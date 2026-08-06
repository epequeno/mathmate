# Competitive Math — Phase 4: Proof Critique

**Feature:** Structured proof critique with explicit reliability caveats, style feedback, and optional Lean formalization pathway  
**Status:** Planned  
**Phase:** 16D  
**Stack:** Tauri v2 / React / TypeScript / Rust  
**Linked roadmap item:** Phase 16 — Competitive Math Support  
**Depends on:** Phase 16A (Hint Ladder, Olympiad Coach mode)

---

## Overview

Students can submit a proof attempt and receive structured feedback. This feature is designed around a clear-eyed understanding of what LLMs can and cannot reliably do for proof critique (see Research Notes below). The feedback is framed as "things to double-check" rather than "your proof is valid/invalid" — honest about the model's limitations.

---

## Research Notes: LLM Proof Reliability

These notes inform all design decisions in this phase.

**Key finding ("Proof or Bluff?", Petrov et al., ETH Zurich, March 2025):**
Expert human annotators graded LLM-generated proofs for all 6 USAMO 2025 problems.
- All models scored **<5%** on average — except Gemini 2.5 Pro at **~25%**
- Most dangerous failure: all LLMs *consistently claimed to have solved problems they hadn't*. They produced confident, plausible-looking proofs with logical gaps.
- This is the "bluff" problem: models cannot reliably tell when their own reasoning is invalid.

**What this means for proof critique:**
A model that can't detect gaps in its own proofs is also unreliable at detecting gaps in a student's proof. It may:
- Approve an invalid proof (worst case — false confidence)
- Flag a valid proof (annoying but harmless)
- Miss subtle case gaps or unstated assumptions

**What LLMs ARE reasonably good at:**
- Catching arithmetic/algebraic calculation errors
- Flagging "hand-wavy" language ("it is clear that", "obviously", "trivially")
- Identifying missing base cases or induction steps
- Style feedback (clarity, structure, notation)
- Suggesting what a more careful proof of a specific step would look like

**Model recommendation:**
Use **Gemini 2.5 Pro** for any proof critique task where logical soundness matters. It is the only publicly available model with a non-trivial score on rigorous olympiad-level proof evaluation (25% vs <5% for all others as of March 2025). For AMC/AIME-level (computational, answer-based), model choice matters less.

**Longer-term: Lean integration**
The only currently reliable approach for formal proof verification is translating to a proof assistant (Lean 4 / Mathlib). Projects like DeepSeek-Prover and APOLLO (LLM+Lean collaboration) are making this more accessible. This is flagged as a future direction (see Phase 16E).

---

## Design Principles

1. **Never claim a proof is correct.** Only surface specific things to check.
2. **Tier feedback by confidence.** "Almost certainly wrong" vs "worth double-checking" vs "style suggestion."
3. **Explain what model was used** and that logical soundness cannot be guaranteed.
4. **Recommend Gemini 2.5 Pro** if the user is on a different model — surface a nudge, not a hard block.
5. **Make it easy to request a hint** if the critique reveals a real gap (connects to Phase 16A hint ladder).

---

## UI Design

### Entry point: `/critique` slash command or "Critique my proof" button

When a student has a proof attempt in the session, a "Critique my proof" button appears above the input bar. This opens a structured submission panel.

### Proof submission panel

```
┌─────────────────────────────────────────────────────┐
│ Proof Critique                                       │
│                                                      │
│ Problem (optional — fill in for context):            │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Let n be a positive integer...                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Your proof:                                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │ We proceed by strong induction on n.            │ │
│ │ Base case: n = 1 is trivial.                    │ │
│ │ ...                                             │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Feedback focus (optional):                           │
│ ○ Full review  ○ Logic only  ○ Style only            │
│                                                      │
│ ⚠ Using: claude-3.7-sonnet                           │
│   For best results on proof logic, Gemini 2.5 Pro    │
│   is recommended. [Switch model]                     │
│                                                      │
│ [Submit for critique]                                │
└─────────────────────────────────────────────────────┘
```

### Critique response format

The model is prompted to return structured JSON that the UI renders as a structured feedback card — not a free-form chat message.

**Rendered feedback card:**

```
┌─────────────────────────────────────────────────────┐
│ Proof Critique                            ⚠ See note │
│                                                      │
│ 🔴 Potential logic gaps (2)                          │
│  • Base case: "n = 1 is trivial" — state explicitly  │
│    what value the expression takes and why it works. │
│  • Step 3: The inequality on line 4 needs            │
│    justification; it does not follow directly from   │
│    the induction hypothesis.                         │
│                                                      │
│ 🟡 Worth double-checking (1)                         │
│  • The step "since k < n, the hypothesis applies"    │
│    — confirm your induction is strong induction,     │
│    not weak; state this explicitly.                  │
│                                                      │
│ 🟢 Style suggestions (2)                             │
│  • Replace "it is clear that" on line 6 — olympiad   │
│    proofs should justify every step.                 │
│  • Define your variables (a, b, k) before first use. │
│                                                      │
│ ─────────────────────────────────────────────────── │
│ ⚠ Reliability note                                   │
│   LLMs can miss subtle logical errors or flag valid  │
│   steps incorrectly. This critique is a checklist,  │
│   not a proof checker. Treat 🔴 items as "review     │
│   carefully" not "definitely wrong."                 │
│                                                      │
│ [Get a hint for the gap in Step 3]  [Revise proof]   │
└─────────────────────────────────────────────────────┘
```

