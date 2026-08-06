# Implementation Plan: Visualization Intent Compiler

## 1) Goal

Replace the current model-as-JSON-engineer architecture with a **model-as-director** architecture: the model describes *what* to visualize in natural language, and MathMate's Intent Compiler builds the validated native primitive spec internally.

This inverts the current responsibility boundary:

| | Current | Proposed |
|---|---|---|
| Model emits | 30-field nested JSON with exact field names | Natural-language description of the visualization |
| App interprets | Validates + normalizes wrong field names | Parses intent → selects primitive → infers schema |
| When schema changes | Model must relearn (or normalizer grows) | App absorbs change internally |
| Model skill needed | JSON schema engineering | Natural language + math understanding |

**Secondary goal**: Expose the Intent Compiler as an MCP server so that external AI clients (Claude Desktop, Cursor, pi, etc.) can use MathMate as a visualization backend.

### 1.1 Expressivity Assessment

The current native primitive system covers ~30% of the visualizations a math tutor needs. The Intent Compiler + new primitive types should push that to ~80%.

**Covered today:** 2D Cartesian graphs, number lines, tables of values, static geometry, quiz cards, hints, solution reveals.

**Gaps the compiler must close:**
| Capability | Agent intent example | Solution |
|---|---|---|
| Annotations & labels | "Label the maximum at (0,1) with an arrow" | Shared annotation layer (Section 4.7) |
| Composite visuals | "Show f(x) and f'(x) side by side" | Composite primitive (Section 4.8) |
| Free-form diagrams | Venn diagrams, flow charts, tree diagrams | Diagram primitive (Section 4.9) |
| Parametric/polar plots | "r = 2sin(3θ)" | Extended graph config (Section 4.10) |
| Quiz with embedded graph | "Quiz about this parabola, with graph above" | Composite: quizCard + graph child |
| Drag-to-explore geometry | "Drag point B to see area change" | Interactive geometry (Phase 9D) |
| Statistical visuals | Box plots, histograms, scatter plots | Stats primitive (Phase 9D) |
| 3D surfaces | "Plot z = x² − y²" | 3D surface primitive (Phase 9D) |
| Animation sequences | "Show the secant approaching the tangent" | Animation layer (Phase 9D) |
| Vector fields | "Gradient field of f(x,y)" | Vector field primitive (future phase) |

**What stays out of scope for Phase 9:** Statistical charts (box plots, histograms) and vector fields require substantial rendering work. These are deferred to a future graphics phase. 3D surfaces and animation sequences have a detailed design below (Section 4.10) and are targeted for Phase 9D — the design is concrete enough to plan against but the rendering scope is large enough to defer past the core compiler.

---

## 2) Problem Statement

The current `create_widget_spec` tool has a fundamental design flaw: it asks the model to be a JSON schema engineer. Evidence:

1. **Normalization layer is scar tissue** — `ToolExecutor` contains `normalizeNumberLineConfig`, `normalizeGeometryCanvasConfig`, `normalizeTableValuesConfig`, and `normalizeGraphFunctionConfig`. These silently alias wrong field names (`fn`→`expressions`, `x`→`points`, `xs`→`xValues`, `vertices`→`polygons`). Each alias is evidence the model emitted the wrong field name.

2. **Tool description is empty** — The `config` parameter is described as `"Primitive-specific configuration"` with zero field details. The model is guessing schema structure.

3. **System prompt bloat** — `_effectiveSystemPrompt` appends an 82-line `widgetContract` block when a user mentions visualization keywords. This is a band-aid: the model needs extensive documentation just to emit the right JSON shape.

4. **No composition reasoning** — When should a tutor use a quiz card with an embedded visualization vs. a standalone graph with a hint? Models cannot reason about this because the tool gives them no pedagogical guidance.

5. **Schema changes break models** — Every new primitive type, renamed field, or new constraint requires updating the system prompt and hoping the model adapts.

---

## 3) Architecture

### 3.1 New Tool: `visualize`

Replace `create_widget_spec` (primary path) with a simple natural-language tool:

```json
{
  "name": "visualize",
  "description": "Create an interactive math visualization. Describe what you want to show — the type of visual, the math content, and any interactive elements. MathMate will choose the best primitive type and render it natively.",
  "parameters": {
    "type": "object",
    "properties": {
      "description": {
        "type": "string",
        "description": "Natural-language description of the visualization. Include math expressions, what should be plotted/shown, and any interactive elements like sliders."
      },
      "pedagogical_goal": {
        "type": "string",
        "description": "What concept the student should learn from this visualization. Used to choose appropriate widget type and settings."
      },
      "type_hint": {
        "type": "string",
        "enum": ["graph", "number_line", "geometry", "table", "quiz", "hint", "solution"],
        "description": "Optional hint about the visualization type. Omit to let MathMate auto-select."
      }
    },
    "required": ["description"]
  }
}
```

The model's job becomes: **describe what to show and why**. The compiler handles everything else.

### 3.2 Intent Compiler Pipeline

```
visualize(description, pedagogical_goal, type_hint)
    │
    ▼
┌──────────────────────────────────────────┐
│  Intent Compiler                        │
│                                         │
│  Step 1: Type Resolution                │
│  description + type_hint → MMPrimitive  │
│                                         │
│  Step 2: Entity Extraction              │
│  Parse math expressions, points,        │
│  domains, inequalities, sliders         │
│                                         │
│  Step 3: Schema Assembly                │
│  Build validated MMNativePrimitiveSpec  │
│                                         │
│  Step 4: Pedagogical Enhancement        │
│  Infer domain, annotations, defaults   │
│  from pedagogical_goal                  │
│                                         │
└──────────────┬───────────────────────────┘
               │
               ▼
      MMPrimitiveRegistry.buildView()
```

### 3.3 Retain `create_widget_spec` as Low-Level Escape Hatch

The existing `create_widget_spec` tool stays available but is no longer the primary path. It serves:
- Power users who know the exact schema
- Advanced models that can emit correct JSON
- Testing and debugging

The system prompt no longer includes the 82-line widget contract by default. It only references `create_widget_spec` for "advanced or precise widget control."

### 3.4 MCP Server (Phase 2)

Once the Intent Compiler works well internally, wrap it as an MCP server:

```
┌─────────────────────────────────────────────┐
│  MathMate App                               │
│  ┌─────────────┐    ┌───────────────────┐   │
│  │ Chat View    │───▶│ Intent Compiler   │   │
│  │ (SwiftUI)    │    │ (rule-based)      │   │
│  └─────────────┘    └───────┬───────────┘   │
│                             │               │
│  ┌──────────────────────────▼─────────────┐ │
│  │     MMPrimitiveRegistry.buildView()    │ │
│  │     (SwiftUI rendering engine)          │ │
│  └────────────────────────────────────────┘ │
│                      │                      │
│         ┌────────────▼────────────┐         │
│         │   MCP Server (stdio)    │         │
│         │   expose: visualize     │         │
│         │   expose: list_primitives│         │
│         └─────────────────────────┘         │
└─────────────────────────────────────────────┘
         │
         │ MCP (stdio/SSE)
         ▼
┌─────────────────┐
│ External Client │  Claude Desktop, Cursor, pi, etc.
└─────────────────┘
```

The MCP server exposes two tools:
- `visualize(description, pedagogical_goal, type_hint)` — the simple one
- `list_primitives()` — returns available widget types and their capabilities for discovery

---

## 4) Intent Compiler: Detailed Design

### 4.1 Step 1 — Type Resolution

Rule-based mapping from description keywords + `type_hint` to `MMPrimitiveType` or composite/diagram dispatch:

| type_hint or keyword match | Primitive |
|---|---|
| `"graph"`, `"plot"`, `"curve"`, `"function"` | `mm.graph.function` |
| `"number_line"`, `"numberline"`, `"inequality"` | `mm.numberline.basic` |
| `"geometry"`, `"triangle"`, `"polygon"`, `"circle diagram"`, `"coordinate plane"` | `mm.geometry.canvas` |
| `"table"`, `"table of values"`, `"evaluate"` | `mm.table.values` |
| `"quiz"`, `"question"`, `"test"`, `"practice"` | `mm.quiz.free_response` or `mm.quiz.multiple_choice` |
| `"hint"`, `"hint stages"`, `"step by step"` | `mm.hint.progressive` |
| `"solution"`, `"reveal"`, `"answer"` | `mm.reveal.solution` |
| `"composite"`, `"side by side"`, `"and also"`, `"together with"`, `"show both"` | `mm.composite` (Section 4.8) |
| `"diagram"`, `"venn"`, `"flow chart"`, `"tree"`, `"probability tree"` | `mm.diagram` (Section 4.9) |

