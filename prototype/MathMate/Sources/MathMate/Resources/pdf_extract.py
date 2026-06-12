#!/usr/bin/env python3
"""
PDF textbook extraction script for MathMate.
Called via: uv run python pdf_extract.py <mode> <pdf_path> [options]

Modes:
  full     — Extract TOC, metadata, and per-chapter text summaries
  toc      — Extract table of contents only
  pages    — Extract text from a page range (--start, --end)
  formulas — Extract LaTeX-style formulas and math expressions

Output: JSON to stdout
"""

import json
import sys
import os
import re
import argparse


def ensure_pymupdf():
    """Ensure PyMuPDF is available, installing via uv if needed."""
    try:
        import fitz
        return fitz
    except ImportError:
        print(json.dumps({"error": "PyMuPDF (fitz) not installed. Run: uv pip install pymupdf"}))
        sys.exit(1)


def extract_metadata(fitz_mod, doc):
    """Extract PDF metadata."""
    meta = doc.metadata or {}
    return {
        "title": meta.get("title", ""),
        "author": meta.get("author", ""),
        "subject": meta.get("subject", ""),
        "creator": meta.get("creator", ""),
        "page_count": doc.page_count,
    }


def extract_toc(fitz_mod, doc):
    """Extract table of contents as a structured list."""
    raw_toc = doc.get_toc(simple=False)
    if not raw_toc:
        return []

    entries = []
    for item in raw_toc:
        # fitz TOC format: [level, title, page, ...]
        level = item[0] if len(item) > 0 else 1
        title = item[1] if len(item) > 1 else ""
        page = item[2] if len(item) > 2 else 0
        if title.strip():
            entries.append({
                "level": level,
                "title": title.strip(),
                "page": page,
            })
    return entries


def extract_page_text(fitz_mod, doc, start_page=0, end_page=None):
    """Extract text from a page range (0-indexed)."""
    if end_page is None:
        end_page = doc.page_count
    end_page = min(end_page, doc.page_count)

    pages = []
    for i in range(start_page, end_page):
        page = doc.load_page(i)
        text = page.get_text("text")
        if text.strip():
            pages.append({
                "page_number": i + 1,  # 1-indexed for humans
                "text": text.strip(),
            })
    return pages


def extract_formulas_from_text(text):
    """
    Heuristic extraction of math expressions from text.
    Looks for:
    - LaTeX-style: \(...\), \[...\], $...$
    - Common patterns: fractions, integrals, sums, etc.
    - Standalone math lines (lines heavy with math symbols)
    """
    formulas = []

    # Inline/display LaTeX delimiters
    for match in re.finditer(r'\\\((.+?)\\\)', text):
        formulas.append(match.group(1).strip())
    for match in re.finditer(r'\\\[(.+?)\\\]', text, re.DOTALL):
        formulas.append(match.group(1).strip())
    for match in re.finditer(r'\$(.+?)\$', text):
        formulas.append(match.group(1).strip())

    # Common math patterns: \command{...}
    for match in re.finditer(r'\\[a-zA-Z]+\{[^}]+\}', text):
        formulas.append(match.group(0))

    # Standalone equation lines (heuristic: lines with many math symbols)
    math_symbols = set('=+-*/^_∑∫∂√∞±×÷≤≥≠≈∈∉⊂⊃∪∩αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ')
    for line in text.split('\n'):
        stripped = line.strip()
        if len(stripped) < 5 or len(stripped) > 200:
            continue
        symbol_count = sum(1 for c in stripped if c in math_symbols)
        if symbol_count >= 3 and '=' in stripped:
            formulas.append(stripped)

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for f in formulas:
        key = f[:100]  # truncate for dedup key
        if key not in seen:
            seen.add(key)
            unique.append(f)
    return unique[:200]  # cap at 200 formulas


def build_chapter_summaries(fitz_mod, doc, toc):
    """Build text summaries for each top-level TOC entry."""
    if not toc:
        return []

    summaries = []
    top_level = [e for e in toc if e["level"] == 1]
    if not top_level:
        top_level = toc  # fallback: use all entries

    for idx, entry in enumerate(top_level):
        start_page = entry["page"] - 1  # fitz is 0-indexed
        if start_page < 0:
            start_page = 0

        # Determine end page (next chapter or end of doc)
        if idx + 1 < len(top_level):
            end_page = top_level[idx + 1]["page"] - 1
        else:
            end_page = doc.page_count

        # Cap at 10 pages per chapter to avoid huge outputs
        end_page = min(end_page, start_page + 10)

        pages = extract_page_text(fitz_mod, doc, start_page, end_page)
        combined_text = "\n".join(p["text"] for p in pages)

        summaries.append({
            "title": entry["title"],
            "level": entry["level"],
            "start_page": entry["page"],
            "end_page": min(start_page + 10, doc.page_count),
            "text_preview": combined_text[:2000],  # first 2000 chars
            "formulas": extract_formulas_from_text(combined_text)[:20],
            "page_count": len(pages),
        })

    return summaries


