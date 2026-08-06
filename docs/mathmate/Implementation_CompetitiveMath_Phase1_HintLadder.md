# Competitive Math — Phase 1: Hint Ladder & Olympiad Coach Mode

**Feature:** Hint-ladder UI for olympiad-style problem sessions + new "Olympiad Coach" tutor style  
**Status:** Planned  
**Phase:** 16A  
**Stack:** Tauri v2 / React / TypeScript / Rust  
**Linked roadmap item:** Phase 16 — Competitive Math Support

---

## Overview

Olympiad training is fundamentally different from coursework: the skill being trained is *recognizing structure and choosing an attack*, and seeing a solution too early short-circuits the learning. This phase introduces two tightly coupled features:

1. **Hint Ladder** — a sequenced, pull-on-demand hint system that lets students get the minimal nudge they need without spoiling the solution
2. **Olympiad Coach tutor style** — a distinct system prompt profile that watches the student think, asks diagnostic questions, and only offers hints when genuinely needed

These two features are the highest-leverage changes for the competitive math use case and require minimal new infrastructure — mostly new prompting logic and a small UI widget.

---

## Rationale

The existing tutor styles (Socratic, Math Tutor, Explanation, Review) all follow a "teacher explains → student practices" model. Olympiad coaching is different:

- The coach observes and asks: *"What have you tried? Why did that fail?"*
- Hints are ordered from minimal to complete, and the student controls how far they go
- The goal is productive struggle, not quick understanding

AoPS forums have problems and solutions, but can't provide a personalized, calibrated hint sequence. That's the gap MathMate fills.

---

## Design

### Hint Ladder Widget

A new UI component rendered inside the chat timeline when the session is in olympiad-coach mode and a problem is active.

**States:**
```
[Problem] → [Attempt submitted] → [Hint 1 available]
                                       ↓ (click)
                                  [Hint 2 available]
                                       ↓ (click)
                                  [Hint 3 available]
                                       ↓ (click)
                                  [Full solution sketch]
```

**Widget anatomy:**
- Problem statement (collapsible after read)
- "What have you tried?" text area — student records their attempt before hints unlock
- Hint strip: numbered chips `[H1] [H2] [H3] [Solution]`
  - Locked chips are greyed out
  - Each chip unlocks only after the previous one is read
  - Clicking a chip fetches that hint from the model (lazy generation)
- "I solved it" / "I'm stuck" buttons that close the session and log the outcome

**Hint generation:**
Hints are generated lazily — only when requested. The model is prompted to produce a sequence of 3–4 hints of strictly increasing explicitness:
- H1: Meta-strategy ("Have you tried small cases?")
- H2: Structural observation ("Consider what happens modulo p")
- H3: Key invariant or transformation ("The key insight is ___")
- Solution sketch: Full outline (not necessarily full proof)

The model generates all 4 in one call (cheaper, avoids re-context) but only reveals them one at a time in the UI. The full response is stored in session state but gated behind the UI.

### Olympiad Coach Tutor Style

New entry in the tutor style selector: **"Olympiad Coach"**.

System prompt profile:
- Does NOT give worked examples unprompted
- Opens with: *"Here's the problem. Take as much time as you need. Tell me your initial observations."*
- Responds to student attempts with diagnostic questions: *"You said X — what happens if n=1?"*, *"That approach works for even n. What about odd?"*
- Only suggests hints when the student explicitly asks or has been stuck for a while (based on message count heuristic)
- When the student submits a proof attempt, gives structural/style feedback (see Phase 3 for reliability caveats)
- Tracks what approaches have been tried in the session context

**Session metadata tag:** `{ mode: "olympiad", problem_id: string | null, hints_used: number, solved: boolean }`

---

## Implementation Plan

### Frontend

