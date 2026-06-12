# Session Branching Implementation Plan

**Status**: Planning Phase  
**Target Phase**: Phase 8 (Post-UI Redesign)  
**Based on**: [pi Session Branching](https://github.com/earendil-works/pi-mono) implementation  
**MathMate Current State**: Linear message history with compaction support

---

## Overview

Session branching allows users to explore alternative conversation paths by branching from any earlier message, then continuing from that point. This is essential for:
- Trying different approaches to a math problem
- "What if?" scenarios (e.g., "What if we used a different formula?")
- Exploring tangents without losing the original thread
- Comparing different solution strategies

MathMate currently stores sessions as linear JSONL files with compaction support. We need to extend this to support tree-based branching similar to pi's approach.

---

## Architecture Overview

### Current State

```
Session File (JSONL):
- Line 1: SessionHeader
- Line 2+: Message entries (linear chain)
    {
      "type": "message",
      "message": {...}
    }
```

### Target State

```
Session File (JSONL):
- Line 1: SessionHeader
- Line 2+: Mixed entries (tree structure via id/parentId)
    {
      "type": "message",
      "id": "a1b2c3d4",
      "parentId": null,
      "timestamp": "...",
      "message": {...}
    }
    {
      "type": "branch_summary",
      "id": "b2c3d4e5",
      "parentId": "a1b2c3d4",
      "timestamp": "...",
      "fromId": "c3d4e5f6",
      "summary": "Branch explored approach A..."
    }
```

---

## Implementation Steps

### Step 1: Core Data Structures

**Files to Create/Modify:**

1. **`Sources/MathMate/Persistence/SessionEntry.swift`** (NEW)
   - `SessionEntryBase` protocol with `id`, `parentId`, `timestamp`
   - `SessionMessageEntry` (wraps Message with tree support)
   - `BranchSummaryEntry` (new type)
   - `BranchSummaryReason` enum (`userInitiated`, `autoSummarized`)

2. **`Sources/MathMate/Persistence/SessionStore.swift`** (MODIFY)
   - Add methods to write entries with `id`/`parentId`
   - Add methods to read tree structure
   - Maintain backward compatibility with linear sessions

3. **`Sources/MathMate/Persistence/SessionHeader.swift`** (MODIFY)
   - Update `SessionHeader` to support branching metadata
   - Add `branchCount` property
   - Add `latestBranchId` property

**Key Design Decisions:**

- Use 8-character hex IDs (like pi) for consistency
- Store all entries (messages, branch summaries) in same JSONL file
- Maintain `parentId: null` for root entry
- Auto-assign `parentId` as current leaf when appending new entries

---

### Step 2: Branch Navigation Model

**Files to Create:**

1. **`Sources/MathMate/Models/BranchManager.swift`** (NEW)
   - `BranchManager` class to handle tree traversal
   - Methods:
     - `getLeafEntry()` - current position
     - `getBranch(fromId:)` - walk path to root
     - `getChildren(parentId:)` - find branches
     - `branch(to entryId:)` - move leaf to earlier entry
     - `createBranchSummary(fromId:to summary:)` - record abandoned branch

**Integration Points:**

- Inject `BranchManager` into `ChatViewModel`
- Replace direct `messages` manipulation with `branchManager` methods

---

### Step 3: UI Branch Controls

**Files to Modify:**

1. **`Sources/MathMate/Views/MainView.swift`**
   - Add branch selector dropdown (similar to pi's tree view)
   - Add "Branch from..." menu item
   - Add branch summary display

2. **`Sources/MathMate/Views/SessionsView.swift`** (NEW or MODIFY)
   - Tree view of session branches
   - Visual representation of branching paths
   - Branch selection and navigation

3. **`Sources/MathMate/ViewModels/SessionBrowserViewModel.swift`** (NEW)
   - Branch tree visualization
   - Branch selection logic
   - Branch summary generation

**UI Components Needed:**

```
┌─────────────────────────────────────────────────┐
│ Branch Selector ▼                              │
├─────────────────────────────────────────────────┤
│ • Current Branch (2 branches) ▼                │
│   └─ Branch #1: "First attempt"                │
│   └─ Branch #2: "Alternative approach" ← active│
└─────────────────────────────────────────────────┘
```

---

### Step 4: Branching Commands

**Slash Commands to Add:**

| Command | Description |
|---------|-------------|
| `/tree` | Open branch tree navigator |
| `/fork` | Create new session from current branch point |
| `/clone` | Duplicate current active branch to new session |
| `/branch from <id>` | Branch from specific message |
| `/branch summary` | Generate branch summary manually |

**Implementation:**

```swift
// In ChatViewModel.handleSlashCommand()
case "/tree":
    showBranchTree = true
case "/fork":
    await forkCurrentBranch()
case "/clone":
    await cloneCurrentBranch()
```

---

### Step 5: Branch Summaries

**Requirements:**

- Generate summaries when switching branches
- Store summaries in session file as `branch_summary` entries
- Optional LLM-assisted summarization with fallback

**Implementation:**

```swift
// In BranchManager.branch(to entryId:)
func branch(to entryId: String, generateSummary: Bool = true) async throws {
    guard generateSummary else {
        leafId = entryId
        return
    }
    
    // Collect messages from current leaf to common ancestor
    let abandonedBranch = getAbandonedBranch(from: leafId, to: entryId)
    
    // Generate summary
    let summary = await generateBranchSummary(abandonedBranch)
    
    // Record branch summary
    try sessionStore.appendBranchSummary(
        fromId: leafId,
        to: entryId,
        summary: summary
    )
    
    leafId = entryId
}
```

---

### Step 6: Backward Compatibility

**Migration Strategy:**

1. **Detect linear sessions** (no `parentId` fields)
2. **Auto-migrate on first write**:
   - Add `parentId` to existing messages (linear chain)
   - Convert to new format
3. **Update version number** in `SessionHeader`

**Migration Code:**

```swift
// In SessionStore.loadMessages()
func loadMessages(for sessionId: UUID) -> [Message] {
    let entries = loadAllEntries(for: sessionId)
    
    // Auto-migrate linear sessions
    if !entries.contains(where: { $0.parentId != nil }) {
        migrateLinearToTree(for: sessionId)
    }
    
    return entries.compactMap { $0 as? SessionMessageEntry }.map { $0.message }
}
```

---

### Step 7: Testing & Validation

**Test Cases:**

1. **Branch creation**
   - Create session with 3 messages
   - Branch from message 1
   - Verify new branch created
   - Verify parent-child relationships correct

2. **Branch navigation**
   - Navigate between branches
   - Verify leaf updates correctly
   - Verify summaries generated

3. **Fork/Clone**
   - Fork branch to new session
   - Verify new session file created
   - Verify messages copied correctly

4. **Compaction + Branching**
   - Compact session
   - Branch from compaction point
   - Verify compaction summary preserved

5. **Backward compatibility**
   - Load old linear session
   - Verify auto-migration works
   - Verify messages display correctly

---

## File Structure After Implementation

```
Sources/MathMate/
├── Models/
│   ├── ModelProvider.swift (existing)
│   ├── Message.swift (existing)
│   ├── ToolCall.swift (existing)
│   └── BranchManager.swift (NEW)
├── Persistence/
│   ├── SessionStore.swift (MODIFY)
│   ├── SessionHeader.swift (MODIFY)
│   └── SessionEntry.swift (NEW)
├── ViewModels/
│   ├── ChatViewModel.swift (MODIFY)
│   └── SessionBrowserViewModel.swift (NEW)
└── Views/
    ├── MainView.swift (MODIFY)
    ├── SessionsView.swift (MODIFY)
    └── BranchTreePicker.swift (NEW)
```

---

## API Design (Swift)

### SessionEntry Protocol

```swift
protocol SessionEntry {
    var id: String { get }
    var parentId: String? { get }
    var timestamp: Date { get }
    var type: String { get }
}

struct SessionMessageEntry: SessionEntry {
    let id: String
    let parentId: String?
    let timestamp: Date
    let message: Message
}

struct BranchSummaryEntry: SessionEntry {
    let id: String
    let parentId: String?
    let timestamp: Date
    let fromId: String
    let summary: String
    let reason: BranchSummaryReason
}
```

### BranchManager API

```swift
@MainActor
class BranchManager: ObservableObject {
    private var entries: [SessionEntry]
    private var leafId: String
    
    // Navigation
    func getLeafEntry() -> SessionEntry?
    func getBranch(fromId: String) -> [SessionEntry]
    func getChildren(parentId: String) -> [SessionEntry]
    
    // Branching
    func branch(to entryId: String) async throws
    func createBranch(from entryId: String, summary: String?) async throws -> String
    
    // Session operations
    func fork(to newSessionId: UUID) throws
    func clone(to newSessionId: UUID) throws
    
    // Query
    func getBranchCount() -> Int
    func getBranchHeads() -> [String]
}
```

### SessionStore Extensions

```swift
extension SessionStore {
    func appendEntry(_ entry: SessionEntry, to sessionId: UUID) throws
    func appendBranchSummary(entry: BranchSummaryEntry, to sessionId: UUID) throws
    func loadAllEntries(for sessionId: UUID) -> [SessionEntry]
    func loadBranchTree(for sessionId: UUID) -> [String: [SessionEntry]]
    func migrateLinearToTree(for sessionId: UUID) throws
}
```

---

## Migration Plan

### Phase 1: Core Implementation (Week 1)
- [ ] Step 1: Data structures
- [ ] Step 2: Branch navigation model
- [ ] Unit tests for `BranchManager`

### Phase 2: UI Integration (Week 2)
- [ ] Step 3: UI branch controls
- [ ] Step 4: Slash commands
- [ ] Integration tests

### Phase 3: Polish & Testing (Week 3)
- [ ] Step 5: Branch summaries
- [ ] Step 6: Backward compatibility
- [ ] Step 7: Full test suite

### Phase 4: Documentation (Week 4)
- [ ] User guide for branching
- [ ] Developer docs for API
- [ ] Changelog entry

---

## Open Questions

1. **Should branch summaries be generated automatically or on-demand?**
   - Proposal: Automatic with option to disable
   - Rationale: pi does automatic summarization

2. **How to handle very long branches?**
   - Proposal: Paginate tree view, limit depth
   - Alternative: Compress old branches

3. **Should forks/clones share compaction snapshots?**
   - Proposal: No, each gets independent snapshot
   - Rationale: Branches may diverge significantly

4. **Should we support merge operations?**
   - Proposal: Out of scope for v1
   - Rationale: Complex UX, low priority

---

## References

- [pi Session Branching Documentation](https://github.com/earendil-works/pi-mono/blob/main/docs/sessions.md)
- [pi Session Format](https://github.com/earendil-works/pi-mono/blob/main/docs/session-format.md)
- [pi SessionManager Source](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts)

---

*Created: 2026-05-19*  
*Status: Planning - Ready for implementation*
