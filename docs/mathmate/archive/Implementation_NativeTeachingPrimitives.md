# Implementation Plan: MathMate Native Teaching Primitives

> **This plan is now subsumed under Phase B of the merged implementation plan:**
> [`Implementation_ScrollPerformance.md`](Implementation_ScrollPerformance.md)
>
> Phase B (Native Primitives) builds on Phase A (Foundation — `ResponseUnit` containerization,
> stable identity, per-part height tracking, Equatable conformance) and feeds into
> Phase C (Flag-Based Intelligence — per-unit flags → better memory, wrap-up, compaction).
>
> This file remains the detailed reference for the primitive catalog, schema, and
> individual view components. The execution order, dependency graph, and testing
> strategy are in the parent plan.

## 1) Goal
Introduce a MathMate-native interactive teaching layer for quiz and tutoring interactions, replacing generic widget feel with cohesive first-party UI primitives.

Primary objective:
- Enable a **session-to-quiz pipeline** with structured, interactive cards that support:
  - problem prompts,
  - optional visualizations,
  - progressive hints,
  - hidden solutions revealed only on explicit user action ("Show me").

Secondary objective:
- Keep compatibility with existing widget/tool architecture while shifting rendering semantics from generic third-party libraries to typed MathMate primitives.

---

## 2) Product Rationale
Generic model harnesses can produce correct math text and render LaTeX, but they do not provide a stable learning UX loop. Native primitives create differentiation by enforcing:
- pedagogically consistent interactions,
- predictable reveal/hint behavior,
- structured attempt tracking,
- reusable analytics for mastery and misconception systems.

This plan is a foundational step toward:
- misconception detection,
- mastery tracking,
- adaptive quiz generation,
- exam simulation modes.

---

## 3) Scope

### In scope (v1)
1. Define and support first-party primitive types for quiz workflows.
2. Add strict schema validation for primitive specs.
3. Render primitives with MathMate-native styling and behavior.
4. Support hide/reveal solution UX with explicit user control.
5. Support optional visualization in quiz cards (function plots first).
6. Persist user interaction state for each primitive instance in-session.

### Out of scope (v1)
- Full grading engine for all problem types.
- Arbitrary custom JS execution from model output.
- Cross-session adaptive sequencing.
- Collaborative multi-user quiz sessions.

---

## 4) Primitive Catalog (v1)

## 4.1 `mm.quiz.free_response`
Free-response quiz card with optional visualization.

Required fields:
- `id: string`
- `type: "mm.quiz.free_response"`
- `promptMarkdown: string`

Optional fields:
- `latexPrompt?: string`
- `visualization?: MMVisualizationSpec`
- `expectedAnswer?: MMAnswerSpec` (hidden from user by default)
- `rubric?: MMRubricSpec`
- `hints?: string[]`
- `solution?: MMSolutionSpec`
- `difficulty?: "easy" | "medium" | "hard"`
- `conceptTags?: string[]`
- `generationSeed?: Int` (optional deterministic seed for reproducible quiz generation)

## 4.2 `mm.quiz.multiple_choice`
Multiple choice card with optional explanation reveal.

Required fields:
- `id: string`
- `type: "mm.quiz.multiple_choice"`
- `promptMarkdown: string`
- `options: MMChoiceOption[]`

Optional fields:
- `correctOptionId?: string` (hidden metadata)
- `hints?: string[]`
- `solution?: MMSolutionSpec`
- `visualization?: MMVisualizationSpec`
- `generationSeed?: Int` (optional deterministic seed for reproducible quiz generation)

## 4.3 `mm.hint.progressive`
Standalone progressive hint block.

Required fields:
- `id: string`
- `type: "mm.hint.progressive"`
- `stages: string[]` (ordered)

Behavior:
- User clicks “Next hint” to reveal one stage at a time.

## 4.4 `mm.reveal.solution`
Explicit reveal control for full solution.

Required fields:
- `id: string`
- `type: "mm.reveal.solution"`
- `solutionMarkdown: string`

Optional fields:
- `steps?: string[]`
- `buttonLabel?: string` (default `"Show me"`)
- `confirmReveal?: bool` (default `false`; recommended `true` in exam/simulation modes)

Behavior:
- Starts hidden.
- Revealed only by user click.
- Reveal action is logged.

## 4.5 `mm.graph.function` (visualization primitive)
Interactive function plot widget for quiz context.

Required fields:
- `id: string`
- `type: "mm.graph.function"`
- `expressions: string[]`

Optional fields:
- `domain?: [Double, Double]`
- `range?: [Double, Double]`
- `sliders?: MMSliderSpec[]`
- `annotations?: MMGraphAnnotation[]`
- `showGrid?: Bool`
- `showAxes?: Bool`

---

## 5) Canonical Spec Wrapper

All primitives are emitted under a common container:

