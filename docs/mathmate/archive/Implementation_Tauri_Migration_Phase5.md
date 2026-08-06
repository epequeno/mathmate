# Tauri v2 Migration — Phase 5: Enhancements

**Goal**: Ship the features that were architecturally painful in Swift and become trivial in a web-based app — visualizations, PDF textbooks, and rich interactive content. This is where the Tauri migration pays off beyond "same experience, fewer crashes."

**Estimated effort**: Ongoing / per-feature (2–5 days each)

**Depends on**: Phase 4 (polish, stable daily-use app)

---

## Deliverables

### D5.1 — Interactive visualizations (Plotly)
**Why this is easy now**: One `<script>` tag + one JS call. Previously required a WKWebView per widget, the whole snapshot pool, height-bridging, and the custom `VisualizationIntentCompiler`.

- [ ] `npm install plotly.js-dist-min` or load from CDN
- [ ] `src/components/Visualization/FunctionGraph.tsx`:
  ```typescript
  import Plotly from 'plotly.js-dist-min';
  
  function FunctionGraph({ expression, xRange, yRange }: Props) {
    const ref = useRef(null);
    useEffect(() => {
      const xValues = linspace(xRange[0], xRange[1], 400);
      const yValues = xValues.map(x => evaluate(expression, x));
      Plotly.newPlot(ref.current, [
        { x: xValues, y: yValues, type: 'scatter', mode: 'lines' }
      ], {
        xaxis: { range: xRange },
        yaxis: { range: yRange }
      });
    }, [expression, xRange, yRange]);
    return <div ref={ref} />;
  }
  ```
- [ ] Supported chart types (mapping from current native primitives):
  - Function graphs (with sliders, tangents, annotations)
  - Number lines (custom SVG or Plotly shapes)
  - Geometry canvases (custom SVG)
  - Data tables (HTML table)
  - Statistics: box plots, histograms, scatter plots, distribution curves
  - Polar plots
  - Parametric curves
  - 3D surfaces (Plotly's `surface` trace type)
- [ ] Composability: function graph next to LaTeX text is just `<div><KaTeX/><FunctionGraph/></div>`

### D5.2 — Model visualization integrations
- [ ] System prompt additions: teach the model to emit simple visualization specs:
  ```
  When you want to visualize a function, use:
  <mathmate-viz type="function" expr="sin(x)" xmin="-5" xmax="5" />
  ```
- [ ] Frontend parses these tags from markdown, renders them inline
- [ ] No tool definitions, no multi-round tool loops, no WKWebView-backed widget shells

### D5.3 — PDF textbook reader
- [ ] Tauri plugin for PDF rendering: `tauri-plugin-pdf` or custom WebView with `pdf.js`
- [ ] Actually — since we're already in a web context, `pdf.js` works natively:
  ```html
  <iframe src={`tauri://localhost/read-pdf?path=${encodeURI(pdfPath)}`} />
  ```
- [ ] Or: Rust reads PDF pages as images, serves them to the frontend:
  - `pdf-extract.py` (current) → Rust `pdf` crate for page extraction
  - Serve extracted pages as images in a scrollable viewer
- [ ] Textbook sidebar: overlay next to chat, shows relevant pages
- [ ] Page reference parsing: model can cite "see page 42 of your textbook" → click to open

### D5.4 — Quiz cards (native teaching interactions)
- [ ] `src/components/Quiz/FreeResponse.tsx` — text input + submit + check answer
- [ ] `src/components/Quiz/MultipleChoice.tsx` — clickable options + feedback
- [ ] `src/components/Quiz/ProgressiveHint.tsx` — staged reveal
- [ ] `src/components/Quiz/SolutionReveal.tsx` — hidden solution, click to show
- [ ] No separate WKWebViews — these are just React components in the message flow
- [ ] Model emits quiz questions as markdown (parsed by the frontend into interactive components):
  ```markdown
  **Question**: What is ∫ x² dx?
  
  <mathmate-quiz type="multiple-choice">
    - (1/3)x³ + C
    - 2x + C
    - x³/3
    - x² + C
  </mathmate-quiz>
  ```

### D5.5 — Synapse integration (revisit)
- [ ] Now that the app is web-based, Synapse's JSON API can be called directly from the frontend
- [ ] No need for Rust MCP client — just `fetch()` to Synapse server
- [ ] Vault features: full-text search, semantic search, note embedding
- [ ] Could replace the file-scanning vault browser with real semantic query

### D5.6 — Speech & audio (optional)
- [ ] Web Speech API (built into browsers):
  - `SpeechRecognition` for speech-to-text (no SFSpeechRecognizer dependency)
  - `SpeechSynthesis` for text-to-speech (no AVSpeechSynthesizer dependency)
- [ ] Zero additional dependencies — the browser provides this natively
- [ ] LaTeX-to-speech normalization in TypeScript

### D5.7 — Build & verify
- [ ] Function graph renders as a Plotly chart inline in a chat message
- [ ] Quiz card is interactive (clickable answers, feedback shown)
- [ ] PDF textbook opens in-app (not external reader)
- [ ] System prompts with `<mathmate-viz>` tags render visualizations
- [ ] Synapse query returns relevant vault notes

---

## What Goes Away (from Phase 9 Swift plans)

| Swift Plan | Status | Tauri Equivalent |
|---|---|---|
| `VisualizationIntentCompiler` (18 tests) | Never shipped (removed) | Plotly + 5 lines of JS |
| `MMFunctionGraphView` (native SwiftUI) | Shipped, ~300 lines | Plotly `newPlot` call |
| `MMQuizFreeResponseView` | Shipped | React `<FreeResponse>` component |
| `MMGeometryCanvasView` | Shipped | SVG component |
| `MMNumberLineView` | Shipped | SVG component |
| `MMTableValuesView` | Shipped | HTML `<table>` |
| `MMPrimitiveRegistry` | Shipped, ~100 lines | React component registry |
| `PrimitiveInteractionStore` | Shipped, ~100 lines | React state |
| `create_widget_spec` tool | Removed | Not needed |
| **~1,000+ lines** | 🗑️ | |

## What Becomes Trivial

| Hard problem in Swift | Easy in Tauri |
|---|---|
| Render a graph next to LaTeX text | `<div><KaTeX/><Graph/></div>` |
| Interactive quiz in a message | `<Quiz>` React component |
| Animate a function changing | Plotly `react()` update |
| Drag to explore a 3D surface | Plotly handles this natively |
| Speech-to-text | `webkitSpeechRecognition` |
| Read a PDF in-app | `pdf.js` or iframe |
| Semantic vault search | `fetch()` to Synapse API |

## Acceptance Criteria
- [ ] Visualizations render inline in chat messages
- [ ] Quiz cards are interactive
- [ ] PDF textbook opens within the app
- [ ] Model-generated visualization tags render correctly
- [ ] Synapse integration works (if configured)
- [ ] Zero WKWebView-backed widgets