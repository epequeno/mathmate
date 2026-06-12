# MathMate Design Specification

## 1. Application Architecture

### 1.1 Core Components

#### LaTeX Normalization Layer
Handles different model LaTeX formatting strategies:
- **Inline math detection**: `$...$`, `\(...\)`, `\begin{math}...\end{math}`
- **Block math detection**: `$$...$$`, `\[...\]`, `\begin{equation}...\end{equation}`
- **Normalization**: Convert to KaTeX-compatible syntax (configurable)
- **Escape handling**: Fix double-escaped backslashes and common model errors

#### Chat Interface (Single Window)
Standard layout:
- **Top bar**: Model selector dropdown (configured providers/models)
- **Middle**: Scrollable message list with live LaTeX rendering
- **Bottom**: Input bar with optional real-time LaTeX preview

#### Model Provider System
Custom `~/.mathmate/models.json` format:
```json
{
  "providers": [
    {
      "name": "Anthropic",
      "apiKey": "sk-...",
      "baseURL": "https://api.anthropic.com/v1",
      "models": ["claude-3.5-sonnet", "claude-3-opus"],
      "defaultModel": "claude-3.5-sonnet"
    }
  ]
}
```

#### Obsidian Vault Integration
- Configure 1+ vault paths in settings
- Scan vaults for markdown files (optional tag filtering: `#math`, `#tutoring`)
- Searchable note list in sidebar/tab
- Open notes via `obsidian://open?vault=MyVault&file=path`
- Agent reads vault notes for context-aware tutoring

#### Study Tracking (Vault-Native)
Logs stored as markdown in vault: `MathTutor/Logs/YYYY-MM-DD.md`
```markdown
# Study Session: 2026-05-19 14:30
- **Model**: Claude 3.5 Sonnet
- **Topic**: Quadratic Equations
- **Duration**: 45 minutes
- **Problems Solved**: 3/5
- **Notes**: Struggled with completing the square
- **Linked Notes**: [[Math/Algebra/Quadratics]]
```

## 2. Technology Stack

| Component | Technology |
|-----------|------------|
| UI Framework | SwiftUI (macOS 14+) |
| LaTeX Rendering | WKWebView + KaTeX (default) / MathJax (toggle) |
| Markdown Parsing | Custom Swift parser (LaTeX-aware) |
| Configuration | JSON files in `~/.mathmate/` |
| Study Logs | Markdown files in Obsidian vault |
| Network | `URLSession` for model API calls |

## 3. User Interface Design

### 3.1 Main Window Layout
```
┌─────────────────────────────────────────────────┐
│  MathMate                    [Model: Claude ▼] │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │                                         │   │
│  │        Message List (LaTeX Render)      │   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  Input bar with LaTeX preview toggle    │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 3.2 Sidebar Tabs (Optional)
- **Chat**: Main tutoring interface
- **Vault**: Searchable Obsidian note browser
- **Logs**: Study session history

## 4. Development Phases

### Phase 1: Prototype (Current)
- [ ] SwiftUI macOS project setup
- [ ] Basic WKWebView with KaTeX loading
- [ ] LaTeX normalization layer (core logic)
- [ ] Simple chat UI with message display

### Phase 2: Core Features
- [ ] Model provider config loading
- [ ] API integration (at least one provider)
- [ ] Real-time LaTeX preview in input
- [ ] Obsidian vault path configuration

### Phase 3: Integration
- [ ] Vault scanning and note listing
- [ ] `obsidian://` URL scheme integration
- [ ] Study log writing to vault
- [ ] MathJax toggle support

### Phase 4: Polish
- [ ] Settings UI
- [ ] Model selector dropdown
- [ ] Session analytics/history view
- [ ] Performance optimization

## 5. Configuration Directory Structure

```
~/.mathmate/
├── config.json          # App settings (LaTeX engine, vault paths, etc.)
├── models.json          # Model provider configurations
└── cache/               # Temporary files, if needed
```

## 6. Open Questions

1. Should we support multiple chat sessions/threads?
2. Do we want spell-check in the input bar?
3. Should the app detect when Obsidian is running and offer special integrations?
4. How should we handle model API rate limiting and errors?

---

*Last updated: 2026-05-19*
