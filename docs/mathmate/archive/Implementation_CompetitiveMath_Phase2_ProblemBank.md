# Competitive Math — Phase 2: Problem Bank & Practice Sessions

**Feature:** Structured problem bank with difficulty tiers, topic tags, and timed practice sessions  
**Status:** Planned  
**Phase:** 16B  
**Stack:** Tauri v2 / React / TypeScript / Rust  
**Linked roadmap item:** Phase 16 — Competitive Math Support  
**Depends on:** Phase 16A (Hint Ladder)

---

## Overview

A curated, offline-first problem bank covering the AMC → AIME → USAMO/IMO difficulty spectrum. Problems are tagged by topic and difficulty tier, sourced from public-domain competition archives. Students can start timed practice sessions, record attempts, use the hint ladder, and build a personal problem log — the standard workflow of serious olympiad competitors.

---

## Problem Sources & Licensing

All sources below are public domain or explicitly free for educational use:

| Source | Coverage | License |
|---|---|---|
| IMO 1959–present | All 6 problems/year | Public domain (official archive) |
| USAMO 1972–present | All problems | Public domain |
| AIME 1983–present | All problems | Public domain |
| AMC 10/12 1950–present | All problems | Public domain (pre-2000 clearly; recent years grey area — use pre-2010 for safety) |
| IMO Shortlist | Annual shortlists | Public domain |
| Putnam 1938–present | All problems | Public domain |

**Seeding strategy:** Ship a curated subset (~500 problems) as a bundled JSON file in the app binary. This is small (problems are text + LaTeX), works offline, and avoids any live API dependency. The catalog can be updated with app releases.

---

## Data Model

