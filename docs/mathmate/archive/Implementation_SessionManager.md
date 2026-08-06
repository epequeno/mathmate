# Implementation Plan: Session Manager

**Phase:** 11  
**Status:** ✅ Completed (Phases 1–2)  
**Design reference:** `mathmate.paper` → "mockups" page → "MathMate — Session Manager (Dark)"  
**Depends on:** Session JSONL backend (✅ complete), Project store (✅ complete), React Router (✅ in use)

---

## 1. Overview

The Session Manager is a dedicated full-panel view for browsing, searching, and bulk-managing all sessions across all projects. It replaces the need to dig through the sidebar to find or act on sessions — particularly useful once a user has accumulated many sessions across multiple projects.

**Entry point:** Bottom of the sidebar, below Settings, via a "Session Manager" nav button.  
**Route:** `/sessions`  
**Layout:** Sidebar (unchanged) + main panel splits into a session table (flex: 1) and a detail panel (292px fixed).

---

## 2. What Gets Built

### 2.1 New files
| File | Purpose |
|---|---|
| `src/pages/SessionManagerPage.tsx` | Top-level page component, owns layout and local state |
| `src/components/SessionManager/SessionTable.tsx` | Scrollable table of sessions, grouped by project |
| `src/components/SessionManager/SessionDetailPanel.tsx` | Right-hand detail panel for selected session |
| `src/components/SessionManager/BulkActionBar.tsx` | Bottom bar shown when rows are selected |
| `src/components/SessionManager/SessionTableRow.tsx` | Single row component (default, selected, archived states) |

### 2.2 Modified files
| File | Change |
|---|---|
| `src/App.tsx` | Add `/sessions` route inside the `<Layout>` block |
| `src/components/Sidebar.tsx` | Add Session Manager nav button at the bottom |
| `src/stores/chatStore.ts` | Expose `loadArchivedSessions` + ensure `sessionList` and `archivedSessionList` are populated |

---

## 3. Data Model

No new Tauri commands are needed — all required commands already exist:

| Command | Used for |
|---|---|
| `list_sessions(project_id?)` | Load active sessions (all projects: pass `null`) |
| `list_archived_sessions(project_id?)` | Load archived sessions |
| `load_session(session_id)` | Load full session for detail panel preview |
| `rename_session(session_id, title)` | Inline rename |
| `archive_session(session_id)` | Archive action |
| `unarchive_session(session_id)` | Restore archived session |
| `delete_session(session_id)` | Delete active session |
| `purge_session(session_id)` | Permanently delete archived session |

### 3.1 Local page state (inside `SessionManagerPage`)

```ts
type SessionManagerState = {
  // Data
  sessions: SessionHeader[];          // active, all projects
  archivedSessions: SessionHeader[];  // archived, all projects
  projects: MathProject[];

  // Selection
  selectedSessionId: string | null;   // detail panel
  checkedIds: Set<string>;            // bulk action checkboxes

  // UI
  filter: "all" | "active" | "archived";
  searchQuery: string;
  loadingDetail: boolean;
  detailSession: Session | null;      // full session for preview
};
```

### 3.2 Derived: multi-model display

`SessionHeader` only stores the *last* model used (`model` field). For the "Models" column and detail panel we need to surface all models that appeared in a session. Two options:

**Option A (fast, no backend change):** On detail panel open, call `load_session` to get all messages, then derive the unique ordered model list from the message sequence. The session header's `model` field gives the last one; the full list requires reading messages.

**Option B (ideal, requires backend change):** Add a `models_used: Vec<String>` field to `SessionHeader`, populated when listing sessions by scanning unique model values across messages. More expensive on list but eliminates the extra `load_session` call.

**Decision for this phase: Option A.** The detail panel already calls `load_session` for the message preview. The models list is derived from that same load with zero extra cost. Option B can be added later as an optimisation if listing performance becomes a concern.

#### Deriving models from a loaded session

```ts
function deriveModels(session: Session): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  // Walk messages in order — capture model switches
  // The session header has the last model; messages don't individually tag their model.
  // Use the header model as the "current" model going backwards isn't reliable,
  // so instead: track header.model as last, show "X model(s) used" in table,
  // expand to full list only in the detail panel via the message scan approach below.
  return [session.header.model]; // phase 1 fallback — see §3.3
}
```

