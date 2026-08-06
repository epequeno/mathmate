# Synapse Phase 3 — Context Panel & Chat Integration

> **Phase:** 13C  
> **Depends on:** Phase 13A (McpClient), Phase 13B (VaultPage)  
> **Estimated effort:** 1 day  
> **Files touched:** `src/components/ContextPanel.tsx`, `src/components/ChatMessage.tsx`, `src/pages/ChatPage.tsx`

---

## Goal

Surface the vault inside the chat flow in three ways:

1. **Related Notes** — a live section in the context panel that shows vault notes relevant to the current conversation topic
2. **Note citation chips** — small chips that appear after the agent writes or reads a vault note, linking directly to that note in the Vault page
3. **Quick Save** — a button on assistant messages that saves the message content as a new vault note

---

## 1. Related Notes — Context Panel

### Where

A new section in `ContextPanel.tsx`, slotted between "Token Breakdown" and "Tool Calls":

```
┌─────────────────────────────────────────┐
│  Context Window        ████░░░ 2%        │
│  Token Breakdown       ...               │
├─────────────────────────────────────────┤
│  📖 Related Notes                       │  ← NEW
│  PROGRESS.md                            │
│  Ch04/4.3 - Logarithmic Functions.md    │
│  MathMate/Study Logs/2026-06-02.md      │
├─────────────────────────────────────────┤
│  Tool Calls            ...               │
│  Memory Engine         ...               │
└─────────────────────────────────────────┘
```

### How it works

1. When a session is active and the Synapse client is running, extract a search query from the last 3 user messages (combined, truncated to 200 chars)
2. Call `invoke("synapse_call", { tool: "note_search", args: { query, limit: 5 } })` in a `useEffect` debounced to 1500ms (so it doesn't fire mid-sentence)
3. Show up to 5 result titles as clickable links
4. Clicking a note navigates to `/vault` and sets `vaultStore.selectedNotePath`

### State

Add to `ContextPanel` local state:

```typescript
const [relatedNotes, setRelatedNotes] = useState<{ path: string; title: string }[]>([]);
const [relatedLoading, setRelatedLoading] = useState(false);
```

The query is derived from `currentSession` messages — no new store state needed.

### Hiding

If Synapse is not running (`synapseRunning === false` from projectStore) or the vault has no notes, the section is hidden entirely (don't show an empty or error state here; keep the panel clean).

---

## 2. Note Citation Chips

### Where

Directly below the assistant message bubble when the agent has called `note_create`, `note_update`, or `note_read` in that turn.

```
  MathMate
  Your progress has been updated in PROGRESS.md. ...

  📝 PROGRESS.md updated  →
```

### How it works

`ChatMessage.tsx` already renders segments. When rendering an assistant message, scan its `tool_result` segments for Synapse write operations:

```typescript
const vaultWriteResults = effectiveSegments
  .filter(s => s.type === "tool_result")
  .map(s => {
    try {
      const r = typeof s.result === "string" ? JSON.parse(s.result) : s.result;
      if (r?.path && (r?.bytes_written !== undefined || r?.updated)) return r;
    } catch {}
    return null;
  })
  .filter(Boolean);
```

For each result, render a chip below the content segments:

```tsx
{vaultWriteResults.map((r, i) => (
  <button key={i} onClick={() => navigateToNote(r.path)} style={chipStyle}>
    <FileText size={11} />
    {r.relative_path ?? basename(r.path)}
    {r.bytes_written ? " updated" : " created"}
    <ChevronRight size={10} />
  </button>
))}
```

`navigateToNote(path)` calls `navigate("/vault")` and sets the selected path in vaultStore.

### Design

```css
chipStyle = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "3px 8px", borderRadius: 4, marginTop: 6, marginRight: 4,
  fontSize: 11, border: "1px solid var(--color-border)",
  background: "var(--color-surface)", color: "var(--color-text-secondary)",
  cursor: "pointer"
}
```

Hovering highlights the chip with `var(--color-accent-subtle)`.

---

## 3. Quick Save Button

### Where

A small "Save to vault" button visible on hover over any assistant message with text content.

```
  MathMate
  The chain rule states that d/dx[f(g(x))] = f'(g(x))·g'(x)...

                               [💾 Save to vault]
```

### How it works

On click, open a small popover with:
- Pre-filled title: `<session title> — <date>`
- Path suggestion: `MathMate/Study Logs/<date>-<slug>.md`
- "Save" button → `invoke("synapse_call", { tool: "note_create", args: { title, content: messageText } })`
- Confirmation toast + citation chip appears

This uses the existing `note_create` tool — no new Tauri commands needed.

### State

Add to `ChatMessage` local state:

```typescript
const [showSavePopover, setShowSavePopover] = useState(false);
const [saveTitle, setSaveTitle] = useState("");
const [savePath, setSavePath] = useState("");
const [saving, setSaving] = useState(false);
```

The button is only shown when `isAssistant && hasTextContent && synapseRunning`. It is hidden during streaming.

---

## Navigation Helper

Add a `navigateToNote` helper to vaultStore:

```typescript
navigateToNote: (path: string) => {
  set({ pendingSelectPath: path });
}
```

`VaultPage` watches `pendingSelectPath`. When non-null, it calls `readNote(path)` and scrolls the note into view, then clears `pendingSelectPath`.

`ChatPage` and `ContextPanel` both use `useNavigate` from react-router and call:

```typescript
const navigate = useNavigate();
const goToNote = (path: string) => {
  useVaultStore.getState().navigateToNote(path);
  navigate("/vault");
};
```

---

## Testing Checklist

- [ ] Related Notes section appears in context panel when Synapse is running and session has messages
- [ ] Section is hidden when Synapse is not running or vault is empty
- [ ] Clicking a related note navigates to /vault and selects the note
- [ ] Citation chip appears after agent calls `note_create` or `note_update`
- [ ] Clicking chip navigates to the written note
- [ ] Quick Save button creates a note and shows confirmation chip
- [ ] Related Notes query debounces correctly — no spam calls mid-typing
