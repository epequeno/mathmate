# Implementation Plan — Logging & Safety Hardening

## Objective
Improve operational safety and diagnostics by removing crash-prone force unwraps and adopting structured logging.

## Targets
- Replace force-unwrapped URL creation in provider endpoint helper.
- Replace ad-hoc `print`/debug logs with `Logger` categories.
- Normalize error surfaces for config/network/parsing failures.

## Scope
- `prototype/MathMate/Sources/MathMate/Models/ModelProvider.swift`
- `prototype/MathMate/Sources/MathMate/MathMate.swift`
- `prototype/MathMate/Sources/MathMate/Visualization/CompilerLLMFallback.swift`
- Other files with `print(...)` diagnostics

## Milestones
1. Introduce logging categories (chat, provider, persistence, rendering, tools).
2. Replace force unwrap endpoint URL with throwing/safe constructor.
3. Downgrade noisy debug output to debug-level logs.
4. Ensure user-facing errors remain actionable while internal logs stay rich.

## Validation
- No force-unwrap crash path for malformed provider URL.
- Debug logs visible in development; reduced console noise in normal runtime.

## Risks
- Log volume if categories/levels are not tuned.
- Need to preserve critical diagnostics during migration from print-based logs.
