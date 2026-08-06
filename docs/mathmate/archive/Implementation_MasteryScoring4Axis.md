# Implementation Plan: 4-Axis Mastery Scoring

## 1) Goal

Extend MathMate's memory system from a single opaque `score` field to a
structured **4-axis mastery model**: `memory`, `comprehension`, `structure`,
`application`.  This provides richer signal for the evaluator agent, the
knowledge graph, and future adaptive tutoring.

This is the foundational data-layer change that `Implementation_MasteryEvaluator`
and `Implementation_KnowledgeGraph` both depend on.

---

## 2) Background

The current `memories` table has a single `score REAL` (0–1 float, default
0.0) used loosely for retrieval ranking.  There is no way to distinguish
between "student can recall the formula but cannot apply it" vs "student
understands deeply but forgets notation."

The 4-axis model (drawn from cognitive taxonomy research and validated in
the Get It. architecture):

| Axis | Cognitive Level | Example signal |
|---|---|---|
| `memory` (0–100) | Recall | User states the quadratic formula correctly |
| `comprehension` (0–100) | Understanding | User explains *why* the discriminant matters |
| `structure` (0–100) | Relations | User links eigenvalues to linear independence |
| `application` (0–100) | Transfer | User applies formula to a novel problem |

**Composite mastery:**
```
mastery = memory*0.25 + comprehension*0.30 + structure*0.20 + application*0.25
```

Scores are **monotone non-decreasing**: the system only records improvements,
never regressions (a student can't "forget" in the DB — regressions are
handled by decay/staleness logic in a future phase).

---

## 3) Scope

### In scope
- DB schema migration (new columns, backward-compat)
- `MemoryItem` Rust struct + serde
- New Tauri commands for reading and writing axis scores
- `memoryStore.ts` type updates
- Display: `MemoryRetrievalBar` and `ContextPanel` updated to show composite
  mastery; OverviewPage gains a mastery summary section
- Migration path for existing rows (default -1 = unevaluated)

### Out of scope
- Evaluator agent that *sets* these scores (see `Implementation_MasteryEvaluator`)
- Knowledge graph visualization (see `Implementation_KnowledgeGraph`)
- Score decay / staleness modeling (future phase)

---

## 4) File-by-File Tickets

### MS1 — DB schema migration
**Modify:** `mathmate/src-tauri/src/memory.rs`

**Tasks:**
- Extend `init_schema` to run these idempotent migrations:
  ```rust
  let migrations = [
      "ALTER TABLE memories ADD COLUMN memory_score REAL NOT NULL DEFAULT -1",
      "ALTER TABLE memories ADD COLUMN comprehension_score REAL NOT NULL DEFAULT -1",
      "ALTER TABLE memories ADD COLUMN structure_score REAL NOT NULL DEFAULT -1",
      "ALTER TABLE memories ADD COLUMN application_score REAL NOT NULL DEFAULT -1",
      "ALTER TABLE memories ADD COLUMN last_evaluated_at TEXT",
  ];
  for sql in &migrations {
      // Ignore error if column already exists (SQLite returns error on duplicate ADD)
      let _ = conn.execute(sql, []);
  }
  ```
- Ensure `open_db()` always runs migrations on startup

---

### MS2 — `MemoryItem` struct + helpers
**Modify:** `mathmate/src-tauri/src/memory.rs`

**Tasks:**
- Add fields to `MemoryItem`:
  ```rust
  pub memory_score: f64,          // -1 = unevaluated
  pub comprehension_score: f64,
  pub structure_score: f64,
  pub application_score: f64,
  pub last_evaluated_at: Option<String>,
  ```
- Add computed method:
  ```rust
  impl MemoryItem {
      pub fn composite_mastery(&self) -> Option<f64> {
          if self.memory_score < 0.0 { return None; }
          Some(
              self.memory_score * 0.25
              + self.comprehension_score * 0.30
              + self.structure_score * 0.20
              + self.application_score * 0.25,
          )
      }
  }
  ```
- Add `MasteryScores` struct (shared with evaluator):
  ```rust
  #[derive(Debug, Clone, Serialize, Deserialize)]
  pub struct MasteryScores {
      pub memory: f64,
      pub comprehension: f64,
      pub structure: f64,
      pub application: f64,
  }
  ```
