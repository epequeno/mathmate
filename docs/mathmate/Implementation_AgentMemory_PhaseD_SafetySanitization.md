# Implementation Plan: Agent Memory — Phase D (Safety & Sanitization)

## 1) Goal
Prevent memory poisoning and unsafe prompt re-injection by sanitizing memory writes and constraining memory-to-prompt rendering.

---

## 2) Threat Model (Practical)
- Prompt-injection strings persisted into memory and replayed later
- Exfiltration-oriented content (API key harvesting instructions)
- Role-hijack text stored as "facts"
- Oversized/low-signal memory entries degrading retrieval quality

---

## 3) Scope

### In scope
- Memory write scanner + blocker rules
- Sanitized rendering for `Memory Context` block injection
- Policy toggles (`block`, `warn`, `allow`) for suspicious writes
- Audit fields for rejected/sanitized entries

### Out of scope
- Full DLP pipeline
- Cloud moderation dependency

---

## 4) File-by-File Tickets

### MS1 — Write-time sanitization pipeline
**New:**
- `Sources/MathMate/Memory/MemorySanitizer.swift`

**Modify:**
- `Sources/MathMate/Memory/MemoryEngine.swift`
- `Sources/MathMate/Memory/MemoryStore.swift`

**Tasks:**
- Implement scanners for high-risk patterns:
  - instruction override phrases ("ignore previous instructions", etc.)
  - role/system impersonation markers
  - obvious exfil commands / secret-pattern leakage
- Return structured result:
  - `accepted`
  - `acceptedWithRedaction`
  - `rejected`

---

### MS2 — Prompt-safe memory rendering
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

**Tasks:**
- Escape/strip unsafe markdown/control fragments before injection
- Render memory as declarative facts only (no imperative text)
- Enforce per-item and total block length caps

---

### MS3 — Settings + observability
**Modify:**
- `Sources/MathMate/ViewModels/SettingsViewModel.swift`
- `Sources/MathMate/Views/Settings/SettingsChatView.swift`
- `Sources/MathMate/Views/ContextPanelView.swift`

**Tasks:**
- Add "Memory safety mode" setting (`strict`, `balanced`, `off`)
- Show count of rejected/sanitized memory writes (debug/advanced view)

---

## 5) Testing Plan

**New:**
- `Tests/MathMateTests/MemorySafetyTests.swift`

**Coverage:**
- Injection phrase detection (true positives)
- Benign math content not over-blocked (false positive guard)
- Sanitized rendering never emits blocked patterns
- Length caps and clipping deterministic

---

## 6) Acceptance Criteria
- Unsafe memory writes are blocked or sanitized per policy.
- Injected memory context is fact-only and bounded.
- No regression in normal memory capture for tutoring content.
- Build + tests pass.

---

## 7) Rollout Notes
- Start in `balanced` mode by default.
- Log scanner decisions in debug builds for tuning.
- Revisit patterns after first week of real usage.