When `type_hint` is provided, it takes precedence. When omitted, keywords in `description` determine the type. Ambiguous cases fall back to `mm.graph.function` (most common) or dispatch to the LLM fallback.

### 4.2 Step 2 — Entity Extraction

Parse structured math content from the description using regex patterns. The extractor handles all primitive types, annotations, composites, and diagrams:

#### Graph entities
| Pattern | Extracted to | Example |
|---|---|---|
| `f(x) = ...`, `y = ...`, `graph ...` | `expressions: [...]` | `"graph x^3 - 3x"` → `expressions: ["x^3 - 3x"]` |
| `tangent at x=N` | `tangentAtX: [N]` | `"tangent at x=2"` → `tangentAtX: [2.0]` |
| `secant from x=A to x=B` | `secantPairs: [[A,B]]` | `"secant from x=1 to x=3"` → `secantPairs: [[1,3]]` |
| `shade where f < 0` | `shadedRegions` with baseline 0 | `"shade the region where f(x) < 0"` → shadedRegion with baseline 0 |
| `polar r = ...` | `polarCurves: [...]` | `"r = 2sin(3θ)"` → polar curve |
| `parametric x = ..., y = ...` | `parametricCurves: [...]` | `"x = cos t, y = sin²t"` → parametric curve |
| `slider for N` | `sliders: [...]` | `"slider for a from -5 to 5"` → slider spec |
| `domain A to B`, `[A, B]` | `domain: [A, B]` | `"domain -5 to 5"` → `domain: [-5, 5]` |
| `range A to B` | `range: [A, B]` | `"range -10 to 10"` → `range: [-10, 10]` |

#### Number-line entities
| Pattern | Extracted to | Example |
|---|---|---|
| `x > N`, `x ≥ N`, `x < N`, `x ≤ N` | `intervals: [...]` with include flags | `"x ≥ 2"` → interval [2, +∞) include: true |
| `x between A and B` | `intervals: [...]` | `"x between 1 and 5"` → interval [1, 5] |
| `point at x = N` | `points: [...]` | `"point at x = 3"` → number-line point |

#### Table entities
| Pattern | Extracted to | Example |
|---|---|---|
| `table for f(x) = ...` | `expression: ...` | `"table for f(x) = x²"` → expression |
| `x = A, B, C` | `xValues: [A, B, C]` | `"evaluate at x = -2, -1, 0, 1, 2"` → xValues |
| `precision N` | `precision: N` | `"4 decimal places"` → precision: 4 |

#### Geometry entities
| Pattern | Extracted to | Example |
|---|---|---|
| `point at (A, B)` | `points: [...]` | `"point at (1, 2)"` → geometry point |
| `triangle A(0,0) B(3,0) C(0,4)` | `polygons: [...]` + `points` | Vertices extracted |
| `circle center (0,0) radius 3` | `circles: [...]` | Circle spec |
| `segment from (A,B) to (C,D)` | `segments: [...]` | Segment spec |

#### Quiz entities
| Pattern | Extracted to | Example |
|---|---|---|
| `A) ... B) ... C) ...` | `options: [...]` | Multiple choice options |
| `answer is ...` | `expectedAnswer.value` | Answer string |
| `hint: ...` | `hints: [...]` | Hint strings |

#### Annotation entities (cross-cutting — Section 4.7)
| Pattern | Extracted to | Example |
|---|---|---|
| `label ... at (A,B)` | `annotations: [{type:"label", ...}]` | `"label the maximum at (0,1)"` |
| `arrow from (A,B) to (C,D)` | `annotations: [{type:"arrow", ...}]` | `"arrow from (0,0) to (2,4)"` |
| `callout ...` | `annotations: [{type:"callout", ...}]` | `"callout: inflection point at x=3"` |
| `mark the ...` | `annotations: [{type:"marker", ...}]` | `"mark the intersection"` |

#### Composite detection (Section 4.8)
| Pattern | Extracted to | Example |
|---|---|---|
| `show X and Y side by side` | `composite children: [X, Y]` | Two children |
| `X with Y overlaid / together with Y` | `composite children` | Nested primitives |
| `quiz about X with graph` | `composite: quizCard + graph child` | Quiz with embedded viz |

#### Diagram entities (Section 4.9)
| Pattern | Extracted to | Example |
|---|---|---|
| `venn diagram of A, B, C` | `shapes: [{type:"circle", label:...}]` | Overlapping circles |
| `flow: A → B → C` | `shapes + arrows` | Flow chart |
| `tree: root → left, right` | `shapes: [{type:"rect", ...}]` | Tree diagram |

### 4.3 Step 3 — Schema Assembly

Build one or more `MMNativePrimitiveSpec` dictionaries from extracted entities. The schema assembler handles all primitive types (not just graphs):

#### Assembly per primitive type

| Primitive | Assembly logic |
|---|---|
| `mm.graph.function` | Map `expressions`, `tangentAtX`, `secantPairs`, `shadedRegions`, `polarCurves`, `parametricCurves`, `lines`, `points`, `sliders`, `domain`, `range`, `annotations`. Infer domain via `DomainInferrer`. Default `showGrid: true`, `showAxes: true`. |
| `mm.numberline.basic` | Map `intervals` (from inequalities), `points`, `ticks`, `domain`. Auto-infer domain from point/interval bounds. Default `showArrowheads: true`. |
| `mm.table.values` | Map `expression` + `xValues` or explicit `rows` + `headers`. If `expression` present without `xValues`, auto-generate `[-3, -2, -1, 0, 1, 2, 3]`. Default `precision: 3`. |
| `mm.geometry.canvas` | Map `points`, `segments`, `polygons`, `circles`. Auto-infer domain/range from element bounds. Default `showGrid: true`, `showAxes: true`. |
| `mm.quiz.free_response` | Map `promptMarkdown`, `expectedAnswer`, `hints`, `solution`, `difficulty`, `conceptTags`. If `pedagogical_goal` includes "derivative" or similar, set `conceptTags` accordingly. |
| `mm.quiz.multiple_choice` | Map `promptMarkdown`, `options` (from A/B/C patterns), `correctOptionId`, `hints`, `solution`. |
| `mm.hint.progressive` | Map `stages` array from hint patterns. |
| `mm.reveal.solution` | Map `solutionMarkdown`, `steps`, `buttonLabel`, `confirmReveal`. |
| `mm.composite` | Recursively assemble children. Set `layout` from description hints ("side by side" → horizontal, "stacked" → vertical). Merge annotations. |
| `mm.diagram` | Map `shapes` (circles, rects, arrows, labels), `viewBox`. Auto-compute viewBox from shape positions. |

#### Assembly pipeline
1. Set `library: "mathmate-native"`, `type: <resolved type>`
2. Generate stable `id` (deterministic from description hash or UUID)
3. Map extracted entities to the correct config fields for the resolved primitive type
4. Run through `MMPrimitiveValidator.validate()`
5. If validation fails, attempt auto-fix (add missing required fields, infer defaults)
6. If still invalid, return error with actionable message

### 4.4 Step 4 — Pedagogical Enhancement

Use `pedagogical_goal` to infer sensible defaults when the description doesn't specify them:

| pedagogical_goal contains | Inferred enhancement |
|---|---|
| "derivative", "slope", "rate of change" | If graph: ensure `showGrid: true`, consider adding tangent annotations |
| "limit", "approaches" | If graph: extend domain to show approaching behavior |
| "area under", "integral", "accumulation" | If graph: add `shadedRegions` between curve and x-axis |
| "inequality", "solution set" | If number line: auto-derive interval from expression |
| "pattern", "sequence" | If table: add more x-values to make pattern visible |
| "transformation", "shift", "scale" | If graph: add slider for transformation parameter |
| "congruence", "proof" | If geometry: label all vertices, add segment labels |

### 4.5 Step 5 — Annotation Assembly (Cross-Cutting)

Annotations are not a standalone primitive — they are a **shared layer** injected into any primitive that renders on a coordinate plane (graph, geometry, number-line, composite). The annotation schema lives alongside the primitive config:

```json
{
  "type": "mm.graph.function",
  "config": {
    "expressions": ["x^2"],
    "annotations": [
      { "type": "label", "x": 0, "y": 0, "text": "minimum", "anchor": "below", "color": "#e74c3c" },
      { "type": "arrow", "from": [0.5, 2], "to": [0.1, 0.1], "label": "vertex", "color": "#3498db" },
      { "type": "callout", "x": -1, "y": 1, "text": "decreasing", "width": 100, "height": 40 },
      { "type": "marker", "x": 1, "y": 1, "style": "star", "label": "symmetric point" }
    ]
  }
}
```

