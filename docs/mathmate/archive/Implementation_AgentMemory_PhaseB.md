# Implementation Plan: Agent Memory — Phase B (Runtime Integration)

## 1) Goal
Integrate SQLite-backed memory into live tutoring turns so responses adapt to learner preferences/goals without overwhelming context.

This phase starts after Phase A schema/store completion.

---

## 2) Scope

### In scope
- Request-time memory retrieval in `ChatViewModel.sendMessage()`
- Token-bounded `Memory Context` injection
- Explicit memory intents (`remember`, `forget`) command path
- Basic observability in context panel

### Out of scope
- Wrap-up extraction automation (Phase C)
- Full memory management UI redesign (Phase D)
- Vector retrieval (later)

---

## 3) Runtime Flow

1. User sends message.
2. Build topic hints from user text + active session metadata.
3. Query `MemoryEngine.retrieveRelevantMemory(...)`.
4. Build compact context block (<= configured budget).
5. Insert block in effective prompt stack:
   `[system] + [memory context] + [history]`.
6. Stream response as normal.

---

## 4) Data/Prompt Budget Rules
- Default memory budget: 500 tokens.
- Max memory items injected: 6.
- Always include confidence/source tags internally; user-facing output optional.
- Skip injection if confidence too low and no explicit user memory present.

Memory block format:
```text
[Memory Context]
- Preference: prefers hints before full solutions. (conf:0.95)
- Goal: pass Calculus I midterm in 3 weeks. (conf:0.90)
- Misconception: sign errors during expansion. (conf:0.82)
```

---

## 5) File-by-File Tickets

### Ticket MB1 — ChatViewModel retrieval hook
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

**Tasks:**
- inject optional memory retrieval before model call
- add helper methods:
  - `_topicHints(from:)`
  - `_buildMemoryContextBlock(...)`

### Ticket MB2 — Memory engine scoring policy
**Modify/New:**
- `Sources/MathMate/Memory/MemoryEngine.swift`

**Tasks:**
- implement weighted scoring + dedup
- deterministic order for testability

### Ticket MB3 — Explicit intents
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

**Tasks:**
- support commands:
  - `/remember <fact>`
  - `/forget <query-or-id>`
  - `/memory` (summary)
- wire to `MemoryStore` APIs

### Ticket MB4 — Context panel visibility
**Modify:**
- `Sources/MathMate/Views/ContextPanelView.swift`

**Tasks:**
- show "Memory injected: N items / X tokens"
- optional disclosure list of injected item summaries

### Ticket MB5 — Settings controls
**Modify:**
- `Sources/MathMate/ViewModels/SettingsViewModel.swift`
- `Sources/MathMate/Views/Settings/SettingsChatView.swift`

**Settings:**
- enable memory injection
- max injected items
- memory token budget

### Ticket MB6 — Tests
**New tests:**
- `Tests/MathMateTests/MemoryIntegrationTests.swift`

**Coverage:**
- no-duplication of memory context
- budget clipping behavior
- explicit commands correctness
- retrieval disabled path

---

## 6) Acceptance Criteria
- Tutor responses adapt to known learner state.
- Injection is bounded and does not degrade context window health.
- Explicit memory commands work and are auditable.
- Build/tests pass.

---

## 7) Rollout
1. MB1+MB2 behind feature flag
2. MB3 commands
3. MB4 observability
4. MB5 settings + default-on decision
