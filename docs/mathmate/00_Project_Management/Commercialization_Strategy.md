# MathMate Commercialization Strategy (OSS Client + Optional Hosted Models)

## 1) Thesis
MathMate can remain free/open-source while monetizing an optional premium layer:

- **Free OSS app** for trust, adoption, and community contributions.
- **Optional MathMate-hosted model endpoints** for users who want best-in-class tutoring quality with minimal setup.

This is a pragmatic dual-path model:
- BYOK remains first-class.
- Paid hosted inference captures value from convenience + quality + reliability.

---

## 2) Product Strategy

## 2.1 Free Tier (Always)
- Open-source macOS app.
- Local session persistence.
- Local memory (SQLite) when implemented.
- BYOK model providers (OpenRouter/OpenAI/Anthropic).
- Core tutoring UX, KaTeX, Obsidian integration.

## 2.2 Paid Tier (MathMate Cloud)
- Hosted model(s) tuned for MathMate workflows.
- Better default tutoring quality and consistency.
- Higher reliability SLAs and sensible default limits.
- Optional premium workflows:
  - stronger wrap-up generation,
  - better memory-aware adaptation,
  - improved tool orchestration behavior.

Optional later:
- cloud sync of memory/session metadata,
- educator/team features,
- social sharing + collaboration features.

---

## 2.3 Collaboration + Education Expansion (new strategic track)

Add a commercialization track around collaborative learning and classroom workflows.

### Social/Community Features (consumer + creator)
- Shareable session links (read-only by default).
- Export/share prompt packs and tutor-mode configs.
- Import community prompt/config templates with trust/safety labeling.
- Optional "remix" flow: fork a shared session into your own workspace.

### Collaborative Sessions (future)
- Multi-user remote sessions (student + peer + tutor/teacher).
- Shared whiteboard/widget state for real-time problem solving.
- Role-based permissions (owner/editor/viewer).

### Teacher/Classroom Features (education plan)
- Classroom roster + assignment templates.
- Personalized instruction profiles per student (pace, misconception patterns, goals).
- Teacher dashboard with class-level learning signals:
  - topic mastery heatmap,
  - common misconceptions,
  - struggling-student alerts,
  - session/engagement trends.
- Teacher intervention tools:
  - targeted hint bundles,
  - recommended follow-up practice,
  - office-hours triage views.

### Guardrails for this track
- Strict privacy model (student data controls, explicit consent, granular sharing permissions).
- FERPA/COPPA/GDPR-readiness as product matures.
- Local-first defaults; cloud collaboration remains opt-in.

---

## 3) Why Users Would Pay
Clear value proposition must be explicit:
1. **Better tutoring outcomes** (not just “different model”).
2. **Less setup friction** (no API keys, no provider comparison work).
3. **Reliable defaults** (fast, stable, safe).
4. **MathMate-native behavior** (formatting discipline, wrap-ups, memory usage).

If paid quality is not visibly better than BYOK baseline, conversion will be weak.

---

## 4) Technical Architecture (Fit with current app)

## 4.1 Provider integration
Add a new provider option in `~/.mathmate/models.json` for MathMate-hosted endpoints.

- Reuse existing OpenAI-compatible provider path if possible.
- Keep existing provider abstraction (`ModelProvider`) unchanged where practical.
- Add authentication token handling via env var and/or secure app-level token flow.

## 4.2 Model routing
Start with one premium endpoint:
- `mathmate/tutor-v1`

Later split into role-optimized endpoints:
- `mathmate/tutor-v2` (pedagogy)
- `mathmate/planner-v1` (tool/task orchestration)

## 4.3 Safety + policy
- Keep mutation tool policies user-visible (`Allow/Ask/Block`).
- Preserve reasoning trace visibility policy in UI.
- Add server-side abuse/rate controls for hosted tier.

---

## 5) Business Model Options

## Option A — Subscription (recommended to start)
- **Pro Individual** monthly/annual.
- Included monthly token budget + overage or throttled fallback.

