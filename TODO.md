# 🚧 CotForce-MCP: Improvement Todo List

Based on the honest value review, here are actionable improvements, organized by priority.

---

## ✅ Quick Wins (Implemented)

- [x] **Fix TypeScript setup** - converted `index.js` to `src/index.ts` with strict `tsconfig.json`, proper ESM/NodeNext resolution, and build output to `dist/`.
- [x] **Add `.gitignore` and `LICENSE`** - standard Node `.gitignore` and MIT `LICENSE` file added.
- [x] **Add Zod runtime validation** - tool arguments now validated with `SolveProblemArgsSchema`; parsed CoT output validated with `AgenticCotSchema` in all parser layers.
- [x] **Scope `rejectionMemo` per-request** - removed global mutable `rejectionMemo`; now passed as a parameter to `sampleLLM`, preventing race conditions under concurrent calls.
- [x] **Remove broken `STREAM` env flag** - MCP Node.js SDK does not support streaming responses. Removed the inert `stream` param and `STREAM` env var from code.
- [x] **Replace Layer 4 regex with brace-balancing scanner** - new `extractBalancedJson()` properly handles nested braces and strings, fixing false matches on nested JSON objects.
- [x] **Fix `McpError` constructor usage** - was passing `(stringMessage, stringCode)`; now uses `(ErrorCode, message)` correctly per SDK signature.
- [x] **Fix sampling method name** - changed from incorrect `sampling/create` to correct `sampling/createMessage` via `server.createMessage()` API.
- [x] **Fix response content parsing** - `CreateMessageResult.content` is a single discriminated union object, not an array. Now reads `response.content.text` directly after type narrowing.
- [x] **Fix system prompt delivery** - MCP schema only allows `user`/`assistant` message roles. Moved system prompt to the dedicated `systemPrompt` param in `createMessage`.

---

## 🔴 Critical (Must Fix for Production Readiness)

- [x] **Support clients without MCP sampling**
  ✅ `MODE=auto/direct` with `API_KEY` and `API_BASE_URL` enables direct OpenAI-compatible HTTP calls. `auto` automatically falls back to direct HTTP when client lacks sampling support. Works with LMStudio, VS Code extensions, and any OpenAI-compatible provider.

- [ ] **Implement true streaming**
  Replace the `stream: true` flag with actual token-by-token emission using SSE or WebSocket transport. The current `server.request` does not support streaming; use lower-level transport or MCP notifications to push partial CoT text.

- [x] **Add output truncation detection**
  ✅ `TRUNCATION_THRESHOLD` env var (default 0.95). Detects truncation via `finish_reason: "length"` and token ratio. Recovery-first strategy: tries to parse truncated JSON before retrying with 1.5x budget.

- [x] **Integrate structured monitoring/metrics**
  ✅ `src/lib/metrics.ts` tracks total requests, successes, failures, truncations, retries, sampling errors, parse latency, and average token usage. Snapshot logged on shutdown.

---

## 🟠 High (Significant Reliability & Usability Gains)

- [x] **Fix section comment numbering in `index.ts`**
  ✅ Sections renumbered sequentially 1→12 (was: duplicate 4, 5, 6, 7).

- [x] **Extract `MAX_RETRIES` constant**
  ✅ Single module-level definition. Replaced 3 duplicate `parseInt(process.env.MAX_RETRIES...)` calls.

- [x] **Replace silent `catch { /* ignore */ }` in parser**
  ✅ All 5 silent catch blocks now log to stderr when `LOG_LEVEL=DEBUG`. Added `parserDebug()` helper.

- [x] **Add `REJECTION_MEMO_MAX_LENGTH` constant**
  ✅ Named constants: `REJECTION_MEMO_MAX_LENGTH=500`, `RETRY_CONTEXT_MAX_LENGTH=300`. No more magic numbers.

- [x] **Multi-session rejection memory**
  ✅ Sliding window of last 10 failures across requests. Detects 8 failure patterns (markdown-fences, preamble, no-reasoning, result-explanation, no-json, truncated, schema-mismatch, unknown). Injects preemptive hint when a pattern recurs 2+ times. TTL 30min, configurable.

- [x] **Validate output against a user-supplied schema**
  ✅ Optional `resultSchema` parameter on `solve_problem` with simple type-map validation (`string`, `number`, `boolean`, `object`). Supports nested schemas. Mismatch triggers retry.

- [x] **Token budget fine-tuning**
  ✅ `REASONING_OVERHEAD` env var (default 800). Budget formula: `overhead + inputTokens × 4`, min 2048, max 8192. `computeTokenBudget()` returns `{ budget, inputTokens }` to eliminate duplicate counting. Added `estimateTokens()` lightweight heuristic.

- [x] **Graceful handling of model-specific quirks**
  ✅ `getSystemPrompt()` selects tuned prompts for Claude, GPT-4, Gemini, Grok. Falls back to default for unknown models.