---

## Prompt Engineering

### Critique prompt

```
You are critiquing an olympiad math proof attempt. Your job is to identify potential issues — not to confirm the proof is correct.

<problem>{{PROBLEM_STATEMENT}}</problem>

<proof>{{PROOF_ATTEMPT}}</proof>

Focus: {{FOCUS}}

Return JSON only, no other text:
{
  "logic_gaps": [
    {
      "location": "brief description of where in the proof",
      "issue": "what might be wrong or missing",
      "confidence": "high | medium | low"
    }
  ],
  "double_check": [
    {
      "location": "...",
      "issue": "..."
    }
  ],
  "style": [
    {
      "location": "...",
      "suggestion": "..."
    }
  ],
  "overall": "one sentence summary"
}

Rules:
- Do NOT say the proof is correct. Only flag things to check.
- Flag every "it is clear that", "obviously", "trivially", "it follows that" as needing justification.
- Flag every implicit step — if something needs justification, say so.
- Keep each item to 1–2 sentences.
- If you cannot find issues, return empty arrays — do not invent them.
- Do not write the corrected proof.
```

### Model routing

When the user has Olympiad Coach mode active:
- Surface model recommendation in the submission panel if not on Gemini 2.5 Pro
- Still allow submission on any model (no hard block)
- Tag the critique response with which model was used

---

## Implementation Plan

### Frontend

**New component: `ProofCritiquePanel.tsx`**
- Controlled by a `showCritique` state in the chat session
- Contains the submission form (problem statement, proof textarea, focus radio)
- Shows model recommendation nudge based on current session model
- Renders critique response as a structured card (not raw markdown)

**New component: `CritiqueCard.tsx`**
- Renders the structured JSON critique response
- Traffic-light color coding: red/yellow/green sections
- "Get a hint" button links to hint ladder for flagged gaps
- Reliability note always shown at bottom

**Slash command: `/critique`**
- Opens `ProofCritiquePanel` with proof area pre-focused
- If a problem is active (from Phase 16B practice session), auto-fills problem statement

**Integration with practice session:**
- After submitting outcome in the practice flow, offer "Critique my proof attempt" if the student logged a written approach

### Backend (Rust)

No new Tauri commands required. Critique uses the existing `stream_chat` infrastructure.

The critique prompt is assembled in the frontend (`chatStore.ts` or a new `critiqueStore.ts`). The JSON response is parsed client-side and stored as a `CritiqueSegment` in the session timeline.

**New segment type:**
```typescript
interface CritiqueSegment {
  kind: "proof-critique";
  problem: string;
  proof: string;
  model_used: string;
  logic_gaps: CritiqueItem[];
  double_check: CritiqueItem[];
  style: CritiqueItem[];
  overall: string;
  timestamp: string;
}
```

---

## Phase 16E (Future): Lean Integration

This section documents the longer-term direction but is **not in scope for Phase 16D**.

Lean 4 + Mathlib provides machine-verifiable proof checking. The pipeline:

1. Student submits informal proof
2. LLM (DeepSeek-Prover or similar) attempts to translate to Lean 4
3. Lean 4 type-checker runs locally (ships as a bundled binary or via subprocess)
4. Result: either "Lean accepts this proof" (formally correct) or specific Lean error at specific step

This approach **cannot produce false positives** — if Lean accepts it, the proof is correct. But formalization is a high bar and the translation step still fails often for complex proofs.

**Prerequisites before building Phase 16E:**
- DeepSeek-Prover or equivalent must be available as a local model or affordable API
- Lean 4 subprocess integration (non-trivial on macOS/Windows)
- User education: Lean proofs look different from informal olympiad proofs

---

## Acceptance Criteria

- [ ] `/critique` slash command opens proof submission panel
- [ ] Panel shows model recommendation if not on Gemini 2.5 Pro
- [ ] Critique returns structured JSON and renders as a card (not free-form text)
- [ ] Traffic-light color coding (red/yellow/green)
- [ ] Reliability note always shown at bottom of critique card
- [ ] "Get a hint" button works for flagged gaps (links to hint ladder)
- [ ] Critique segment persists in session timeline across refresh
- [ ] Works from practice session outcome flow (auto-fills problem statement)

---

## Related Docs

- `Implementation_CompetitiveMath_Phase1_HintLadder.md`
- `Implementation_CompetitiveMath_Phase2_ProblemBank.md`
- Research: *"Proof or Bluff? Evaluating LLMs on 2025 USA Math Olympiad"* — Petrov et al., arXiv:2503.21934 (March 2025)
