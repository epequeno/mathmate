# Implementation Plan — Phase 14G: Cleanup & Dead Code Removal

## Objective

Land a set of small cleanup improvements that came out of the 2026-06-12 review. Most are no-behavior-change, but a few are policy-sensitive and explicitly marked as such. Each item is independently shippable and can land in any order. The intent is to remove rough edges that distract from the bigger Phase 14 refactors and to fix correctness bugs unrelated to architecture.

## Scope

Each item below is a separate, small PR. None should take more than a few hours.

### G.0 — Re-validate assumptions before each cleanup PR

Before changing code, attach a quick evidence block (grep output + file path + line pointers) proving the assumption is still true in the current branch. Several 2026-06-12 findings were already stale by 2026-06-12 EOD.

### G.1 — Remove dead `_toolCallDeltas` field from `chatStore`

**Files:** `src/stores/chatStore.ts`

`useChatStore`'s state includes `_toolCallDeltas: { index, call_id_part?, tool_name_part?, arguments_part? }[]` and the action `set({ _toolCallDeltas: [...] })` is called repeatedly in `sendMessage`. A repo-wide grep shows the field is *only written*, never read by any consumer (`ChatMessage.tsx`, `ProcessBlock.tsx`, and components all use the segment timeline, not the raw delta array). Remove the field and the writes.

```bash
grep -rn "_toolCallDeltas\|toolCallDeltas" src/
```

### G.2 — Reconcile `open_path.confirmed` contract (policy-sensitive)

**Files:** `src-tauri/src/lib.rs`, `src/pages/ChatPage.tsx`, `src/pages/VaultPage.tsx`

`open_path` currently accepts `confirmed: Option<bool>`, and the frontend **does** pass it after a user confirmation dialog for out-of-root paths. So this is not dead surface today.

Decision options:
- (a) Keep `confirmed` and document/test the current confirmation flow as the supported contract.
- (b) Remove `confirmed` and unconditionally reject non-root paths, while also removing the frontend retry-with-confirmed behavior.

**Phase 14 decision:** take (a) unless product explicitly chooses stricter behavior. If (b) is chosen, do it in one coordinated TS+Rust PR with updated UX copy.

### G.3 — Fix the `wrapup.rs` TODO

**Files:** `src-tauri/src/wrapup.rs:178`

```rust
let session_id = "unknown"; // TODO: plumb session_id through from caller
```

Trace the call site of `generate_wrap_up` to confirm whether the session_id is actually available. If yes, thread it through. If no, change the return shape so the caller passes the id and `generate_wrap_up` does not need to invent one.

### G.4 — Remove no-op tests in `pathscope.rs`

**Files:** `src-tauri/src/pathscope.rs`

The file contains 6+ tests like:

```rust
#[test]
fn test_is_within_same_directory() {
    let _root = Path::new("/");
    let _target = Path::new("/tmp/foo.txt");
    // assert!(is_within(root, target));
}
```

The assertions are commented out, leaving the tests as no-ops that always pass. Delete the no-op tests; the surviving tests (`ensure_inside_vault_*`, `canonical_inside_any_*`, `safe_extension_*`, `normalize_local_path_*`) already cover the live code paths.

### G.5 — Replace the dynamic `await import` in `App.tsx` and `chatStore.ts`

**Files:** `src/App.tsx`, `src/stores/chatStore.ts`

`App.tsx` does:

```ts
const { listen } = await import("@tauri-apps/api/event");
```

and `chatStore.ts:737` does:

```ts
const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
```

Both modules are statically importable in Tauri and non-Tauri modes. The dynamic import was a defensive measure. Replace with static imports at the top of the file; if needed, gate the actual `listen` / `invoke` call with an `isTauri()` check that is computed once at module load.

### G.6 — Add a `useRef` mount-once guard in `Layout`

**Files:** `src/components/Layout.tsx`

`Layout.tsx:38`:

```ts
useEffect(() => {
  loadConfig();
  restoreLastSession();
}, []);
```

The AGENTS.md comment notes the risk: if `Layout` ever unmounts and remounts, `restoreLastSession` runs again, creating a phantom session. Add a `useRef(false)` guard:

```ts
const initialized = useRef(false);
useEffect(() => {
  if (initialized.current) return;
  initialized.current = true;
  loadConfig();
  restoreLastSession();
}, [loadConfig, restoreLastSession]);
```

### G.7 — Tighten `assembleToolCalls` argument parsing

**Files:** `src/lib/providers.ts:assembleToolCalls`

```ts
let args: Record<string, unknown> = {};
try {
  args = JSON.parse(assembled.argumentsRaw || "{}");
} catch {
  // Malformed arguments — keep as empty object
}
```

Silently swallowing malformed tool-call arguments is a security smell: the model could send a partial/invalid JSON that the executor then runs with default args. Change the catch to throw a `StreamError { status: 502, retryable: false }` so the orchestrator can surface the error. (Or: pass the raw string through to the executor and let it decide.)