def main():
    parser = argparse.ArgumentParser(description="Extract content from a PDF textbook")
    parser.add_argument("mode", choices=["full", "toc", "pages", "formulas"],
                        help="Extraction mode")
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument("--start", type=int, default=1, help="Start page (1-indexed, for pages mode)")
    parser.add_argument("--end", type=int, default=None, help="End page (1-indexed, for pages mode)")
    parser.add_argument("--output-dir", type=str, default=None,
                        help="Directory to write index files (default: same dir as PDF)")
    args = parser.parse_args()

    fitz_mod = ensure_pymupdf()

    if not os.path.isfile(args.pdf_path):
        print(json.dumps({"error": f"File not found: {args.pdf_path}"}))
        sys.exit(1)

    try:
        doc = fitz_mod.open(args.pdf_path)
    except Exception as e:
        print(json.dumps({"error": f"Failed to open PDF: {e}"}))
        sys.exit(1)

    result = {}

    try:
        metadata = extract_metadata(fitz_mod, doc)
        result["metadata"] = metadata

        if args.mode == "toc":
            result["toc"] = extract_toc(fitz_mod, doc)

        elif args.mode == "pages":
            start = max(0, args.start - 1)
            end = args.end if args.end else min(start + 20, doc.page_count)
            result["pages"] = extract_page_text(fitz_mod, doc, start, end)

        elif args.mode == "formulas":
            toc = extract_toc(fitz_mod, doc)
            chapters = build_chapter_summaries(fitz_mod, doc, toc)
            all_formulas = []
            for ch in chapters:
                for f in ch["formulas"]:
                    all_formulas.append({"chapter": ch["title"], "formula": f})
            result["formulas"] = all_formulas
            result["chapters"] = [{"title": c["title"], "start_page": c["start_page"]} for c in chapters]

        elif args.mode == "full":
            toc = extract_toc(fitz_mod, doc)
            result["toc"] = toc
            chapters = build_chapter_summaries(fitz_mod, doc, toc)
            result["chapters"] = chapters

            # Write index files if output-dir specified
            if args.output_dir:
                os.makedirs(args.output_dir, exist_ok=True)

                # textbook_index.md
                index_lines = [f"# {metadata.get('title', 'Textbook')} — Index\n"]
                index_lines.append(f"**Author:** {metadata.get('author', 'Unknown')}  ")
                index_lines.append(f"**Pages:** {metadata.get('page_count', '?')}\n")
                index_lines.append("## Table of Contents\n")
                for entry in toc:
                    indent = "  " * (entry["level"] - 1)
                    index_lines.append(f"{indent}- {entry['title']} (p. {entry['page']})")
                index_lines.append("\n## Chapters\n")
                for ch in chapters:
                    index_lines.append(f"### {ch['title']} (p. {ch['start_page']})")
                    preview = ch["text_preview"][:500].replace("\n", " ")
                    index_lines.append(f"> {preview}...")
                    index_lines.append("")

                with open(os.path.join(args.output_dir, "textbook_index.md"), "w") as f:
                    f.write("\n".join(index_lines))

                # textbook_formulas.md
                formula_lines = ["# Textbook Formulas\n"]
                for ch in chapters:
                    if ch["formulas"]:
                        formula_lines.append(f"## {ch['title']}\n")
                        for fm in ch["formulas"]:
                            formula_lines.append(f"```latex\n{fm}\n```\n")

                with open(os.path.join(args.output_dir, "textbook_formulas.md"), "w") as f:
                    f.write("\n".join(formula_lines))

                # textbook_metadata.json
                with open(os.path.join(args.output_dir, "textbook_metadata.json"), "w") as f:
                    json.dump({
                        "metadata": metadata,
                        "toc_entries": len(toc),
                        "chapters": [{"title": c["title"], "start_page": c["start_page"],
                                      "page_count": c["page_count"]} for c in chapters],
                    }, f, indent=2)

                result["index_files"] = {
                    "index": os.path.join(args.output_dir, "textbook_index.md"),
                    "formulas": os.path.join(args.output_dir, "textbook_formulas.md"),
                    "metadata": os.path.join(args.output_dir, "textbook_metadata.json"),
                }

    finally:
        doc.close()

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