**Annotation types:**
| Type | Description | Fields |
|---|---|---|
| `label` | LaTeX text at a coordinate | `x`, `y`, `text`, `anchor` (above/below/left/right), `color`, `fontSize` |
| `arrow` | Directed line with optional label | `from` [x,y], `to` [x,y], `label`, `color`, `style` (solid/dashed) |
| `callout` | Bounded text box | `x`, `y`, `text`, `width`, `height`, `color`, `backgroundColor` |
| `marker` | Symbol at a coordinate | `x`, `y`, `style` (circle/star/diamond/square), `label`, `color`, `size` |
| `region` | Highlighted area | `bounds` [xMin, xMax, yMin, yMax] or `condition` string, `color`, `opacity`, `label` |

**Assembly rules:**
- Annotations are extracted from the description by the EntityExtractor ("label the max at (0,1)" → annotation).
- Annotations are merged into the final config alongside the primitive's own fields.
- The validator checks that annotation coordinates are within the rendered domain (if known) and emits warnings for annotations that would render off-screen.
- PedagogicalEnhancer infers common annotations from `pedagogical_goal`:
  - "derivative" → add markers at local extrema
  - "integral" → add a region annotation for the area under the curve
  - "limit" → add a marker at the point of interest
  - "transformation" → add before/after callouts

### 4.6 Composite Primitives

Composites let the agent express "show X alongside Y" — two or more primitives composed into a single visual block. This is how we solve the quiz+graph embedding problem and the function+derivative comparison use case.

```json
{
  "type": "mm.composite",
  "config": {
    "layout": "horizontal",  // or "vertical", "grid"
    "children": [
      {
        "type": "mm.graph.function",
        "config": { "expressions": ["x^2"], "domain": [-3, 3], "title": "f(x)" }
      },
      {
        "type": "mm.graph.function",
        "config": { "expressions": ["2x"], "domain": [-3, 3], "title": "f'(x)" }
      }
    ],
    "sharedDomain": true,
    "annotations": [
      { "type": "label", "x": 0, "y": 0, "text": "Compare: derivative doubles the slope", "anchor": "top" }
    ]
  }
}
```

**Layout types:**
| Layout | Behavior |
|---|---|
| `horizontal` | Children side by side, equal widths |
| `vertical` | Children stacked, equal heights |
| `grid` | 2-column grid, wraps as needed |

**Key behaviors:**
- `sharedDomain: true` → all children use the same domain/range for comparable scales
- Each child renders independently through `MMPrimitiveRegistry`
- Annotations at the composite level render across children (e.g., an arrow from one pane to another)
- The composite itself gets `MMPrimitiveCard` chrome with a title synthesized from child titles

**Quiz embedding special case:** When the composite's parent type is `mm.quiz.free_response` or `mm.quiz.multiple_choice` and a child is a graph/geometry/table primitive, the child renders inline within the quiz card (replacing the current placeholder icon):

```json
{
  "type": "mm.quiz.free_response",
  "config": {
    "promptMarkdown": "Where does f(x) = x² − 4 intersect the x-axis?",
    "visualization": {
      "type": "mm.composite",
      "children": [
        { "type": "mm.graph.function", "config": { "expressions": ["x^2 - 4"], "domain": [-4, 4], "showGrid": true } }
      ]
    }
  }
}
```

### 4.7 Free-Form Diagram Primitive

For visualizations that don't fit a coordinate plane: Venn diagrams, flow charts, tree diagrams, set diagrams, probability trees, concept maps, proof diagrams.

```json
{
  "type": "mm.diagram",
  "config": {
    "shapes": [
      { "type": "circle", "cx": 80, "cy": 60, "r": 45, "label": "A", "fill": "#e8f4f8", "stroke": "#3498db" },
      { "type": "circle", "cx": 120, "cy": 60, "r": 45, "label": "B", "fill": "#fef9e7", "stroke": "#f39c12" },
      { "type": "rect", "cx": 65, "cy": 60, "w": 25, "h": 15, "label": "A∩B", "fill": "#eafaf1", "stroke": "#27ae60" },
      { "type": "arrow", "x1": 180, "y1": 30, "x2": 180, "y2": 55, "label": "injection" }
    ],
    "viewBox": [0, 0, 260, 120],
    "backgroundColor": "white"
  }
}
```

**Shape types:**
| Type | Fields | Use case |
|---|---|---|
| `circle` | `cx`, `cy`, `r`, `label`, `fill`, `stroke` | Venn diagrams, node diagrams |
| `rect` | `x`, `y`, `w`, `h`, `label`, `fill`, `stroke`, `cornerRadius` | Flow chart nodes, tree nodes |
| `ellipse` | `cx`, `cy`, `rx`, `ry`, `label`, `fill`, `stroke` | Wide labels, state diagrams |
| `diamond` | `cx`, `cy`, `w`, `h`, `label`, `fill`, `stroke` | Decision nodes |
| `arrow` | `x1`, `y1`, `x2`, `y2`, `label`, `color`, `style` | Connections, flow |
| `line` | `x1`, `y1`, `x2`, `y2`, `style`, `color` | Dividers, connectors |
| `text` | `x`, `y`, `text`, `fontSize`, `color`, `anchor` | Free-floating labels |
| `path` | `d` (SVG-style), `fill`, `stroke` | Custom shapes (LLM fallback only) |

**Assembly rules:**
- `viewBox` is auto-computed from shape positions with padding if not specified.
- Overlapping circles with `intersection` hints trigger automatic intersection-region rects.
- Flow-chart patterns (`A → B → C`) generate a linear layout with auto-positioned arrows.
- Tree patterns (`root → [left, right]`) generate a hierarchical layout.
- The diagram renders via a lightweight Canvas-based renderer (no WKWebView).

### 4.8 Parametric & Polar Support (Graph Extension)

Extended graph config fields parsed by EntityExtractor:

```json
{
  "type": "mm.graph.function",
  "config": {
    "polarCurves": [
      { "expression": "2sin(3*theta)", "thetaRange": [0, 6.283], "label": "r = 2sin(3θ)", "color": "#e74c3c" }
    ],
    "parametricCurves": [
      { "xExpression": "cos(t)", "yExpression": "sin(t)^2", "tRange": [0, 6.283], "label": "(cos t, sin²t)" }
    ]
  }
}
```

**Entity extraction patterns:**
| Pattern | Extracts |
|---|---|
| `"r = expression"`, `"polar expression"` | `polarCurves` entry |
| `"x = ..., y = ..."`, `"parametric"`, `"particle moves"` | `parametricCurves` entry |

**Domain inference for polar/parametric:**
- Polar curves default to `thetaRange: [0, 2π]`
- Parametric curves default to `tRange: [0, 2π]` unless description specifies bounds
- DomainInferrer adjusts visible domain to contain the parametric/polar range

### 4.9 LLM Fallback Model

When the rule-based compiler cannot resolve a description (ambiguous entities, unusual notation, compositional requests), it falls back to an LLM for structured extraction.

**Model: `google/gemini-2.5-flash-lite`** via OpenRouter

| Attribute | Value |
|---|---|
| Model ID | `google/gemini-2.5-flash-lite` |
| Provider | OpenRouter (`https://openrouter.ai/api/v1`) |
| Input cost | $0.10/M tokens |
| Output cost | $0.40/M tokens |
| Cost per visualization | ~$0.00011 |
| Context window | 1M tokens (vastly exceeds compiler needs) |
| Key capability | Thinking mode for tricky extractions; excellent JSON schema adherence |

**Why this model:**
1. **Thinking mode** — Flash Lite supports a low-budget reasoning mode. For ambiguous descriptions ("plot the curve that passes through a minimum at x=2"), the model can reason briefly before emitting structured JSON. This is critical for the fallback path where rule-based extraction already failed.
2. **Same price tier as the chat default** — marginal cost difference vs `deepseek-v4-flash` at compiler-scale token volumes.
3. **Better structured output** — Gemini 2.5 Flash Lite is specifically strong at JSON schema adherence, which is the compiler's exact requirement.
4. **Decoupled from chat model** — Using a separate model for the compiler means the user can chat with any model (DeepSeek, Claude, GPT-4o) without affecting compiler reliability.
5. **No local model needed** — Avoids the complexity of bundling/local ML inference for now. OpenRouter API call is simple, fast, and stateless.

