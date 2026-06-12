# Implementation Plan — Chat Runtime Decomposition

## Objective
Break down `ChatViewModel` into focused runtime services to improve maintainability, testability, and performance isolation.

## Current Pain
`ChatViewModel` mixes UI state, provider orchestration, tool loop, memory injection, persistence, slash commands, and snapshot triggers.

## Proposed Components
- `ChatRuntimeCoordinator` — turn lifecycle + stream orchestration
- `ToolLoopCoordinator` — tool-call rounds, policy checks, result routing
- `ChatPersistenceAdapter` — session/header/message persistence
- `PromptAssemblyService` — system prompt, memory block, mode composition
- `SnapshotOrchestrator` — post-stream snapshot + image migration triggers

## Scope
- Primary: `prototype/MathMate/Sources/MathMate/ViewModels/ChatViewModel.swift`
- Supporting: provider/tool/persistence integration points

## Milestones
1. Extract pure helpers first (no behavior change).
2. Introduce protocol boundaries for provider/tool/persistence dependencies.
3. Move tool-loop execution out of view model.
4. Move prompt assembly + memory injection out of view model.
5. Keep `ChatViewModel` as thin UI-facing facade.

## Validation
- Maintain existing tests; add focused tests per new service.
- Verify streaming/tool behavior parity with existing sessions.

## Risks
- Regression risk in cancellation/stream finalization.
- Increased plumbing initially; offset by improved long-term clarity.
