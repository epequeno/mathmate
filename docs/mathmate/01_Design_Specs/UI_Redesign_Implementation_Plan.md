# UI Redesign — Implementation Plan

**Designed:** 2026-05-19  
**Design reference:** `mathmate.paper` — screens: Chat Tab, Overview Tab, Empty State, Context Panel, Settings, Agent Memory, Model Selector  
**Style guide:** [`Design_Style_Guide.md`](./Design_Style_Guide.md)

---

## Overview

This plan migrates MathMate from its current single-chat layout to a full project/session hierarchy with tabbed navigation, a context panel, an overview tab, a redesigned settings window, and an agent memory manager. Implementation is broken into self-contained phases ordered by dependency.

---

## Phase 1 — Data Model Updates
**Files touched:** `Models/Project.swift`, `Persistence/SessionStore.swift`, `Configuration/ConfigurationManager.swift`, `ViewModels/SettingsStore.swift`

### 1.1 Provider enable/disable flag
Add `enabled: Bool` to `ProviderConfig` (default `true`). This flag is persisted in `models.json` and controls whether a provider's models appear in the model selector.

```swift
struct ProviderConfig: Codable {
    var name: String
    var enabled: Bool          // NEW — default true
    var apiKeyEnvVar: String
    var models: [String]
    var defaultModel: String?
    // ...existing fields
}
```

### 1.2 Session auto-naming
`SessionHeader` already has `name` and `customName`. Wire up auto-naming:
- On first assistant message completion, generate a short title (≤ 6 words) from the first user message content.
- Write it to `header.name` via `SessionStore.updateHeader(_:)`.
- `customName` remains `nil` until the user explicitly renames.
- `displayName` returns `customName ?? name` — already correct.

### 1.3 Last-opened session persistence
Add to `SettingsStore` (or a lightweight `UserDefaults` wrapper):
```swift
var lastOpenedSessionId: UUID?   // persisted in UserDefaults
var lastOpenedProjectId: UUID?
```
Read on app launch to restore continuity. Fall back to most-recent session if the stored ID no longer exists.

### 1.4 No new model changes to `MathProject`
The existing struct is sufficient. Vault path, textbook path, and `id` are already there.

---

## Phase 2 — Sidebar Redesign
**New files:** —  
**Modified:** `Views/MainView.swift` → `SidebarView`

Replace the current `Picker + NavigationLink` sidebar with a project-container + session-list tree.

### 2.1 Structure
```
SidebarView
├── SidebarHeaderView          (app name, settings icon)
├── ProjectsListView           (scrollable, flex: 1)
│   └── ProjectRowView         (per project)
│       ├── ProjectHeaderRow   (chevron, name, + button)
│       └── SessionListView    (shown when expanded)
│           └── SessionRowView (per session, selected state)
└── NewProjectButton           (bottom-pinned)
```

### 2.2 Expand/collapse state
Each project row maintains local `@State var isExpanded: Bool`. Default: expand the project containing the last-opened session; collapse all others.

### 2.3 Session row selection
`SidebarView` takes a binding: `@Binding var selectedSession: SessionHeader?`. When a session row is tapped, update this binding. The main panel observes it.

### 2.4 Inline new session
The `+` icon in each project header creates a new `SessionHeader` with `projectId` set, writes it via `SessionStore.createSession`, then selects it. The session title reads "New Session" until the first message completes and auto-naming fires.

### 2.5 New project button
Tapping "New Project" presents the project creation sheet (a streamlined version of the existing `ProjectConfigurationSheet`, now only creation — editing moves to Settings).

### 2.6 Empty sidebar state
When `projectVM.projects.isEmpty`, the scrollable area shows:
```
[icon]
No projects yet.
Create one to get started.
```
The "New Project" button remains visible and actionable.

---

## Phase 3 — Main Panel Shell + Tab Bar
**Modified:** `Views/MainView.swift` → `ContentView`, `ChatView`

### 3.1 ContentView
Replace the current `NavigationSplitView` detail with a new `MainPanelView` that accepts the selected session:

```swift
struct ContentView: View {
    @State private var projectVM = ProjectViewModel()
    @State private var selectedSession: SessionHeader? = nil

    var body: some View {
        NavigationSplitView {
            SidebarView(projectVM: projectVM, selectedSession: $selectedSession)
        } detail: {
            if let session = selectedSession {
                MainPanelView(session: session, projectVM: projectVM)
            } else {
                EmptyStateView(onCreateProject: { /* show sheet */ })
            }
        }
    }
}
```