**Implementation:** The compiler's LLM call reuses the existing `OpenAIProvider` (OpenRouter is OpenAI-compatible) with a hardcoded model ID and a short system prompt specific to the extraction task. The API key is the same `OPENROUTER_API_KEY` already configured. No new auth, no new provider config.

### 4.9.1 LLM Fallback Prompt

The compiler sends a short, targeted prompt to the fallback model:

```
You are a math visualization extraction engine. Given a natural-language description of a math visualization, extract structured data.

Return ONLY valid JSON matching this schema:
{
  "type": "mm.graph.function" | "mm.numberline.basic" | "mm.geometry.canvas" | "mm.table.values" | "mm.quiz.free_response" | "mm.quiz.multiple_choice" | "mm.hint.progressive" | "mm.reveal.solution",
  "config": { ... primitive-specific fields ... },
  "pedagogical_additions": [ ... suggested enhancements based on the goal ... ]
}

Description: <user description>
Pedagogical goal: <goal if provided>
```

### 4.6 Quiz Disambiguation

When `type_hint` is `"quiz"`, the compiler uses `pedagogical_goal` + description structure:

- If description contains multiple choice options (e.g., "A: ..., B: ..., C: ...") → `mm.quiz.multiple_choice`
- If description asks an open question → `mm.quiz.free_response`
- If description provides hint stages → `mm.hint.progressive` (possibly alongside quiz)
- If description provides a solution to reveal → `mm.reveal.solution` (possibly alongside quiz)

The compiler can produce **multiple primitives** from a single `visualize` call when the description implies composition (e.g., a quiz card with an embedded graph).

---

## 5) Compiler Internals: New & Modified Files

### New module: `Sources/MathMate/Visualization/`

| File | Purpose |
|---|---|
| `VisualizationIntentCompiler.swift` | Main entry point: `(description, pedagogical_goal, type_hint) → [MMNativePrimitiveSpec]` |
| `TypeResolver.swift` | Keyword → `MMPrimitiveType` mapping (including composite and diagram) |
| `EntityExtractor.swift` | Regex-based math entity parsing from natural language (all 8 primitives + annotations + composites + diagrams) |
| `SchemaAssembler.swift` | Entities → validated config dict for all primitive types |
| `AnnotationBuilder.swift` | Annotation extraction, assembly, and cross-primitive injection |
| `CompositeBuilder.swift` | Composite detection, child assembly, layout inference |
| `DiagramCompiler.swift` | Diagram-specific entity extraction, shape positioning, viewBox computation |
| `PedagogicalEnhancer.swift` | Goal-based default inference, annotation suggestions, and domain tuning |
| `DomainInferrer.swift` | Auto-infer domain/range from expression type (polynomial, trig, log, polar, parametric) |
| `VisualizationTool.swift` | New `visualize` tool definition |
| `CompilerLLMFallback.swift` | OpenRouter API client for LLM-assisted extraction when rules fail |

### New files: Native Widget Schema Extensions

| File | Purpose |
|---|---|
| `NativeWidgets/Schema/MathMateAnnotationSchema.swift` | Annotation types (`label`, `arrow`, `callout`, `marker`, `region`) — shared across graph, geometry, number-line, composite |
| `NativeWidgets/Schema/MathMateCompositeSchema.swift` | Composite config (`layout`, `children`, `sharedDomain`) + quiz-embedding logic |
| `NativeWidgets/Schema/MathMateDiagramSchema.swift` | Diagram config (`shapes`, `viewBox`) |
| `NativeWidgets/Schema/MathMateGraphExtensionSchema.swift` | Polar curves, parametric curves — added to graph config |

### New files: Native Widget Renderers

| File | Purpose |
|---|---|
| `NativeWidgets/Primitives/MMCompositeView.swift` | Renders `mm.composite` — lays out children via `MMPrimitiveRegistry` |
| `NativeWidgets/Primitives/MMDiagramView.swift` | Renders `mm.diagram` — Canvas-based shape renderer |

### Modified files

| File | Change |
|---|---|
| `Tools/ToolCatalog.swift` | Add `visualize` tool definition; keep `create_widget_spec` as secondary |
| `Tools/ToolExecutor.swift` | Add `runVisualize()` that delegates to `VisualizationIntentCompiler`; move normalization logic from `runCreateWidgetSpec` into the compiler |
| `ViewModels/ChatViewModel.swift` | Simplify `_effectiveSystemPrompt` — replace 82-line `widgetContract` with short `visualize` instruction; add `visualize` tool result handling |
| `NativeWidgets/Schema/MathMatePrimitiveSchema.swift` | Add `mm.composite`, `mm.diagram` to `MMPrimitiveType`; add `MMAnnotationSpec`; extend `MMGraphFunctionConfig` with `polarCurves`, `parametricCurves` |
| `NativeWidgets/Schema/MathMatePrimitiveValidator.swift` | Add validation cases for composite, diagram, annotations; extend graph validation for polar/parametric |
| `NativeWidgets/MathMatePrimitiveRegistry.swift` | Register `mm.composite` → `MMCompositeView`, `mm.diagram` → `MMDiagramView` |
| `NativeWidgets/MathMateNativeWidgetView.swift` | Route annotation injection for graph/geometry/number-line/composite primitives |

---

## 6) DomainInferrer: Smart Defaults

The domain inferrer makes visualizations look good without requiring the model to specify bounds. It now handles all expression types including polar and parametric:

```
Cartesian expression analysis:
  "sin", "cos"              → domain: [-2π, 2π], range: [-1.5, 1.5]
  "tan"                     → domain: [-π/2 + 0.1, π/2 - 0.1], range: [-5, 5]
  "log", "ln"               → domain: [0.1, 10], range: [-2, 5]
  "sqrt", "x^(1/2)"         → domain: [0, 10], range: [0, 5]
  "x^n" (n even)            → domain: [-5, 5], range: [0, 25] (for n=2)
  "x^n" (n odd)             → domain: [-5, 5], range: [-125, 125] (for n=3, capped)
  "1/x"                     → domain: [-5, 5], range: [-10, 10]
  "e^x", "exp"              → domain: [-3, 3], range: [-0.5, 8]
  "asin", "acos"            → domain: [-1, 1], range: [-π, π]
  No recognized pattern     → domain: [-10, 10], range: [-10, 10]

Multiple expressions:      → union of inferred domains, padded by 15%

Polar curve analysis:
  "r = sin(n*theta)"       → domain: [-maxR*1.2, maxR*1.2], range: [-maxR*1.2, maxR*1.2]  (maxR from radius amplitude)
  "r = expression"          → domain: [-abs(maxR)*1.2, abs(maxR)*1.2] both axes

Parametric curve analysis:
  Sample t across tRange → auto-compute domain/range from min/max x and y values, padded by 15%

Number-line domain:
  Points/intervals bounds   → domain: [min - 1, max + 1] (or [-6, 6] default)

Geometry domain:
  Element bounds            → auto-compute from points, circles, polygon vertices, padded by 12%

Composite shared domain:
  When sharedDomain: true   → union all children domains
```

**Auto-evaluation fallback:** When regex can't classify the expression type, the compiler evaluates the expression at 5 evenly-spaced sample points in [-10, 10]. If all values are finite, use the sampled range padded by 20%. If any evaluate to NaN/Inf, warn and fall back to [-10, 10] x [-10, 10].

---

## 7) System Prompt Changes

### Before (current — 82-line widgetContract appended to system prompt)

```
When the user asks for a visualization/widget, ALWAYS call the tool `create_widget_spec` first.
This app is native-only for widgets: ALWAYS use `library: "mathmate-native"` with an `mm.*` type.
After tool execution, do NOT echo the returned JSON/spec...

### Native Primitives
[massive block describing all 8 primitive types, field names, shapes, examples]
```

### After (proposed — short, model-friendly)

```
When a concept would benefit from visual exploration, call the `visualize` tool with a
natural-language description of what to show. Include the math content and any interactive
elements. MathMate will select the best widget type and render it natively.

Example: visualize(description: "Graph f(x) = x³ - 3x with tangent lines at the local extrema
and shade where f(x) < 0", pedagogical_goal: "Understanding how derivatives relate to curve shape")

For precise control over the widget schema, you can also use `create_widget_spec` with
`library: "mathmate-native"` and a known `mm.*` primitive type.
```

This reduces the widget system prompt from ~82 lines to ~6 lines, while giving the model a tool it can actually use correctly.

---

