# Synapse Phase 2 — Vault UI Redesign

> **Phase:** 13B  
> **Depends on:** Phase 13A (McpClient running)  
> **Estimated effort:** 1–2 days  
> **Files touched:** `src/pages/VaultPage.tsx`, `src/stores/vaultStore.ts`

---

## Goal

Replace VaultPage's current `scan_vault` / `read_note` approach with Synapse API calls, and add the UI capabilities that Synapse's richer data model makes possible: real note titles, FTS search, in-app editing, and a backlinks panel.

---

## Current State vs Target

| Feature | Now | After Phase 2 |
|---|---|---|
| Note list | Filename stems only | Real titles from `note_list` |
| Search | None | FTS search bar → `note_search` |
| Preview | Raw `<pre>` or rendered markdown (read-only) | Rendered + edit mode (saves via `note_update`) |
| New note | ✗ | "New note" button → `note_create` |
| Backlinks | ✗ | Backlinks panel → `note_backlinks` |
| Vault status | Folder path only | Note count + Synapse status indicator |

---

## Store Changes: `src/stores/vaultStore.ts`

Replace `scanVault` / `readNote` with Synapse-backed calls:

```typescript
interface VaultState {
  notes: NoteEntry[];           // { path, title } from note_list
  loading: boolean;
  error: string | null;
  searchResults: SearchResult[] | null;
  selectedNote: NoteDetail | null;  // { path, title, body }
  backlinks: BacklinkInfo | null;

  loadNotes: () => Promise<void>;          // note_list
  searchNotes: (q: string) => Promise<void>; // note_search
  readNote: (path: string) => Promise<void>; // note_read
  saveNote: (path: string, content: string, title?: string) => Promise<void>; // note_update
  createNote: (title: string, content: string) => Promise<void>; // note_create
  loadBacklinks: (path: string) => Promise<void>; // note_backlinks
}
```

All calls go through `invoke("synapse_call", { tool, args })` — a new thin Tauri command that proxies to `McpClient::call`.

---

## VaultPage Layout

```
┌─────────────────────────────────────────────────────────┐
│  Vault  [🔄]                      ← toolbar             │
├─────────────────────────────────────────────────────────┤
│  🔍 Search notes…                 ← FTS search bar      │
├──────────────────┬──────────────────────────────────────┤
│ Note list        │  Note title                [Edit][⬡] │
│                  │  /relative/path.md                   │
│  Folder          │  ─────────────────────────────────── │
│  ├ Note A        │  Rendered markdown content           │
│  ├ Note B ●      │  (or edit textarea when in edit mode)│
│  └ Note C        │                                      │
│                  │  ─────────────────────────────────── │
│  Folder          │  Backlinks (3)          ▼            │
│  └ Note D        │  ← Home.md                           │
│                  │  ← PROGRESS.md                       │
│  [+ New note]    │  Forward links: Section_1.1.md ✓     │
│                  │  Broken: Missing_Note ✗              │
└──────────────────┴──────────────────────────────────────┘
```

---

## Component Breakdown

### Search bar

```tsx
<input
  placeholder="Search notes…"
  onChange={(e) => debouncedSearch(e.target.value)}
/>
```

- Debounced 300ms (reuse existing `useDebounce` hook)
- When non-empty: shows `searchResults` in the note list (with snippet below each title)
- When empty: shows full `notes` list

### Note list

- Grouped by folder (split on `/` in path)
- Selected note has blue left border
- Clicking calls `readNote(path)` + `loadBacklinks(path)`
- `[+ New note]` button at bottom: opens a small inline form asking for a title, then calls `createNote`

### Preview / Edit panel

Two modes toggled by the `[Edit]` button:

**Preview mode** (default):
- `dangerouslySetInnerHTML` with `renderMarkdown` + `sanitize` (same pipeline as chat)
- "Open in editor" button still present

**Edit mode**:
- `<textarea>` pre-filled with raw note body
- Save button → `saveNote(path, content)` → `note_update`
- Cancel button → revert to preview
- Unsaved changes indicator in the title bar

### Backlinks panel

Collapsible section below the preview:

```
Backlinks (N)   ▼
← Home.md
← PROGRESS.md

Forward links
→ Section_1.1.md  ✓
→ Missing_Note    ✗ (broken)
```

Each entry is clickable: clicking a backlink calls `readNote` on that path (selecting it in the left panel too).

---

## New Tauri Command: `synapse_call`

A thin proxy command added alongside the Phase 1 commands:

```rust
#[tauri::command]
fn synapse_call(
    state: State<AppState>,
    tool: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut guard = state.mcp_client.lock().map_err(|e| e.to_string())?;
    let client = guard.as_mut().ok_or("Synapse MCP not running")?;
    client.call(&tool, args)
}
```

This allows the frontend to call Synapse tools directly (for UI-driven operations) independently of the agent tool loop.

---

## Vault Page Toolbar

Add a small Synapse status indicator to the vault toolbar:

```
Vault  [🔄]  ● Synapse active (12 notes)
             ○ Synapse not running — [Start]
```

- Green dot + "Synapse active (N notes)": MCP client running, note count from `vault_info`
- Grey dot + "Synapse not running": MCP client down; clicking [Start] invokes `start_synapse_mcp`
- This also serves as a first-run affordance

---

## `init_vault` flow (preserved)

When a project has a vault path set but the vault is empty or uninitialized, the Vault page still shows the existing "Initialize vault" CTA from `ProjectSettingsPanel`. After init, `loadNotes` is called automatically (vault now has files). This works independently of Synapse — `init_vault` writes the scaffold directly via Rust `fs`, then Synapse picks it up on the next `note_list`.

---

## Error States

- **Synapse not running**: Show the "Synapse not running" banner; note list falls back to the old `scan_vault` path (if vault path set) so the page is never completely empty
- **note_update fails**: Show an inline error below the save button; keep the editor open
- **note_create fails**: Show toast; keep the new note form open

---

## Testing Checklist

- [ ] Note list shows real titles (not just filenames)
- [ ] Search returns FTS results with snippets
- [ ] Edit mode saves via `note_update`; content survives a reload
- [ ] New note appears in the list after `note_create`
- [ ] Backlinks panel shows correct entries; clicking navigates
- [ ] "Synapse not running" fallback works when binary is missing