### 3.2 MainPanelView
Owns the tab bar and routes between Chat, Vault, and Overview tabs.

```swift
struct MainPanelView: View {
    let session: SessionHeader
    let projectVM: ProjectViewModel
    @State private var activeTab: MainTab = .chat
    @State private var chatVM = ChatViewModel()

    var body: some View {
        VStack(spacing: 0) {
            MainToolbarView(session: session, projectVM: projectVM,
                            activeTab: $activeTab, chatVM: chatVM)
            TabBarView(activeTab: $activeTab)
            Divider()
            switch activeTab {
            case .chat:    ChatPanelView(viewModel: chatVM)
            case .vault:   VaultView(activeProject: activeProject)
            case .overview: OverviewView(project: activeProject, projectVM: projectVM)
            }
        }
    }
}

enum MainTab { case chat, vault, overview }
```

### 3.3 Toolbar
`MainToolbarView` replaces `chatToolbar` in the current `ChatView`. Shows:
- Breadcrumb: `ProjectName / SessionName` (11px muted) above session title (18px bold)  
- Model selector pill (→ Phase 6)
- Icon row: wrap-up, clear, context-panel toggle, settings

When `activeTab == .overview`, the breadcrumb shows only the project name and the title shows the project name (no session breadcrumb).

### 3.4 TabBarView
Simple underline tab row. Active tab: 2px prussian blue `#2B4B8C` underline, bold label + coloured icon. Inactive: no underline, muted label.

---

## Phase 4 — Empty State
**New file:** `Views/EmptyStateView.swift`

Shown in the detail pane when no session is selected (no projects, or projects exist but none selected).

Two sub-states:
- **No projects:** show full welcome screen (logo, headline, description, big CTA "Create your first project", three how-it-works steps).
- **Projects exist, no session selected:** show a smaller prompt — "Select a session or start a new one."

The big CTA calls the same project-creation action as the sidebar button.

---

## Phase 5 — Context Panel
**Modified:** `Views/ContextDrawerView.swift` → replace entirely  
**New file:** `Views/ContextPanelView.swift`

The existing `ContextDrawerView` is replaced with a richer panel that sits as a fixed-width column (272px) inside the chat content row, toggled by the context icon in the toolbar.

### 5.1 Sections (top to bottom)
| Section | Data source |
|---|---|
| Context Window | `chatVM.totalTokens` / `chatVM.contextLimit` |
| Token Breakdown | `promptTokens`, `completionTokens`, `reasoningTokens` per message summed |
| Session Cost | `chatVM.estimatedCost`, pricing from `ModelPricing` |
| Tool Calls | Aggregated `toolEvents` across all messages |
| Attachments | `pendingImages` + images already sent in messages |
| Per Message | Per-message token rows |

### 5.2 Reasoning tokens
`TokenUsage` currently has `promptTokens` and `completionTokens`. Add `reasoningTokens: Int?` to capture thinking token counts from providers that report them (Kimi K2, Claude). Surface in the token breakdown row with a warm amber `#B8956A` indicator.

### 5.3 Fill bar
```swift
// Context window fill bar
let fillFraction = Double(totalTokens) / Double(contextLimit)
// Render as a GeometryReader-driven overlay, not absolute positioning
```

---

## Phase 6 — Model Selector Popover
**Modified:** `Views/MainView.swift` (toolbar model pill)  
**New file:** `Views/ModelSelectorView.swift`

### 6.1 Trigger
The model pill in the toolbar becomes a `Button` that presents `ModelSelectorView` as a popover anchored to the pill.

### 6.2 ModelSelectorView structure
```
ModelSelectorView (popover, 360px wide)
├── SearchField              (focused on appear)
├── ScrollView
│   └── ForEach enabledProviders
│       ├── ProviderGroupHeader    (dot, name, "via X" if routed, "no key" if unconfigured)
│       └── ForEach filteredModels
│           └── ModelRow          (name, provider chip, ctx size, pricing)
```

### 6.3 Filtering logic
```swift
var filteredModels: [(provider: String, model: String)] {
    let enabled = availableModels.filter { entry in
        providers.first { $0.name == entry.provider }?.enabled == true
    }
    guard !query.isEmpty else { return enabled }
    return enabled.filter {
        $0.model.localizedCaseInsensitiveContains(query) ||
        $0.provider.localizedCaseInsensitiveContains(query)
    }
}
```