- Add `update_mastery_scores(conn, memory_id, scores)`:
  - `SELECT` current scores first
  - Clamp incoming scores to [0, 100]
  - Enforce monotone: `new = max(current, incoming)` per axis
  - `-1` existing score is treated as 0 for the `max()` comparison

---

### MS3 — Tauri command: `update_memory_mastery`
**Modify:** `mathmate/src-tauri/src/lib.rs`

**Tasks:**
```rust
#[tauri::command]
pub async fn update_memory_mastery(
    memory_id: String,
    scores: MasteryScores,
    state: State<'_, AppState>,
) -> Result<MemoryItem, String>
```
- Opens DB, calls `update_mastery_scores`, returns updated item

Also add:
```rust
#[tauri::command]
pub async fn get_mastery_summary(
    project_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<MasterySummary, String>
```
Where `MasterySummary` contains:
```rust
pub struct MasterySummary {
    pub total_concepts: usize,
    pub evaluated_concepts: usize,
    pub average_mastery: Option<f64>,
    pub top_concepts: Vec<(String, f64)>,    // (label, composite_mastery)
    pub weakest_concepts: Vec<(String, f64)>,
}
```

---

### MS4 — Frontend type updates
**Modify:** `mathmate/src/lib/types.ts`

**Tasks:**
- Extend `MemoryItem` interface:
  ```typescript
  export interface MemoryItem {
    // ... existing fields ...
    memory_score: number;        // -1 = unevaluated
    comprehension_score: number;
    structure_score: number;
    application_score: number;
    last_evaluated_at: string | null;
  }

  export function compositeMastery(item: MemoryItem): number | null {
    if (item.memory_score < 0) return null;
    return (
      item.memory_score * 0.25 +
      item.comprehension_score * 0.30 +
      item.structure_score * 0.20 +
      item.application_score * 0.25
    );
  }
  ```

---

### MS5 — `memoryStore.ts` additions
**Modify:** `mathmate/src/stores/memoryStore.ts`

**Tasks:**
- Add `masterySummary: MasterySummary | null` to state
- Add `loadMasterySummary(projectId?)` action
- Call `loadMasterySummary` on project change in `projectStore`

---

### MS6 — `MemoryRetrievalBar`: show mastery indicator
**Modify:** `mathmate/src/components/MemoryRetrievalBar.tsx`

**Tasks:**
- For each retrieved memory: if `composite_mastery()` is not null, show a
  small colored dot (green ≥70, amber 40–69, red <40) next to the label
- Tooltip on hover: "Memory 72 · Comprehension 65 · Structure 55 · Application 40"
- If unevaluated: show grey dot with "Not yet evaluated"

---

### MS7 — `OverviewPage`: mastery summary section
**Modify:** `mathmate/src/pages/OverviewPage.tsx`

**Tasks:**
- Add "Mastery Overview" card below the stats grid
- Calls `get_mastery_summary` for the selected project
- Shows:
  - `N / M concepts evaluated`
  - Average mastery bar (color-coded)
  - Top 3 strongest concepts
  - Top 3 weakest concepts (with "Practice" quick-link to `/feynman [concept]`)
- Empty state: "No concepts evaluated yet — complete a session to see your
  progress"

---

## 5) Migration Notes

- Existing `score` field is **preserved** — it continues to drive retrieval
  ranking until the evaluator has run at least once on a memory item
- After first evaluation: the composite mastery score could optionally
  replace `score` as the retrieval weight (configurable in settings,
  default off for now)
- All existing `MemoryItem` reads remain backward-compatible; new fields
  default to `-1`

---

## 6) Testing Checklist
- [ ] Schema migration runs without error on existing non-empty DB
- [ ] `composite_mastery()` returns `None` for unevaluated items
- [ ] Monotone enforcement: scores never decrease
- [ ] `update_memory_mastery` returns updated item with new composite
- [ ] `MemoryRetrievalBar` shows mastery dots correctly
- [ ] OverviewPage mastery card renders for projects with/without evaluations
- [ ] `cargo check` passes
- [ ] `npm run build` passes
