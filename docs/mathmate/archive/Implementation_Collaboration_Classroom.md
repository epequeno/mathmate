# Implementation Plan: Collaboration + Classroom Features

## 1) Goal
Introduce a phased collaboration and education platform layer for MathMate:
- social sharing (sessions/prompts/configs),
- optional multi-user remote sessions,
- teacher classroom workflows with student personalization + class analytics.

This plan is designed to fit MathMate’s local-first architecture while adding opt-in cloud capabilities.

---

## 2) Principles
- **Local-first default:** private/local workflows remain first-class.
- **Opt-in cloud:** sharing and multi-user features require explicit enablement.
- **Role-based access:** owner/editor/viewer and classroom roles.
- **Privacy by design:** minimum data collection, auditability, configurable retention.
- **Education-safe posture:** staged compliance path (FERPA/COPPA/GDPR readiness).

---

## 3) Phased Scope

## Phase C1 — Social Sharing (single-user publish, read-only consume)
- Share session snapshots via link (read-only).
- Export/import prompt packs and tutor configs.
- “Remix” a shared session into local workspace.
- Basic trust labels for imported content (verified author, community, unknown).

## Phase C2 — Collaborative Sessions (small groups)
- Live shared session room (2–5 users initially).
- Shared widget/whiteboard state.
- Presence + turn indicators.
- Branch/fork support in collaborative context.

## Phase C3 — Classroom Layer
- Teacher creates classes and invites students.
- Assignment templates tied to topics/goals.
- Student progress feed and at-risk indicators.
- Teacher interventions (targeted hints/resources/follow-up prompts).

---

## 4) Data Model (Cloud-side)

Core entities:
- `User`, `Org`, `Classroom`, `Enrollment`
- `SharedArtifact` (session, prompt-pack, config-pack)
- `CollaborativeRoom`, `RoomParticipant`, `RoomEvent`
- `Assignment`, `Submission`, `Intervention`
- `StudentLearningSignal` (mastery, misconception, engagement, trend)

Access model:
- Artifact ACLs: `private`, `link-read`, `org-read`, `class-read`, `explicit-users`
- Classroom roles: `teacher`, `assistant_teacher`, `student`

---

## 5) Client Architecture Changes

### New modules
- `CollabService` (network API + auth token handling)
- `ShareViewModel` (publish/import/remix flows)
- `RealtimeSessionClient` (WebSocket/event stream)
- `ClassroomViewModel` (classes, assignments, interventions)

### Existing integration points
- `SessionStore`:
  - export/import safe session snapshot format
  - provenance metadata for shared imports
- `ChatViewModel`:
  - publish current session
  - consume shared artifact into new local session
  - optional real-time event sync in collaborative mode
- `MainView`:
  - Share actions in toolbar/context menus
  - Classroom tab (later phase)

---

## 6) Security, Privacy, Compliance
- End-to-end transport encryption (TLS).
- Signed artifact links with expiration and revocation.
- PII minimization in analytics; pseudonymous IDs where feasible.
- Configurable retention + delete/export requests.
- Admin audit logs for classroom actions.
- Compliance checklist gates before education GA:
  - policy docs,
  - data processing controls,
  - parent/guardian handling path for minors.

---

## 7) File-by-File Tickets (Client)

### Ticket CL1 — Shareable artifact export/import
**Modify:**
- `Sources/MathMate/Persistence/SessionStore.swift`
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

**New:**
- `Sources/MathMate/Collab/SharedArtifactModels.swift`

### Ticket CL2 — Share UI + commands
**Modify:**
- `Sources/MathMate/Views/MainView.swift`
- `Sources/MathMate/ViewModels/ChatViewModel.swift`

**Commands:**
- `/share session`
- `/share prompt-pack`
- `/import <link-or-file>`

### Ticket CL3 — Auth + API client
**New:**
- `Sources/MathMate/Collab/CollabService.swift`
- `Sources/MathMate/Collab/AuthTokenStore.swift`

### Ticket CL4 — Realtime collaboration shell
**New:**
- `Sources/MathMate/Collab/RealtimeSessionClient.swift`

**Modify:**
- `ChatViewModel` event apply/reconcile pipeline

### Ticket CL5 — Classroom MVP views
**New:**
- `Sources/MathMate/Views/Classroom/ClassroomDashboardView.swift`
- `Sources/MathMate/ViewModels/ClassroomViewModel.swift`

### Ticket CL6 — Tests
**New tests:**
- `Tests/MathMateTests/SharedArtifactTests.swift`
- `Tests/MathMateTests/CollabRealtimeTests.swift`
- `Tests/MathMateTests/ClassroomSignalsTests.swift`

---

## 8) Classroom Analytics (MVP)

Student-level signals:
- topic coverage,
- misconception recurrence,
- response latency/effort,
- assignment completion.

Class-level aggregates:
- mastery heatmap by topic,
- most common error patterns,
- intervention recommendations queue.

Teacher interventions:
- push hint set,
- assign targeted practice,
- request follow-up explanation from student.

---

## 9) Acceptance Criteria by Phase

### C1
- User can share/read/remix sessions and prompt/config packs.
- Sharing controls are clear and revocable.

### C2
- Small-group collaborative session is stable and conflict-safe.
- Realtime state sync is resilient to reconnects.

### C3
- Teacher can track class progress and identify at-risk students.
- Teacher can issue targeted interventions from dashboard.

---

## 10) Rollout Strategy
1. Internal alpha: artifact sharing only.
2. Private beta: small collaborative rooms.
3. Educator pilot: 1–3 classrooms with feedback loops.
4. Public classroom launch after compliance/readiness gates.

---

## 11) Monetization Fit
- Pro individual: share/remix and limited collaboration.
- Team/Education plans: classroom dashboards, analytics, interventions, higher collaboration limits.
- Keep BYOK + local-only workflows available in free tier.
