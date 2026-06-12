# PDF Textbook Processing Implementation Plan

## Overview

MathMate will support processing PDF textbooks to extract content that can be used as context for tutoring. Users will be able to associate a PDF with their project, then call a `process_pdf` tool that:
1. Extracts metadata (title, author, page count) 
2. Parses table of contents
3. Builds chapter summaries
4. Identifies key mathematical formulas
5. Caches the structured index under `.mathmate/` in the project vault

The tool leverages `uv` to manage a Python environment with `pymupdf` for OCR-free text extraction.

## User Workflow

1. Create or edit a project and configure a PDF textbook path
2. In chat, ask the agent to "Summarize chapter 3 of my textbook" or "Explain the quadratic formula from my chapter 2"
3. Agent calls `process_pdf` to index the textbook (if not already indexed)
4. Agent reads the index files (`.mathmate/textbook_index.md`, etc.) using existing tools
5. Agent combines textbook content with chat history and responds

## Technical Components

### 1. Tool Definition (`ToolCatalog.swift`)
Adds a new tool `process_pdf` with parameters:
- `file_path`: Relative path to PDF in vault
- `mode`: `"full"` (index), `"toc"` (TOC only), `"pages"` (page subset), `"formulas"` (expressions)
- `page_start`, `page_end`: Page range for pages mode

### 2. Tool Implementation (`ToolExecutor.swift`)
Adds `runProcessPdf()` method that:
- Validates PDF file exists and is `.pdf`
- Bundles `pdf_extract.py` into the app 
- Checks for Python virtual environment in `.mathmate/.venv`
- Installs `pymupdf` via `uv pip install`
- Runs `pdf_extract.py` with appropriate arguments
- Captures output JSON and parses results
- Returns a human-readable summary plus the raw JSON

### 3. Index Caching
When processing in `full` mode, writes these files to `.mathmate/`:
- `textbook_index.md` — formatted TOC + chapter summaries
- `textbook_formulas.md` — LaTeX formulas grouped by chapter
- `textbook_metadata.json` — structured metadata
- These are readable via existing tools

### 4. Project Model Extension (`Project.swift`)
Extends `MathProject` with:
- `hasTextbookIndex` property — detects cached index files
- `textbookIndexMetadata` property — decodes JSON metadata
- `mathmateDirectoryURL` — helper for `.mathmate/` dir

### 5. UI Touchpoints
- **Project View/Settings**: TextBox or file picker for PDF path 
- **Context Panel**: Display textbook metadata when loaded
- **Overview Tab**: Show index stats (pages, chapters, formulas)
- **Chat Input**: Optional auto-trigger on first PDF interaction

### 6. Security & Isolation
- Virtual environments isolated per-project in `.mathmate/.venv`
- Python dependencies managed via `uv` (not global Python)
- File permissions enforced via tool safety checks
- Environment variables not exposed

## Benefits
- Enables "deep textbook-grounded tutoring" workflows
- Reusable for future RAG enhancements
- Modular design allows easy extension of extraction methods
- No global system dependencies — Python handled in app bundle
- Fast subsequent processing via cached index

## Future Work
- Integration with `search_files` for contextual note retrieval from textbook index
- Per-chapter caching with page-based access
- PDF annotation support (highlighting, bookmarks)
- Conversion to Markdown with rich formatting