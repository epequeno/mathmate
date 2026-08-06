# Implementation Plan — Snapshot Pipeline Hardening

## Objective
Fix correctness and reliability gaps in the LaTeX snapshot pipeline so completed response units always render accurate snapshots without hangs.

## Problems to Address
- `SnapshotStore.requestSnapshot` currently ignores provided `htmlContent`.
- `LaTeXSnapshotPool.PooledWebView.loadAndWait(html:timeout:)` does not enforce timeout.
- Snapshot requests can fail silently and leave stale UI placeholder states.

## Scope
- `prototype/MathMate/Sources/MathMate/Rendering/SnapshotView.swift`
- `prototype/MathMate/Sources/MathMate/Rendering/LaTeXSnapshotPool.swift`
- `prototype/MathMate/Sources/MathMate/ViewModels/ChatViewModel.swift` (triggering paths)

## Milestones
1. **Correct content flow**
   - Pass `htmlContent` through `SnapshotStore` into pool render path.
   - Keep KaTeX shell as wrapper while injecting per-unit content.
2. **Timeout safety**
   - Implement hard timeout in `loadAndWait` with fallback completion.
   - Ensure continuation is resumed exactly once.
3. **Failure handling**
   - Add explicit state transitions (`loading -> failed`) with retry path.
   - Prevent indefinite loading states.
4. **Parity checks**
   - Verify visual parity between live `LaTeXView` and captured snapshot.

## Validation
- Unit test: snapshot request uses supplied content.
- Unit test: timeout path returns failure state (no hang).
- Manual: stream long message, ensure snapshot replaces live view after completion.

## Risks
- WebKit timing races around JS message callbacks.
- Snapshot sizing mismatch vs live view; mitigate with shared shell and common CSS.