#### Phase 1 simplification for the table column

The `SessionHeader` only carries the last model. For the **table column** in phase 1:
- Show the last model with its provider dot.
- If the session has >1 model (detectable only after `load_session`), show `+N` overflow indicator.
- This means: table column is a best-effort display; detail panel shows the full list.

For the detail panel, after `load_session`, scan `session.messages` to build the ordered unique model list. Since `Message` doesn't carry a `model` field, the practical approach in phase 1 is:

> Display the model from `session.header.model` (last used) in the detail panel. Add a note "Model may have changed during conversation" when the session has >40 messages (heuristic). Option B above solves this cleanly in a follow-up.

**Phase 1 scope:** Just show `session.header.model` everywhere, styled as a stacked list ready to accept multiple entries. The multi-model mockup in the design file is the *target state* post-Option-B.

---

## 4. Component Specs

### 4.1 `SessionManagerPage`

```tsx
// Route: /sessions
// Owns: all data fetching, filter state, search state, selection state
// Renders: topbar + flex row of [SessionTable | SessionDetailPanel]
```

- On mount: call `list_sessions()` and `list_archived_sessions()` and `list_projects()`.
- Passes filtered+searched session list down to `SessionTable`.
- On row click: set `selectedSessionId`, call `load_session` for detail panel.
- On checkbox change: update `checkedIds` set.

### 4.2 `SessionTable`

- Renders column headers (fixed, 36px) + scrollable row list.
- Groups rows by project with collapsible group headers (chevron + project name + count badge).
- Groups are sorted: projects ordered by most-recently-updated session descending.
- Archived rows are shown within their project group at the bottom, at 55% opacity, italic title.
- Column widths: checkbox 32px · title flex:1 · models 130px · messages 100px · updated 120px · status 80px · actions 56px.

**Filtering logic:**
```ts
const visible = sessions
  .filter(s => filter === "all" ? true : filter === "active" ? !isArchived(s) : isArchived(s))
  .filter(s => searchQuery === "" ? true :
    s.title.toLowerCase().includes(q) ||
    s.model.toLowerCase().includes(q) ||
    projects.find(p => p.id === s.project_id)?.name.toLowerCase().includes(q)
  );
```

### 4.3 `SessionTableRow`

Props: `session`, `project`, `isSelected`, `isChecked`, `isArchived`, `onSelect`, `onCheck`, `onArchive`, `onDelete`, `onOpen`

**Selected state:** `background: var(--color-accent-selected)`, `border-left: 3px solid var(--color-accent-light)`  
**Archived state:** `opacity: 0.55`, italic title, restore icon in actions column  
**Actions column:** eye icon (open detail) + ⋯ menu (archive/delete/rename) — shown on hover

### 4.4 `SessionDetailPanel`

- Fixed 292px width, `bg-elevated` background, `border-left: 1px solid var(--color-border)`.
- Two sections separated by `1px #3C3834` dividers: header → metadata → last message preview → actions.
- "Open in Chat" button navigates to `/chat` and calls `openSession(id)`.
- Rename: inline — clicking "Rename session" replaces the title text with an input field, blurs to save.
- Archive / Delete: calls store actions, then clears `selectedSessionId` and removes from local list.

### 4.5 `BulkActionBar`

- Shown when `checkedIds.size > 0`, replaces normal bottom padding.
- Height 48px, `bg-elevated`, `border-top: 1px solid var(--color-border)`.
- Actions: Archive (all active), Delete (all active), Purge (all archived) — only shows relevant actions based on selection mix.
- "N selected" count in `accent-light` color. "X sessions total" right-aligned in `text-tertiary`.

---

## 5. Sidebar Integration

Add a "Session Manager" nav button at the bottom of the sidebar, above Settings:

```tsx
// In Sidebar.tsx — bottom section
<button
  onClick={() => navigate("/sessions")}
  style={{
    ...settingsBtnStyle,
    background: isActive ? "var(--color-accent-selected)" : "transparent",
    color: isActive ? "var(--color-accent-light)" : "var(--color-text-secondary)",
  }}
>
  <SessionManagerIcon />
  Session Manager
</button>
```

