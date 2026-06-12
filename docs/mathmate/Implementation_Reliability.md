# Implementation Plan: Reliability, Retry, and Error UX

## 1) Goal
Make chat resilient and recoverable when provider/network/tool failures occur.

---

## 2) User-Facing Features
- Retry last user turn
- Regenerate last assistant response
- Cancel active stream cleanly
- Better error messaging (auth, rate limit, timeout, malformed response)
- Suggested fallback action (switch model/provider) where applicable

---

## 3) Technical Plan

### Error classification
Map provider errors into categories:
- Authentication
- Rate limit
- Network/timeout
- Invalid response
- Tool execution error

### Retry behavior
- Keep last request payload snapshot for deterministic retry.
- Add idempotent retry path that does not duplicate user message history.

### Stream cancellation
- Add cancellation token/task handle in `ChatViewModel`.
- Ensure UI leaves consistent state after cancel.

### UI
- Inline actionable banners with buttons:
  - Retry
  - Switch Model
  - Dismiss

---

## 4) Task Checklist
- [ ] Introduce typed error mapping layer
- [ ] Add `retryLastTurn()` and `regenerateLastResponse()` in `ChatViewModel`
- [ ] Add proper stream cancellation plumbing
- [ ] Add actionable error banner UI in `ChatView`
- [ ] Add tests for retry/cancel and non-duplication of history

---

## 5) Acceptance Criteria
- Common failures provide clear next actions.
- Retry/regenerate paths work without corrupting conversation state.
- Canceling stream never leaves a stuck loading state.
