# Managed API Vendor Due-Diligence Matrix (MathMate)

> **Status:** Draft for product/engineering review (not legal advice)
> **Date:** 2026-05-20
> **Purpose:** Evaluate provider/router options for MathMate Managed API + BYOK strategy.

---

## 1) Evaluation Criteria

Scoring key:
- **Strong** = clear support for intended use
- **Medium** = generally compatible but needs contract/legal clarification
- **Weak** = significant ambiguity or likely conflict with target model

Criteria:
1. **End-user app support** (can we power a product used by our users?)
2. **Resale/proxy fit** (can we operate a managed API without violating account/key rules?)
3. **Data controls** (retention controls, training-on-data defaults)
4. **Commercial/legal maturity** (business terms, indemnity posture, enterprise readiness)
5. **Operational readiness** (reliability/SLA posture and production signals)
6. **Overall fit for MathMate managed default**

---

## 2) Vendor Matrix (Initial Pass)

| Vendor | End-user app support | Resale/proxy fit | Data controls | Commercial/legal maturity | Operational readiness | Overall fit |
|---|---|---|---|---|---|---|
| **OpenAI (direct)** | **Strong** | **Medium-Strong** | **Strong** | **Strong** | **Strong** | **Strong** |
| **Anthropic (direct)** | **Strong** | **Medium** | **Strong** | **Strong** | **Strong** | **Strong** |
| **Mistral (direct)** | **Strong** | **Medium** | **Medium-Strong** | **Strong** | **Medium-Strong** | **Medium-Strong** |
| **Groq** | **Strong** | **Medium-Strong** | **Strong** | **Medium-Strong** | **Strong** | **Medium-Strong** |
| **Together AI** | **Medium-Strong** | **Medium** | **Medium-Strong** | **Medium-Strong** | **Medium** | **Medium** |
| **OpenRouter** | **Medium** (pending full review) | **Medium** (pending full review) | **Medium** | **Medium** | **Medium** | **Medium (pending)** |
| **AWS Bedrock** | **Strong** | **Strong** | **Strong** | **Strong** | **Strong** | **Strong** |
| **Azure OpenAI** | **Strong** | **Strong** | **Strong** | **Strong** | **Strong** | **Strong** |
| **Google Vertex AI** | **Strong** | **Strong** | **Strong** | **Strong** | **Strong** | **Strong** |
| **Fireworks** | **Medium** | **Weak-Medium** (needs careful term parsing) | **Medium** | **Medium** | **Medium** | **Weak-Medium (pending)** |

---

## 3) Evidence Notes (High-Level)

## 3.1 OpenAI (direct)
- Services agreement language supports integrating APIs into customer applications and making those available to end users.
- Key restrictions include account/key transfer and policy compliance.
- **Action:** legal verify managed-proxy architecture and any latest policy updates.

## 3.2 Anthropic (direct)
- Commercial terms explicitly reference powering products/services for customer users.
- Restrictions include limits around reselling except as approved.
- **Action:** confirm your exact monetization architecture is in-bounds (managed subscription vs API resale framing).

## 3.3 Mistral (direct)
- Commercial terms framed for organizations with end users/customer offerings.
- Contains key/account transfer and use restrictions, plus model-specific additional terms.
- **Action:** validate any special limits for specific model families/feature sets.

## 3.4 Groq
- Services agreement includes right to integrate services into customer apps and make available to end users.
- Explicitly disallows resell/lease access to account itself.
- **Action:** structure managed mode as service consumption via your app, not account resale.

## 3.5 Together AI
- Business API terms are compatible with commercial use.
- Restriction language around offering services on a standalone basis requires careful interpretation.
- **Action:** legal review of your managed API positioning.

## 3.6 OpenRouter
- Terms page identified, but full extraction/review in this pass was incomplete.
- **Action:** do full legal pass before selecting as managed default backend.

## 3.7 Fireworks
- Retrieved terms include broader platform/community-style clauses; potential mismatch with clean managed proxy strategy.
- **Action:** require legal and vendor clarification before production commitment.

## 3.8 Hyperscalers (Bedrock/Azure/Vertex)
- Common enterprise path for commercial apps with strong legal/compliance posture.
- Complexity/cost may be higher initially than direct API aggregators.
- **Action:** evaluate based on GTM timeline, compliance needs, and margin.

---

## 4) Recommended Shortlist for MathMate Managed Mode

## Tier A (start here)
1. **OpenAI (direct)**
2. **Anthropic (direct)**
3. **Mistral (direct)**

## Tier B (performance/cost optional)
4. **Groq**

## Tier C (after legal deep-dive)
5. **OpenRouter**
6. **Together AI**

## Enterprise-heavy path (optional)
7. **AWS Bedrock / Azure OpenAI / Vertex AI** for high-compliance B2B variant.

---

## 5) Contract Questions to Send Vendors (Template)

1. Does your agreement explicitly permit us to offer a paid end-user app where inference is called from our backend on behalf of users?
2. Is this considered acceptable “managed service” use vs prohibited resale of account/API access?
3. Are there any restrictions on exposing model outputs to our end users in a subscription app?
4. Can we route among multiple models/providers behind one customer-facing endpoint?
5. What are your data retention defaults? Can we disable training on our traffic by default?
6. What indemnity is provided for output/IP claims, and what exclusions apply?
7. What SLA/uptime commitments are available and at what pricing tier?
8. Can terms be locked for a committed term, or can key pricing/terms change unilaterally?
9. Are there region/country restrictions that would block our target user base?
10. Are there explicit prohibitions against “wrapper”/proxy services in our intended architecture?

---

## 6) Go/No-Go Gates Before Launching Managed Mode

- [ ] Legal counsel reviews target vendor contracts (current versions)
- [ ] Written vendor confirmation for intended deployment model
- [ ] Unit economics verified at expected token mix and growth curve
- [ ] Data processing + retention posture documented in privacy policy
- [ ] Abuse/rate-limit controls in place
- [ ] BYOK fallback path tested and always available

---

## 7) Suggested Next Step
Create a lightweight **RFI packet** using Section 5 questions and send to 3 Tier-A vendors first, then make a final backend decision based on:
1) legal certainty,
2) margin,
3) reliability,
4) roadmap fit for MathMate-native features.