## 8) MCP Server Design (Phase 2)

### Transport

- **stdio** (primary) — MathMate launches the MCP server as a subprocess
- **SSE** (secondary) — for remote/network access (future)

### Tools exposed

```json
{
  "name": "visualize",
  "description": "Create an interactive math visualization rendered by MathMate's native SwiftUI engine. Describe what you want to show in natural language.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "description": { "type": "string", "description": "What to visualize" },
      "pedagogical_goal": { "type": "string", "description": "Learning objective" },
      "type_hint": { "type": "string", "enum": ["graph", "number_line", "geometry", "table", "quiz", "hint", "solution"] }
    },
    "required": ["description"]
  }
}
```

```json
{
  "name": "list_primitives",
  "description": "List all available MathMate visualization primitive types and their capabilities.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

### Resources exposed (future)

- `mathmate://primitives/{type}` — Full schema and examples for a given primitive type
- `mathmate://sessions/{id}` — Read-only access to session content for context

### Implementation

New file: `Sources/MathMate/MCP/MathMateMCPServer.swift`

- Implements the MCP protocol (initialize → tools/list → tools/call)
- Reuses `VisualizationIntentCompiler` internally
- On `visualize` call: compiles intent → returns the spec JSON + a render confirmation
- On `list_primitives` call: returns the primitive catalog with descriptions

---

## 9) Error Handling & Fallbacks

### Compiler errors

| Error | Behavior |
|---|---|
| Unrecognized type_hint | Log warning, fall back to keyword-based resolution |
| No math content found in description | Return error: "Could not extract math content. Please specify an expression, function, or geometric construction." |
| Validation fails after assembly | Attempt auto-fix (add missing id, infer domain). If still fails, return structured error with fields that need attention |
| Ambiguous quiz type | Default to `mm.quiz.free_response` unless options are clearly specified |

### Rendering fallback

If the compiler produces a spec that renders incorrectly:
- The existing `MMPrimitiveCard` fallback view handles unknown/invalid types
- Tool result includes the compiled spec so the model can see what was produced and correct in a follow-up
- The model never sees raw validation errors — the compiler provides human-readable suggestions

---

## 10) Testing Strategy

### Unit tests: `Tests/MathMateTests/VisualizationIntentCompilerTests.swift`

1. **Type resolution** — keyword → primitive type mapping
   - "graph x^2" → `mm.graph.function`
   - "number line for x > 3" → `mm.numberline.basic`
   - "right triangle with vertices at ..." → `mm.geometry.canvas`
   - "table of values for sin(x)" → `mm.table.values`
   - "quiz: what is the derivative of x^3?" → `mm.quiz.free_response`
   - "show both f(x) and f'(x) side by side" → `mm.composite`
   - "venn diagram of A and B" → `mm.diagram`
   - "r = 2sin(3θ)" → `mm.graph.function` (polar)
   - "x = cos t, y = sin t" → `mm.graph.function` (parametric)

2. **Entity extraction** — parse math content from descriptions
   - "graph x^3 - 3x with tangent at x=1" → expressions + tangentAtX
   - "shade where f(x) < 0" → shadedRegions with baseline 0
   - "slider for a from -5 to 5" → slider spec
   - "x >= 2" → interval with includeFrom
   - "point at (3, 4)" → point spec
   - "circle center (0,0) radius 5" → circle spec
   - "label the maximum at (0, 1)" → annotation of type label
   - "arrow from (0,0) to (2,4) labeled ∇f" → annotation of type arrow
   - "venn diagram of A, B, C" → diagram shapes (3 circles with labels)
   - "A → B → C → D" → diagram shapes (4 rects + 3 arrows)
   - "r = 2sin(3θ)" → polarCurves entry
   - "x = cos t, y = sin²t for t in [0, 2π]" → parametricCurves entry
   - "A) 3 B) 4 C) 5" → multiple choice options
   - "evaluate at x = -2, -1, 0, 1, 2" → xValues array

3. **Schema assembly** — entities → valid config for ALL primitive types
   - Each primitive type produces config that passes `MMPrimitiveValidator.validate()`
   - All required fields present
   - Auto-fix fills missing optional fields with sensible defaults
   - Composite assembles children recursively
   - Diagram computes viewBox and positions shapes
   - Annotations injected into parent config correctly

4. **Pedagogical enhancement** — goal-based inference
   - "derivative" → tangent annotations suggested for graphs
   - "integral" → shaded regions + area annotations suggested
   - "transformation" → sliders + before/after callouts suggested
   - "inequality" → interval highlighting on number line
   - "limit" → marker at point of interest

5. **Domain inference** — expression-type → default domain/range
   - sin/cos → [-2π, 2π]
   - tan → [-1.47, 1.47]
   - log → [0.1, 10]
   - polynomial → [-5, 5]
   - polar r = sin(theta) → square bounds around [-1.2, 1.2]
   - parametric → auto-computed from sampling
   - unspecified → [-10, 10]
   - multi-expression → union with padding

6. **Annotation injection** — annotations render correctly in each host primitive
   - Graph: label at coordinate, arrow between points, callout box
   - Number-line: label above/below points and intervals
   - Geometry: labels on vertices, segments, circles
   - Composite: annotations span children

7. **Composition** — single description → multiple primitives
   - "quiz about the derivative of x^2 with a graph" → composite: quizCard + graph child
   - "show f(x) and f'(x) side by side with shared domain" → composite with sharedDomain
   - "venn diagram of sets A, B, C with all intersections labeled" → diagram with computed intersection rects
   - "flow chart: start → compute → decide? → yes: done / no: retry" → diagram with flow layout

8. **Roundtrip** — visualize → compile → validate → render
   - Full pipeline test for each primitive type
   - Full pipeline test for composites with annotations
   - Full pipeline test for diagrams

9. **LLM fallback** — mocked OpenRouter responses for ambiguous descriptions
   - Fallback triggered when rule-based extraction returns sparse entities
   - Fallback handles unusual notation (e.g., "plot the curve that passes through a minimum at x=2")
   - Fallback result enriched with structured fields
   - Non-configured API key → graceful degradation to rule-based only

### Integration tests

- Model calls `visualize` tool in streaming chat → correct primitive appears in chat
- Fallback: model calls `create_widget_spec` with explicit schema → still works
- MCP server: external client calls `visualize` → returns spec JSON
- Annotation rendering: visual comparison of label/arrow/callout/marker rendering across host primitives
- Composite layout: children render at correct sizes in horizontal, vertical, and grid layouts

---

## 11) Migration Path

### Phase 1: Build the compiler + new tool (internal)
1. Implement `VisualizationIntentCompiler` module
2. Add `visualize` tool to `ToolCatalog`
3. Add `runVisualize()` to `ToolExecutor`
4. Simplify system prompt
5. Add comprehensive tests
6. Keep `create_widget_spec` working as-is (backward compat)

### Phase 2: Deprecate primary use of `create_widget_spec`
1. System prompt recommends `visualize` as primary tool
2. `create_widget_spec` remains available but is no longer the default
3. Remove normalization aliases from `runCreateWidgetSpec` (move into compiler)
4. Measure accuracy improvement (fewer tool errors, fewer retry rounds)

### Phase 3: MCP server
1. Build `MathMateMCPServer`
2. Expose `visualize` + `list_primitives` over stdio
3. Test with Claude Desktop, Cursor, pi
4. Add SSE transport (optional, for remote access)

### Phase 4: Remove old normalization code
1. Once `visualize` is stable, remove alias normalization from `ToolExecutor`
2. Simplify `runCreateWidgetSpec` to strict validation only (no aliases)
3. Clean up system prompt further

---

## 12) Acceptance Criteria

### Core compiler (Phase 9A)
1. `visualize(description: "Graph x^3 - 3x with tangent lines at local extrema")` produces a valid `mm.graph.function` spec with correct expressions, `tangentAtX`, and inferred domain/range — without the model knowing what `tangentAtX` means.
2. `visualize(description: "Number line showing x > 2")` produces a valid `mm.numberline.basic` spec with an interval from 2 (open).
3. `visualize(description: "Table of values for sin(x)")` produces a valid `mm.table.values` spec with expression, x-values, and inferred precision.
4. `visualize(description: "Right triangle with legs 3 and 4")` produces a valid `mm.geometry.canvas` spec with vertices and the hypotenuse segment.
5. `visualize(description: "Free response quiz: find the derivative of x^3")` produces a valid `mm.quiz.free_response` spec with prompt and answer.
6. `visualize(description: "Multiple choice: what is 2+2? A)3 B)4 C)5")` produces a valid `mm.quiz.multiple_choice` spec with 3 options.
7. `visualize(description: "Progressive hints for solving 2x + 5 = 13")` produces a valid `mm.hint.progressive` spec with stages.
8. `visualize(description: "Solution: the quadratic formula is x = [-b ± √(b²-4ac)] / 2a")` produces a valid `mm.reveal.solution` spec.