```json
{
  "library": "mathmate-native",
  "type": "mm.quiz.free_response",
  "config": {
    "...primitive fields...": "..."
  },
  "version": "1.0"
}
```

Rules:
- `library` must be `mathmate-native` for native rendering path.
- `type` must be one of registered primitive IDs.
- `config` must pass schema validation before rendering.

---

## 6) Tooling Contract Changes

## 6.1 `create_widget_spec` prompt contract update
Model instruction changes:
- Prefer `library: "mathmate-native"` for quiz/tutor interactions.
- Use typed primitives instead of arbitrary HTML/CSS/JS.
- Include hidden solution/hints in structured fields, not narrative spill into chat text.

## 6.2 Validation layer
Add strict validation before rendering:
1. Parse JSON.
2. Validate wrapper fields.
3. Validate primitive-specific schema.
4. If invalid, return structured tool error and optional fallback text card.

No primitive should render on partial/invalid schema.

---

## 7) Rendering Architecture

## 7.1 New renderer path
Current path:
- `WidgetView` receives generic `WidgetSpec` and delegates by `library`.

New path:
- Add `MathMateNativeWidgetView` for `library == "mathmate-native"`.
- Primitive registry maps `type` -> native SwiftUI view.

## 7.2 New components (proposed)
- `NativeWidgets/MathMateNativeWidgetView.swift`
- `NativeWidgets/Primitives/MMQuizFreeResponseView.swift`
- `NativeWidgets/Primitives/MMQuizMultipleChoiceView.swift`
- `NativeWidgets/Primitives/MMProgressiveHintView.swift`
- `NativeWidgets/Primitives/MMRevealSolutionView.swift`
- `NativeWidgets/Primitives/MMFunctionGraphView.swift`
- `NativeWidgets/Schema/MathMatePrimitiveSchema.swift`
- `NativeWidgets/Schema/MathMatePrimitiveValidator.swift`
- `NativeWidgets/State/PrimitiveInteractionStore.swift`

## 7.3 View behavior standards
All native primitives should share:
- consistent card chrome (spacing, border radius, color tokens),
- standard title rows and action rows,
- keyboard-accessible controls,
- minimal animation only (no distracting transitions).

---

## 8) UX Design Details

## 8.1 Quiz card anatomy (free response)
- Header: concept tag chips + difficulty badge
- Prompt body: markdown + LaTeX rendering
- Visualization region (optional)
- Answer input region
- Action row:
  - `Check` (optional in v1, can be no-op message)
  - `Hint`
  - `Show me` (solution reveal)

## 8.2 Reveal UX
States:
1. `hidden`: solution not visible
2. `confirm`: optional confirmation dialog
3. `revealed`: full solution shown

Design constraints:
- Reveal is explicit and irreversible for that card instance in the current session state.
- Default reveal is one-click (no confirmation) for study flow; exam/simulation flows should set `confirmReveal = true`.
- UI should make reveal action intentional (prevents accidental spoilers).
- Revealing does **not** lock answer submission; post-reveal practice remains allowed.

## 8.3 Hint UX
- Hints are staged.
- One hint stage per click.
- Show “Hint 2/3” progress indicator.

## 8.4 Visualization embedding
For v1 in quiz cards:
- support function plotting only (`mm.graph.function`) as embedded child region,
- fixed-height viewport,
- consistent controls (reset view, toggle grid optional).

---

## 9) State & Persistence Model

## 9.1 Interaction state per primitive instance
Track:
- `primitiveId`
- `revealedSolution: Bool`
- `revealedHintIndex: Int`
- `selectedOptionId` (MCQ)
- `freeResponseText` (persisted by default)
- `attemptCount`
- `attemptPhase: preReveal | postReveal`
- `lastInteractionAt`
- `status: unattempted | attempted_pre_reveal | revealed | attempted_post_reveal | completed`

## 9.2 Storage scope
v1 persistence scope:
- session-local persistence via existing session message storage extension,
- no cross-session aggregation yet.

## 9.3 Serialization
Store primitive interaction payload as metadata attached to message entry containing the primitive spec.

---

## 10) Security & Safety Constraints
- Disallow arbitrary script execution in native primitive path.
- Reject unknown primitive types.
- Reject oversized payloads beyond configured limits.
- Strip or escape unsupported markdown/html in primitive text fields.
- Keep reasoning traces separate from primitive rendering (no regression).

---

## 11) Performance Requirements
- Primitive validation should complete in <5ms for normal specs.
- Initial card render should feel instant (<1 frame delay under normal load).
- Graph primitives must avoid reinitializing expensive views on every stream token.
- Streaming integration should append complete primitive blocks only after valid decode.

---

## 12) Observability (v1)
Capture analytics events in **local-only storage** (no remote telemetry in v1):
- `primitive_rendered`
- `hint_revealed`
- `solution_revealed`
- `quiz_option_selected`
- `quiz_attempt_submitted`