## Option B — Usage-based
- Metered billing by input/output tokens.
- Better for power users; harder UX for mainstream users.

## Option C — Hybrid
- Subscription includes base quota, plus metered overage.

Recommended launch: **Option A (simple plans)**, then hybrid later.

---

## 6) Unit Economics Framework
Before launch, validate per-active-user economics:

- avg daily prompts/user
- avg tokens/turn (in/out/reasoning)
- hosted COGS/token
- gross margin per plan

Guardrail target:
- healthy gross margin at p50 usage,
- survivable margin at p90 usage.

If margin too thin, adjust:
- model mix/routing,
- context budget defaults,
- plan limits.

---

## 7) Go-To-Market (Phased)

## Phase 0 — Validation (now)
- Build benchmark set of real math tutoring tasks.
- Compare baseline BYOK models vs candidate hosted/tuned model.
- Measure user-visible delta (accuracy, pedagogy, formatting quality, latency).

## Phase 1 — Private Beta
- Offer invite-only MathMate Cloud provider.
- Keep pricing simple and discounted for feedback.
- Instrument retention and session-level outcomes.

## Phase 2 — Public Launch
- Keep OSS app free.
- Add clear in-app upgrade path (“Use MathMate Cloud”).
- Publish transparent pricing and limits.

## Phase 3 — Expansion
- Team/education plan,
- API access,
- advanced memory/cloud sync features,
- social sharing + prompt/config marketplace,
- classroom analytics + teacher intervention workflows.

---

## 8) Metrics to Track

Activation:
- app install -> first solved tutoring task
- BYOK setup success rate

Conversion:
- free -> paid cloud provider selection rate
- trial -> paid conversion

Retention:
- D7/D30 active users
- sessions per week
- wrap-up usage rate
- shared-session adoption rate
- collaborative session repeat rate

Education/Classroom:
- teacher weekly active rate
- class assignment completion rate
- intervention-to-improvement rate
- time-to-identify struggling students

Quality:
- user thumbs up/down
- correction rate (user asks for fixes)
- latency p50/p95

Economics:
- COGS per active paid user
- gross margin by plan

---

## 9) Risks & Mitigations

1. **Insufficient quality delta**
   - Mitigation: benchmark-driven gating before launch; no paid push until clear win.

2. **Cost overruns**
   - Mitigation: usage caps, model routing, prompt/token budgets.

3. **Community trust concerns (OSS + paid)**
   - Mitigation: keep core app open, BYOK first-class, transparent roadmap.

4. **Vendor dependence**
   - Mitigation: support multiple backend providers and fallback routes.

5. **Data/privacy concerns**
   - Mitigation: explicit data policy, local-first defaults, opt-in cloud features.

6. **Classroom compliance complexity (FERPA/COPPA/GDPR)**
   - Mitigation: staged rollout, compliance-by-design data model, district/teacher admin controls.

---

## 10) Licensing & Governance Guidance
- Keep app code under OSS license (e.g., MIT/Apache-2.0).
- Hosted model weights/prompts/evals may remain proprietary.
- Publish clear boundary: what is open, what is paid managed service.
- Avoid lock-in by preserving BYOK pathways.

---

## 11) Decision Gates (Kill/Go Criteria)

Proceed to public paid launch only if:
1. Hosted model shows clear quality win on benchmark + beta feedback.
2. Unit economics meet margin target under realistic usage.
3. Core reliability metrics (latency/error) meet minimum thresholds.

If any gate fails:
- continue as OSS + BYOK,
- revisit hosting model architecture later.

---

## 12) Immediate Next Steps
1. Define a 50–100 item tutoring benchmark set from real MathMate sessions.
2. Add instrumentation hooks for quality + latency metrics.
3. Prototype `MathMate Cloud` provider entry in `models.json` and UI copy.
4. Run small private beta with power users.
5. Reassess with decision gates above.