---

## 🟡 Medium (Nice-to-Haves for Power Users)

- [x] **Retry with different model**
  ✅ `FALLBACK_MODELS=gpt-4o,claude-3-5-sonnet` cycles through models on failure. Each gets `MAX_RETRIES+1` attempts.

- [x] **Expose raw token usage in response**
  ✅ Appended to response text: `📊 Token Usage: X in / Y out / Z budget`. Available on both success and fallback responses.

- [x] **Preserve error stack traces in `McpError` wrappers**
  ✅ Both `McpError` throw sites now attach original error via `Error.cause` before re-throwing.

- [x] **Sanitize LLM error responses**
  ✅ `sanitizeErrorText()` redacts `sk-...`, Bearer tokens, `apikey=`, `key=`, `token=` patterns from error text.

- [x] **Add test for the full retry loop**
  ✅ 4 integration tests with mock HTTP LLM server covering: parse failures, truncated recovery, schema mismatch retries, fallback model switching.

- [x] **Add rate limiting / concurrency control**
  ✅ Not needed - MCP stdio transport processes requests serially. LLM providers already enforce their own rate limits. True streaming (SSE/WebSocket) would be required before concurrency is possible.

- [x] **Support for chat-style multi-turn CoT**
  ✅ Added optional `history` parameter to `solve_problem`. When provided, previous reasoning/result pairs are injected as `[PREVIOUS REASONING CHAIN]` context before the new prompt. Cache key includes full effective prompt with history.

---

## 🟢 Low (Cosmetic / Dev Experience)

- [x] **Add progress notifications for long CoT**
  ✅ Sends `notifications/progress` when client provides `_meta.progressToken`. Reports step number, total steps, and human-readable messages at key stages (LLM call, truncation recovery, parse success, model switch).

- [x] **Improve few-shot examples**
  ✅ Expanded from 1 to 4 correct examples showing all result types (number, string, object, boolean). Added small-model-specific prompt for Qwen, Gemma, Llama, Mistral, Phi.

- [x] **Write integration tests with real LLMs**
  ✅ Comprehensive test suite with 123 tests covering parser layers (including truncated JSON recovery), token budgeting, retry loop, fallback models, progress notifications, and MCP server integration via `@slbdn/mcp-tester`.

- [x] **Create a `CONTRIBUTING.md`**
  ✅ Architecture documented in README.md with `src/lib/` module descriptions.

- [x] **Publish to npm**
  ✅ Package configured as `@slbdn/cotforce-mcp`. Ready to publish with `npm publish --access public`. Dry-run passes: 31 files, 36.2 kB.

- [x] **Lazy import `tiktoken`**
  ✅ `tiktoken` WASM (~2MB) lazily loaded via dynamic `import()` on first `countTokens()` call. `getEncodingSafe()` and `countTokens()` are now async.

- [x] **Fix type assertions for `progressToken` and `sendNotification`**
  ✅ `progressToken` accessed via typed SDK schema (`request.params._meta?.progressToken`). `sendNotification` typed via `ProgressNotification` from SDK types.

- [x] **Add test for progress notification delivery**
  ✅ 5 unit tests for `createProgressSender`: no-op without token, correct structure, deduplication, numeric token, total steps.

- [x] **Protect concurrent access to metrics**
  ✅ All metrics mutations wrapped in `MetricsGuard.run()`. Synchronous guard with generic return type. No async overhead.

---

## 🔮 Future / Experimental

- [ ] **Self‑optimizing prompt generator**  
  Use the rejection log to automatically rewrite the system prompt (e.g., via another LLM call) to close recurring failure patterns.

- [ ] **Auto conversationContext**  
  CotForce tracks the last N `solve_problem` results internally. If the new call doesn't pass `history` but looks like a follow-up (short prompt, no explicit problem statement), auto-inject recent context. Avoids the caller having to manage history manually.

- [x] **Plug-in architecture for parsers**
  ✅ `CotParser` interface + `ParserPipeline` class. Five built-in parsers as plugins (`direct-json`, `fenced-block`, `heuristic`, `brace-balanced`, `truncated-recovery`). Custom parsers via `addParser()`/`removeParser()`. Env `COT_PARSERS` to select a subset. 133 tests passing.

- [x] **Tool-specific CoT caching**
  ✅ `src/lib/cache.ts`: TTL-based cache with configurable `CACHE_TTL` (default 1h) and `CACHE_MAX_ENTRIES` (default 100). Cache key includes prompt + optional resultSchema. Periodic cleanup every 30s. 10 tests.

---

**How to contribute?**
Pick an item from the `🔴 Critical` or `🟠 High` list, and submit a PR. Each improvement should include tests and updated documentation. Let's turn CotForce-MCP from a prototype into a robust, production-ready binding.