### Annotations (Phase 9A)
9. `visualize(description: "Graph x^2, label the minimum at (0,0) and mark the points where x=±2 with arrows")` produces a graph spec with 3+ annotations of the correct types.
10. Annotations render at the correct positions across all host primitives (graph, number-line, geometry).
11. Pedagogical goal "derivative" automatically adds extremum markers to graphs.

### Composites (Phase 9A)
12. `visualize(description: "Show f(x)=x^2 and f'(x)=2x side by side with shared domain")` produces a valid `mm.composite` spec with 2 graph children and `sharedDomain: true`.
13. `visualize(description: "Quiz: where does f(x)=x²-4 cross the x-axis? Include the graph")` produces a composite with `mm.quiz.free_response` parent and `mm.graph.function` child.
14. Composite children render at equal sizes in horizontal and vertical layouts.

### Diagrams (Phase 9A)
15. `visualize(description: "Venn diagram showing intersection of sets A, B, and C")` produces a valid `mm.diagram` spec with 3 circles and computed intersection regions.
16. `visualize(description: "Flow chart: input → validate → {valid: process, invalid: reject}")` produces a diagram with 4 rects + 3 arrows auto-positioned.
17. `visualize(description: "Probability tree: coin flip → {heads: 0.5, tails: 0.5}")` produces a tree diagram with auto-layout.

### Polar/Parametric (Phase 9A)
18. `visualize(description: "Polar plot: r = 2sin(3θ)")` produces a graph spec with `polarCurves` entry and correct domain inference.
19. `visualize(description: "Parametric: x = cos(t), y = sin²(t) for t in [0, 2π]")` produces a graph spec with `parametricCurves` entry.

### System & robustness
20. System prompt for widget support is ≤ 10 lines (down from ~82).
21. Models using `visualize` require ≤ 1 tool round (no retries) in 90%+ of cases.
22. `swift build` and `swift test` pass with ≥85% test coverage on new compiler module.
23. `create_widget_spec` still works for backward compatibility.
24. MCP server responds to `visualize` and `list_primitives` over stdio (Phase 9B).

### Expressivity target
25. The combined primitives + compiler can express ≥80% of the 20 common math-tutoring visualization intents identified in Section 1.1.

---

## 13) File-by-File Work Breakdown

### Ticket V1 — Intent Compiler Core + Native Schema Extensions
**New compiler files:**
- `Sources/MathMate/Visualization/VisualizationIntentCompiler.swift` — main entry point
- `Sources/MathMate/Visualization/TypeResolver.swift` — keyword → primitive type (incl. composite, diagram)
- `Sources/MathMate/Visualization/EntityExtractor.swift` — regex extraction for all 8 primitives + annotations + composites + diagrams + polar/parametric
- `Sources/MathMate/Visualization/SchemaAssembler.swift` — entities → config for all 8 primitives + composite + diagram
- `Sources/MathMate/Visualization/AnnotationBuilder.swift` — annotation extraction, assembly, cross-primitive injection
- `Sources/MathMate/Visualization/CompositeBuilder.swift` — composite detection, child assembly, layout inference, quiz-embedding
- `Sources/MathMate/Visualization/DiagramCompiler.swift` — diagram shape extraction, layout, viewBox computation
- `Sources/MathMate/Visualization/PedagogicalEnhancer.swift` — goal-based defaults, annotation inference, domain tuning
- `Sources/MathMate/Visualization/DomainInferrer.swift` — expression-type → domain/range (incl. polar, parametric, multi-expression)
- `Sources/MathMate/Visualization/CompilerLLMFallback.swift` — OpenRouter fallback for ambiguous descriptions

**New schema files:**
- `Sources/MathMate/NativeWidgets/Schema/MathMateAnnotationSchema.swift` — `MMAnnotationSpec` (label, arrow, callout, marker, region)
- `Sources/MathMate/NativeWidgets/Schema/MathMateCompositeSchema.swift` — `MMCompositeConfig` (layout, children, sharedDomain)
- `Sources/MathMate/NativeWidgets/Schema/MathMateDiagramSchema.swift` — `MMDiagramConfig` (shapes, viewBox)
- `Sources/MathMate/NativeWidgets/Schema/MathMateGraphExtensionSchema.swift` — polar/parametric curve specs

**New renderer files:**
- `Sources/MathMate/NativeWidgets/Primitives/MMCompositeView.swift` — composite layout + child rendering
- `Sources/MathMate/NativeWidgets/Primitives/MMDiagramView.swift` — Canvas-based shape renderer

**Modified schema/registry/validator:**
- `Sources/MathMate/NativeWidgets/Schema/MathMatePrimitiveSchema.swift` — add `mm.composite`, `mm.diagram` to enum; add annotation fields to graph/geometry/number-line configs; extend graph config with polar/parametric
- `Sources/MathMate/NativeWidgets/Schema/MathMatePrimitiveValidator.swift` — validation for composite, diagram, annotations, polar/parametric
- `Sources/MathMate/NativeWidgets/MathMatePrimitiveRegistry.swift` — register composite, diagram views
- `Sources/MathMate/NativeWidgets/MathMateNativeWidgetView.swift` — annotation injection pipeline

**Deliverables:**
- Full compiler pipeline covering all 8 existing primitives + composite + diagram
- Annotation extraction, assembly, and rendering for graph, number-line, geometry, composite
- Composite resolution with quiz-embedding special case
- Diagram resolution with auto-layout for flow, tree, and venn patterns
- Polar and parametric curve support in graph config and renderer
- Domain inference for all expression types
- Pedagogical enhancement rules covering 6 goal types
- LLM fallback via `google/gemini-2.5-flash-lite` on OpenRouter

### Ticket V2 — New Tool + Executor Integration
**New files:**
- `Sources/MathMate/Visualization/VisualizationTool.swift`

**Modify:**
- `Sources/MathMate/Tools/ToolCatalog.swift` — add `visualize` tool
- `Sources/MathMate/Tools/ToolExecutor.swift` — add `runVisualize()`, move normalization logic into compiler
- `Sources/MathMate/ViewModels/ChatViewModel.swift` — simplify `_effectiveSystemPrompt`, add `visualize` result handling

**Deliverables:**
- `visualize` tool callable by models
- System prompt uses `visualize` as primary path (≤10 lines)
- `create_widget_spec` still works as escape hatch

### Ticket V3 — Tests
**New files:**
- `Tests/MathMateTests/VisualizationIntentCompilerTests.swift` — 40+ test cases (types, extraction, assembly, pedagogy, domain, annotations, composites, diagrams, polar/parametric, composition, roundtrip)
- `Tests/MathMateTests/CompilerLLMFallbackTests.swift` — mocked OpenRouter responses, fallback triggers, structured output parsing
- `Tests/MathMateTests/AnnotationRenderTests.swift` — visual regression: annotation positions across host primitives
- `Tests/MathMateTests/CompositeLayoutTests.swift` — layout correctness for horizontal, vertical, grid, sharedDomain
- `Tests/MathMateTests/DiagramShapeTests.swift` — auto-layout for flow, tree, venn patterns

**Deliverables:**
- ≥85% test coverage on Visualization module
- Type resolution tests (10+ cases)
- Entity extraction tests (15+ cases)
- Schema assembly + validation tests (all 10 primitive types)
- Pedagogical enhancement tests (6 goal types)
- Domain inference tests (all expression families + polar/parametric)
- Annotation injection tests (5 annotation types × 4 host primitives)
- Composition tests (quiz+graph, function+derivative, venn+intersections, flow chart)
- Roundtrip integration tests (full pipeline for each type)
- LLM fallback tests (mocked)

### Ticket V4 — MCP Server (Phase 9B)
**New files:**
- `Sources/MathMate/MCP/MathMateMCPServer.swift`
- `Sources/MathMate/MCP/MCPProtocol.swift`
- `Sources/MathMate/MCP/MCPTransport.swift`

**Deliverables:**
- MCP server responds to `initialize`, `tools/list`, `tools/call`
- `visualize` and `list_primitives` tools exposed
- Stdio transport working

