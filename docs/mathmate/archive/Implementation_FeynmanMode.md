# Implementation Plan: Feynman Mode

## 1) Goal

Add a **Feynman technique study mode** where the AI plays the role of a
curious, non-expert student and the user (the learner) must *teach* the
concept in plain terms.  This is the strongest comprehension signal in
active-recall research: if you can teach it, you understand it.

Inspired by the Feynman mode in [Get It.](https://github.com/beltromatti/get-it),
adapted to MathMate's math-first chat architecture.

---

## 2) Scope

### In scope
- New page/tab: `FeynmanPage` accessible from the sidebar and from a
  `/feynman` slash command
- Multi-turn Feynman dialogue (4–6 turns by default)
- Configurable topic (free-text input) — defaults to current session topic
  if launched from a live chat
- AI plays a "curious student" persona: asks follow-up questions, probes
  for clarity, admits confusion when the explanation is incomplete
- After the dialogue concludes: a brief evaluator summary of comprehension
  quality, stored to memory DB and optionally appended to the study log
- Sessions persist in a `feynman_sessions` table so past dialogues are
  reviewable

### Out of scope
- Voice/TTS (nice-to-have, low priority given our desktop focus — defer)
- Real-time score updates during a turn (post-session only)
- Feynman sessions scoped to a specific PDF/textbook (defer to PDF pipeline)

---

## 3) User Flow

```
1. User opens Feynman Mode (sidebar icon or /feynman [topic])
2. Enters a topic: e.g. "Eigenvalue decomposition"
3. AI opens: "Hey! I'm trying to understand eigenvalue decomposition for my
   exam tomorrow. Can you explain what an eigenvalue actually IS?"
4. User explains in their own words
5. AI follows up: "Ok… but why does it matter if the eigenvector just gets
   scaled? What's useful about that?"
6. [3–5 more turns]
7. AI wraps up: "Thanks! That actually makes sense now. [summary of what was
   explained clearly and what was shaky]"
8. Evaluator pass: comprehension score stored to memory DB for "Eigenvalue
   decomposition"
```

---

## 4) File-by-File Tickets

### FM1 — Backend: `feynman.rs`
**Create:** `mathmate-v2/src-tauri/src/feynman.rs`

**Tasks:**
- Define structs:
  ```rust
  pub struct FeynmanTurn {
      pub role: String,  // "user" | "ai-student"
      pub content: String,
      pub created_at: String,
  }

  pub struct FeynmanSession {
      pub id: String,
      pub topic: String,
      pub project_id: Option<String>,
      pub turns: Vec<FeynmanTurn>,
      pub summary: Option<String>,
      pub comprehension_score: Option<f64>,
      pub created_at: String,
      pub ended_at: Option<String>,
  }
  ```
- Add `feynman_sessions` table to memory DB schema:
  ```sql
  CREATE TABLE IF NOT EXISTS feynman_sessions (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      project_id TEXT,
      turns TEXT NOT NULL DEFAULT '[]',   -- JSON
      summary TEXT,
      comprehension_score REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT
  );
  ```
- CRUD helpers: `create_feynman_session`, `save_turn`, `finalize_session`
- Load recent sessions for a project: `list_feynman_sessions(project_id)`

---

### FM2 — Backend: Feynman AI-student prompt
**Modify:** `mathmate-v2/src-tauri/src/feynman.rs`

**Tasks:**
- System prompt for the "curious student" persona:
  - Role: friendly, non-expert student who is studying [topic]
  - Style: asks genuine clarifying questions; confused by jargon; probes
    for analogies and examples; does NOT explain back (never says "so what
    you mean is X" and confirms it correctly — it should probe and admit
    gaps)
  - Constraint: stay on [topic]; don't introduce external concepts the
    user hasn't explained yet
  - After `max_turns` is reached: wrap up with a 2–3 sentence honest
    assessment of what was clear and what was confusing
- Provide `max_turns` configuration (default 5, configurable per session)
- Opening message is generated from topic alone (no user turn needed first)

---

### FM3 — Backend: Tauri commands
**Modify:** `mathmate-v2/src-tauri/src/lib.rs`

**Tasks:**
Register:
```rust
#[tauri::command]
pub async fn start_feynman_session(
    topic: String,
    project_id: Option<String>,
    max_turns: Option<u32>,
    state: State<'_, AppState>,
) -> Result<(String, String), String>
// returns (session_id, opening_question)

#[tauri::command]
pub async fn feynman_respond(
    session_id: String,
    user_message: String,
    state: State<'_, AppState>,
) -> Result<FeynmanTurn, String>
// returns the AI-student's next question/response

#[tauri::command]
pub async fn end_feynman_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<FeynmanSession, String>
// triggers evaluator pass, saves summary + comprehension_score

#[tauri::command]
pub async fn list_feynman_sessions(
    project_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<FeynmanSession>, String>
```

---

### FM4 — Frontend: `FeynmanPage.tsx`
**Create:** `mathmate-v2/src/pages/FeynmanPage.tsx`

**Layout:**
```
┌─────────────────────────────────────────────┐
│  🧠 Feynman Mode           [New Session]    │
├─────────────────────────────────────────────┤
│  Topic: [__________________________] [Start] │
├─────────────────────────────────────────────┤
│  [AI-Student avatar]                        │
│  "Hey! I'm studying eigenvalues for my      │
│   exam. Can you explain what they ARE?"     │
│                                             │
│                      [User's explanation]   │
│                                             │
│  [AI follow-up question]                    │
│  ...                                        │
├─────────────────────────────────────────────┤
│  [Reply input box]          [Send] [Finish] │
└─────────────────────────────────────────────┘
```

**Tasks:**
- Topic input + Start button → calls `start_feynman_session`
- Chat-style turn display, AI turns left-aligned with a subtle student icon,
  user turns right-aligned — visually distinct from normal math chat
- "Finish" button ends the session early and triggers the evaluator pass
- Session auto-ends after `max_turns` AI responses
- After session ends: show summary card with comprehension score + evaluator
  note (use the mastery score display from `Implementation_MasteryEvaluator`)
- Past sessions list (collapsible sidebar panel or bottom history strip)

---

### FM5 — Slash command: `/feynman`
**Modify:** `mathmate-v2/src/stores/commandStore.ts`

**Tasks:**
- Register `/feynman [topic]`
- If topic provided: navigate to FeynmanPage with topic pre-filled and
  auto-start the session
- If no topic: navigate to FeynmanPage with cursor in topic field
- Command hint: "Practice teaching a concept using the Feynman technique"

---

### FM6 — Sidebar integration
**Modify:** `mathmate-v2/src/components/Sidebar.tsx`

**Tasks:**
- Add "Feynman" nav item with a brain/lightbulb icon (Lucide `BrainCircuit`
  or `Lightbulb`)
- Show badge with count of incomplete sessions for current project (optional)

---

### FM7 — Memory DB integration
**Modify:** `mathmate-v2/src-tauri/src/evaluator.rs` (from ME2)

**Tasks:**
- After `end_feynman_session`: call evaluator with the Feynman transcript
  instead of (or in addition to) the normal chat session
- Store comprehension score as a memory item with:
  - `source_type = "feynman"`
  - `unit_type = "comprehension_probe"`
  - `content = evaluator summary`
  - `score = comprehension_score / 100`
- Tag: `["feynman", topic]`

---

## 5) AI Student Persona: Prompt Skeleton

```
You are a curious, friendly student preparing for an exam on [topic].
You do NOT already understand [topic] — that is why you are asking.
Your role is to ask the user to explain it to you.

Rules:
- Ask one clear question per turn. Do not monologue.
- When the explanation is clear, say so briefly and ask a follow-up that
  probes deeper (an edge case, an analogy, a "but why?" question).
- When the explanation is confusing or uses jargon you wouldn't know,
  say you're confused and ask for a simpler version.
- Do NOT confirm correct answers by re-explaining them.
- After [max_turns] turns, write a wrap-up: 2–3 sentences on what you now
  understand and what you're still unsure about. Be honest.

Topic: [topic]
```

---

## 6) Testing Checklist
- [ ] Session start generates an opening question without a user prompt
- [ ] Turns persist across page navigation (DB-backed)
- [ ] Session ends correctly at `max_turns` and via "Finish" button
- [ ] Comprehension score written to memory DB after session ends
- [ ] `/feynman eigenvalues` navigates and pre-fills topic
- [ ] Past sessions are listed and readable
- [ ] `cargo check` passes
- [ ] `npm run build` passes
