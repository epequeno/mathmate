# Implementation Plan: Agent Memory (SQLite-First, Local-First)

## 1) Goal
Introduce a formal persistent memory system so MathMate can provide coherent, personalized tutoring across sessions.

This memory system is **separate from chat logs and Obsidian notes**. Obsidian remains user-facing knowledge capture; Memory is tutor-facing learner state.

---

## 2) Design Principles
- **Local-first:** all memory stored on-device in `~/.mathmate/`.
- **User control:** inspect/edit/delete/forget memory entries.
- **Evidence-based:** each memory item stores provenance (session/message source).
- **Token-efficient retrieval:** inject only relevant memory snippets per request.
- **Safe by default:** avoid hallucinated learner traits; support confidence + decay.

---

## 3) Why SQLite (vs JSONL)
SQLite is the default backend for memory because it supports:
- indexed filtering and ranking,
- reliable updates/deletes (forget/edit),
- transactions,
- easy future UI querying,
- optional FTS search and optional vector extension later.

JSONL remains suitable for append-only session logs (`SessionStore`) and does not need replacement.

---

## 4) Storage Layout
Database path:
- `~/.mathmate/memory/memory.sqlite`

Optional future artifacts:
- `~/.mathmate/memory/schema_version.json` (if needed for diagnostics)

---

## 5) Schema (MVP)

### 5.1 `learner_profile` (single-row key/value facts)
Tracks stable preferences and goals.

Columns:
- `key TEXT PRIMARY KEY`  (e.g. `preferred_style`, `pace`, `goal_primary`)
- `value TEXT NOT NULL`
- `confidence REAL NOT NULL DEFAULT 0.7`
- `source_kind TEXT NOT NULL` (`user_explicit`, `inferred`, `imported`)
- `source_ref TEXT` (session/message id)
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### 5.2 `memory_items` (episodic + conceptual memory)
Tracks learner events and recurring patterns.

Columns:
- `id TEXT PRIMARY KEY` (UUID)
- `kind TEXT NOT NULL` (`misconception`, `mastery`, `preference`, `goal`, `context`)
- `topic TEXT NOT NULL` (`algebra`, `trig`, `calculus`, etc.)
- `summary TEXT NOT NULL` (compact memory statement)
- `evidence TEXT` (short quote/justification)
- `confidence REAL NOT NULL` (0.0–1.0)
- `status TEXT NOT NULL DEFAULT 'active'` (`active`, `archived`, `forgotten`)
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `last_seen_at TEXT`

Indexes:
- `(topic, kind)`
- `(status, updated_at DESC)`
- `(confidence DESC)`

### 5.3 `memory_sources` (provenance many-to-many)
Links memory to sessions/messages.

Columns:
- `memory_id TEXT NOT NULL`
- `session_id TEXT`
- `message_id TEXT`
- `role TEXT` (`user`, `assistant`, `system`)
- `created_at TEXT NOT NULL`

Composite index:
- `(memory_id, session_id, message_id)`

### 5.4 Optional FTS table (Phase 2)
- `memory_items_fts(summary, evidence, topic)` linked to `memory_items`.

---

## 6) Core Components

### 6.1 `MemoryStore.swift` (new)
Actor-backed SQLite access layer:
- `upsertProfileFact(...)`
- `addMemoryItem(...)`
- `updateMemoryItem(...)`
- `forgetMemoryItem(id:)`
- `listMemoryItems(filter:)`
- `retrieveRelevantMemory(query:, topicHints:, limit:)`
- `linkSource(memoryId:, sessionId:, messageId:, role:)`

### 6.2 `MemoryModels.swift` (new)
Strongly typed models:
- `LearnerFact`
- `MemoryItem`
- `MemorySource`
- `MemoryRetrievalResult`

### 6.3 `MemoryEngine.swift` (new)
Policy layer on top of store:
- extraction candidates from wrap-up/session,
- ranking/scoring for retrieval,
- confidence decay and deduplication heuristics,
- “safe write” rules for inferred memory.

---

## 7) Retrieval Strategy (Request-Time)
Before each provider call:
1. Build lightweight topic hints from current user message.
2. Retrieve top memory items using hybrid score:
   - topic match,
   - recency,
   - confidence,
   - kind weighting (preferences/goals prioritized).
3. Build a compact `Memory Context` prompt block (token budget ~300–800).
4. Prepend block after system prompt and before conversation history.

Format example:
```text
[Memory Context]
- Learner preference: prefers Socratic hints first (confidence 0.95)
- Recurring misconception: sign errors in polynomial expansion (confidence 0.82)
- Current goal: prepare for Calculus I midterm in 3 weeks (confidence 0.90)
```

---

## 8) Write Strategy (How Memory Gets Created)

### 8.1 Explicit user memory
When user says “remember X”, create/update memory with high confidence and `source_kind = user_explicit`.

### 8.2 Wrap-Up extraction (recommended default)
At Wrap-Up generation, run memory candidate extraction:
- propose candidate items,
- optionally show confirm/reject UI,
- commit accepted items to SQLite.

### 8.3 Inferred memory guardrails
Inferred memories should:
- include evidence,
- start with lower confidence,
- be easy to override or forget,
- never become immutable.

---

## 9) User Experience / Controls
Add a **Memory** management surface (phaseable):
- List remembered items,
- Filter by kind/topic,
- Edit confidence/summary,
- Forget/archive,
- “Why remembered?” provenance view,
- Toggle automatic inferred memory capture.

---

## 10) Optional Vector Layer (Phase 3)
SQLite-first with optional vectors later:
- add `memory_embeddings(memory_id TEXT PRIMARY KEY, vector BLOB, model TEXT, updated_at TEXT)`
- use extension-based KNN if available, otherwise app-side rerank.
- retrieval pipeline: metadata filter -> vector rerank -> confidence/recency blend.

This phase is optional and should be deferred until memory volume/quality justifies added complexity.

---

## 11) Implementation Phases

### Phase A — Foundation
- Create SQLite schema and migration bootstrap.
- Implement `MemoryStore` CRUD + provenance linking.
- Add simple retrieval by topic + recency + confidence.
- Detailed execution breakdown: `Implementation_AgentMemory_PhaseA.md`

### Phase B — Runtime Integration
- Inject memory context in `ChatViewModel.sendMessage()`.
- Add explicit memory commands handling (remember/forget intents).

### Phase C — Wrap-Up Integration
- Add memory extraction pass during Wrap-Up flow.
- Add confirm-before-commit UI for inferred items.

### Phase D — Memory UI
- Add memory browser/editor/forget actions.

### Phase E — Advanced Retrieval (optional)
- FTS, dedup improvements, optional vectors.

---

## 12) Task Checklist
- [ ] Create `MemoryStore.swift` with SQLite setup + schema migrations
- [ ] Create `MemoryModels.swift`
- [ ] Create `MemoryEngine.swift` ranking/extraction policies
- [ ] Integrate retrieval context into `ChatViewModel`
- [ ] Add explicit remember/forget handling path
- [ ] Integrate wrap-up extraction to memory candidates
- [ ] Build memory management UI (list/edit/forget)
- [ ] Add tests for retrieval ranking, decay, and provenance links
- [ ] Add migration/version tests for schema stability

---

## 13) Acceptance Criteria
- Memory persists across app restarts via SQLite.
- Tutor responses reflect stable learner preferences/goals.
- User can inspect/edit/delete memory entries.
- Retrieval remains token-bounded and does not bloat prompts.
- Provenance is available for each inferred memory item.
- No API keys or sensitive secrets are written into memory tables.
