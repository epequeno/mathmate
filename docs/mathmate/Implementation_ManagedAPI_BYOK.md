# Implementation Plan: Managed MathMate API + BYOK (Monetization Path)

## 1) Goal
Provide a plug-and-play default experience for non-technical users (no provider API keys, no model selection complexity) while preserving full BYOK (Bring Your Own Key) flexibility for advanced users.

---

## 2) Product Strategy

### Default mode: Managed MathMate API
- User signs in to MathMate account.
- App uses official MathMate endpoint.
- No provider key setup required.
- Model/provider routing handled server-side.

### Advanced mode: BYOK
- User can configure OpenRouter/OpenAI/Anthropic-compatible keys locally.
- Existing power-user workflow remains supported.
- User controls provider/model selection and cost directly.

---

## 3) Scope

### In scope (v1)
- Dual runtime mode (`managed` vs `byok`)
- Official MathMate API endpoint in app config
- Account auth for managed mode
- Usage metering primitives (requests/tokens/cost buckets)
- Tier-aware routing policy (e.g., standard/pro models)
- Clear settings UX to switch modes

### Out of scope (v1)
- Complex multi-tenant enterprise billing
- Public third-party developer API marketplace
- Full self-serve billing portal (can be staged)

---

## 4) Architecture (High-Level)

App -> MathMate API -> Upstream provider routers/providers

Managed API responsibilities:
- auth/session validation
- provider routing + fallback
- retry/backoff and reliability
- usage metering + entitlement checks
- moderation/abuse throttling
- feature APIs (quiz generation, mastery services, retrieval)

Client responsibilities:
- mode selection (`managed`/`byok`)
- local UX + session state
- BYOK config handling (existing)

---

## 5) UX Requirements

## 5.1 Onboarding
- New users default to Managed mode.
- No API key prompts during initial setup.
- Optional “Advanced: Use my own provider keys” entry point.

## 5.2 Settings
- Provider section includes:
  - `MathMate Cloud (Recommended)` toggle
  - `Use my own keys (Advanced)` toggle
- Mode switch explains tradeoffs:
  - managed: easiest, subscription-based
  - BYOK: self-managed billing/provider control

## 5.3 In-chat model UX
- Managed mode exposes simple tiers (e.g., Standard / Pro), not raw provider lists by default.
- BYOK mode can expose full provider/model selector.

---

## 6) Monetization Model (Candidate)

## 6.1 Subscription-first
- Free tier: limited monthly usage/trial credits
- Plus tier: higher limits + priority models
- Pro tier: largest limits + premium features (native quiz/memory features)

## 6.2 Optional overages
- per-token or per-request overage after quota

## 6.3 BYOK coexistence
- BYOK may include:
  - free/basic app access with reduced cloud features, or
  - lower platform fee for advanced features only

---

## 7) Compliance, Legal, and Risk Checklist
- Verify upstream provider/router resale/proxy terms before launch.
- Publish privacy policy with explicit data retention controls.
- Add anti-abuse controls:
  - per-user rate limits
  - anomaly detection
  - emergency throttles
- Ensure API keys and secrets remain server-side only in managed mode.

---

## 8) Technical Work Breakdown

### Ticket M1 — Runtime mode abstraction
**Modify:**
- `Sources/MathMate/ViewModels/ChatViewModel.swift`
- provider selection/config layers

**Deliverables:**
- clean `managed` vs `byok` runtime branch
- shared message streaming interface

### Ticket M2 — Managed auth + session
**New/Modify:**
- auth/session service files
- settings store for managed account state

**Deliverables:**
- login/session refresh
- managed endpoint token attachment

### Ticket M3 — Settings UX
**Modify:**
- `Sources/MathMate/Views/SettingsView.swift`
- model/provider settings views

**Deliverables:**
- explicit mode switch
- explanatory UX copy

### Ticket M4 — Metering plumbing
**New/Modify:**
- usage accounting models and context panel surfacing

**Deliverables:**
- usage counters from managed responses
- quota state in UI

### Ticket M5 — Entitlements and plan gates
**New:**
- entitlement service abstraction

**Deliverables:**
- feature and model gating by plan

### Ticket M6 — BYOK regression hardening
**Tests:**
- ensure BYOK path remains fully functional when managed mode exists

---

## 9) Acceptance Criteria
- New users can complete onboarding and send messages with no API key setup.
- BYOK remains available and functional.
- Runtime mode is transparent and user-switchable.
- Usage/plan state is visible in app.
- `swift build` and `swift test` pass after implementation.

---

## 10) Rollout Plan
1. R1: internal managed endpoint + feature flag.
2. R2: opt-in beta for managed mode, BYOK default fallback retained.
3. R3: managed mode default for new users; BYOK in advanced settings.
4. R4: tiered plans and entitlement gating.

---

## 11) Open Questions (Needs Review)
1. Should managed mode support explicit model selection, or only tier-level choices?
2. How should BYOK users access premium app features (subscription add-on vs free)?
3. What retention controls should be user-configurable at launch?
4. Should managed and BYOK usage stats be shown in one unified dashboard?