`isActive` = `location.pathname === "/sessions"` (via `useLocation`).

---

## 6. Routing

```tsx
// In App.tsx — inside the hasProjects Routes block, inside <Layout>
<Route path="/sessions" element={<SessionManagerPage />} />
```

No changes to `<Layout>` itself — the Session Manager page renders its own topbar and does not use the TabBar.

---

## 7. CSS Variables Used

All values from the dark theme design tokens — no new variables needed:

| Variable | Value | Usage |
|---|---|---|
| `--color-bg` | `#232120` | Page/table background |
| `--color-bg-elevated` | `#1C1A18` | Sidebar, topbar, detail panel, bulk bar |
| `--color-surface` | `#2C2926` | Input fields, filter pills, preview card |
| `--color-border` | `#3C3834` | All dividers and borders |
| `--color-text-primary` | `#E8E3D9` | Session titles, body text |
| `--color-text-secondary` | `#7A7167` | Timestamps, model names, muted labels |
| `--color-text-tertiary` | `#6E6860` | Column headers, placeholders, section labels |
| `--color-accent` | `#3A5CA8` | Active filter pill, "Open in Chat" button |
| `--color-accent-light` | `#5A7ED4` | Selected row border, active nav item text, bulk count |
| `--color-accent-selected` | `#2B4B8C` | Selected row bg, active nav item bg |
| `--color-success` | `#4A9E6A` | Active status badge, Claude model dot |
| `--color-red` | `#C05C5C` | Delete/purge destructive button |

---

## 8. Implementation Phases

### Phase 1 — Core view (MVP) ✅
- [x] Add `/sessions` route in `App.tsx`
- [x] Build `SessionManagerPage` with data fetching and layout shell
- [x] Build `SessionTable` with group headers and `SessionTableRow`
- [x] Build `SessionDetailPanel` with metadata display and "Open in Chat"
- [x] Wire filter pills (All / Active / Archived)
- [x] Wire search (client-side filter on title, model, project name)
- [x] Add Session Manager nav button to Sidebar
- [x] Single-model display in table column (header.model) + detail panel

### Phase 2 — Actions & selection ✅
- [x] Build `BulkActionBar`
- [x] Wire checkboxes → `checkedIds` state
- [x] Bulk archive (active sessions)
- [x] Bulk delete (active sessions, confirm dialog)
- [x] Bulk purge (archived sessions, confirm dialog)
- [x] Inline rename (detail panel title → input on click → save on blur/Enter)
- [x] Per-row ⋯ context menu (archive / rename / delete)
- [x] Restore archived session from detail panel

### Phase 3 — Multi-model display (not yet started)
- [ ] Add `models_used: Vec<String>` to `SessionHeader` in `session.rs`
- [ ] Populate `models_used` in `list_sessions_in_dir` by scanning messages for model field transitions
- [ ] Update table column to show stacked multi-model list (dot + name per model)
- [ ] Update detail panel to show full ordered model list

---

## 9. Out of Scope (This Phase)

- Session export (copy to clipboard, export as markdown) — deferred
- Session merge / split — deferred
- Drag-and-drop project reassignment — deferred
- Full-text search across message *content* (would require a search index) — deferred
- Pagination / virtual scroll (not needed until >500 sessions) — deferred

---

## 10. Acceptance Criteria

- [ ] `/sessions` route loads without errors; sidebar nav item highlights as active
- [ ] All active sessions appear, grouped by project, sorted by `updated_at` descending
- [ ] Archived sessions appear within their project group at the bottom (dimmed, italic)
- [ ] Search filters rows in real-time across title, model, and project name
- [ ] Clicking a row opens the detail panel with correct metadata
- [ ] "Open in Chat" navigates to `/chat`, opens the session, and focuses the input bar
- [ ] Archive / delete / rename actions from the detail panel are reflected immediately in the table
- [ ] Bulk action bar appears when ≥1 checkbox is checked; hides when deselected
- [ ] Bulk archive and bulk delete work correctly and update the table in-place
- [ ] `npm run build` passes with no TypeScript errors
- [ ] `cargo check` passes (no Rust changes in phase 1–2)

---

*Created: 2026-05-30*
