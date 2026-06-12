# Implementation Plan — Session Store Scalability

## Objective
Improve session persistence performance for large histories by reducing full-file reads/rewrites and improving append/update patterns.

## Current Issues
- Frequent full-file string loading/parsing for header/message operations.
- `replaceMessages` rewrites entire JSONL file.
- Message counting relies on whole-file read.

## Scope
- `prototype/MathMate/Sources/MathMate/Persistence/SessionStore.swift`

## Milestones
1. **I/O API split**
   - Introduce streaming/incremental read helpers for JSONL.
2. **Header operations optimization**
   - Avoid repeated full-file loads where possible.
3. **Message loading strategy**
   - Add paged/recent-window loading API for UI.
4. **Count/index optimization**
   - Optional metadata sidecar (counts + last activity + offsets).
5. **Compaction/replace efficiency**
   - Reduce full rewrites in common paths.

## Validation
- Benchmarks on synthetic large sessions (1000+ messages).
- Functional parity for restore, rename, compaction, and replay.

## Risks
- JSONL compatibility for old sessions.
- Atomicity guarantees during partial writes.