**New component: `HintLadderWidget.tsx`**
- Props: `problem: string`, `hintCount: number`, `onHintRequest: (level: number) => Promise<string>`, `onOutcome: (solved: boolean, hintsUsed: number) => void`
- State: `hintsRevealed: number`, `hintTexts: string[]`, `attemptText: string`, `locked: boolean`
- Renders inside `ChatMessage` timeline when segment type is `"hint-ladder"`

**New segment type in timeline data model:**
```typescript
interface HintLadderSegment {
  kind: "hint-ladder";
  problem: string;
  hints: string[];        // pre-generated, revealed lazily in UI
  hintsRevealed: number;  // persisted so refresh doesn't reset
  solved: boolean | null;
  hintsUsed: number;
}
```

**Slash command: `/problem`**
- Opens a text area to paste a problem statement
- Triggers hint ladder generation and switches session to olympiad-coach mode
- Works alongside existing `/help` and `/compact`

**Tutor style update:**
- Add `"olympiad"` to `TUTOR_STYLES` in `WelcomePage.tsx` and project settings
- Add corresponding system prompt in `chatStore.ts` prompt builder

### Backend (Rust)

Minimal changes required:
- Store `hints_used` and `solved` in session metadata (extend `SessionHeader`)
- No new Tauri commands needed — hint generation uses existing `stream_chat`

### Prompt Engineering

**Hint generation prompt (one-shot, produces all hints):**
```
You are generating a hint ladder for this olympiad problem:
<problem>{{PROBLEM}}</problem>

The student has attempted:
<attempt>{{ATTEMPT}}</attempt>

Generate exactly 4 hints in JSON:
{
  "h1": "...",  // meta-strategy, no specifics
  "h2": "...",  // structural observation
  "h3": "...",  // key invariant or transformation
  "solution": "..." // full outline proof sketch
}

Rules:
- h1 must be answerable without knowing the solution
- Each hint must be strictly more revealing than the previous
- Do NOT mention the next hint in any hint
- solution should be a sketch, not a complete formal proof
```

**Olympiad coach system prompt:**
```
You are an experienced olympiad math coach. Your student is working on a competition problem.

Your coaching philosophy:
- Let the student struggle productively. Do not give solutions or hints unless explicitly asked.
- Ask probing questions: "What have you tried?", "What happens for small cases?", "Why does that step fail?"
- When the student asks for a hint, say "Let me give you a small nudge" and give only the minimum needed.
- Track what approaches have been tried. If a dead end has been visited, acknowledge it briefly.
- Celebrate genuine progress. Be encouraging without being dishonest about gaps.
- Never say "it is clear that" or "obviously" — nothing is obvious.

Tutor style: Olympiad Coach
```

---

## Acceptance Criteria

- [ ] `/problem` slash command opens hint ladder UI
- [ ] Student must write an attempt before H1 unlocks
- [ ] Hints reveal one at a time, H(n+1) locked until H(n) is read
- [ ] All 4 hints generated in one model call, stored in session
- [ ] `hintsRevealed` persists across refresh
- [ ] Olympiad Coach style appears in tutor style selector
- [ ] Session outcome (solved/stuck, hints used) saved in session header
- [ ] Works with any configured model (no model-specific code)

---

## Open Questions

- Should the hint ladder be available in all tutor styles, or gated to Olympiad Coach only?
  - Proposed: available in all styles, but Olympiad Coach activates automatically
- Timer: should we show elapsed time on the problem? Useful for competition prep.
  - Proposed: opt-in timer widget alongside hint ladder
- Should H1-H3 be generated up-front or one at a time?
  - Decision: up-front (one call), revealed lazily in UI (see above)

---

## Dependencies

- Existing streaming chat infrastructure (`stream_chat` Tauri command)
- Existing tutor style system (`chatStore.ts` prompt builder)
- Existing slash command infrastructure

## Related Docs

- `Implementation_Phase16B_ProblemBank.md` — problem sourcing and difficulty tagging
- `Implementation_Phase16C_CompetitiveMathCatalog.md` — free resource catalog additions
- `Implementation_Phase16D_ProofCritique.md` — proof critique with reliability caveats
