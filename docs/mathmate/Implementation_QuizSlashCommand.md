# Implementation Plan: `/quiz` Slash Command

## 1) Goal
Add a slash command that generates quizzes from current session context (or selected previous sessions), with answer key and optional save-to-vault workflow.

Command family:
- `/quiz` (current session)
- `/quiz recent [n]`
- `/quiz session <session-id-or-name>`
- `/quiz project [count]`

---

## 2) UX Requirements

## 2.1 Chat command behavior
- Running `/quiz` creates a quiz draft message in chat.
- Quiz appears as structured markdown with sections:
  - Topic
  - Difficulty
  - Questions
  - (Optional) Answer key collapsed/toggled

## 2.2 Optional save flow
- Add `Save Quiz` action similar to Wrap-Up save.
- Default path: `<vault>/MathMate/Quizzes/`.

## 2.3 Safety/clarity
- Show provenance: sessions used to build quiz.
- If insufficient history, provide graceful fallback message.

---

## 3) Command Spec

## 3.1 Basic forms
- `/quiz`
  - Uses active session messages.
- `/quiz recent 3`
  - Uses last 3 sessions of active project.
- `/quiz session <query>`
  - Uses best matching session name/id.
- `/quiz project 5`
  - Uses last 5 sessions in project scope.

## 3.2 Options (flags)
- `--difficulty easy|medium|hard` (default medium)
- `--count 5` (# questions)
- `--format mcq|short|mixed` (default mixed)
- `--with-solutions true|false` (default true)

Example:
`/quiz recent 4 --difficulty hard --count 8 --format mixed`

---

## 4) Implementation Design

## 4.1 Parsing layer
Extend slash-command parsing in `ChatViewModel.handleSlashCommand`:
- parse primary source selector (current/recent/session/project)
- parse optional flags
- validate bounds (e.g., max count)

## 4.2 Session source resolver
Use `SessionStore` to load selected sessions and aggregate messages.
Create helper:
- `_resolveQuizSources(args:) -> [SessionHeader]`
- `_buildQuizCorpus(from sessions:) -> String`

## 4.3 Quiz generator pipeline
- Build deterministic prompt template requesting JSON/markdown schema.
- Provider streaming allowed; finalize into `QuizDraft` model.
- Fallback local generator if model unavailable (simple question transforms).

## 4.4 Output model
New type in `ChatViewModel` or dedicated file:
- `QuizDraft { title, topic, difficulty, questions, answerKey, sourceSessionIds }`

Render as message `.text(...)` initially.
(Phase 2: consider dedicated `ContentPart.quiz`.)

---

## 5) File-by-File Tickets

### Ticket Z1 — Command parsing
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

**Tasks:**
- add `/quiz` branch in command router
- implement args/flags parser

### Ticket Z2 — Quiz generation helpers
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

**Add:**
- `_generateQuiz(...)`
- `_buildQuizPrompt(...)`
- `_renderQuizMarkdown(...)`

### Ticket Z3 — Optional save integration
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`
- `Sources/MathMate/Views/MainView.swift`

**Tasks:**
- add Save Quiz action and write path helper
- include source/session metadata in saved markdown frontmatter

### Ticket Z4 — Settings hooks (optional)
**Modify:**
- `Sources/MathMate/ViewModels/SettingsViewModel.swift`
- `Sources/MathMate/Views/Settings/SettingsChatView.swift`

**Settings:**
- default quiz count
- default difficulty
- include solutions by default

### Ticket Z5 — Tests
**New tests:**
- `Tests/MathMateTests/QuizCommandParsingTests.swift`
- `Tests/MathMateTests/QuizGenerationTests.swift`

**Coverage:**
- command parsing variants
- session source resolution
- prompt contains provenance + constraints
- fallback generation path

---

## 6) Prompt Contract (MVP)

Require generator output sections:
1. `# Quiz: <topic>`
2. `## Questions`
3. `## Answer Key` (if enabled)
4. `## What to Review Next`

Question mix defaults:
- 40% conceptual
- 40% procedural
- 20% transfer/challenge

---

## 7) Acceptance Criteria
- `/quiz` works on current session with useful output.
- User can target previous/recent sessions.
- Output quality is study-oriented and source-grounded.
- Optional save-to-vault works.
- Build/tests pass.

---

## 8) Future Enhancements
- `ContentPart.quiz` rich rendering with reveal answers button
- Adaptive quizzes using Memory profile + prior mistakes
- Spaced repetition scheduling and retry queues
