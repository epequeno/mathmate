# Implementation Plan: Multimodal Support (Text + Image)

## 1. Overview

Allow users to attach images (drag-and-drop or file picker) to their messages,
enabling textbook screenshot workflows. All messages — user and assistant — are
restructured around a `[ContentPart]` array. A clean `MessagePayload` struct
decouples the provider serialization layer from UI state.

---

## 2. Data Layer

### 2a. `ContentPart` and `ImageAttachment` (new, in `ModelProvider.swift`)

```swift
struct ImageAttachment: Codable {
    enum Source: Codable {
        case base64(data: Data, mimeType: String)
    }
    let source: Source
    let altText: String?
}

enum ContentPart: Codable {
    case text(String)
    case image(ImageAttachment)
}
```

### 2b. `Message` — migrate `content: String` → `parts: [ContentPart]`

```swift
struct Message: Identifiable, Codable {
    let id: UUID
    var parts: [ContentPart]           // replaces content: String
    var thinkingText: String           // always plain text, always assistant-only
    let isUser: Bool
    var isStreaming: Bool
    var tokenUsage: TokenUsage?        // from context panel plan
    var timestamp: Date                // from context panel plan

    /// Convenience: joined text parts — used by LaTeXView and legacy callsites
    var content: String {
        parts.compactMap {
            if case .text(let s) = $0 { return s }
            return nil
        }.joined()
    }

    /// Convenience: image attachments in this message
    var images: [ImageAttachment] {
        parts.compactMap {
            if case .image(let img) = $0 { return img }
            return nil
        }
    }
}
```

`thinkingText` remains a plain `String` — it is always a raw assistant reasoning
trace and never multipart.

### 2c. `MessagePayload` — provider-layer struct (new, in `ModelProvider.swift`)

Separates API concerns from UI state (`id`, `isStreaming`, etc. are not sent
to the provider).

```swift
struct MessagePayload {
    enum Role { case system, user, assistant }
    let role: Role
    let parts: [ContentPart]

    /// Convenience initialiser for plain-text messages
    static func text(_ role: Role, _ content: String) -> MessagePayload {
        MessagePayload(role: role, parts: [.text(content)])
    }
}
```

---

## 3. Provider Layer

### 3a. `ModelProvider` protocol — updated signature

```swift
protocol ModelProvider: Sendable {
    func streamMessage(
        _ messages: [MessagePayload],
        model: String,
        maxTokens: Int?
    ) -> AsyncThrowingStream<StreamToken, Error>
}
```

The system prompt is now included as the first `MessagePayload` with
`.system` role by the caller (`ChatViewModel`), removing it as a separate
parameter.

### 3b. `OpenAIProvider` — multimodal serialization

When serializing a `MessagePayload`, if `parts` contains only a single
`.text`, emit the existing `"content": "string"` format for compatibility.
If `parts` contains any `.image`, emit the array format:

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is shown here?" },
    { "type": "image_url",
      "image_url": { "url": "data:image/jpeg;base64,<data>" } }
  ]
}
```

### 3c. `AnthropicProvider` — multimodal serialization

```json
{
  "role": "user",
  "content": [
    { "type": "image",
      "source": { "type": "base64",
                  "media_type": "image/jpeg",
                  "data": "<data>" } },
    { "type": "text", "text": "What is shown here?" }
  ]
}
```

---

## 4. `ChatViewModel` changes

- Build `[MessagePayload]` from the full `messages` array before each call
  (already required by the conversation history fix in the context panel plan).
- Prepend system prompt as `.system` role payload.
- User messages with attached images → include `.image` parts in the payload.
- `pendingImages: [ImageAttachment]` — transient state, cleared after send.

---

## 5. UI Layer

### 5a. `MessageRow` — render image thumbnails

For user messages, render any `.image` parts above the text bubble as a
horizontal strip of rounded thumbnails (max height ~120pt). Tapping a
thumbnail opens a `Quick Look` preview.

### 5b. Input bar — attachment support

Add a paperclip button (left of the text field):
- Opens `NSOpenPanel` filtered to image types (`jpg`, `png`, `gif`, `webp`, `tiff`)
- Reads file as `Data`, wraps in `ImageAttachment(source: .base64(...))`
- Appends to `ChatViewModel.pendingImages`

**Drag and drop:**
- Add `.onDrop(of: [.image])` to the input bar area
- Accept `NSItemProvider` image data → same `ImageAttachment` path

**Pending images strip:**
- Show thumbnails above the text field when `pendingImages` is non-empty
- Each thumbnail has an `×` dismiss button to remove before sending

---

## 6. Implementation Order

1. Add `ImageAttachment`, `ContentPart` to `ModelProvider.swift`
2. Add `MessagePayload` to `ModelProvider.swift`
3. Migrate `Message.content: String` → `Message.parts: [ContentPart]`
   with `content` and `images` computed properties for backward compat
4. Update `OpenAIProvider` serialization for multimodal payloads
5. Update `AnthropicProvider` serialization for multimodal payloads
6. Update `ModelProvider` protocol signature; remove `systemPrompt` parameter
7. Update `ChatViewModel` to build `[MessagePayload]` + manage `pendingImages`
8. Update `MessageRow` to render image thumbnails
9. Add attachment button + drag-and-drop to input bar

---

## 7. Verification

- `swift build` must pass.
- `swift test` must pass.
- Plain text messages must render identically to current behaviour
  (the `content` computed property ensures this).
- Image attachment round-trips correctly through base64 encoding.
- Thumbnails display in message history after send.
- Drag-and-drop accepts PNG and JPEG from Finder.
- Test against at least one OpenRouter vision-capable model
  (e.g. `openai/gpt-4o` or `anthropic/claude-3-5-sonnet`).
