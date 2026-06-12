# Implementation Plan — Main-Actor I/O Offload

## Objective
Remove blocking file/data operations from main-actor UI paths to reduce jank during chat, session switching, and image workflows.

## Targets
- `ChatViewModel.attachImage(from:)` (`Data(contentsOf:)` on main actor)
- Session/config file reads in UI-triggered paths
- Large message/session load/save operations

## Scope
- `prototype/MathMate/Sources/MathMate/ViewModels/ChatViewModel.swift`
- `prototype/MathMate/Sources/MathMate/Persistence/SessionStore.swift`
- `prototype/MathMate/Sources/MathMate/Configuration/ConfigurationManager.swift`

## Milestones
1. **Audit all sync I/O on @MainActor paths**
   - Categorize as small/cheap vs potentially blocking.
2. **Offload strategy**
   - Move expensive reads/writes to background tasks or actors.
   - Keep UI mutations on `MainActor` only.
3. **Session loading refactor**
   - Async load API returning decoded models.
   - Preserve current UX (no behavior regressions).
4. **Image ingestion refactor**
   - Decode/transform image data off-main.
   - Keep thumbnail/display assignment on main.

## Validation
- Profiling: reduced main-thread stalls during attach/load/restore flows.
- Regression checks: session restore, wrap-up, and message send still work.

## Risks
- Actor boundary mistakes causing stale UI updates.
- Need careful cancellation handling for rapid session switches.
