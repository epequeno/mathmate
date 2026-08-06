# Free Open Textbook Initiative — Implementation Plan (v2)

**Feature:** Curated catalog of free, open-access math textbooks with one-click download and project integration  
**Status:** Phase 1 Complete (2026-06-09) — see dev log  
**Phase:** D — Chat View: Process Block & Tool Formatting  
**Stack:** Tauri v2 / React / TypeScript / Rust  
**Linked roadmap item:** Priority 4 — Textbook & PDF Pipeline

---

## Overview

MathMate will incorporate a curated collection of free, open-access mathematics textbooks that users can browse, download, and set as their project textbook — all from within the app. This builds on the recently completed PDF Viewer Tab (Book tab, pdf.js rendering, drag-to-capture) and the existing Project Settings (textbook path, PDF TOC import) infrastructure.

---

## Rationale & Impact

### Educational Equity
- **Reduced financial barriers** to quality mathematics education
- **Increased accessibility** to curriculum-rich content for underserved communities
- **Enhanced tutoring experience** with real-world textbook examples

### Pedagogical Benefits  
- **Curriculum alignment** with widely-used textbooks (OpenStax, Axler, Strang)
- **Subject consistency** with standardized mathematical concepts
- **Rich content variety** spanning calculus, linear algebra, statistics, and beyond

### Community Engagement
- **Promotes open educational resources** (OER) movement
- **Encourages sharing** and adaptation of learning materials
- **Builds trust** with educators through transparent licensing practices

---

## Featured Resources