### 6.4 Grouping
Group by provider name. Within each group, sort alphabetically. Show disabled-provider models dimmed with "no key set" if the provider is enabled but unconfigured; omit entirely if the provider is toggled off.

### 6.5 Pricing data
`ModelPricing.lookup(model:)` already exists. Add `contextWindow: Int` to the pricing struct and surface it in each model row.

---

## Phase 7 — Settings Window Redesign
**Modified:** `Views/SettingsView.swift` — full rewrite  
**New files:** `Views/Settings/SettingsModelsView.swift`, `Views/Settings/SettingsGeneralView.swift`, `Views/Settings/SettingsChatView.swift`, `Views/Settings/SettingsAboutView.swift`

### 7.1 Window structure
Use macOS `Settings` scene (SwiftUI `SettingsLink` / `@Environment(\.openSettings)`):

```swift
Settings {
    SettingsWindowView()
}
```

`SettingsWindowView` is an `HSplitView` (or manual HStack): 200px sidebar + content pane. Active section stored as `@State var section: SettingsSection`.

### 7.2 Sections
| Section | Content |
|---|---|
| General | Appearance (system/light/dark), default session name prefix |
| Models | Provider list with enable toggle + API key field + default model picker |
| Chat | System prompt textarea, max tokens, mutation policies per tool |
| Memory | Link to memory manager (opens `MemoryManagerView` as sheet or window) |
| About | App version, links |

### 7.3 Provider toggle
```swift
// In SettingsModelsView
Toggle(isOn: $provider.enabled) { }
    .toggleStyle(.switch)
    .onChange(of: provider.enabled) { _, _ in
        settingsStore.saveProviders()
    }
```
When toggled off: dim the API key field and default model picker. Do not clear the key.

### 7.4 API key display
Keys are read from environment variables — display them masked (last 4 chars visible). Show the env var name as a code hint below. Fields are read-only in the UI; copy-to-clipboard button optional.

---

## Phase 8 — Overview Tab
**New file:** `Views/OverviewView.swift`  
**New file:** `ViewModels/OverviewViewModel.swift`

### 8.1 Data
`OverviewViewModel` is initialized with a `MathProject` and computes:
- Session count: `sessionStore.allHeaders(forProjectId: project.id).count`
- Total messages: sum of `sessionStore.countMessages(for:)` across all project sessions
- Vault note count: `VaultViewModel.notes.count` scoped to project vault
- Last active: `allHeaders(...).first?.lastActivity`
- Key topics: stored in `memory_items` (kind = `mastery`, topic field) — query MemoryStore
- AI summary: generated on demand (see 8.2)
- Recent sessions: most recent 5 from `allHeaders`

### 8.2 AI Summary (on-demand)
Button "Generate Summary" → calls a lightweight chat completion (not a full session) with a prompt summarising the project's recent session content. Store the result + timestamp in `UserDefaults` keyed by `project.id`. Show "generated Xh ago" freshness indicator.

```swift
func generateSummary() async {
    let context = buildSummaryContext()   // recent session snippets
    let summary = await llm.complete(summaryPrompt(context))
    cachedSummary = (text: summary, generatedAt: Date())
    UserDefaults.standard.set(/* encode */ , forKey: "summary_\(project.id)")
}
```

### 8.3 Recent sessions list
Each row: session title, relative timestamp, message count. Tapping a row sets `selectedSession` in the parent and switches `activeTab` to `.chat`.

---

## Phase 9 — Agent Memory UI
**New files:** `Views/MemoryManagerView.swift`, `ViewModels/MemoryViewModel.swift`  
**Existing:** `Implementation_AgentMemory.md` for the SQLite schema and `MemoryStore`

### 9.1 MemoryViewModel
```swift
@Observable final class MemoryViewModel {
    var groups: [MemoryGroup] = []   // grouped by category
    var searchQuery: String = ""
    private let store: MemoryStore

    func load() { groups = store.fetchGrouped() }
    func delete(_ item: MemoryItem) { store.delete(item); load() }
    func update(_ item: MemoryItem) { store.upsert(item); load() }
    func add(content: String, kind: MemoryKind) { store.insert(...); load() }
}
```

### 9.2 Memory categories (UI groups)
Map `memory_items.kind` to display groups:
| DB `kind` | Display group |
|---|---|
| `preference` | Preferences |
| `mastery`, `misconception`, `goal` | Learning Profile |
| `context` | User Notes |

