# Implementation Plan: Knowledge Graph View

## 1) Goal

Add a **visual concept mastery map** per project: a force-directed graph
where nodes are math concepts the student has studied, sized/colored by
composite mastery score, with typed edges representing concept relationships.
Clicking a node opens a 4-axis breakdown plus evaluator notes and a
quick-launch link to Feynman or quiz mode for that concept.

Inspired by the knowledge graph in [Get It.](https://github.com/beltromatti/get-it),
adapted for MathMate's project-scoped, math-first context.

**Prerequisites:** `Implementation_MasteryScoring4Axis` and
`Implementation_MasteryEvaluator` must be completed first (this UI
visualizes data those plans produce).

---

## 2) Scope

### In scope
- New page: `KnowledgeGraphPage` — accessible from sidebar and from
  OverviewPage
- Force-directed 2D graph rendered with **D3-force** (lightweight, no Three.js
  needed for 2D)
- Nodes: one per distinct concept label in memory DB for the project
- Edges: typed relations extracted by the evaluator agent (e.g.
  "prerequisite", "extends", "contrasts-with")
- Node size ∝ composite mastery score; color encodes mastery tier
- Click a node: detail panel with 4-axis radar/bar chart + evaluator note
- Panel quick-actions: `/feynman [concept]`, `/quiz [concept]`
- Graph persists concept-edge data in a new `concept_graph` table in memory DB

### Out of scope
- 3D graph rendering (not needed; 2D is more readable for math topics)
- Automatic graph rebuild on every chat message (too expensive; rebuild
  on session wrap-up or manual trigger only)
- Cross-project graph merging

---

## 3) Data Model

```
concept_graph table
┌────────────────────────────────────────────────────────────┐
│ id          TEXT PK                                        │
│ project_id  TEXT                                           │
│ concept     TEXT    (matches memory item label)            │
│ memory_id   TEXT    (FK → memories.id, nullable)          │
│ built_at    TEXT                                           │
└────────────────────────────────────────────────────────────┘

concept_edges table
┌────────────────────────────────────────────────────────────┐
│ id          TEXT PK                                        │
│ project_id  TEXT                                           │
│ source      TEXT    (concept label)                        │
│ target      TEXT    (concept label)                        │
│ relation    TEXT    (e.g. "prerequisite", "extends")       │
└────────────────────────────────────────────────────────────┘
```

Edges are extracted by the evaluator agent as part of its pass (see
`Implementation_MasteryEvaluator`, ME2). The evaluator's JSON output
includes an optional `edges` array; if absent, the graph is node-only
(still useful).

---

## 4) File-by-File Tickets

### KG1 — DB schema: concept graph tables
**Modify:** `mathmate/src-tauri/src/memory.rs`

**Tasks:**
- Add to `init_schema`:
  ```sql
  CREATE TABLE IF NOT EXISTS concept_graph (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      concept TEXT NOT NULL,
      memory_id TEXT,
      built_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS concept_edges (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'related'
  );
  ```
- Add helpers:
  - `upsert_concept_node(project_id, concept, memory_id)`
  - `upsert_concept_edge(project_id, source, target, relation)`
  - `load_concept_graph(project_id) -> ConceptGraph`

---

### KG2 — `graph.rs`: graph data types + Tauri commands
**Create:** `mathmate/src-tauri/src/graph.rs`

**Tasks:**
- Define:
  ```rust
  pub struct GraphNode {
      pub id: String,
      pub label: String,
      pub memory_score: f64,
      pub comprehension_score: f64,
      pub structure_score: f64,
      pub application_score: f64,
      pub composite_mastery: Option<f64>,
      pub evaluator_note: String,
      pub last_evaluated_at: Option<String>,
  }

  pub struct GraphEdge {
      pub source: String,
      pub target: String,
      pub relation: String,
  }

  pub struct ConceptGraph {
      pub project_id: Option<String>,
      pub nodes: Vec<GraphNode>,
      pub edges: Vec<GraphEdge>,
      pub built_at: Option<String>,
  }
  ```
- Register Tauri commands:
  ```rust
  #[tauri::command]
  pub async fn get_concept_graph(
      project_id: Option<String>,
      state: State<'_, AppState>,
  ) -> Result<ConceptGraph, String>

  #[tauri::command]
  pub async fn rebuild_concept_graph(
      project_id: Option<String>,
      state: State<'_, AppState>,
  ) -> Result<ConceptGraph, String>
  // Triggers evaluator → extracts edges → upserts all nodes/edges
  ```

---

### KG3 — Evaluator edge extraction (add to ME2)
**Modify:** `mathmate/src-tauri/src/evaluator.rs`

**Tasks:**
- Extend evaluator JSON output schema with optional edges:
  ```json
  {
    "concept_evaluations": [...],
    "edges": [
      { "source": "Eigenvalues", "target": "Determinants", "relation": "prerequisite" },
      { "source": "Eigenvalues", "target": "PCA", "relation": "used-in" }
    ],
    "global_note": "..."
  }
  ```
- After evaluator pass: call `upsert_concept_edge` for each returned edge
- Allowed relation types: `prerequisite`, `extends`, `contrasts-with`,
  `used-in`, `example-of`, `related`
- Edge extraction is best-effort; missing edges are fine

---

### KG4 — Frontend: D3 dependency
**Modify:** `mathmate/package.json`

**Tasks:**
- Add `d3-force`, `d3-drag`, `d3-zoom`, `d3-selection` (or just `d3` if
  bundle size is acceptable given we already ship Plotly)
- Alternative: use `@visx/network` which wraps D3 force in React idioms —
  evaluate during implementation; prefer minimal surface area

---

### KG5 — `KnowledgeGraphPage.tsx`
**Create:** `mathmate/src/pages/KnowledgeGraphPage.tsx`

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  🕸 Concept Map   [Project: Calculus ▾]   [Rebuild] [?] │
├───────────────────────────────┬──────────────────────────┤
│                               │  Eigenvalues             │
│     [Force-directed graph]    │  ────────────────        │
│                               │  Memory        72 ████░  │
│   ● Eigenvalues               │  Comprehension 65 ███░░  │
│     ╱                         │  Structure     55 ███░░  │
│   ● Determinants              │  Application   40 ██░░░  │
│       ╲                       │  Overall       59        │
│        ● PCA                  │                          │
│                               │  "Student can recall     │
│   ● Integration               │   but struggles to       │
│                               │   apply in novel cases." │
│                               │  ─────────────────────── │
│                               │  [🧠 Feynman] [📝 Quiz] │
└───────────────────────────────┴──────────────────────────┘
```

**Tasks:**
- SVG canvas via D3 `forceSimulation` with:
  - `forceLink` (edges, distance proportional to relation type)
  - `forceManyBody` (repulsion)
  - `forceCenter`
  - `forceCollide` (prevent overlap)
- Node rendering:
  - Circle radius: 16–36px scaled by composite mastery
  - Fill color:
    - Grey: unevaluated
    - Red: mastery < 40
    - Amber: 40–69
    - Green: ≥ 70
  - Label below node, truncated at 20 chars
- Edge rendering: thin lines, label on hover
- Pan + zoom via D3 zoom transform on the SVG `<g>`
- Click node → populate right detail panel
- Detail panel:
  - 4-axis horizontal bars (reuse a small `MasteryBar` component)
  - Evaluator note (collapsible if long)
  - "Feynman" button → navigate to FeynmanPage with concept pre-filled
  - "Quiz" button → insert `/quiz [concept]` into active chat input and
    navigate to chat
- "Rebuild" button triggers `rebuild_concept_graph`, shows spinner
- Empty state: "Complete and wrap up a session to generate your concept map"
- Loading skeleton: pulsing circles while graph data loads

---

### KG6 — `MasteryBar` shared component
**Create:** `mathmate/src/components/MasteryBar.tsx`

**Tasks:**
- Props: `{ label: string, score: number, max?: number }`
- Renders a labeled progress bar using CSS variables for color
- Used by both KnowledgeGraphPage and OverviewPage mastery section

---

### KG7 — Sidebar integration
**Modify:** `mathmate/src/components/Sidebar.tsx`

**Tasks:**
- Add "Concept Map" nav item (Lucide `Network` icon)
- Show a "!" badge if the project has unevaluated sessions (new concepts
  available that aren't in the graph yet)

---

### KG8 — OverviewPage deep-link
**Modify:** `mathmate/src/pages/OverviewPage.tsx`

**Tasks:**
- Replace the plain "weakest concepts" list with clickable concept chips
  that navigate to `KnowledgeGraphPage` with that node pre-selected

---

## 5) Graph UX Notes

- **Don't overwhelm**: cap at 30 nodes max. If a project has more memory
  items, show only the `max_mastery` evaluated ones (so the most-studied
  concepts dominate the map)
- **Stable layout**: fix node positions after first render; only re-simulate
  when new nodes are added (use `d3.simulation.stop()` after convergence)
- **Math labels**: concept labels from memory DB may contain LaTeX snippets
  (e.g. `$\lambda$`). Render node labels as plain text initially; add
  KaTeX tooltip on hover if label contains `$`

---

## 6) Testing Checklist
- [ ] Empty project shows empty state, not a crash
- [ ] Graph renders with correct node sizes and colors after evaluation
- [ ] Clicking a node opens detail panel with correct scores
- [ ] "Feynman" and "Quiz" quick-actions navigate correctly
- [ ] Rebuild re-runs evaluator and updates graph
- [ ] Pan and zoom work without breaking click events
- [ ] `cargo check` passes
- [ ] `npm run build` passes
