# 🚧 CotForce-MCP: Improvement Todo List

Based on the honest value review, here are actionable improvements, organized by priority.

---

## ✅ Quick Wins (Implemented)

- [x] **Fix TypeScript setup** — converted `index.js` to `src/index.ts` with strict `tsconfig.json`, proper ESM/NodeNext resolution, and build output to `dist/`.
- [x] **Add `.gitignore` and `LICENSE`** — standard Node `.gitignore` and MIT `LICENSE` file added.
- [x] **Add Zod runtime validation** — tool arguments now validated with `SolveProblemArgsSchema`; parsed CoT output validated with `AgenticCotSchema` in all parser layers.
- [x] **Scope `rejectionMemo` per-request** — removed global mutable `rejectionMemo`; now passed as a parameter to `sampleLLM`, preventing race conditions under concurrent calls.
- [x] **Remove broken `STREAM` env flag** — MCP Node.js SDK does not support streaming responses. Removed the inert `stream` param and `STREAM` env var from code.
- [x] **Replace Layer 4 regex with brace-balancing scanner** — new `extractBalancedJson()` properly handles nested braces and strings, fixing false matches on nested JSON objects.
- [x] **Fix `McpError` constructor usage** — was passing `(stringMessage, stringCode)`; now uses `(ErrorCode, message)` correctly per SDK signature.
- [x] **Fix sampling method name** — changed from incorrect `sampling/create` to correct `sampling/createMessage` via `server.createMessage()` API.
- [x] **Fix response content parsing** — `CreateMessageResult.content` is a single discriminated union object, not an array. Now reads `response.content.text` directly after type narrowing.
- [x] **Fix system prompt delivery** — MCP schema only allows `user`/`assistant` message roles. Moved system prompt to the dedicated `systemPrompt` param in `createMessage`.

---

## 🔴 Critical (Must Fix for Production Readiness)

- [ ] **Implement true streaming**  
  Replace the `stream: true` flag with actual token‑by‑token emission using SSE or WebSocket transport. The current `server.request` does not support streaming; use lower‑level transport or MCP notifications to push partial CoT text.

- [x] **Add output truncation detection**  
  ✅ `TRUNCATION_THRESHOLD` env var (default 0.95). Detects when output/budget ratio exceeds threshold, logs warning, injects conciseness hint into rejection memo, and retries.

- [ ] **Integrate structured monitoring/metrics**  
  Expose counters (total requests, success/retry/failure rates, average token usage, parse latency) via a `/metrics` endpoint or log structured JSON that can be consumed by tools like Prometheus or Datadog.

---

## 🟠 High (Significant Reliability & Usability Gains)

- [ ] **Multi‑session rejection memory**  
  Instead of a single rejection memo, store a sliding window of recent failures (e.g., last 5). Aggregate common failure patterns (e.g., “model outputs markdown blocks without JSON”) and inject more targeted corrections.

- [ ] **Validate output against a user‑supplied schema**  
  Allow the caller to provide an optional `resultSchema` parameter (JSON schema) that validates the `result` field. If mismatch, trigger retry or return detailed error.

- [ ] **Token budget fine‑tuning**  
  Replace the fixed overhead formula with a machine‑learned or adaptive model that estimates reasoning length based on prompt complexity and historical data. At minimum, add an env variable `REASONING_OVERHEAD` for manual tuning.

- [ ] **Graceful handling of model‑specific quirks**  
  Support model‑specific system prompt variants (e.g., Grok, Gemini, GPT‑4) that may respond differently to the standard prompt. Use `MODEL` env to select prompt template.

---

## 🟡 Medium (Nice‑to‑Haves for Power Users)

- [ ] **Retry with different model**  
  On failure, try alternative models (e.g., from a comma‑separated `FALLBACK_MODELS` env list). Useful if one model refuses to output JSON but another complies.

- [x] **Expose raw token usage in response**  
  ✅ Appended to response text: `📊 Token Usage: X in / Y out / Z budget`. Available on both success and fallback responses.

- [ ] **Add rate limiting / concurrency control**  
  Prevent overloading the LLM with concurrent requests. Use a simple semaphore or queue.

- [ ] **Support for chat‑style multi‑turn CoT**  
  Allow the tool to accept a `history` parameter (previous messages) so the LLM can build on prior reasoning. Useful for iterative problem solving.

---

## 🟢 Low (Cosmetic / Dev Experience)

- [ ] **Add progress notifications for long CoT**  
  While streaming is not available, at least send periodic `$message` notifications to the MCP client (if supported) to indicate “still thinking”.

- [ ] **Improve few‑shot examples**  
  Include more diverse examples (arithmetic, logic, creative writing) in the system prompt to cover a wider range of problem types.

- [x] **Write integration tests with real LLMs**  
  ✅ Comprehensive test suite with 65+ tests covering parser layers, token budgeting, and MCP server integration via `@slbdn/mcp-tester`.

- [x] **Create a `CONTRIBUTING.md`**  
  ✅ Architecture documented in README.md with `src/lib/` module descriptions.

- [ ] **Publish to npm**  
  Automate CI/CD and publish as `cotforce-mcp` for easy installation.

---

## 🔮 Future / Experimental

- [ ] **Self‑optimizing prompt generator**  
  Use the rejection log to automatically rewrite the system prompt (e.g., via another LLM call) to close recurring failure patterns.

- [ ] **Plug‑in architecture for parsers**  
  Allow users to write custom parser modules (e.g., YAML, CSV) without modifying core code.

- [ ] **Tool‑specific CoT caching**  
  Cache successful CoT results for identical prompts (with TTL) to reduce LLM calls for repeated tasks.

---

**How to contribute?**  
Pick an item from the `🔴 Critical` or `🟠 High` list, and submit a PR. Each improvement should include tests and updated documentation. Let’s turn CotForce‑MCP from a prototype into a robust, production‑ready binding.