**Note:** The [American Institute of Mathematics (AIM) Open Textbook Initiative](https://textbooks.aimath.org/) maintains a peer-reviewed, editorial-board-approved list of ~60+ open mathematics textbooks — this is the single best meta-resource for curation. Below we highlight the top picks for immediate inclusion, organized by subject.

### Secondary / Introductory

| Title | Author(s) | URL | License |
|---|---|---|---|
| **OpenStax Pre-Algebra through Calculus** | OpenStax / Rice University | [openstax.org/subjects/math](https://openstax.org/subjects/math) | CC-BY |
| **Contemporary Mathematics** | OpenStax | [openstax.org/details/books/contemporary-mathematics](https://openstax.org/details/books/contemporary-mathematics) | CC-BY |
| **ORCCA — Open Resources for Community College Algebra** | Portland CC | [textbooks.aimath.org/textbooks/approved-textbooks/orcca/](https://textbooks.aimath.org/textbooks/approved-textbooks/orcca/) | CC-BY-SA |
| **Elementary Algebra / Intermediate Algebra** | Katherine Yoshiwara | [textbooks.aimath.org](https://textbooks.aimath.org/textbooks/approved-textbooks/yoshiwara-ea/) | CC-BY-SA |
| **Precalculus / College Algebra / Trigonometry** | Stitz & Zeager | [stitz-zeager.com](https://www.stitz-zeager.com/) | CC-BY-NC-SA |
| **Paul's Online Math Notes** (Calc 1–3, Linear Algebra, ODEs) | Paul Dawkins / Lamar | [tutorial.math.lamar.edu](https://tutorial.math.lamar.edu/) | Free for educational use |

### Calculus

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Calculus** (Strang) | Gilbert Strang / MIT | [ocw.mit.edu](https://ocw.mit.edu/courses/18-01-single-variable-calculus-fall-2006/) | CC-BY-NC-SA |
| **Active Calculus** (Single + Multivariable) | Matt Boelkins / Grand Valley State | [activecalculus.org](https://activecalculus.org/) | CC-BY-SA |
| **APEX Calculus** | Hartman, Heinold, Siemers, Chalishajar / VMI | [apexcalculus.com](https://www.apexcalculus.com/) | CC-BY-NC |
| **CLP Calculus** (I, II, III) | Feldman, Rechnitzer, Yeager / UBC | [math.ubc.ca/~CLP](https://www.math.ubc.ca/~CLP/) | CC-BY-NC-SA |
| **Whitman Calculus** (Community Calculus) | David Guichard / Whitman College | [whitman.edu/mathematics/calculus](https://www.whitman.edu/mathematics/calculus/) | CC-BY-NC-SA |
| **Calculus in Context** | Callahan, Hoffman, Cox, O'Shea et al. / Smith College | [aimath.org](https://textbooks.aimath.org/textbooks/approved-textbooks/callahan/) | CC-BY-NC-SA |
| **Calculus: Early Transcendentals** (OpenStax 3-volume) | OpenStax | [openstax.org/details/books/calculus-volume-1](https://openstax.org/details/books/calculus-volume-1) | CC-BY-NC-SA |

### Linear Algebra

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Linear Algebra Done Right (4e)** | Sheldon Axler / SFSU | [linear.axler.net](https://linear.axler.net/LADR4e.pdf) | CC-BY-SA |
| **Introduction to Linear Algebra** | Gilbert Strang / MIT | [math.mit.edu/~gs/linearalgebra/](https://math.mit.edu/~gs/linearalgebra/) | Free online |
| **A First Course in Linear Algebra** | Rob Beezer / Puget Sound | [linear.ups.edu](http://linear.ups.edu/) | GNU FDL |
| **Linear Algebra** | Jim Hefferon / St. Michael's College | [hefferon.net/linearalgebra](https://hefferon.net/linearalgebra/) | CC-BY-SA |
| **Interactive Linear Algebra** | Margalit & Rabinoff / Georgia Tech | [textbooks.math.gatech.edu/ila](https://textbooks.math.gatech.edu/ila/) | CC-BY-NC-SA |
| **Understanding Linear Algebra** | David Austin / Grand Valley State | [understandinglinearalgebra.org](https://understandinglinearalgebra.org/) | CC-BY |

### Differential Equations

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Notes on Diffy Qs: Differential Equations for Engineers** | Jiří Lebl | [jirka.org/diffyqs](https://www.jirka.org/diffyqs/) | CC-BY-NC-SA |
| **Elementary Differential Equations** (+ w/ BVP) | William Trench / Trinity | [digitalcommons.trinity.edu/mono/8](https://digitalcommons.trinity.edu/mono/8/) | CC-BY-NC-SA |
| **Partial Differential Equations** | Victor Ivrii / U of Toronto | [math.toronto.edu/ivrii/PDE-textbook](https://www.math.toronto.edu/ivrii/PDE-textbook/) | Open source (CC) |

### Discrete Math / Combinatorics

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Discrete Mathematics: An Open Introduction (4e)** | Oscar Levin / U of Northern Colorado | [discrete.openmathbooks.org](https://discrete.openmathbooks.org/) | CC-BY-SA |
| **Applied Combinatorics** | Keller & Trotter | [appliedcombinatorics.org](https://www.appliedcombinatorics.org/) | CC-BY-SA |

### Abstract Algebra

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Abstract Algebra: Theory and Applications** | Tom Judson / SFA State | [abstract.ups.edu](http://abstract.ups.edu/) | CC-BY-SA |
| **An Inquiry-Based Approach to Abstract Algebra** | Dana Ernst / NAU | [dcernst.github.io/IBL-AbstractAlgebra](http://dcernst.github.io/IBL-AbstractAlgebra/) | CC-BY-SA |

### Real & Complex Analysis

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Basic Analysis: Introduction to Real Analysis** | Jiří Lebl | [jirka.org/ra](https://www.jirka.org/ra/) | CC-BY-NC-SA |
| **Measure, Integration & Real Analysis** | Sheldon Axler / SFSU | [measure.axler.net](https://measure.axler.net/) | Springer Open Access |
| **A First Course in Complex Analysis** | Beck, Marchesi, Pixton, Sabalka | [matthbeck.github.io/complex.html](https://matthbeck.github.io/complex.html) | CC-BY-SA |
| **How We Got from There to Here: A Story of Real Analysis** | Boman & Rogers | [milneopentextbooks.org](https://milneopentextbooks.org/how-we-got-from-there-to-here-a-story-of-real-analysis/) | CC-BY-SA |

### Probability & Statistics

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Introduction to Probability** (Grinstead & Snell) | Grinstead & Snell / AMS | [math.dartmouth.edu/~prob/prob/prob.pdf](https://math.dartmouth.edu/~prob/prob/prob.pdf) | GNU FDL |
| **OpenIntro Statistics (4e)** | Diez, Barr, Çetinkaya-Rundel | [openintro.org/book/os](https://www.openintro.org/book/os/) | CC-BY-SA |
| **Introduction to Modern Statistics** | Çetinkaya-Rundel & Hardin | [openintro-ims.netlify.app](https://openintro-ims.netlify.app/) | CC-BY-SA |
| **An Introduction to Statistical Learning (ISLR)** | James, Witten, Hastie, Tibshirani / Stanford | [statlearning.com](https://www.statlearning.com/) | Springer Open Access |

### Number Theory

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Number Theory: In Context and Interactive** | Karl-Dieter Crisman / Gordon College | [math.gordon.edu/ntic](https://math.gordon.edu/ntic/) | CC-BY-SA |
| **Elementary Number Theory** | William Stein / U of Washington | [wstein.org/ent](https://wstein.org/ent/ent.pdf) | CC-BY-SA |

### Proofs / Foundations

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Book of Proof (3e)** | Richard Hammack / VCU | [richardhammack.github.io/BookOfProof](https://richardhammack.github.io/BookOfProof/) | CC-BY-ND |
| **An Introduction to Proof via Inquiry-Based Learning** | Dana Ernst / NAU | [dcernst.github.io/IBL-IntroToProof](http://dcernst.github.io/IBL-IntroToProof/) | CC-BY-SA |
| **Mathematical Reasoning: Writing and Proof** | Ted Sundstrom / Grand Valley State | [tedsundstrom.com](https://www.tedsundstrom.com/mathematical-reasoning-writing-and-proof) | CC-BY-NC-SA |

### Topology / Geometry

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Topology without Tears** | Sidney Morris | [topologywithouttears.net](https://www.topologywithouttears.net/) | CC-BY |
| **Geometry with an Introduction to Cosmic Topology** | Michael Hitchman | [math.ups.edu/~hitchman](https://textbooks.aimath.org/textbooks/approved-textbooks/hitchman/) | CC-BY-NC |
| **Differential Geometry and Its Applications** | John Oprea / Cleveland State | [bookstore.ams.org/clrm-59](https://bookstore.ams.org/clrm-59) | Free PDF (MAA Press) |

### Data Science / ML

| Title | Author(s) | URL | License |
|---|---|---|---|
| **Mathematics for Machine Learning** | Deisenroth, Faisal, Ong | [mml-book.com](https://mml-book.com/) | CC-BY-NC-SA |
| **Probability for Data Science** | Stanley Chan / Purdue | [probability4datascience.com](https://probability4datascience.com/) | CC-BY-NC |

### Key Meta-Resources

| Resource | URL | Purpose |
|---|---|---|
| **AIM Open Textbook Initiative** (approved list) | [textbooks.aimath.org/textbooks/approved-textbooks](https://textbooks.aimath.org/textbooks/approved-textbooks/) | Peer-reviewed, editorial board curation of ~60+ open math textbooks |
| **Open Textbook Library — Mathematics** | [open.umn.edu/opentextbooks/subjects/mathematics](https://open.umn.edu/opentextbooks/subjects/mathematics) | User-reviewed catalog with community ratings |
| **LibreTexts Mathematics** | [math.libretexts.org](https://math.libretexts.org/) | Multi-disciplinary, interactive, CC-BY-SA |
| **Dana Ernst's Free & Open-Source Textbooks** | [danaernst.com/resources/free-and-open-source-textbooks](http://danaernst.com/resources/free-and-open-source-textbooks/) | Comprehensive curated list across all subjects |
| **Open Culture — Free Math Textbooks** | [openculture.com/free-math-textbooks](https://www.openculture.com/free-math-textbooks/) | Meta-list of 100+ free textbooks |
| **PreTeXt Gallery** | [pretextbook.org/gallery.html](https://pretextbook.org/gallery.html) | Catalog of 50+ open textbooks authored with the PreTeXt publishing system. Many entries already in the MathMate catalog (Active Calculus, Book of Proof, Discrete Math Open Intro, AATA, Beezer Linear Algebra, etc.) — remaining titles are candidates for future catalog expansion. |

---

## Technical Implementation — v2 Stack

### 1. Textbook Catalog Schema

#### Frontend — TypeScript (`mathmate/src/lib/types.ts`)

```typescript
// ─── Textbook Catalog types ────────────────────

export interface TextbookCatalogEntry {
  id: string;
  title: string;
  authors: string[];
  edition?: string;
  subject: TextbookSubject;
  publisher?: string;
  license: TextbookLicense;
  description: string;
  thumbnail_url?: string;
  download_urls: TextbookDownloads;
  file_size_hint?: number;   // bytes, approximate
  page_count_hint?: number;
  recommended_for?: string[];  // e.g. ["Calculus I", "Linear Algebra"]
}

export interface TextbookDownloads {
  pdf?: string;
  epub?: string;
  html?: string;
}

export type TextbookSubject =
  | "algebra"
  | "calculus"
  | "statistics"
  | "linear-algebra"
  | "differential-equations"
  | "geometry"
  | "trigonometry"
  | "discrete-math"
  | "probability"
  | "physics"
  | "other";

export type TextbookLicense =
  | "cc-by"
  | "cc-by-sa"
  | "cc-by-nc"
  | "cc-by-nc-sa"
  | "gpl"
  | "mit"
  | "free-online"
  | "other";

export interface TextbookLicenseInfo {
  type: TextbookLicense;
  label: string;
  url?: string;
  attribution_required: boolean;
  description: string;
}
```

#### Backend — Rust (`mathmate/src-tauri/src/textbook_catalog.rs`)

The catalog itself lives as a **static JSON file** bundled with the app (under `mathmate/src-tauri/resources/`), loaded at build time. A Rust module provides:

```rust
// src-tauri/src/textbook_catalog.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextbookCatalogEntry {
    pub id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub edition: Option<String>,
    pub subject: String,
    pub publisher: Option<String>,
    pub license: String,
    pub description: String,
    pub thumbnail_url: Option<String>,
    pub download_urls: TextbookDownloads,
    pub file_size_hint: Option<u64>,
    pub page_count_hint: Option<u32>,
    pub recommended_for: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextbookDownloads {
    pub pdf: Option<String>,
    pub epub: Option<String>,
    pub html: Option<String>,
}

/// Load the bundled catalog JSON.
pub fn load_catalog() -> Result<Vec<TextbookCatalogEntry>, String> {
    let data = include_str!("../../resources/textbook-catalog.json");
    serde_json::from_str(data).map_err(|e| format!("Failed to parse textbook catalog: {e}"))
}
```

**Design rationale:** A static catalog avoids database complexity for Phase 1. It can be updated via app releases (or later via a remote fetch mechanism in Phase 3). The catalog JSON is hand-curated and stored at:

```
mathmate/src-tauri/resources/textbook-catalog.json
```

### 2. Tauri Commands — Rust (`mathmate/src-tauri/src/lib.rs`)

```rust
// ─── Free Textbook Catalog ────────────────────

#[tauri::command]
fn list_textbook_catalog() -> Result<Vec<textbook_catalog::TextbookCatalogEntry>, String> {
    textbook_catalog::load_catalog()
}

#[tauri::command]
fn get_textbook_license_info(license: String) -> Result<LicenseInfo, String> {
    textbook_catalog::get_license_info(&license)
}

/// Download a free textbook PDF to the user's local library and optionally
/// set it as the active project's textbook.
#[tauri::command]
fn download_free_textbook(
    catalog_id: String,
    project_id: Option<String>,
) -> Result<DownloadResult, String> {
    // 1. Load catalog, find entry by ID
    // 2. Download PDF from download_urls.pdf (with progress reporting via Tauri events)
    // 3. Save to ~/.mathmate/textbooks/{id}.pdf
    // 4. If project_id is provided, update project's textbook_path
    // 5. Return the local file path
}
```

**New Rust module:** `textbook_catalog.rs`

**New dependency (optional):** `ureq` or `reqwest` for HTTP downloads. If minimizing dependencies, use `std::process::Command` to invoke `curl` (macOS/Linux have it built-in), or use Tauri's `tauri-plugin-http`.

### 3. Frontend — Discovery UI

#### New components:

| File | Purpose |
|---|---|
| `mathmate/src/components/TextbookCatalog.tsx` | Grid/list view of available textbooks, filtering by subject |
| `mathmate/src/components/TextbookCatalogCard.tsx` | Single card with title, author, subject badge, download button |
| `mathmate/src/components/TextbookDetailsPanel.tsx` | Full metadata + license info + download + "Set as project textbook" |

#### Integration points:

- **Project Settings Panel** (`ProjectSettingsPanel.tsx`): Add "Browse Free Textbooks" button alongside the existing manual path picker. Selecting a textbook from the catalog triggers download and sets `textbook_path`.
- **Welcome Page** (`WelcomePage.tsx`): Optionally show a "Browse free textbooks" CTA when no textbook is set.
- **Book tab** (`BookPage.tsx` / `PdfViewer.tsx`): Already handles pdf.js rendering — no changes needed once the textbook path is set.

#### Download flow:

```
User clicks "Download" on a catalog card
  → Rust command download_free_textbook()
  → Progress events emitted via Tauri event system
  → Frontend shows progress bar
  → On success: textbook_path set on project
  → Toast: "Textbook downloaded! Open Book tab to view"
```

### 4. License Compliance

```typescript
// mathmate/src/lib/textbookLicenses.ts

export const LICENSE_INFO: Record<TextbookLicense, TextbookLicenseInfo> = {
  "cc-by": {
    type: "cc-by",
    label: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    attribution_required: true,
    description: "Creative Commons Attribution — can be adapted with credit",
  },
  "cc-by-sa": {
    type: "cc-by-sa",
    label: "CC BY-SA 4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution_required: true,
    description: "Creative Commons Attribution-ShareAlike — adaptations must share alike",
  },
  // ...
};

export function buildAttributionNotice(entry: TextbookCatalogEntry): string {
  const authors = entry.authors.join(", ");
  return `Source: ${entry.title} by ${authors} (${LICENSE_INFO[entry.license].label}). ${LICENSE_INFO[entry.license].url ?? ""}`;
}
```

For **agent prompt integration**: the system prompt can optionally include the attribution notice when a textbook is set, so the AI tutor references the source naturally.

---

## Existing Infrastructure to Leverage

The following is already in place and needs **no changes** for Phase 1:

| Component | File(s) | What it provides |
|---|---|---|
| **PDF Viewer** | `PdfViewer.tsx`, `usePdfRenderer.ts`, `usePdfRegionSelect.ts` | Full pdf.js rendering, page nav, zoom, bookmarks, drag-to-capture |
| **Book tab** | `BookPage.tsx` | Dedicated route, textbook loading from project, capture→chat navigation |
| **Project Settings** | `ProjectSettingsPanel.tsx` | Textbook path input, PDF TOC extraction, vault note import |
| **Textbook metadata** | `textbook.rs` | `TextbookMetadata`, `read_textbook_metadata()` |
| **PDF TOC extraction** | `pdf_import.rs` | `extract_pdf_toc()`, `import_pdf_toc()` — bookmark→vault notes |
| **Project model** | `project.rs`, `types.ts` | `MathProject` with `textbook_path` field |
| **Project store** | `projectStore.ts` | `updateProject()` — set textbook path after download |

---

## File-by-File Implementation Plan (Phase 1)

### Rust Backend

| File | Action |
|---|---|
| `mathmate/src-tauri/src/textbook_catalog.rs` | **New** — catalog types + `load_catalog()`, download function, license helper |
| `mathmate/src-tauri/src/lib.rs` | Add `mod textbook_catalog;` + register `list_textbook_catalog`, `get_textbook_license_info`, `download_free_textbook` commands |
| `mathmate/src-tauri/resources/textbook-catalog.json` | **New** — static JSON catalog of ~10–15 hand-curated free textbooks |
| `mathmate/src-tauri/Cargo.toml` | Add `ureq` or `reqwest` for HTTP downloads (or use `curl` subprocess) |

### Frontend

| File | Action |
|---|---|
| `mathmate/src/lib/types.ts` | Add `TextbookCatalogEntry`, `TextbookDownloads`, `TextbookSubject`, `TextbookLicense`, `TextbookLicenseInfo` types |
| `mathmate/src/lib/textbookLicenses.ts` | **New** — license metadata map + `buildAttributionNotice()` helper |
| `mathmate/src/components/TextbookCatalog.tsx` | **New** — grid view, subject filter, search input, triggers download |
| `mathmate/src/components/TextbookCatalogCard.tsx` | **New** — card with thumbnail, metadata, download button |
| `mathmate/src/components/TextbookDetailsPanel.tsx` | **New** — full details + license info + "Set as project textbook" |
| `mathmate/src/components/ProjectSettingsPanel.tsx` | Add "Browse Free Textbooks" button; integrate catalog selection into textbook_path setter |
| `mathmate/src/pages/WelcomePage.tsx` | Optionally add "Browse free textbooks" CTA |

---

## Workflow Scenarios

### Scenario 1: Quick Setup
1. User creates new project → sees empty textbook state in Project Settings
2. Clicks "Browse Free Textbooks" → catalog grid opens
3. Filters by "Linear Algebra" → selects "Linear Algebra Done Right" by Axler
4. Clicks "Download & Set as Textbook"
5. Progress bar shows download progress
6. On completion: `textbook_path` is set, Book tab becomes active
7. User opens Book tab → pdf.js renders the downloaded textbook immediately

### Scenario 2: Content Reference
1. User has a project with a free textbook already set
2. Asks "Explain eigenvalues from Strang's linear algebra textbook"
3. Agent recognizes textbook context → references the correct textbook
4. Response includes optional attribution: *"Source: Introduction to Linear Algebra by Gilbert Strang (CC-BY)"*

### Scenario 3: Teaching Preparation
1. Educator wants to prep class with textbook content
2. Creates project "College Algebra" → browses OpenStax collection
3. Downloads "College Algebra 2e" from OpenStax
4. Uses PDF Structure Import (existing) to generate vault chapter notes
5. Ready to tutor with structured textbook content

---

## Implementation Priority

### Phase 1 (Immediate — this issue)
- Static textbook catalog JSON (~20–30 entries covering Calc, Linear Algebra, ODEs, Discrete Math, Stats, Algebra, Analysis)
- Rust `textbook_catalog.rs` module with `load_catalog()`, download, license helpers
- `list_textbook_catalog`, `get_textbook_license_info`, `download_free_textbook` Tauri commands
- `TextbookCatalog` + `TextbookCatalogCard` + `TextbookDetailsPanel` React components
- "Browse Free Textbooks" button in Project Settings
- Download progress reporting

### Phase 2 (Next Sprint)  
- **Agent attribution**: Inject `buildAttributionNotice()` into system prompt when free textbook is active
- **License compliance UI**: Visual indicator in Book tab showing textbook license
- **Caching**: Offline catalog caching, resume interrupted downloads
- **Remote catalog fetch**: Auto-update catalog from a URL post-install

### Phase 3 (Later)
- **Community sharing**: User-submitted textbook recommendations
- **Curriculum mapping**: Map textbooks to national/state standards

---

## Success Metrics

1. **User Engagement**: % of new projects that add a free textbook
2. **Textbook Usage**: Frequency of Book tab opens / capture actions
3. **Community Contributions**: Number of user-submitted textbook recommendations
4. **Educator Adoption**: Feedback from classroom pilots
5. **Licensing Compliance**: Percentage of projects using properly attributed resources

---

## Build & Test Commands

```bash
# Ensure Rust compiles
cd mathmate/src-tauri && cargo check

# Frontend build
cd mathmate && npm run build

# Full Tauri dev mode
cd mathmate && npm run tauri dev
```

Before completing Phase 1:
- [ ] `cargo check` passes
- [ ] `npm run build` passes
- [ ] Manual test: catalog loads in UI
- [ ] Manual test: download a free textbook and see it render in the Book tab
- [ ] Manual test: switching project resets to that project's textbook