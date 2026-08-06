# Textbook Content Integration — Implementation Plan

**Feature:** Full-text search and agent-proactive content retrieval for project textbooks  
**Status:** Phase 1 Complete (2026-06-09)  
**Phase:** D — Chat View: Process Block & Tool Formatting  
**Stack:** Tauri v2 / React / TypeScript / Rust  
**Linked roadmap item:** Priority 4 — Textbook & PDF Pipeline

---

## Overview

When a user tells the AI tutor "I'm working on section 5.2 exercise 33 from my textbook," the agent should be able to:
1. Search the textbook's text content for the relevant section/exercise
2. Read the problem statement and surrounding material
3. Use that context to provide targeted tutoring

This builds on the Phase 1 Free Textbook Catalog (download + set textbook) and the PDF Viewer Tab (pdf.js rendering).

### Key Design Decisions

| Question | Decision | Rationale |
|---|---|---|
| Text extraction | pdf.js `getTextContent()`, cached at first open | pdf.js has excellent text extraction quality; caching avoids re-extraction |
| Search scope | Single textbook per project (1:1) | Simpler; multi-book search can come later |
| Context injection | Agent-proactive via tool call | Keeps latency low; LLM decides when to search |
| Persistence | `~/.mathmate/textbooks/{id}_index.json` + meta | Survives restarts; indexed once, searched many times |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Chat Flow                        │
│                                                     │
│  User: "Section 5.2 exercise 33"                   │
│    ↓                                                │
│  System prompt: "You have a textbook. Use           │
│   search_textbook() to find content."               │
│    ↓                                                │
│  LLM calls tool: search_textbook("section 5.2")     │
│    ↓                                                │
│  Rust: loads index, scores pages, returns snippets  │
│    ↓                                                │
│  LLM uses snippets to answer user                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                Indexing Flow                         │
│                                                      │
│  1. User opens Book tab → PdfViewer loads PDF       │
│  2. Check if {id}_index.json exists                 │
│  3. If not:                                          │
│     a. Iterate pages via pdf.js getTextContent()     │
│     b. Buffer text per-page                          │
│     c. Send batches to index_textbook_pages command  │
│     d. Rust writes {id}_index.json + {id}_meta.json  │
│  4. If yes:                                          │
│     a. Load meta, mark as ready                      │
└─────────────────────────────────────────────────────┘
```

---

## Data Formats

### Index File: `~/.mathmate/textbooks/{id}_index.json`

```json
{
  "textbook_id": "linear-algebra-done-right",
  "total_pages": 356,
  "pages": [
    {
      "page": 1,
      "text": "Linear Algebra Done Right Fourth Edition Sheldon Axler..."
    },
    {
      "page": 2,
      "text": "..."
    }
  ],
  "indexed_at": "2026-06-09T20:00:00Z"
}
```

### Meta File: `~/.mathmate/textbooks/{id}_meta.json`

```json
{
  "textbook_id": "linear-algebra-done-right",
  "title": "Linear Algebra Done Right",
  "total_pages": 356,
  "indexed_pages": 356,
  "indexed_at": "2026-06-09T20:00:00Z",
  "status": "complete"
}
```

---

## Rust Backend

### New Module: `textbook_index.rs`

```rust
// ===== Types =====

struct PageContent {
    page: u32,
    text: String,
}

struct TextbookIndex {
    textbook_id: String,
    total_pages: u32,
    pages: Vec<PageContent>,
    indexed_at: String,
}

struct TextbookIndexMeta {
    textbook_id: String,
    title: Option<String>,
    total_pages: u32,
    indexed_pages: u32,
    indexed_at: String,
    status: IndexStatus,  // "indexing" | "complete" | "failed"
}

struct SearchResult {
    page: u32,
    score: f64,
    snippet: String,       // ~200 char window around best match
}

struct SearchQuery {
    query: String,
    max_results: Option<usize>,  // default 5
    page_boost: Option<u32>,     // if user mentions a specific page
}

// ===== Commands =====

// Save a batch of extracted page text (called from frontend during indexing)
fn index_textbook_pages(
    textbook_id: String,
    title: Option<String>,
    total_pages: u32,
    pages: Vec<PageContent>,     // may be a subset for incremental indexing
    complete: bool,               // true if this is the last batch
) -> Result<TextbookIndexMeta, String>

