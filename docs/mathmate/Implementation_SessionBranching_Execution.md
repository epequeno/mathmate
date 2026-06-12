# Implementation Plan: Session Branching — Execution Breakdown

## 1) Goal
Convert linear sessions into branch-capable conversation trees with safe migration and usable navigation.

This complements `Implementation_SessionBranching.md` with implementation sequencing and risk controls.

---

## 2) Delivery Strategy

### Milestone S1 — Data layer first
- Introduce tree entry model in persistence while preserving current APIs.
- Add migration path from linear JSONL.

### Milestone S2 — Runtime branch manager
- Add `BranchManager` and route message append/load through active leaf.

### Milestone S3 — UI and commands
- Add tree picker + `/tree` `/fork` `/clone` UX.

### Milestone S4 — Branch summaries + polish
- Auto-summarize abandoned branches and expose in tree UI.

---

## 3) File-by-File Tickets

### Ticket SB1 — Entry model and codec
**New:**
- `Sources/MathMate/Persistence/SessionEntry.swift`

**Modify:**
- `Sources/MathMate/Persistence/SessionStore.swift`

**Tasks:**
- support mixed entry decoding (`message`, `branch_summary`)
- maintain backward compatibility with existing `loadMessages(...)`

### Ticket SB2 — Header versioning
**Modify:**
- `Sources/MathMate/Persistence/SessionStore.swift` (`SessionHeader`)

**Tasks:**
- add `formatVersion`, `branchCount`, `latestBranchId`
- default values for old sessions

### Ticket SB3 — Migration path
**Modify:**
- `SessionStore` migration helpers

**Tasks:**
- detect linear sessions
- write parent links as linear chain
- idempotent migration guard

### Ticket SB4 — Branch manager
**New:**
- `Sources/MathMate/Models/BranchManager.swift`

**Tasks:**
- branch traversal API
- set active leaf
- compute branch heads and ancestors

### Ticket SB5 — Chat runtime integration
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

**Tasks:**
- append to active leaf instead of linear tail
- switch leaf on branch selection
- preserve compaction compatibility

### Ticket SB6 — Tree picker UI
**New/Modify:**
- `Sources/MathMate/Views/BranchTreePicker.swift` (new)
- `Sources/MathMate/Views/MainView.swift` (toolbar integration)

### Ticket SB7 — Slash commands
**Modify:**
- `ChatViewModel.handleSlashCommand`

**Commands:**
- `/tree`
- `/fork`
- `/clone`

### Ticket SB8 — Branch summaries
**Tasks:**
- summarize branch when user leaves it
- persist `branch_summary` entry
- render summary nodes in tree picker

### Ticket SB9 — Tests
**New tests:**
- `Tests/MathMateTests/SessionBranchingTests.swift`
- `Tests/MathMateTests/SessionMigrationTests.swift`

---

## 4) Risk Register
1. **Migration corruption risk**
   - Mitigation: snapshot file before migration; rollback on parse failure.
2. **Compaction interaction risk**
   - Mitigation: treat compaction as branch-aware entry metadata.
3. **UI complexity risk**
   - Mitigation: ship minimal tree picker before advanced graph visuals.

---

## 5) Acceptance Criteria
- Existing linear sessions load without data loss.
- Users can branch and continue from earlier points.
- Fork/clone work from active branch.
- Branch summaries improve navigation clarity.
- Build/tests pass.
