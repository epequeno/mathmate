# Implementation Plan: Learner Levels (Elementary → Postgrad)

## 1) Goal
Adapt MathMate tutoring behavior to learner developmental stage and academic context, from elementary learners through graduate/postgraduate learners.

This feature introduces a structured **Learner Level Profile** that affects explanation style, rigor, pacing, and output format across chat, quizzes, and classroom workflows.

---

## 2) Product Outcome
MathMate should feel like a different tutor depending on learner level:
- Elementary: visual, simple language, short scaffolded steps
- Middle/High: guided but standards-aligned practice
- Undergrad: conceptual + procedural depth
- Grad/Postgrad: rigorous, formal, assumption-aware analysis

---

## 3) Learner Level Model

## 3.1 Enum
Add a core enum:
- `elementary`
- `middleSchool`
- `highSchool`
- `undergrad`
- `gradPostgrad`

## 3.2 Profile fields
Create `LearnerProfile` model:
- `level: LearnerLevel`
- `gradeBandOrProgram: String?` (e.g., “Grade 4”, “Calculus I”, “PhD PDEs”)
- `goals: [String]`
- `preferredPace: PaceMode` (`slow`, `normal`, `fast`)
- `hintStyle: HintStyle` (`guided`, `balanced`, `minimal`)
- `notationDensity: NotationDensity` (`light`, `standard`, `dense`)
- `readingComplexity: ReadingComplexity` (`simple`, `standard`, `advanced`)

Persistence target:
- Session-level override in session metadata
- Optional project default in settings
- Optional memory-level persistent learner profile (later phase)

---

## 4) Behavior Matrix

## 4.1 Elementary
- short, concrete sentences
- one concept per step
- visual-first recommendations (widgets)
- check-for-understanding frequently
- avoid unnecessary symbolic compression

## 4.2 Middle School
- scaffold operations explicitly
- emphasize pattern recognition and error prevention
- use vocabulary with concise definitions

## 4.3 High School
- exam/homework alignment
- balance speed with reasoning transparency
- include alternate methods where useful

## 4.4 Undergrad
- include intuition + formal method
- discuss constraints/assumptions
- handle multi-step derivations and edge cases

## 4.5 Grad/Postgrad
- rigorous definitions and proof structure
- assumptions, limitations, and method comparisons
- optional citation/research framing

---

## 5) Prompt Composition Integration

Extend current prompt builder in `ChatViewModel`:

Final effective prompt:
`[global base] + [learner level block] + [mode block] + [feature guidance: widgets/tools/etc.]`

### Level block requirements
- deterministic and concise
- explicit do/don’t constraints per level
- no hidden chain-of-thought requirement changes

Example snippet for elementary:
```text
Learner level: Elementary.
Use short sentences, concrete examples, and one step at a time.
After every 1–2 steps, ask a simple check-for-understanding question.
Prefer visual/interactive explanations when appropriate.
```

---

## 6) UI/UX Plan

## 6.1 Session toolbar controls
Add compact control group in chat toolbar:
- Level selector dropdown
- “Adaptivity” quick menu (pace, hints, notation)

## 6.2 Settings defaults
Add defaults in Settings → Chat:
- default learner level
- default pace/hint style/notation density

## 6.3 Explainability
Context panel should show active profile:
- level
- pace
- hint style
- if profile is inherited (project default) or overridden (session)

---

## 7) Quiz Integration

Update `/quiz` plan to be level-aware:
- Question format by level:
  - elementary: fewer items, concrete prompts, optional visuals
  - high school: mixed conceptual/procedural
  - undergrad+: proof/derivation/transfer-heavy
- language complexity aligned with profile
- answer key detail level configurable by level

---

## 8) Classroom Integration

In classroom mode (future):
- teacher sets baseline level per student/group
- MathMate adapts automatically per student profile
- dashboard tracks progression between support levels over time

Signals:
- scaffold dependency trend
- misconception recurrence
- readiness for increased rigor

---

## 9) File-by-File Tickets

### Ticket LL1 — Core models
**New file:**
- `Sources/MathMate/Models/LearnerProfile.swift`

**Tasks:**
- define enums and profile model
- add Codable/Sendable conformance

### Ticket LL2 — Session metadata persistence
**Modify:**
- `Sources/MathMate/Persistence/SessionStore.swift`

**Tasks:**
- add optional learner profile metadata to `SessionHeader`
- maintain backward compatibility defaults

### Ticket LL3 — ChatViewModel prompt integration
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

**Tasks:**
- add active learner profile state
- integrate level block into `_effectiveSystemPrompt(...)`

### Ticket LL4 — Toolbar UI
**Modify:**
- `Sources/MathMate/Views/MainView.swift` (`MainToolbarView`)

**Tasks:**
- add learner level selector
- add pace/hints quick controls

### Ticket LL5 — Settings defaults
**Modify:**
- `Sources/MathMate/ViewModels/SettingsViewModel.swift`
- `Sources/MathMate/Views/Settings/SettingsChatView.swift`

### Ticket LL6 — Context panel visibility
**Modify:**
- `Sources/MathMate/Views/ContextPanelView.swift`

### Ticket LL7 — Quiz tie-in
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`
- align with `Implementation_QuizSlashCommand.md`

### Ticket LL8 — Tests
**New tests:**
- `Tests/MathMateTests/LearnerProfilePromptTests.swift`
- `Tests/MathMateTests/LearnerProfilePersistenceTests.swift`
- `Tests/MathMateTests/LearnerLevelQuizAdaptationTests.swift`

---

## 10) Acceptance Criteria
- User can choose learner level per session.
- Tutor behavior visibly changes by level in wording, pacing, and rigor.
- Session metadata preserves chosen profile.
- Quiz generation adapts to level.
- Defaults configurable in settings.
- Build/tests pass.

---

## 11) Rollout Strategy
1. LL1–LL3 (hidden feature flag; prompt-level only)
2. LL4–LL6 UI exposure in toolbar/settings/context panel
3. LL7 quiz adaptation
4. Classroom tie-in after collaboration/classroom foundation

---

## 12) Risks & Mitigations
1. **Over-generalized level behavior**
   - Mitigation: keep controls editable (pace/hints/notation), not rigid presets.
2. **Prompt bloat**
   - Mitigation: strict size cap for level block; concise templates.
3. **Incorrect age appropriateness**
   - Mitigation: pedagogy review set + targeted test prompts across levels.
4. **Conflicts with tutor modes**
   - Mitigation: deterministic precedence order in prompt composer.

---

## 13) Metrics
- learner level selection rate
- session satisfaction by level
- retry/correction rate by level
- quiz completion and score trends by level
- scaffold dependency trend (for classroom mode)
