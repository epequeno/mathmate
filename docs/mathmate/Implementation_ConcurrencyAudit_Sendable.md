# Implementation Plan — Concurrency Audit & Sendable Hardening

## Objective
Reduce unsafe concurrency surface by auditing `@unchecked Sendable` usage and documenting/enforcing isolation invariants.

## Scope
- `ModelProvider.swift`
- `LaTeXSnapshotPool.swift`
- `MemoryStore.swift`
- `SynapseManager.swift`
- `ImageDiskCache.swift`
- Other `@unchecked Sendable` declarations in `Sources/MathMate`

## Milestones
1. **Inventory + rationale table**
   - For each unchecked type: why needed, isolation owner, mutability model.
2. **Eliminate where feasible**
   - Replace with actors/value types or explicit `@MainActor` confinement.
3. **Invariant docs**
   - Add file-level comments for remaining unchecked cases.
4. **Concurrency tests**
   - Add stress-style tests for high-risk components.

## Validation
- Build with strict concurrency checks enabled.
- No behavior regressions under parallel streaming/tool workflows.

## Risks
- Some external APIs (WebKit/SQLite pointers) may require retained unchecked wrappers.
- Over-correction may add unnecessary contention if not balanced.