// Search the indexed textbook for a project
fn search_textbook(
    project_id: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String>

// Check if textbook is indexed (for frontend to decide whether to show "indexing")
fn get_textbook_index_status(
    textbook_id: String,
) -> Result<Option<TextbookIndexMeta>, String>
```

### Tauri Commands (`lib.rs`)

```rust
#[tauri::command]
fn index_textbook_pages(
    textbook_id: String,
    title: Option<String>,
    total_pages: u32,
    pages: Vec<textbook_index::PageContent>,
    complete: bool,
) -> Result<textbook_index::TextbookIndexMeta, String>

#[tauri::command]
fn get_textbook_index_status(
    textbook_id: String,
) -> Result<Option<textbook_index::TextbookIndexMeta>, String>
```

### Search Tool (`tools/textbook_search.rs`)

```rust
pub fn definition() -> ToolDefinition {
    ToolDefinition {
        tool_type: "function".into(),
        function: FunctionDef {
            name: "search_textbook".into(),
            description: "Search the current project's textbook for relevant \
                         content. Use this when the user asks about specific \
                         topics, sections, exercises, or page numbers from \
                         their textbook. Returns page numbers and text snippets.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to search for — topic, section number, exercise number, etc."
                    },
                    "max_results": {
                        "type": "number",
                        "description": "Max page results to return (default 5)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }),
        },
    }
}
```

The search tool is an **agent tool** (like `calculate`, `graph`, `vault_search`) — the LLM calls it proactively during conversation. It's only available when the project has a textbook set AND the textbook has been indexed.

### Search Algorithm (in `textbook_index.rs`)

```rust
fn search(index: &TextbookIndex, query: &SearchQuery) -> Vec<SearchResult> {
    let query_lower = query.query.to_lowercase();
    let terms: Vec<&str> = query_lower.split_whitespace().collect();

    let mut scored: Vec<(u32, f64, String)> = index.pages.iter().map(|page| {
        let text_lower = page.text.to_lowercase();
        let mut score = 0.0;

        for term in &terms {
            let count = text_lower.matches(term).count() as f64;
            score += count * 2.0;  // term frequency

            // Bonus for title/section matches at page start
            if text_lower.starts_with(term) {
                score += 10.0;
            }
        }

        // Extract a snippet around the best match
        let snippet = extract_snippet(&page.text, &terms, 200);

        (page.page, score, snippet)
    }).collect();

    // Sort by score, take top N
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.into_iter()
        .filter(|(_, score, _)| *score > 0.0)
        .take(query.max_results.unwrap_or(5))
        .map(|(page, score, snippet)| SearchResult { page, score, snippet })
        .collect()
}

fn extract_snippet(text: &str, terms: &[&str], max_len: usize) -> String {
    // Find the first occurrence of any term
    // Snip a window around it of max_len characters
    // Include line breaks for readability
}
```

### System Prompt Integration

When a project has an indexed textbook, the chat system prompt is augmented with:

```
You have access to the textbook "{title}" for this project.
Use the `search_textbook` tool when you need to find relevant
content from the textbook. This is especially useful when the
user references specific sections, exercises, or page numbers.
```

This is injected in the same place vault context and other project-scoped instructions are added.

---

## Frontend

### New Hook: `useTextbookIndexer.ts`

```typescript
// Hook that manages textbook text extraction + uploading to Rust cache
//
// Usage: called from PdfViewer when a textbook is first loaded
//
// Flow:
// 1. On mount, check if textbook has been indexed already
// 2. If not, start background extraction:
//    a. Get document from pdf.js
//    b. Iterate pages in batches of 10
//    c. For each page: page.getTextContent() → extract text items → join
//    d. Send batch to index_textbook_pages() Tauri command
//    e. On last batch, set complete: true
// 3. Track progress (pages indexed / total pages)
```

#### Interface

```typescript
interface UseTextbookIndexerOptions {
  textbookId: string;
  title?: string;
  pdfUrl: string | null;
  enabled: boolean;  // only index when Book tab is visible
}

interface UseTextbookIndexerReturn {
  status: "idle" | "checking" | "indexing" | "complete" | "error";
  progress: { indexed: number; total: number } | null;
  error: string | null;
}
```

### Modified: `PdfViewer.tsx`

The viewer already loads the pdf.js document via `usePdfRenderer`. We add the indexer hook after the document is loaded:

```typescript
const indexer = useTextbookIndexer({
  textbookId: projectId,  // or textbook hash
  title: textbookTitle,
  pdfUrl,
  enabled: !loading && pdfUrl !== null,
});

// Show indexing progress in the toolbar
if (indexer.status === "indexing") {
  // Show: "Indexing textbook for search… {progress.indexed}/{progress.total}"
}
```

### Modified: `BookPage.tsx`

The Book page needs to compute a stable `textbookId` for the index. This can be either:
- The catalog ID (if downloaded from Free Textbook Catalog)
- An MD5 hash of the textbook path (for manually-added PDFs)

---

## File-by-File Implementation Plan

### Rust Backend

| File | Action |
|---|---|
| `mathmate-v2/src-tauri/src/textbook_index.rs` | **New** — `PageContent`, `TextbookIndex`, `TextbookIndexMeta`, `SearchResult` types. `load_index()`, `save_index()`, `search_index()`, `extract_snippet()` functions. TF-IDF-like scoring. |
| `mathmate-v2/src-tauri/src/tools/textbook_search.rs` | **New** — Tool definition + execute function. `definition()` returns `ToolDefinition`. `execute()` resolves project → textbook → index → search → return results. |
| `mathmate-v2/src-tauri/src/tools/mod.rs` | Add `pub mod textbook_search;`. Add `textbook_search::definition()` to `get_tool_definitions()`. Add `textbook_search::execute()` dispatch to `execute_tool()`. Update test count. |
| `mathmate-v2/src-tauri/src/lib.rs` | Add `mod textbook_index;`. Register `index_textbook_pages`, `get_textbook_index_status` Tauri commands. |

### Frontend

| File | Action |
|---|---|
| `mathmate-v2/src/hooks/useTextbookIndexer.ts` | **New** — Text extraction via pdf.js `getTextContent()`, batched upload to Rust, progress tracking. |
| `mathmate-v2/src/components/PdfViewer.tsx` | Integrate `useTextbookIndexer` hook. Show indexing progress in toolbar. |
| `mathmate-v2/src/pages/BookPage.tsx` | Compute stable `textbookId` (catalog ID or path hash). Pass to PdfViewer. |
| `mathmate-v2/src/stores/chatStore.ts` | Inject system prompt instructions about textbook availability + `search_textbook` tool when project has indexed textbook. |

---

## System Prompt Integration Detail

Currently, system prompts are assembled in `chatStore.ts`. The textbook tool should only be added to the tool list when:
1. The project has a `textbook_path` set
2. The textbook has been indexed (`get_textbook_index_status` returns `complete`)

This requires either:
- **Eager check**: On chat session start, call `get_textbook_index_status` and cache the result
- **Lazy check**: Add the tool definition always; the tool returns a clear error if no textbook/index is available

The eager approach is cleaner. The tool list is assembled per-project when the chat initializes.

---

## Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Textbook not yet indexed | `search_textbook` returns: "This textbook hasn't been indexed for search yet. Open it in the Book tab to start indexing." |
| Indexing in progress | `search_textbook` returns: "Textbook is currently being indexed ({indexed}/{total} pages). Try again once indexing completes." |
| No textbook for project | Tool not added to tool list at all |
| Very large textbook (1000+ pages) | Index in background batches of 10 pages; show progress; allow search on partial index |
| PDF has no extractable text (scanned) | Indexing completes with 0 text pages; tool returns: "This textbook appears to be a scanned document without extractable text." |
| Textbook deleted from disk | Tool returns: "Textbook file not found at saved path." |
| Query matches nothing | Tool returns empty results; LLM handles gracefully |

---

## Search Quality

The initial search uses **simple keyword matching** with:
- Term frequency scoring (count of matches per page)
- Position bonus (matches near the start of a page = section headings)
- Case-insensitive matching
- Snippet extraction around the best match

**Future improvements** (not in scope for Phase 1):
- Stemming (e.g., `rust-stem` crate for "derivative" ≈ "differentiation")
- Stop word filtering
- Bigram/token scoring for phrase matches

---

## Build & Test Plan

```bash
# Rust
cd mathmate-v2/src-tauri && cargo check
cd mathmate-v2/src-tauri && cargo test  # New tests for indexing + search

# Frontend
cd mathmate-v2 && npm run build

# Manual test scenarios:
# 1. Open a downloaded free textbook → see "Indexing…" in toolbar → wait for completion
# 2. Open a manually-set textbook → same flow
# 3. In chat: "Find section on eigenvalues" → agent uses search_textbook tool
# 4. Close/reopen app → index loads from cache (no re-indexing)
# 5. Remove textbook file → tool returns graceful error
```

### Success Criteria

- [ ] Textbook text is extracted and cached on first open
- [ ] Index persists across app restarts
- [ ] Agent can call `search_textbook` and receive page + snippet results
- [ ] User sees relevant textbook content in AI responses
- [ ] Only one textbook indexed per project
- [ ] Graceful error when:
  - no textbook set
  - textbook not indexed yet
  - textbook file missing
  - query matches nothing
- [ ] `cargo check` passes
- [ ] `npm run build` passes
- [ ] `cargo test` passes

---

## Out of Scope (Phase 1)

- Multi-textbook search or cross-project search
- Automatic context injection (proactive pre-fetching before LLM call)
- Synonym expansion / semantic search (beyond keyword matching)
- Scanned PDF OCR
- User-facing search UI (the search is agent-mediated only)
- Search within non-PDF textbooks (EPUB, HTML)