`learner_profile` rows surface in Learning Profile as well.

### 9.3 Entry card
Each entry shows:
- Full content text (13px, line-height 20px)
- Source badge: `auto` (grey pill) for `inferred`/`imported`; `manual` (blue pill) for `user_explicit`
- Provenance: project name + date from `source_ref`
- Edit pencil → inline text edit
- Delete → confirmation then `store.delete`

Manual entries (`user_explicit`) get a blue border `#C5D3EF` on the card.

### 9.4 "Add note" flow
Tapping "Add note" opens a small popover with a multiline text field and a "Save" button. Saves as `kind = context`, `source_kind = user_explicit`.

### 9.5 Search
`MemoryViewModel.filteredGroups` filters by `searchQuery` across content text and topic. Use SQLite FTS if available, otherwise Swift-side `localizedCaseInsensitiveContains`.

### 9.6 Wrap-up integration
After `WrapUpSheetView` successfully saves a session note to Obsidian, call:
```swift
await memoryVM.extractFromSession(chatVM.messages, projectId: activeProject?.id)
```
This passes the session transcript to a structured extraction prompt that returns a JSON array of `MemoryItem` candidates. The agent reviews them (confidence filter) and upserts to SQLite. No UI blocking — runs silently in background, items appear next time Memory is opened.

### 9.7 Access points
- Settings > Memory section → "Open Memory Manager" button → sheet
- Future: a memory icon in the sidebar footer (post-MVP)

---

## Phase 10 — Session Auto-naming
**Modified:** `ViewModels/ChatViewModel.swift`

After the first assistant message stream completes and `isStreaming` becomes false:
```swift
private func autoNameSessionIfNeeded() async {
    guard let session = currentSession,
          session.customName == nil,
          session.name == "New Session",
          let firstUserMsg = messages.first(where: { $0.isUser }) else { return }

    let title = await generateTitle(from: firstUserMsg.content)
    var updated = session
    updated.name = title
    currentSession = updated
    try? sessionStore.updateHeader(updated)
}

private func generateTitle(from text: String) async -> String {
    // Lightweight completion: "Summarise this in 5 words or fewer: {text}"
    // Fallback: first 40 chars of user message, truncated
}
```

---

## Phased Delivery Order

| Phase | Description | Effort |
|---|---|---|
| 1 | Data model updates (provider flag, session naming, last-opened) | S |
| 2 | Sidebar redesign (project containers + session list) | M |
| 3 | Main panel shell + tab bar | M |
| 4 | Empty state | S |
| 10 | Session auto-naming | S |
| 5 | Context panel rewrite | M |
| 6 | Model selector popover | M |
| 7 | Settings window redesign | L |
| 8 | Overview tab | M |
| 9 | Agent memory UI | L |

Start with phases 1–4+10 as a single PR to establish the new navigation structure without breaking existing functionality. Phases 5–6 are independent and can follow in parallel. Phases 7–9 are larger and should each be their own branch.

---

## Files Created / Modified Summary

### New files
```
Views/EmptyStateView.swift
Views/ContextPanelView.swift
Views/ModelSelectorView.swift
Views/OverviewView.swift
Views/MemoryManagerView.swift
Views/Settings/SettingsWindowView.swift
Views/Settings/SettingsModelsView.swift
Views/Settings/SettingsGeneralView.swift
Views/Settings/SettingsChatView.swift
Views/Settings/SettingsAboutView.swift
ViewModels/OverviewViewModel.swift
ViewModels/MemoryViewModel.swift
```

### Modified files
```
Views/MainView.swift          — SidebarView, ContentView, ChatView, MainPanelView (new), TabBarView (new)
Views/ContextDrawerView.swift — replaced by ContextPanelView
Views/SettingsView.swift      — replaced by SettingsWindowView
Views/WrapUpSheetView.swift   — add memory extraction call post-save
ViewModels/ChatViewModel.swift — auto-naming, reasoningTokens, context panel data
Models/Project.swift           — no changes
Persistence/SessionStore.swift — no changes needed
Configuration/ConfigurationManager.swift — persist provider enabled flag
ViewModels/SettingsStore.swift — lastOpenedSessionId, lastOpenedProjectId
Models/ModelPricing.swift      — add contextWindow: Int
```

---

*Created: 2026-05-19*
