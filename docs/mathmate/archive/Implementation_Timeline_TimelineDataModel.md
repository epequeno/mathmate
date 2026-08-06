# Implementation Plan: Timeline Data Model

## 1) Goal

Replace the flat `thinking` + `content` assistant message shape with an ordered list of **message segments** so every assistant response preserves chronological order across:
- thinking traces,
- tool calls,
- tool results,
- user-facing content.

This is the canonical data foundation for Tool Execution and Timeline Rendering.

---

## 2) Motivation

The current message format is lossy for agent workflows. Thinking and content are split fields with no ordering, and tool activity is not represented reliably. We need a single, ordered timeline structure that survives streaming, persistence, and reload.

---

## 3) Scope

### In scope
- Add `MessageSegment` + `SegmentKind` in Rust (`session.rs`) and TS (`types.ts`).
- Add `Message.segments` to the persisted model and IPC model.
- Define one canonical JSON contract for segment payloads (no double-encoded JSON strings).
- Keep `Message.content` for user multimodal content (`ContentPart[]`) and legacy compatibility.
- Add compatibility adapters so old sessions (no `segments`) still render.
- Add parser contract for streaming tool deltas (complete + fragmented assembly support).

### Out of scope
- Tool execution business logic (separate plan).
- Final timeline UI polish (separate plan).

---

## 4) Canonical Data Model

## 4.1 Rust (`session.rs`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageSegment {
    pub id: String, // UUID
    pub ts: String, // ISO-8601
    #[serde(flatten)]
    pub kind: SegmentKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SegmentKind {
    Thinking {
        content: String,
    },
    ToolCall {
        tool_name: String,
        arguments: serde_json::Value, // JSON object
        call_id: String,
        status: ToolCallStatus,
    },
    ToolResult {
        call_id: String,
        result: serde_json::Value, // JSON value
        is_error: bool,
    },
    Content {
        text: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    Pending,
    Running,
    Completed,
    Error,
}
```

`Message` shape:

```rust
pub struct Message {
    pub id: String,
    pub role: String,
    #[serde(default)]
    pub segments: Vec<MessageSegment>,
    #[serde(default)]
    pub content: Vec<ContentPart>, // user multimodal + legacy fallback
    pub flags: Option<HashMap<String, bool>>,
    pub created_at: Option<String>,
}
```

Notes:
- Remove legacy `thinking` field.
- Keep `content` for user images/text and migration compatibility.

## 4.2 TypeScript (`types.ts`)

```ts
export type ToolCallStatus = "pending" | "running" | "completed" | "error";

export type MessageSegment =
  | {
      id: string;
      ts: string;
      type: "thinking";
      content: string;
    }
  | {
      id: string;
      ts: string;
      type: "tool_call";
      tool_name: string;
      arguments: Record<string, unknown>;
      call_id: string;
      status: ToolCallStatus;
    }
  | {
      id: string;
      ts: string;
      type: "tool_result";
      call_id: string;
      result: unknown;
      is_error: boolean;
    }
  | {
      id: string;
      ts: string;
      type: "content";
      text: string;
    };

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  segments: MessageSegment[];
  content: ContentPart[]; // required for user multimodal + legacy reads
  created_at?: string;
  flags?: Record<string, string | boolean>;
}
```

## 4.3 Streaming contract (`StreamChunk`)

```ts
export interface StreamChunk {
  text?: string;
  thinking?: string;
  tool_call_delta?: {
    index: number;
    call_id_part?: string;
    tool_name_part?: string;
    arguments_part?: string; // raw JSON text chunk
  };
  tool_call_complete?: {
    call_id: string;
    tool_name: string;
    arguments: Record<string, unknown>;
  };
  tool_result?: {
    call_id: string;
    result: unknown;
    is_error?: boolean;
  };
  done?: boolean;
  usage?: { prompt_tokens: number; completion_tokens: number };
}
```

Provider parsers must normalize fragmented `delta.tool_calls` into complete calls before store dispatch.

---

## 5) JSONL Format

Example persisted assistant message:

```json
{
  "type": "message",
  "id": "msg-1",
  "role": "assistant",
  "segments": [
    { "id": "seg-1", "ts": "2026-06-01T12:00:01Z", "type": "thinking", "content": "Let me compute this." },
    {
      "id": "seg-2",
      "ts": "2026-06-01T12:00:02Z",
      "type": "tool_call",
      "tool_name": "calculate",
      "arguments": { "expression": "2+2" },
      "call_id": "call-1",
      "status": "completed"
    },
    {
      "id": "seg-3",
      "ts": "2026-06-01T12:00:03Z",
      "type": "tool_result",
      "call_id": "call-1",
      "result": { "value": 4 },
      "is_error": false
    },
    { "id": "seg-4", "ts": "2026-06-01T12:00:04Z", "type": "content", "text": "The answer is 4." }
  ],
  "content": [],
  "created_at": "2026-06-01T12:00:00Z"
}
```

Compatibility policy:
- If `segments` missing, load `segments = []`.
- Legacy renderer path uses `content` when `segments.length === 0`.

---

## 6) Migration & Compatibility

1. **Read-path adapter (required)**: old messages with `thinking`/`content` load safely.
2. **Write-path policy**: new assistant messages write `segments`; user messages keep `content` for multimodal.
3. **No destructive migration required** for existing JSONL files.
4. **Optional backfill utility** (later): convert legacy assistant `content/text` into a single `content` segment.

---

## 7) Test Plan

### Rust
- `test_message_segment_roundtrip`
- `test_legacy_message_without_segments_loads`
- `test_segment_kind_serde_roundtrip`
- `test_tool_status_serde_roundtrip`
- `test_segment_order_preserved`
- `test_user_content_parts_roundtrip`

### TypeScript
- `message_segment_union_narrowing`
- `stream_chunk_tool_call_delta_assembly_contract`
- `tool_arguments_json_not_string`
- `legacy_message_adapter_fallback`

### Integration
- Provider emits fragmented tool calls -> parser assembles exactly one complete call.
- Persist/reload preserves segment ordering and tool JSON values.

---

## 8) Files Changed

- `mathmate/src-tauri/src/session.rs`
- `mathmate/src/lib/types.ts`
- `mathmate/src/lib/providers.ts` (delta normalization contract)
- `mathmate/src/stores/chatStore.ts` (segment assembly hooks)

---

## 9) Rollout Order

1. Land canonical schema + Rust/TS types.
2. Land compatibility adapters and tests.
3. Land provider normalization for tool-call deltas.
4. Verify old sessions render; new sessions persist full segments.
5. Update changelog + dev log.
