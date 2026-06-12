# Implementation Plan: Dynamic Model Catalog + Vision Filter

## 1) Goal
Add a **dynamic OpenRouter model catalog** (capabilities + metadata) without replacing the existing provider runtime config in `~/.mathmate/models.json`.

This plan covers:
- UX-1: dynamic catalog fetch/cache
- UX-2: vision-capable filtering + non-blocking warning when images are sent to non-vision models

---

## 2) Non-Negotiable Guardrails

1. **Do not conflate config and catalog**
   - `models.json` remains the runtime provider/key/endpoint config.
   - `models_cache.json` is fetched metadata only.

2. **Do not route by model ID prefix**
   - OpenRouter IDs like `anthropic/...` are model IDs, not provider routing switches.
   - Request routing remains driven by selected provider config.

3. **Image checks must use real payload content**
   - Vision warning logic must inspect outbound message content parts (actual image parts), not markdown placeholders.

4. **Graceful degradation is required**
   - No-network/API failure must not block chat.
   - Use cached catalog when available; otherwise fallback to static configured models.

---

## 3) Current Gaps

- Model selector only shows hardcoded provider model arrays.
- No metadata exists (`supports_vision`, context length, pricing).
- No reliable vision warning path tied to actual outbound payload.
- No persisted catalog cache.

---

## 4) Architecture

### 4.1 Rust data model
Create catalog-only types (in `models.rs` or shared type module):

```rust
pub struct ModelCatalogEntry {
  pub id: String,
  pub name: String,
  pub supports_vision: bool,
  pub context_length: u64,
  pub pricing: Option<ModelPricing>,
}

pub struct ModelPricing {
  pub prompt: String,
  pub completion: String,
  pub image: Option<String>,
}

pub struct ModelCatalog {
  pub fetched_at: String,
  pub models: Vec<ModelCatalogEntry>,
}
```

### 4.2 Commands
- `fetch_models(force_refresh: bool) -> Result<ModelCatalog, String>`
- `get_cached_models() -> Result<Option<ModelCatalog>, String>`

Semantics:
- `get_cached_models`: read-only, no network
- `fetch_models(false)`: return fresh cache when valid; otherwise fetch+cache
- `fetch_models(true)`: force network fetch+cache

### 4.3 Caching
- Cache path: `~/.mathmate/models_cache.json`
- Writes must be atomic (tmp + rename)
- Corrupt cache => ignore/delete and recover
- TTL: 24h

### 4.4 Vision support inference
- Primary: `architecture.input_modalities` includes `"image"`
- Fallback: `architecture.modality` contains `"image"`

---

## 5) Dependency Guidance

In `src-tauri/Cargo.toml`:
- Add `reqwest` for HTTP
- Avoid blanket `tokio = { features = ["full"] }` unless truly needed
- Prefer minimal features to keep binary/build impact low

---

## 6) Frontend Integration

### `src/lib/types.ts`
Add `ModelInfo` catalog interface.

### `src/stores/configStore.ts`
Add catalog state:
- `modelCatalog`
- `modelCatalogFetchedAt`
- `modelCatalogLoading`
- `modelCatalogError`
- `visionFilterEnabled`

Add actions:
- `fetchModelCatalog(forceRefresh?: boolean)`
- `setVisionFilter(enabled: boolean)`

### `src/components/ModelSelector.tsx`
- Render catalog-backed rows when available.
- Keep provider tabs/search behavior.
- Apply filters with AND logic:
  - provider filter
  - text search
  - vision-only toggle
- Add capability badges (vision/context).
- Add refresh action + loading/error states.

### `src/stores/chatStore.ts` (warning path)
Before send, detect if outbound payload has image parts.
If yes, and selected model has `supports_vision === false`, show non-blocking warning toast.

> Important: this check must use real message/payload structure, not display markdown.

---

## 7) OpenRouter response fields used

From `GET https://openrouter.ai/api/v1/models`:
- `id`
- `name`
- `architecture.modality`
- `architecture.input_modalities`
- `context_length`
- `pricing.prompt`, `pricing.completion`, `pricing.image`

---

## 8) Edge Cases

- Offline / DNS failure: return cache if present, else fallback to static models.
- 401/403: show auth-related error state, do not block selector fallback.
- 5xx / timeout: fallback same as network failure.
- Concurrent fetches: dedupe or gate in-flight calls.
- Removed models upstream: refresh should naturally remove stale entries.

---

## 9) Acceptance Criteria

- Catalog and runtime config are stored separately.
- Provider routing never changes based on model ID prefix.
- Vision warning triggers only when payload actually contains images.
- Filter composition works: provider + search + vision toggle (AND).
- Failure modes degrade cleanly without breaking chat.
- `cargo check` and `npm run build` pass.

---

## 10) Execution Order

1. Implement Rust catalog fetch/cache + commands.
2. Add frontend catalog types/store/actions.
3. Wire `ModelSelector` to catalog and filters.
4. Implement payload-aware vision warning path.
5. Run build checks and manual QA for online/offline/auth-failure flows.