### Ticket V5 — Cleanup (Phase 9C)
**Modify:**
- `Sources/MathMate/Tools/ToolExecutor.swift` — remove normalization aliases from `runCreateWidgetSpec`
- `Sources/MathMate/ViewModels/ChatViewModel.swift` — further simplify system prompt

**Deliverables:**
- `create_widget_spec` is strict-only (no alias patching)
- System prompt minimal for widget support
- All normalization logic lives in the Intent Compiler

---

## 14) Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Regex entity extraction misses edge cases | High (math notation is diverse) | Fallback to LLM-assisted extraction via `google/gemini-2.5-flash-lite` on OpenRouter. If LLM also fails, return a helpful error asking the model to be more specific. The model can rephrase and retry. |
| Compiler produces wrong primitive type | Medium | `type_hint` gives the model an override. Compiler logs its resolution reasoning in the tool result for transparency. |
| Domain inference produces bad defaults for unusual expressions | Medium | Compiler evaluates the expression at sample points and auto-scales. If expression can't be evaluated, fall back to [-10, 10]. |
| Diagram auto-layout produces ugly/cluttered results | Medium (diagrams are harder than plots) | Start with simple layouts (linear flow, 2-set venn, binary tree). Add more sophisticated layout algorithms incrementally. The `path` shape type provides an escape hatch for custom layouts via LLM fallback. |
| Composite rendering creates layout issues (uneven sizing, scroll overflow) | Medium | Children get equal sizing in horizontal/vertical modes. Max composite width is bounded by the chat column. Overflow composites get vertical stacking. |
| Annotation coordinates out of bounds | Medium | Validator warns on off-screen annotations. Renderer clips annotations to the visible region with a fade effect. PedagogicalEnhancer uses conservative default positions. |
| Polar/parametric expression evaluation is fragile | Medium | Same `NSExpression`-based evaluator as Cartesian graphs. Add word-boundary-aware string substitution for `theta` and `t` variables. Fall back to LLM-evaluated sample points for complex expressions. |
| MCP server adds complexity before it's needed | Low | MCP is Phase 9B, explicitly deferred until the compiler is stable internally. |
| Models don't use `visualize` and keep calling `create_widget_spec` | Medium | System prompt strongly recommends `visualize`. If models still use the old tool, it still works — no breakage. |
| OpenRouter API key not configured (LLM fallback unavailable) | Low | Compiler falls back to rule-based extraction only. Returns best-effort spec or a helpful error. The LLM fallback is an enhancement, not a dependency. |
| LLM fallback adds latency | Low | Only triggered when rule-based extraction fails (~20% of cases). Typical LLM response time for 300-token input is <2s. UX impact is minimal since the user is already waiting for a widget render. |
| Phase 9A scope is large (annotations + composites + diagrams + polar/parametric + full compiler) | Medium | Prioritize execution: (1) full compiler for all 8 existing primitives, (2) annotations, (3) composites, (4) diagrams, (5) polar/parametric. Each is independently shippable. |

---

## 15) Dependencies

- Existing `MathMatePrimitiveSchema` (primitive types, config structs)
- Existing `MathMatePrimitiveValidator` (validation logic)
- Existing `MMPrimitiveRegistry` (rendering)
- Existing `ToolExecutor` + `ToolCatalog` (tool infrastructure)
- Phase 8B (Native Primitives) must be complete — this builds on top of the primitive rendering system

---

### 4.10 Phase 9D — 3D, Animation & Remaining Expressivity

Phase 9D covers capabilities that are architecturally well-understood but have larger rendering scope than the 9A primitives. 3D and animation are the two biggest items — both are genuine power features for math tutoring.

---

### 4.10.1 3D Surface Primitive (`mm.surface_3d`)

**Renderer: SceneKit.** SceneKit is bundled with macOS, has native Swift interop, and handles camera orbits, lighting, and mesh rendering without custom OpenGL/Metal code. No dependency to bundle.

#### Schema

```json
{
  "type": "mm.surface_3d",
  "config": {
    "id": "surface-001",
    "surfaceExpression": "x^2 - y^2",
    "domain": [-3, 3, -3, 3],      // [xMin, xMax, yMin, yMax]
    "zRange": [-10, 10],             // optional, auto-sampled if omitted
    "curves": [                       // space curves on or near the surface
      { "expression": "(t, t^2, 0)", "tRange": [-3, 3], "label": "parabola on xy-plane", "color": "#e74c3c" }
    ],
    "points": [                       // highlighted points in 3D
      { "x": 0, "y": 0, "z": 0, "label": "saddle point", "color": "#3498db" }
    ],
    "annotations": [                  // 3D label annotations
      { "type": "label_3d", "x": 0, "y": 0, "z": 0, "text": "saddle", "anchor": "above" }
    ],
    "style": "surface",              // "surface" | "wireframe" | "both"
    "camera": {                       // initial camera position
      "position": [5, 5, 8],
      "lookAt": [0, 0, 0]
    },
    "showAxes": true,
    "gridResolution": 50              // mesh density (50 × 50 = 2500 faces)
  }
}
```

#### Renderer design

```
SCNView (wrapped in NSViewRepresentable)
├── SCNCamera (orbitable via built-in allowsCameraControl)
├── SCNNode: AXES
│   ├── SCNCylinder × 3 (x/y/z axes, thin rods)
│   └── SCNText × 3 (axis labels)
├── SCNNode: SURFACE
│   └── SCNGeometry (custom triangle mesh from expression sampling)
│       ├── SCNGeometrySource (vertices from grid evaluation)
│       ├── SCNGeometryElement (triangles from grid quads)
│       └── SCNMaterial (diffuse color + specular, semi-transparent option)
├── SCNNode: CURVES
│   └── SCNCylinder segments (sampled space curves)
├── SCNNode: POINTS
│   └── SCNSphere × N (small spheres at highlight positions)
└── SCNNode: ANNOTATIONS
    └── SCNText × N (billboard-constrained text labels)
```

#### Mesh generation

1. Sample `surfaceExpression` on a uniform grid of `gridResolution × gridResolution` in the domain.
2. Replace `x` and `y` in the expression with grid coordinates, evaluate with `NSExpression` (same evaluator as 2D graphs).
3. Build vertex buffer + index buffer from the grid quads.
4. Compute vertex normals from face normals (or analytically if we can symbolically differentiate).

**Performance budget:** 50×50 grid = 2500 vertices = 4802 triangles. SceneKit handles this trivially at 60fps.

#### Domain inference for 3D

| Expression type | Inferred domain |
|---|---|
| `x^2 + y^2` (paraboloid) | x: [-3, 3], y: [-3, 3], z: [0, 18] |
| `x^2 - y^2` (saddle) | x: [-3, 3], y: [-3, 3], z: [-9, 9] |
| `sin(x) * cos(y)` (egg carton) | x: [-2π, 2π], y: [-2π, 2π], z: [-1, 1] |
| `exp(-x^2 - y^2)` (Gaussian) | x: [-3, 3], y: [-3, 3], z: [0, 1] |
| `sqrt(x^2 + y^2)` (cone) | x: [-3, 3], y: [-3, 3], z: [0, 4.25] |

#### Entity extraction patterns

| Pattern | Extracts |
|---|---|
| `"surface z = ..."`, `"plot z = ..."`, `"3d plot of ..."` | `surfaceExpression` |
| `"space curve r(t) = ..."`, `"parametric curve (x, y, z) = ..."` | `curves` entry |
| `"saddle point at (x, y, z)"`, `"minimum at (x, y, z)"` | `points` entry |
| `"from above"`, `"side view"`, `"isometric"` | Camera preset hints |

**Camera presets** (inferred from description, overridable):
| Hint | Camera position |
|---|---|
| "from above" | (0, 0, 10) looking at (0, 0, 0) |
| "from the side" | (10, 0, 0) looking at (0, 0, 0) |
| "isometric" | (5, 5, 5) looking at (0, 0, 0) — default |
| "close up" | Reduced distance, wider FOV |

#### Compositing with 3D

A composite can mix 2D and 3D children:
```json
{
  "type": "mm.composite",
  "config": {
    "layout": "horizontal",
    "children": [
      { "type": "mm.graph.function", "config": { "expressions": ["x^2"], "title": "y = x²" } },
      { "type": "mm.surface_3d", "config": { "surfaceExpression": "x^2 + y^2", "title": "z = x² + y²" } }
    ]
  }
}
```
This enables "show the 2D parabola alongside its 3D paraboloid of revolution" — a powerful teaching pattern.

---

### 4.10.2 Animation Primitive (`mm.animation.sequence`)

