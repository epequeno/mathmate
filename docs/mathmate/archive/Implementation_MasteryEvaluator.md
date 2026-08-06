# Implementation Plan: Mastery Evaluator Agent

## 1) Goal

After each session ends, run an LLM pass over the full session transcript
(and optionally recent session history) to produce **per-concept mastery
scores** stored back into the memory DB.  This closes the loop between what
the student says in chat and what the system "knows" about their progress.

Inspired by the evaluator pattern in [Get It.](https://github.com/beltromatti/get-it),
adapted to MathMate's multi-session, multi-project architecture.

---

## 2) Scope

### In scope
- `wrapup.rs`: replace template-only generation with an optional LLM
  evaluation pass that produces concept scores
- `memory.rs`: extend schema with 4-axis mastery columns
  (`memory_score`, `comprehension_score`, `structure_score`, `application_score`)
- New Tauri command: `run_evaluator(session_id)` → `EvaluatorResult`
- Frontend: trigger evaluator automatically when `generate_wrapup` is called;
  surface a "Session evaluated" toast / update overview stats
- Scores are **monotone non-decreasing** per concept — a score can only go up
  after a session, never down

### Out of scope
- Real-time evaluation during streaming (post-session only)
- Cross-session evaluator rollup (deferred to Phase 2 of this feature)
- UI visualization of the 4-axis breakdown (see `Implementation_KnowledgeGraph.md`)

---

## 3) Background: 4-Axis Mastery Model

Each concept/memory item gets four 0–100 scores:

| Axis | What it measures |
|---|---|
| `memory` | Verbatim recall — can the student state the fact/formula? |
| `comprehension` | Own-words understanding — can they paraphrase or explain it? |
| `structure` | Relational knowledge — do they understand how it connects to other concepts? |
| `application` | Transfer — can they use the concept in a novel or unfamiliar context? |

A single **mastery score** is derived as:
```
mastery = memory*0.25 + comprehension*0.30 + structure*0.20 + application*0.25
```

---

## 4) File-by-File Tickets

### ME1 — Extend memory schema (4-axis columns)
**Modify:** `mathmate/src-tauri/src/memory.rs`

**Tasks:**
- Add columns to `memories` table:
  ```sql
  memory_score      REAL NOT NULL DEFAULT -1,
  comprehension_score REAL NOT NULL DEFAULT -1,
  structure_score   REAL NOT NULL DEFAULT -1,
  application_score REAL NOT NULL DEFAULT -1,
  last_evaluated_at TEXT
  ```
  (-1 = "not yet evaluated"; 0–100 = evaluated score)
- Run `ALTER TABLE` migration guarded by `IF NOT EXISTS` on each column
- Update `MemoryItem` struct to include all four fields + `last_evaluated_at`
- Add helper:
  ```rust
  pub fn update_mastery_scores(
      conn: &Connection,
      memory_id: &str,
      scores: MasteryScores,
  ) -> Result<(), String>
  ```
  Enforce monotone non-decreasing: `new_score = max(current, incoming)`

---

### ME2 — EvaluatorResult type + evaluator prompt
**Create:** `mathmate/src-tauri/src/evaluator.rs`

**Tasks:**
- Define structs:
  ```rust
  pub struct MasteryScores {
      pub memory: f64,
      pub comprehension: f64,
      pub structure: f64,
      pub application: f64,
  }

  pub struct ConceptEvaluation {
      pub concept: String,     // matched to memory item by label
      pub scores: MasteryScores,
      pub evaluator_note: String,
  }

  pub struct EvaluatorResult {
      pub session_id: String,
      pub evaluated_at: String,
      pub concept_evaluations: Vec<ConceptEvaluation>,
      pub global_note: String,
  }
  ```
- Build the evaluator prompt:
  - System: the evaluator role (reads transcript, produces per-concept scores)
  - User context: serialized session transcript (user + assistant turns,
    roles clearly labeled, thinking traces stripped)
  - Existing memory items for the project (to anchor concept names)
  - Output schema: JSON array of `ConceptEvaluation`
- Call the configured provider via HTTP (reuse provider config from
  `config.rs`); model defaults to the session's model but can be overridden
  to a cheaper/faster model in settings
- Parse response, clamp scores to [0, 100]

---

### ME3 — Tauri command `run_evaluator`
**Modify:** `mathmate/src-tauri/src/lib.rs`

**Tasks:**
- Register new command:
  ```rust
  #[tauri::command]
  pub async fn run_evaluator(session_id: String, state: State<'_, AppState>) -> Result<EvaluatorResult, String>
  ```
- Load session from `session::load_session`
- Load project's memory items for concept anchoring
- Call `evaluator::run_evaluator_pass`
- Persist score updates via `memory::update_mastery_scores`
- Return `EvaluatorResult` to frontend

---

### ME4 — Upgrade `wrapup.rs` to include evaluator output
**Modify:** `mathmate/src-tauri/src/wrapup.rs`

**Tasks:**
- After template generation, call `run_evaluator_pass` internally (optional:
  only if provider is configured)
- Append evaluator output to the study log markdown:
  ```markdown
  ### Mastery Update
  | Concept | Memory | Comprehension | Structure | Application | Overall |
  |---|---|---|---|---|---|
  | Eigenvalues | 72 | 65 | 55 | 40 | 59 |
  ...
  > Evaluator note: Student demonstrated clear recall but struggled to
  > apply eigenvalue decomposition to novel matrices.
  ```
- Keep existing template path as fallback if LLM call fails

---

### ME5 — Frontend: auto-trigger + feedback
**Modify:**
- `mathmate/src/stores/chatStore.ts`
- `mathmate/src/pages/OverviewPage.tsx`

**Tasks:**
- In `chatStore`: after `generate_wrapup` completes successfully, fire
  `invoke('run_evaluator', { sessionId })` non-blockingly
- Show a subtle "Evaluating session…" indicator in the session row
  (reuse session flags pattern)
- On completion: update OverviewPage stats if visible — add a
  "Latest mastery update" section showing top 3 concept changes
- Add `memoryStore` action: `refreshMasteryStats()` that re-reads
  aggregate scores from DB

---

### ME6 — Settings: evaluator model override
**Modify:** `mathmate/src/pages/SettingsPage.tsx`

**Tasks:**
- Add "Evaluator model" setting (defaults to `""` = use session model)
- Cheaper model (e.g. `openai/gpt-4o-mini`) works well for structured
  JSON evaluation — document this in the UI hint
- Persist via existing config path

---

## 5) Prompt Design Notes

The evaluator prompt should:
1. Receive labeled turns: `[USER]: ...`, `[ASSISTANT]: ...`
2. Have access to existing concept labels from memory DB (so it anchors to
   known concepts rather than inventing new names)
3. Be instructed to score only concepts that have **evidence** in the session
   (skip unevidenced concepts rather than guessing)
4. Return structured JSON — use `zod`-equivalent validation on the Rust side
   (or just serde with defaults)
5. Be reminded of the monotone constraint: "Report only the new evidence you
   see; the system will keep the higher of old and new scores."

---

## 6) Testing Checklist
- [ ] Schema migration runs cleanly on existing `memory.db`
- [ ] `update_mastery_scores` enforces monotone non-decreasing correctly
- [ ] Evaluator call fails gracefully (no crash, wrapup still saves)
- [ ] Frontend shows evaluator progress without blocking chat
- [ ] Scores appear in OverviewPage after completion
- [ ] `cargo check` passes
- [ ] `npm run build` passes