Use cases:
- evaluate engagement,
- estimate premature reveal rate,
- identify high-friction primitive types.

---

## 13) File-by-File Work Breakdown (No implementation yet)

### Ticket N1 — Schema + validator
**New files:**
- `Sources/MathMate/NativeWidgets/Schema/MathMatePrimitiveSchema.swift`
- `Sources/MathMate/NativeWidgets/Schema/MathMatePrimitiveValidator.swift`

**Deliverables:**
- codable primitive models
- strict validation with structured errors

### Ticket N2 — Native renderer registry
**New files:**
- `Sources/MathMate/NativeWidgets/MathMateNativeWidgetView.swift`
- `Sources/MathMate/NativeWidgets/MathMatePrimitiveRegistry.swift`

**Modify:**
- `Sources/MathMate/Views/WidgetView.swift`

**Deliverables:**
- branch on `library == mathmate-native`
- type-to-view mapping

### Ticket N3 — Quiz + reveal primitives
**New files:**
- `Sources/MathMate/NativeWidgets/Primitives/MMQuizFreeResponseView.swift`
- `Sources/MathMate/NativeWidgets/Primitives/MMQuizMultipleChoiceView.swift`
- `Sources/MathMate/NativeWidgets/Primitives/MMProgressiveHintView.swift`
- `Sources/MathMate/NativeWidgets/Primitives/MMRevealSolutionView.swift`

**Deliverables:**
- complete show/hide solution flow
- progressive hint flow

### Ticket N4 — Function graph primitive
**New files:**
- `Sources/MathMate/NativeWidgets/Primitives/MMFunctionGraphView.swift`

**Deliverables:**
- consistent graph container + controls
- reusable visualization embedding in quiz cards

### Ticket N5 — Interaction state persistence
**New files:**
- `Sources/MathMate/NativeWidgets/State/PrimitiveInteractionStore.swift`

**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`
- session storage models/files as needed

**Deliverables:**
- session-local state restore for hints/reveal/answers

### Ticket N6 — Tool contract + prompts
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift` (system prompt/tool instruction composition)
- `Sources/MathMate/Models/ToolExecutor` related tool metadata files

**Deliverables:**
- model reliably produces native primitive specs for quiz flows

### Ticket N7 — Tests
**New tests:**
- `Tests/MathMateTests/NativePrimitiveSchemaTests.swift`
- `Tests/MathMateTests/NativePrimitiveRenderTests.swift`
- `Tests/MathMateTests/QuizRevealStateTests.swift`

**Coverage:**
- schema validation success/failure
- reveal/hint state transitions
- persistence restore correctness
- malformed spec safe fallback behavior

---

## 14) Acceptance Criteria
1. Model can generate native quiz primitives using `mathmate-native` library.
2. Quiz cards render with cohesive first-party styling.
3. Solution is hidden by default and reveals only on explicit user action.
4. Progressive hints reveal stage-by-stage.
5. Optional function visualizations render inside quiz cards consistently.
6. Interaction state survives session reload.
7. `swift build` and `swift test` pass after implementation.

---

## 15) Rollout Plan
1. **Phase R1 (dark launch):** schema + renderer path behind feature flag `nativeTeachingPrimitives`.
2. **Phase R2:** enable `mm.reveal.solution` and `mm.hint.progressive` only.
3. **Phase R3:** add full quiz primitives (`free_response`, `multiple_choice`).
4. **Phase R4:** add `mm.graph.function` embedding.
5. **Phase R5:** tune prompt contract and telemetry-informed UX refinements.

---

## 16) Finalized Product Decisions
1. **Reveal confirmation policy**
   - Default: `confirmReveal = false` (no confirmation in normal study mode).
   - Exam/simulation mode: set `confirmReveal = true`.

2. **Post-reveal attempts**
   - Answer submission remains enabled after reveal.
   - Attempts are tagged with `attemptPhase` (`preReveal` vs `postReveal`).

3. **Free-response persistence**
   - Persist free-response input by default in session-local metadata.
   - Optional privacy toggle can be added in a later phase.

4. **Deterministic generation**
   - Support optional `generationSeed` in quiz primitives for reproducibility.

5. **Analytics scope**
   - Local-only analytics in v1.
   - No remote export/telemetry in this phase.

---

## 17) Dependencies & Risks
Dependencies:
- existing widget parsing pipeline (`create_widget_spec` + `WidgetView` path),
- stable markdown + LaTeX rendering stack.

Risks:
- model non-compliance with strict schemas,
- UI complexity creep if too many primitive types are added early,
- state synchronization bugs during streaming updates.

Risk mitigations:
- strict validator + graceful fallback card,
- start with narrow primitive set,
- gate release via feature flag and add targeted state tests.