Animations are not a new renderer — they are an **animation layer** that wraps existing primitive configs and sequences through states. The renderer shows one stage at a time with play/pause/step controls. This reuses every existing primitive renderer unmodified.

#### Design decision: stage-sequenced, not keyframe-based

**Why stages, not keyframes:** Math tutoring animations are inherently discrete — "step 1: draw the triangle, step 2: add the altitude, step 3: label the right angles, step 4: state the congruence." Continuous interpolation works for function transformations (shift, scale) but the stage model covers both discrete and continuous cases.

**How continuous interpolation works within stages:** Each stage specifies a `duration` and an `interpolate` field listing which config fields transition smoothly. The renderer generates intermediate states at 30fps by linearly interpolating the numeric values between adjacent stages.

#### Schema

```json
{
  "type": "mm.animation.sequence",
  "config": {
    "id": "anim-001",
    "title": "Derivative as limit of secant lines",
    "primitiveType": "mm.graph.function",
    "stages": [
      {
        "label": "Starting function",
        "duration": 0,
        "config": {
          "expressions": ["x^2"],
          "domain": [-3, 3],
          "showGrid": true
        }
      },
      {
        "label": "Secant through x=1 and x=3",
        "duration": 1.5,
        "interpolate": ["secantPairs[0][1]", "annotations[0].x"],
        "config": {
          "secantPairs": [[1, 3]],
          "annotations": [
            { "type": "label", "x": 2, "y": 4, "text": "secant", "color": "#e74c3c" }
          ]
        }
      },
      {
        "label": "Secant through x=1 and x=2",
        "duration": 1.0,
        "interpolate": ["secantPairs[0][1]", "annotations[0].x"],
        "config": {
          "secantPairs": [[1, 2]],
          "annotations": [
            { "type": "label", "x": 1.5, "y": 2.25, "text": "getting closer", "color": "#e74c3c" }
          ]
        }
      },
      {
        "label": "Tangent at x=1 (limit)",
        "duration": 0,
        "config": {
          "tangentAtX": [1],
          "annotations": [
            { "type": "label", "x": 1, "y": 1, "text": "f'(1) = 2", "color": "#27ae60" }
          ]
        }
      }
    ],
    "loop": false,
    "autoPlay": false
  }
}
```

#### Stage controller (renderer)

```
┌────────────────────────────────────────────┐
│  MMAnimationSequenceView                   │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  Current stage rendered via          │  │
│  │  MMPrimitiveRegistry.buildView()     │  │
│  │  (reuses existing primitive views)   │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ◀◀  ◀  ● ⏸  ▶  ▶▶    Stage 2 / 4        │
│  ──────○──────────────  "Secant through"   │
└────────────────────────────────────────────┘
```

**Playback controls:**
| Control | Action |
|---|---|
| `◀◀` | Jump to first stage |
| `◀` | Previous stage |
| `▶` / `⏸` | Play/pause auto-advance |
| `▶` | Next stage |
| `▶▶` | Jump to last stage |
| Progress bar | Seek to any stage (scrub) |

**Interpolation engine:**
1. Parse `interpolate` paths for each stage (e.g., `"secantPairs[0][1]"` → field accessor).
2. During play, sample at 30fps: `t = elapsed / duration`, `value = lerp(prevValue, nextValue, easeInOut(t))`.
3. Apply interpolated values to a working config dict, render the primitive.
4. Only numeric fields are interpolated; strings, bools, and arrays snap at the stage boundary.

**Natural language patterns for animation:**
| User says | Compiler infers |
|---|---|
| "animate the secant approaching the tangent" | `mm.animation.sequence` with secantPairs stages converging to tangentAtX |
| "show the function shifting left" | Stages with expression changing from `f(x)` to `f(x+2)` |
| "step through the construction" | Discrete stages with `duration: 0`, one per step |
| "before and after the transformation" | Two stages: original + transformed |
| "Riemann sum with more rectangles" | Stages with increasing rectangle counts, auto-generated by compiler |
| "rotate the shape 90°" | Geometry stages with rotated vertex coordinates |

#### Animation use cases unlocked

| Category | Example | Type |
|---|---|---|
| **Limit visualization** | Secant → tangent, Riemann sum → integral | Continuous interpolation |
| **Function transformation** | f(x) → f(x+2), f(x) → 2f(x), f(x) → -f(x) | Continuous interpolation |
| **Derivative exploration** | Point moving along curve with tangent line following | Continuous (parametric) |
| **Geometric proofs** | Construct triangle → add altitude → prove congruence | Discrete stages |
| **Integration** | Riemann sums with n=2, 4, 8, 16, 32 rectangles | Discrete stages (auto-generated) |
| **Polar tracing** | Point tracing r = 2sin(3θ) as θ increases | Continuous (parametric) |
| **Comparative** | Before/after transformation side by side | Discrete (could use composite for layout) |
| **Exam review** | "Here's the problem → here's step 1 → step 2 → solution" | Discrete stages |

#### Compiler auto-generation for common patterns

Some animations are formulaic enough that the compiler can generate stages without the model specifying each one:

| Pattern | Auto-generation |
|---|---|
| "Riemann sum with n rectangles" | Generate `n/2, n, 3n/2, 2n` stages with increasing rectangle counts |
| "Secant approaching tangent at x=a" | Generate `a+2, a+1, a+0.5, a+0.1, a+0.01` stages for secant |
| "Transform f(x) by h units right" | Generate `f(x), f(x+h/4), f(x+h/2), f(x+3h/4), f(x+h)` stages |

These are compiler-internal — the model just describes the intent and the compiler fills in the stages.

---

### 4.10.3 Phase 9D Implementation Summary

The following capabilities are out of scope for Phase 9A–C but have detailed designs above and are tracked for Phase 9D:

| Capability | Dependency | New files needed |
|---|---|---|
| **3D surface primitive** | SceneKit (bundled, no dep) | `MMSurface3DSchema.swift`, `MMSurface3DView.swift`, `DomainInferrer3D.swift` |
| **Animation sequence primitive** | All existing primitives (renders them) | `MMAnimationSequenceSchema.swift`, `MMAnimationSequenceView.swift`, `AnimationInterpolator.swift` |
| **Slider rendering** | `MMSliderSpec` (exists) | `MMFunctionGraphView` extension, `SliderOverlay.swift` |
| **Drag-to-explore geometry** | Gesture recognizers | `MMInteractiveGeometryView.swift`, `GeometryConstraintSolver.swift` |
| **Statistical visuals** | Canvas rendering | `MMStatsSchema.swift`, `MMStatsView.swift` (box, histogram, scatter) |
| **Live graph annotations** | Gesture recognizers + annotation persistence | `AnnotationGestureHandler.swift` |

**Priority ordering for Phase 9D:**
1. **Slider rendering** — smallest scope, schema already exists, high user-requested value
2. **Animation sequences** — high teaching value (limits, transformations, proofs), reuses all existing renderers
3. **3D surfaces** — multivariable calculus is a major curriculum area; SceneKit makes rendering straightforward
4. **Interactive geometry** — drag-to-explore for geometry canvases
5. **Statistical visuals** — useful but narrower audience than calculus/algebra
6. **Live annotations** — user-placed, not agent-generated; different interaction model

## 16) Why Not Fine-Tuning?

Fine-tuning was considered as an alternative approach. It was rejected for this use case because:

1. **The bottleneck is tool description, not model knowledge** — expanding the `config` schema description would itself fix much of the problem, but the real win is eliminating the need for the model to know the schema at all.

2. **Fine-tuning teaches style, not schema compliance** — models are mediocre at exact structural compliance with complex JSON schemas, especially with many conditionally-required fields.

3. **No training data exists** — we'd need thousands of (prompt, correct_widget_spec) pairs covering all 8 primitives, all field combinations, and edge cases. Synthetic data amplifies generator biases.

4. **Schema changes break fine-tuned models** — every new primitive type or renamed field requires re-fine-tuning. The Intent Compiler absorbs changes internally.

5. **Cost/benefit is unfavorable** — fine-tuning costs $500-5K+ and 3-6 weeks for +10-30% accuracy improvement. The Intent Compiler is free to build (app-side code), takes 1-2 weeks, and should improve accuracy by 50-70% by eliminating the schema-compliance problem entirely.

Fine-tuning may become valuable later for **pedagogical reasoning** (when to use which visualization, how to compose multi-widget responses), but that's a different problem from schema compliance and can be addressed after the Intent Compiler proves the architecture.

---

*Created: 2026-05-22*
