# Competitive Math — Phase 3: Competition Resource Catalog

**Feature:** Curated catalog entries for free competitive math resources (Evan Chen handouts, Napkin, OTIS Excerpts, etc.)  
**Status:** Planned  
**Phase:** 16C  
**Stack:** Rust / JSON catalog file  
**Linked roadmap item:** Phase 16 — Competitive Math Support  
**Depends on:** Existing free textbook catalog infrastructure (`textbook-catalog.json`, `textbook_catalog.rs`)

---

## Overview

Add a "Competition Prep" section to the existing free textbook catalog. All resources below are freely available (Evan Chen's materials are CC-BY-SA with source on GitHub; competition problem archives are public domain). This phase is primarily a data/content task — the catalog infrastructure from `Implementation_FreeTextbooks.md` already handles browsing, downloading, and project integration.

---

## Resources to Add

### Tier 1 — Primary References (add immediately)

| ID | Title | Author | Subject tag | License | URL |
|---|---|---|---|---|---|
| `evan-napkin` | An Infinitely Large Napkin | Evan Chen | olympiad-general | CC-BY-SA 4.0 | https://web.evanchen.cc/napkin.html |
| `evan-otis-excerpts` | OTIS Excerpts | Evan Chen | olympiad-general | CC-BY-SA 4.0 | https://web.evanchen.cc/textbooks/OTIS-Excerpts.pdf |
| `evan-bary` | Barycentric Coordinates in Olympiad Geometry | Evan Chen | olympiad-geometry | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/bary/bary-full.pdf |
| `evan-cmplx` | Bashing Geometry with Complex Numbers | Evan Chen | olympiad-geometry | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/cmplx/en-cmplx.pdf |
| `evan-ineq` | Olympiad Inequalities | Evan Chen | olympiad-algebra | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/Ineq/en.pdf |
| `evan-funceq` | Introduction to Functional Equations | Evan Chen | olympiad-algebra | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/FuncEq-Intro/FuncEq-Intro.pdf |
| `evan-orpr` | Orders Modulo a Prime | Evan Chen | olympiad-number-theory | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/ORPR/ORPR.pdf |
| `evan-prob-method` | Expected Uses of Probability | Evan Chen | olympiad-combinatorics | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/ProbabilisticMethod/ProbabilisticMethod.pdf |
| `evan-monsters` | Monsters (Pathological Functional Equations) | Evan Chen | olympiad-algebra | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/Monsters/Monsters.pdf |
| `evan-syllabus` | Unofficial Syllabus for Math Olympiads | Evan Chen | olympiad-general | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/Syllabus/Syllabus.pdf |

### Tier 2 — Problem Collections (add after Tier 1)

| ID | Title | Source | Subject tag | License | URL |
|---|---|---|---|---|---|
| `imo-compendium-problems` | IMO Problems 1959–2024 | IMO Official | olympiad-general | Public domain | https://www.imo-official.org/problems.aspx |
| `evan-directed-angles` | How to Use Directed Angles | Evan Chen | olympiad-geometry | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/Directed-Angles/Directed-Angles.pdf |
| `evan-incenter-excenter` | The Incenter/Excenter Lemma | Evan Chen | olympiad-geometry | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/Fact5/Fact5.pdf |
| `evan-sos` | SOS: A Dumbass's Perspective | Evan Chen | olympiad-algebra | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/SOS-Dumbass/SOS-Dumbass.pdf |
| `evan-summation` | Summation (advanced techniques) | Evan Chen | olympiad-combinatorics | CC-BY-SA 4.0 | https://web.evanchen.cc/handouts/Summation/Summation.pdf |

---

## New Subject Tags

The existing catalog uses subject tags like `calculus`, `linear-algebra`, etc. Add the following for competition prep:

| Tag | Display label | Color (suggested) |
|---|---|---|
| `olympiad-general` | Olympiad — General | `#7c3aed` (purple) |
| `olympiad-geometry` | Olympiad — Geometry | `#0891b2` (cyan) |
| `olympiad-algebra` | Olympiad — Algebra | `#059669` (emerald) |
| `olympiad-number-theory` | Olympiad — Number Theory | `#d97706` (amber) |
| `olympiad-combinatorics` | Olympiad — Combinatorics | `#dc2626` (red) |

Add a new filter group "Competition Prep" in the catalog UI that shows only olympiad-tagged entries.

---

## Catalog JSON Entries (sample)

Add to `src-tauri/resources/textbook-catalog.json` under `entries`:

```json
{
  "id": "evan-napkin",
  "title": "An Infinitely Large Napkin",
  "authors": ["Evan Chen"],
  "edition": null,
  "subject": "olympiad-general",
  "publisher": null,
  "license": "cc-by-sa",
  "description": "A 900-page journey through competition and advanced mathematics: olympiad algebra, combinatorics, complex analysis, topology, algebraic geometry, and beyond. Written for high school students preparing for the Putnam or IMO, and curious undergraduates. One of the most comprehensive free resources in olympiad mathematics.",
  "thumbnail_url": null,
  "download_urls": {
    "pdf": "https://web.evanchen.cc/upload/napkin.pdf",
    "html": "https://web.evanchen.cc/napkin.html"
  },
  "file_size_hint": 12000000,
  "page_count_hint": 900,
  "recommended_for": ["USAMO", "Putnam", "IMO", "advanced undergraduates"]
},
{
  "id": "evan-otis-excerpts",
  "title": "OTIS Excerpts",
  "authors": ["Evan Chen"],
  "edition": null,
  "subject": "olympiad-general",
  "publisher": null,
  "license": "cc-by-sa",
  "description": "202 curated olympiad problems with full solutions, drawn from Evan Chen's OTIS (Olympiad Training for Individual Study) coaching program. Covers all four olympiad areas (combinatorics, algebra, number theory, geometry) at USAMO/IMO level.",
  "thumbnail_url": null,
  "download_urls": {
    "pdf": "https://web.evanchen.cc/textbooks/OTIS-Excerpts.pdf",
    "html": "https://web.evanchen.cc/excerpts.html"
  },
  "file_size_hint": 3000000,
  "page_count_hint": 202,
  "recommended_for": ["USAMO", "IMO", "HMMT", "Putnam"]
}
```

*(Remaining entries follow the same schema — see the table in the Resources section above for all fields.)*

---

## UI Changes

### Catalog subject filter bar

Add an "Olympiad" group to the subject filter in `TextbookCatalog.tsx`:

```
All  |  Calculus  |  Linear Algebra  |  ...  |  ── Competition Prep ──  |  General  |  Geometry  |  Algebra  |  Number Theory  |  Combinatorics
```

Or alternatively: add a top-level toggle "Competition Prep" that swaps the filter set.

### Project creation wizard

When a user selects an olympiad-tagged textbook, auto-suggest:
- Tutor style → Olympiad Coach (from Phase 16A)
- Project name → e.g. "Competition Prep — {textbook title}"

---

## Implementation Plan

### Changes required

1. **`src-tauri/resources/textbook-catalog.json`** — add all Tier 1 entries (10 entries)
2. **`src/lib/textbookLicenses.ts`** — add `olympiad-*` subject tags to `subjectLabel()` and `subjectColor()` with appropriate colors
3. **`src/components/TextbookCatalog.tsx`** — add olympiad subject filter group to `SUBJECTS` array and filter bar

### Verification steps

- [ ] All 10 Tier 1 PDFs resolve at their download URLs
- [ ] License attribution displayed correctly in catalog card
- [ ] Filter group shows only olympiad entries when selected
- [ ] Download + project integration works identically to existing catalog entries
- [ ] Napkin (~900 pages, ~12MB) downloads and opens in the Book tab

---

## License & Attribution Notes

All Evan Chen materials are explicitly licensed **CC-BY-SA 4.0** (source at github.com/vEnhance/web.evanchen.cc). Attribution must be shown in the catalog card. The `buildAttributionNotice()` function in `textbookLicenses.ts` already handles this for CC licenses.

IMO problem archives are public domain internationally. AIME/USAMO problems are published by the Mathematical Association of America; pre-2010 papers are effectively public domain through universal academic practice, though AMC LLC technically holds copyright on recent years — use pre-2010 for the initial problem bank to be safe.

---

## Acceptance Criteria

- [ ] 10 Tier 1 catalog entries added and rendering in catalog UI
- [ ] New olympiad subject tags appear in filter bar
- [ ] Subject colors are visually distinct from existing ones
- [ ] CC-BY-SA attribution shown in catalog cards
- [ ] Olympiad textbook selection suggests Olympiad Coach tutor style in project wizard

---

## Related Docs

- `Implementation_FreeTextbooks.md` — existing catalog infrastructure
- `Implementation_CompetitiveMath_Phase1_HintLadder.md`
- `Implementation_CompetitiveMath_Phase2_ProblemBank.md`
