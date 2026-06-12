# Implementation Plan: User-Defined Skills (MathMate)

## 1) Goal
Allow users to define reusable behavior packs (“skills”) that shape tutor behavior, tool usage, output style, and workflow preferences on a per-session or per-project basis.

This brings agent-harness flexibility to MathMate while preserving math-tutoring UX and safety constraints.

---

## 2) Scope

### In scope (v1)
- Skill definition format (metadata + instructions + optional policy block)
- Skill discovery from user and project locations
- Enable/disable skills in settings and per-session
- On-demand skill loading into runtime prompt composition
- Optional slash command to activate skill in chat (e.g. `/skill:proof-coach`)

### Out of scope (v1)
- Remote skill marketplace/sync
- Arbitrary executable scripts inside skills
- Team/shared permissions model

---

## 3) Product Behavior

1. User creates a skill file with:
   - `name`
   - `description`
   - `instructions`
   - optional `tags`, `allowedTools`, `defaultMode`

2. MathMate discovers and validates available skills.

3. User can:
   - enable a default skill set globally,
   - set project-level default skills,
   - activate/deactivate skills in current chat session.

4. Runtime includes enabled skill instructions when composing effective system prompt.

5. Active skills are visible in UI (chips/toggles) for transparency.

---

## 4) Skill Format (v1)

## 4.1 File format
- Primary: Markdown with YAML frontmatter (`.md`)
- Optional future: JSON schema variant

Example:

```md
---
name: proof-coach
description: Focus on proof strategy, minimal spoilers, and theorem justification.
tags: [proof, undergrad]
allowedTools: [read_file, search_notes]
defaultMode: socratic
---

# Proof Coach

- Ask one guiding question before giving full proof.
- Require explicit statement of theorem assumptions.
- Prefer hint progression: structure -> key lemma -> full derivation.
```

## 4.2 Validation rules
- Name: lowercase, alphanumeric/hyphen, max 64 chars
- Description required, max 1024 chars
- Instruction body required
- Unknown frontmatter keys tolerated but ignored (warn)

---

## 5) Storage & Discovery

Discovery locations (proposal):
- Global user skills: `~/.mathmate/skills/`
- Project-local skills: `<projectRoot>/.mathmate/skills/`

Behavior:
- Merge skills from both scopes
- Project-local skill name collision overrides global (explicitly surfaced in UI)
- Persist enabled skill IDs in:
  - global settings (default set)
  - project settings (project default set)
  - session metadata (active set at send time)

---

## 6) Runtime Integration

## 6.1 Prompt composition
Extend `ChatViewModel._effectiveSystemPrompt` pipeline:
1. base system prompt
2. project context
3. formatting rules
4. enabled skill instruction blocks (ordered)
5. mode-specific/tool-specific constraints

## 6.2 Tool policy integration (optional v1.1)
- `allowedTools` in skill can constrain tool access for session
- final tool policy = intersection of global policy, project policy, active skills

## 6.3 Slash command integration
Add command family:
- `/skill` → list active/available skills
- `/skill:add <name>`
- `/skill:remove <name>`
- `/skill:reload`

---

## 7) UX Design

## 7.1 Settings
- “Skills” section:
  - discovered skills list
  - validation warnings
  - global default toggles

## 7.2 Project settings
- per-project default skill selection

## 7.3 Chat toolbar
- active skill chips (removable)
- quick add button (popover search)

## 7.4 Command discoverability
- `/help` should list `/skill` commands and examples

---

## 8) Security & Safety
- Skill instructions are untrusted text; never execute directly.
- v1 disallows executable scripts referenced by skills.
- Keep existing mutation confirmation policies intact regardless of skill content.
- Surface active skills clearly to reduce hidden-behavior risk.

---

## 9) File-by-File Work Breakdown

### Ticket S1 — Models + parser
**New files:**
- `Sources/MathMate/Skills/SkillDefinition.swift`
- `Sources/MathMate/Skills/SkillParser.swift`
- `Sources/MathMate/Skills/SkillValidator.swift`

### Ticket S2 — Discovery service
**New files:**
- `Sources/MathMate/Skills/SkillDiscoveryService.swift`

### Ticket S3 — Settings persistence
**Modify/New:**
- `Sources/MathMate/ViewModels/SettingsViewModel.swift`
- `Sources/MathMate/ViewModels/SettingsStore.swift`
- project/session metadata models as needed

### Ticket S4 — Runtime prompt wiring
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

### Ticket S5 — UI
**Modify/New:**
- `Sources/MathMate/Views/SettingsView.swift`
- `Sources/MathMate/Views/MainView.swift` (chat toolbar chips/popover)
- optional dedicated `SkillManagerView.swift`

### Ticket S6 — Slash commands
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift` command parser/help text

### Ticket S7 — Tests
**New tests:**
- `Tests/MathMateTests/SkillParserTests.swift`
- `Tests/MathMateTests/SkillDiscoveryTests.swift`
- `Tests/MathMateTests/SkillPromptIntegrationTests.swift`

---

## 10) Acceptance Criteria
- Users can define skills in supported locations and see them in UI.
- Users can enable skills globally/project/session-level.
- Active skills reliably influence runtime behavior via prompt composition.
- Slash commands for skill activation/deactivation work.
- `swift build` and `swift test` pass after implementation.

---

## 11) Rollout Plan
1. R1: parser + discovery + read-only listing in settings.
2. R2: global/project/session activation + prompt integration.
3. R3: toolbar UX + `/skill` commands.
4. R4: optional tool-policy constraint integration.

---

## 12) Open Questions (Needs Review)
1. Should project-local skills override global by name, or require explicit namespacing?
2. Should skill order be user-defined (priority list) or deterministic by source?
3. Should we allow signed/verified skills in future for safer sharing?
4. Should skill activation be stamped into each assistant message for auditability?
