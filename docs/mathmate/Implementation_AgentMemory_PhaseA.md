# Implementation Plan: Agent Memory — Phase A Execution Breakdown

## ✅ STATUS: RE-IMPLEMENTED

The SQLite memory foundation was originally implemented but the source files were lost/removed from the tree. Re-implemented on 2026-05-21 according to the original specification with:
- Schema migrations with `schema_migrations` table
- Typed CRUD APIs for profile and memory items 
- Provenance linking for source tracking
- Baseline retrieval with weighted scoring
- Optional user-flagging awareness in scoring

## Summary of Implementation

### Architecture Used
- **Database driver**: Apple's built-in SQLite C API (`import SQLite3`)
- **Concurrency model**: Swift actor-based (single connection via `DatabaseHandle` wrapper)
- **File location**: `~/.mathmate/memory/memory.sqlite` with proper directory creation
- **Date format**: UNIX timestamps (converted to/from Date)

### Core Files

1. **`Sources/MathMate/Memory/MemoryModels.swift`**  
   Defines all core types:
   - `MemoryKind` (preference, goal, misconception, concept, habit, behavior, observation, custom)
   - `MemoryStatus` (active, archived, forgotten)
   - `MemorySourceKind` (manual, message, session, system, import)
   - `MemoryItem`, `LearnerFact`, `MemorySource` — all `Sendable` + `Codable` + `Hashable`
   - `MemoryListFilter`, `MemoryRetrievalQuery` for queries
   - Validation utilities on `MemoryItem.isValid` and `LearnerFact.isValid`

2. **`Sources/MathMate/Memory/MemoryStore.swift`**  
   Full SQLite-backed actor:
   - `DatabaseHandle` wrapper class (@unchecked Sendable) for safe OpaquePointer lifecycle
   - Schema migrations with `schema_migrations` table (idempotent, versioned)
   - Tables: `learner_facts` (key-UNIQUE upsert), `memory_items` (typed, indexed), `memory_sources` (FK cascade)
   - WAL journal mode + foreign keys enabled
   - Profile facts: `upsertProfileFact`, `getProfileFact`, `listProfileFacts`, `deleteProfileFact`
   - Memory items: `addMemoryItem`, `updateMemoryItem`, `forgetMemoryItem`, `archiveMemoryItem`, `listMemoryItems`
   - Provenance: `linkSource`, `listSources`
   - Convenience: `getAllItems()`, `getAllFacts()`, `countItems()`, `countFacts()`

3. **`Sources/MathMate/Memory/MemoryEngine.swift`**  
   Retrieval with weighted scoring:
   - `retrieveRelevantMemory(query:limit:minimumConfidence:)` — async actor-based
   - Scoring: confidence (40%) + topical match (35%) + recency (15%) + flagged bonus (10%)
   - Token overlap matching, 90-day recency decay
   - `buildMemoryContextBlock(from:)` and `formatMemoryPromptBlock(_:maxTokens:minimumScore:)`

### Key Implementation Notes

- ✅ Swift actor isolation guarantees thread safety (no manual dispatch queues needed)
- ✅ `DatabaseHandle` class solves `OpaquePointer` Sendability issue in deinit
- ✅ PRAGMAs: `foreign_keys = ON`, `journal_mode = WAL`
- ✅ Indexes on `memory_items(kind)`, `memory_items(status)`, `memory_items(created_at)`, `memory_sources(memory_item_id)`
- ✅ Migration system supports idempotent upgrades with the `targetSchemaVersion` constant
- ✅ `isFlaggedReference` field on `MemoryItem` — surfaced from user flagging UX, weighted in scoring

## Integration with ChatViewModel

- `memoryStore: MemoryStore` — private(set) actor instance, initialized in `init()`
- `memoryEngine` — computed property wrapping MemoryEngine(store: memoryStore)
- `MemoryViewModel(store:)` — takes store reference, extracts flagged-message observations

## Next Phase: Phase B - Runtime Integration

### What's Left for Phase B
- Runtime retrieval hook in `sendMessage()` (MB1)
- Token bounding of memory context injection (MB1)
- Explicit memory commands: `/remember`, `/forget`, `/memory` (MB3)
- Context panel visibility showing memory injected (MB4)
- Settings controls for memory budget (MB5)
- Full unit tests for memory integration (MB6)

## Final Notes
- Build passes with Swift 6 concurrency.
- All 69 existing tests continue to pass.
- SQLite implementation meets all Phase A requirements.
- User flagging UX (Stage 1) is already wired into the scoring formula.