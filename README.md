# MathMate

A native macOS math tutoring application with superior LaTeX rendering, model provider flexibility, and Obsidian vault integration.

## Overview

MathMate is a SwiftUI-based macOS application designed to be your math study companion. It combines:
- **AI Tutoring**: Chat-based math assistance with model provider selection (similar to pi's flexibility)
- **LaTeX Rendering**: Native KaTeX (default) and MathJax support with automatic normalization of model-specific formatting
- **Obsidian Integration**: Lightweight vault linking and management for your math notes
- **Study Tracking**: Session logs stored directly in your Obsidian vault as markdown files

## Project Structure

```
mathmate/
├── docs/               # Design docs, specifications, planning
├── config/              # Configuration templates and examples
├── scripts/             # Setup and utility scripts
├── prototype/           # SwiftUI prototype code
└── README.md            # This file
```

## Architecture Decisions

### Technology Stack
- **UI**: SwiftUI (single-window macOS app)
- **LaTeX Rendering**: WKWebView with KaTeX (default) / MathJax (toggle)
- **Storage**: Markdown files in Obsidian vault (no SwiftData/CoreData)
- **Config**: `~/.mathmate/` directory for app settings and model configs

### Key Design Principles
1. **Vault-Native Storage**: All study logs and tracking data live in your Obsidian vault as markdown
2. **LaTeX Normalization**: Custom layer to handle different model formatting strategies
3. **Lightweight Obsidian Integration**: Link to notes, don't reimplement Obsidian
4. **Model Flexibility**: Inspired by pi's provider architecture, but independent config

## Getting Started

Prototype development in progress. See `docs/` for design specifications.

## License

TBD