### Problem record

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompProblem {
    pub id: String,               // e.g. "imo-2019-p2"
    pub source: ProblemSource,    // IMO | USAMO | AIME | AMC | Putnam | Custom
    pub year: u32,
    pub number: u8,               // problem number within contest
    pub difficulty: DifficultyTier,
    pub topics: Vec<ProblemTopic>,
    pub statement: String,        // LaTeX
    pub answer: Option<String>,   // for AIME/AMC (numeric); None for proof problems
    pub solution_sketch: Option<String>, // optional; used as final hint-ladder entry
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DifficultyTier {
    Amc,          // AMC 10/12 (early problems)
    Aime,         // AIME / AMC 10/12 (hard end)
    UsamoEasy,    // USAMO P1/P4
    UsamoHard,    // USAMO P2/P3/P5/P6
    ImoEasy,      // IMO P1/P4
    ImoHard,      // IMO P2/P3/P5/P6
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProblemTopic {
    Combinatorics,
    NumberTheory,
    Algebra,
    Geometry,
    Inequalities,
    FunctionalEquations,
    Probability,    // rarer at olympiad level
    Other,
}
```

### Attempt record (stored per-session in vault)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProblemAttempt {
    pub problem_id: String,
    pub session_id: String,
    pub timestamp: String,
    pub elapsed_seconds: u32,
    pub outcome: AttemptOutcome,
    pub hints_used: u8,
    pub notes: String,            // student's written approach
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AttemptOutcome {
    Solved,
    PartialProgress,
    Stuck,
    GaveUp,
}
```

---

## UI: Practice Session Flow

### 1. Problem picker (`/practice` slash command or "Practice" button)

Filter controls:
- **Topic:** All | Combinatorics | Number Theory | Algebra | Geometry | Inequalities | Functional Equations
- **Difficulty:** AMC | AIME | USAMO Easy | USAMO Hard | IMO Easy | IMO Hard
- **Source:** All | IMO | USAMO | AIME | AMC | Putnam
- **Exclude solved:** toggle (based on local attempt history)
- **Random pick** button

### 2. Active problem view

- Full problem statement with KaTeX rendering
- Optional countdown timer (configurable: off / 15 / 30 / 45 / 60 min)
- "Start working" confirmation (starts timer)
- Scratch area — plain text, saved to session
- Hint ladder widget (from Phase 16A)
- "Submit attempt" → opens outcome dialog

### 3. Outcome dialog

- Radio: Solved / Partial progress / Stuck / Gave up
- Text: "Summarize your key insight or where you got stuck" (saved to vault note)
- Star rating (optional self-assessment 1–5)
- "View solution sketch" button (unlocks after outcome recorded)

### 4. Problem log (new sidebar section or vault page)

A chronological log of all attempted problems:
- Problem ID, date, outcome icon, hints used, time taken
- Filter by topic/outcome
- Click → opens session replay

---

## Vault Integration

Each completed attempt generates a vault note:

```markdown
---
type: problem-attempt
problem_id: imo-2019-p2
source: IMO 2019, Problem 2
topic: [combinatorics, graph-theory]
difficulty: ImoEasy
outcome: solved
hints_used: 1
time_minutes: 38
date: 2026-06-12
---

## Problem

Let $n$ be a positive integer...

## My Approach

Started by trying small cases for $n = 2, 3$...
Key insight: model the configuration as a bipartite graph...

## What I Learned

The probabilistic method applies when you need to show existence...
```

This is identical in format to the existing wrap-up study logs, so Synapse can index and retrieve problem attempts as part of vault context.

---

## Implementation Plan

### Backend (Rust)

**New file: `src/problem_bank.rs`**
- Load bundled `resources/problem-bank.json` via `include_str!`
- `list_problems(filter: ProblemFilter) -> Vec<CompProblem>`
- `get_problem(id: &str) -> Option<CompProblem>`
- `random_problem(filter: ProblemFilter) -> Option<CompProblem>`

**New file: `src/problem_attempts.rs`**
- Store attempts in `~/.mathmate/attempts/` as per-problem JSON files
- `save_attempt(attempt: ProblemAttempt) -> Result<()>`
- `list_attempts(problem_id: Option<&str>) -> Vec<ProblemAttempt>`
- `get_attempt_stats() -> AttemptStats` (solved count by topic/tier)

**New Tauri commands (register in `lib.rs`):**
```rust
list_problems, get_problem, random_problem,
save_problem_attempt, list_problem_attempts, get_attempt_stats
```

**Problem bank data file: `src-tauri/resources/problem-bank.json`**
- Initial seed: ~200 problems spanning all tiers and topics
- Priority curation: IMO 1990–2024 P1/P4 (accessible entry point), AIME 2000–2020 (good for AMC→AIME transition)

### Frontend

**New page: `PracticePage.tsx`** (route `/practice`)
- Problem picker with filters
- Integrates `HintLadderWidget` from Phase 16A
- Timer component (countdown + elapsed)
- Outcome recording form

**New component: `ProblemLog.tsx`**
- Tabular view of attempts with filter
- Linked from Overview page stats section

**Sidebar addition:**
- "Practice" link in nav (between Chat and Vault)

**Slash command: `/practice [topic] [difficulty]`**
- Quick entry into practice mode from chat

---

## Progress Tracking & Stats (Overview Page Integration)

Add a "Competition Prep" card to the Overview page:

```
┌─────────────────────────────────────┐
│ Competition Prep                     │
│ 47 problems attempted                │
│                                      │
│ Solved     ████████░░  32 (68%)      │
│ Partial    ██░░░░░░░░   9 (19%)      │
│ Stuck      ██░░░░░░░░   6 (13%)      │
│                                      │
│ Strongest: Number Theory             │
│ Needs work: Geometry                 │
│                                      │
│ Recent: IMO 2019 P2  ✓ 38 min        │
└─────────────────────────────────────┘
```

---

## Acceptance Criteria

- [ ] `resources/problem-bank.json` ships with ≥200 curated problems
- [ ] Problem picker filters by topic, difficulty, source, excludes-solved
- [ ] Random problem selection respects active filters
- [ ] Timer starts on "Start working", pauses on minimize, saves elapsed time
- [ ] Hint ladder available during practice (from Phase 16A)
- [ ] Outcome recording saves to `~/.mathmate/attempts/`
- [ ] Completed attempt generates a vault note in the correct format
- [ ] Problem log visible and filterable
- [ ] Overview page shows competition prep stats card
- [ ] All problems render LaTeX correctly via KaTeX

---

## Open Questions

- Should we support user-added custom problems? (Proposed: yes, via a "New problem" form, stored locally)
- Should attempt stats sync across devices? (Proposed: out of scope for v1 — local only)
- Problem bank update mechanism: ship new problems in app updates, or allow user-fetched updates?
  - Proposed: app updates for v1; consider separate update channel later

---

## Dependencies

- Phase 16A (Hint Ladder) — the practice session uses the hint ladder widget
- Existing vault integration (wrap-up note format)
- Existing Overview page (stats card addition)

## Related Docs

- `Implementation_CompetitiveMath_Phase1_HintLadder.md`
- `Implementation_CompetitiveMath_Phase3_Catalog.md`
- `Implementation_CompetitiveMath_Phase4_ProofCritique.md`
