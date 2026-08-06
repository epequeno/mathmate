# Implementation Plan: Agent Memory — Phase C (Tiering, Trust, Lineage)

## 1) Goal
Upgrade MathMate memory from "retrieval + manual memory ops" to a clearer consolidation model:

- **Working memory**: per-turn injected context
- **Episodic memory**: session/compaction-aware events
- **Semantic memory**: durable learner facts and patterns

while adding **trust scoring** and **session lineage** so retrieval quality improves over time.

---

## 2) Scope

### In scope
- Trust-score policy on memory feedback events (`+0.05 / -0.10`, clamped [0,1])
- Retrieval threshold filtering (default min trust: `0.30`)
- Session lineage metadata for compaction and restore chains (`parentSessionId`)
- Flagged-unit extraction pipeline (ResponseUnit → semantic memory candidate)
- Tier labels/flow in retrieval path (`working -> episodic -> semantic`)

### Out of scope
- Vector DB / embeddings
- Knowledge graph layer
- Procedural memory learning automation (future phase)

---

## 3) File-by-File Tickets

### MC1 — Trust scoring + threshold retrieval
**Modify:**
- `Sources/MathMate/Memory/MemoryModels.swift`
- `Sources/MathMate/Memory/MemoryStore.swift`
- `Sources/MathMate/Memory/MemoryEngine.swift`

**Tasks:**
- Add `trustScore`, `helpfulCount`, `unhelpfulCount` fields (migration-safe defaults)
- Add helpers:
  - `recordHelpful(memoryId:)`
  - `recordUnhelpful(memoryId:)`
- Filter low-trust entries during retrieval (configurable threshold)

---

### MC2 — Session lineage for episodic chain integrity
**Modify:**
- `Sources/MathMate/Models/SessionModels.swift` (or equivalent session state model)
- `Sources/MathMate/ViewModels/ChatViewModel.swift`
- compaction/restore flow files used by `/compact`

**Tasks:**
- Add optional `parentSessionId` to session metadata
- On compaction split, set child session's `parentSessionId = sourceSession.id`
- Preserve lineage during restore and replay

---

### MC3 — Flagged-unit extraction into semantic memory
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`
- `Sources/MathMate/Memory/MemoryEngine.swift`
- wrap-up integration path(s)

**Tasks:**
- Extract candidates from flagged `ResponseUnit`s only (with unit type + excerpt)
- Deduplicate against existing semantic entries
- Store source provenance (`sessionId`, `messageId`, `unitId`)

---

### MC4 — Tier-aware retrieval orchestration
**Modify:**
- `Sources/MathMate/Memory/MemoryEngine.swift`
- `Sources/MathMate/Views/ContextPanelView.swift` (optional observability)

**Tasks:**
- Build retrieval in deterministic order:
  1. Working (current-turn hints)
  2. Episodic (recent lineage chain)
  3. Semantic (trusted durable memory)
- Add lightweight debug counters in context panel

---

## 4) Testing Plan

**Modify/New:**
- `Tests/MathMateTests/MemoryIntegrationTests.swift`
- add `Tests/MathMateTests/MemoryTieringTrustTests.swift`

**Coverage:**
- Trust score clamp behavior and asymmetry (+0.05/-0.10)
- Threshold filtering correctness
- Compaction lineage survives save/load/restore
- Flagged-unit extraction writes provenance and dedupes
- Tier ordering deterministic under fixed clock

---

## 5) Acceptance Criteria
- Retrieval quality improves by excluding low-trust stale memory.
- Compaction no longer loses episodic chain identity.
- Flagged units are persisted into semantic memory without duplicates.
- Build + tests pass.

---

## 6) Rollout Notes
- Gate with feature flags:
  - `memory.trustScoringEnabled`
  - `memory.flaggedExtractionEnabled`
  - `memory.lineageEnabled`
- Start with conservative defaults (threshold 0.30).