### G.8 — Add an `unlistenRef` cleanup pattern in `App.tsx`

**Files:** `src/App.tsx`

The `menu-navigate` listener is set up in an effect and torn down in the cleanup. The current code is correct, but the pattern is fragile: if a new event listener is added that is not in `unlisten?.[0]`, the cleanup will not see it. Refactor to a `useRef<UnlistenFn[]>` array of unsub functions.

### G.9 — Consolidate the `MCP tools/call` JSON-RPC envelope unwrap

**Files:** `src-tauri/src/lib.rs` (`synapse_call`), `src-tauri/src/mcp_client.rs`

The `synapse_call` Tauri command does the JSON-RPC envelope unwrap inline (`if let Some(content) = result.get("content")...`). Move it to `mcp_client.rs` as a `call_unwrapped` method (or `call_json` for the wrapped form). One less responsibility in `lib.rs`.

### G.10 — Replace the `synapse_tools` string array in `execute_tool`

**Files:** `src-tauri/src/lib.rs` (`execute_tool`)

The hardcoded `synapse_tools` array duplicates what `mcp_client.list_tools()` returns. Replace with a runtime check:

```rust
if let Some(ref mut client) = state.mcp_client.lock().ok().and_then(|mut g| g.as_mut()) {
    if let Ok(current_tools) = client.list_tools() {
        if current_tools.iter().any(|t| t.function.name == call.tool_name) {
            return client.call(&call.tool_name, call.arguments.clone())...;
        }
    }
}
```

This costs one extra `list_tools` round-trip per non-vault tool call (or the result is cached for ~1s in the client). It eliminates the silent contract drift between the string array and Synapse's actual tool list.

### G.11 — Resolve duplicate error surfaces in `chatStore` (policy-sensitive)

**Files:** `src/stores/chatStore.ts`, `src/App.tsx`

The streaming flow currently surfaces errors in two places (store error + assistant error message). Decide one primary UX before 14E rollout:
- banner-first (preferred for operational errors), or
- chat-message-first.

If both are retained, document the distinction and add a single retry affordance so users do not see conflicting actions.

### G.12 — Remove the `modelCatalog` flag staleness in `configStore`

**Files:** `src/stores/configStore.ts`

The `useConfigStore` exposes a `visionFilterEnabled` flag and a `visionFilter` setter, but `grep` shows it is never read. Either remove it or wire it to `ModelSelector` so the user can filter by vision-capable models.

### G.13 — Strengthen `scripts/check-no-eval.mjs`

**Files:** `scripts/check-no-eval.mjs`

`prebuild` already runs this script, but it currently checks only `new Function(` and `eval(` patterns. Extend coverage to also catch at least:
- direct `Function(` constructor calls,
- string code in `setTimeout("...", ...)` / `setInterval("...", ...)`,
- obvious `(0, eval)(...)` forms.

Add a small fixture-based test for the checker so regressions in the checker itself are caught.

### G.14 — Cap the in-memory `streamedText` / `streamedThinking` growth

**Files:** `src/stores/chatStore.ts`

The streamed text/thinking strings are appended to on every chunk. There is no upper bound. A pathological model response (or a bug in the parser) could grow the string to MB. Cap to 1 MB and emit a `TURN_ERROR` (or truncate) when exceeded. This is paranoia — the response sizes are bounded by the API's max_tokens — but a 1-line guard is cheap.

### G.15 — Add a "command name + arg shape" lint to the typed client

**Files:** `src/lib/api/*.ts`

After 14A, the typed client is the only place that knows the Tauri command surface. Add a JSDoc `@command: <name>` annotation to each method and write a small script that greps `invoke_handler!` from `lib.rs` and confirms 1:1 coverage. This is the cheapest possible "did we forget to wrap a command" check.

## Task Checklist

Each item G.1–G.15 is an independent PR. Land them in any order. Track in the Phase 14G milestone.

## Validation

- `npm run build` ✅, `npm test` ✅ after each PR
- `cargo check` ✅, `cargo test` ✅ after each Rust PR
- Manual smoke test of the affected surface

## Acceptance Criteria

- Each G.x PR has a clean, scoped diff with explicit evidence for its assumption.
- The `_toolCallDeltas` field, `synapse_tools` array, and no-op `pathscope` tests are gone from the codebase.
- `open_path.confirmed` has an explicit, tested policy decision (kept + documented, or removed via coordinated TS+Rust change).
- The dynamic `await import` calls in `App.tsx` and `chatStore.ts` are gone.
- The `Layout` mount-once guard is in place.
- The `assembleToolCalls` error handling is tightened.
- The `wrapup.rs` TODO is resolved (either fixed or removed with a documented reason).

## Risks

- **Some "cleanup" claims hide subtle UX changes.** Mitigation: each PR includes before/after screenshots (or interaction notes) for the affected UI surface.
- **G.2 and G.11 are policy-sensitive.** Mitigation: require explicit product/security sign-off in the PR description before landing.
