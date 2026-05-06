# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Output truncation detection** — `isTruncated()` in `src/lib/tokens.ts` with configurable `TRUNCATION_THRESHOLD` env var (default 0.95). Detects when LLM responses hit the token budget.
- **Truncated JSON recovery** — Layer 5 parser (`recoverTruncatedJson()`) salvages reasoning from responses cut off by token limits before retrying, avoiding MCP timeouts.
- **`finish_reason` detection** — `callDirectLLM()` returns `finish_reason` from LLM API for reliable truncation detection.
- **Token usage exposure** — `sampleLLM` now tracks input/output/budget token counts. Successful and fallback responses include `📊 Token Usage: X in / Y out / Z budget`.
- **`estimateTokens()`** — lightweight char-based heuristic (~1/3.5 chars per token) for budget math. `countTokens()` still uses tiktoken for exact counts.
- **Token budget fine-tuning** — `REASONING_OVERHEAD` env var (default 800). Budget formula: `overhead + inputTokens × 4`, min 2048, max 8192.
- **Structured monitoring/metrics** — `src/lib/metrics.ts` tracks requests, success/fail rates, truncations, retries, sampling errors, parse latency, and average token usage. Metrics snapshot logged on SIGINT/SIGTERM shutdown.
- **User-supplied result schema** — optional `resultSchema` parameter on `solve_problem` validates the `result` field against a simple type-map. Supports nested objects. Mismatches trigger retry.
- **Model-specific prompts** — `getSystemPrompt()` selects tuned system prompts for Claude, GPT-4, Gemini, and Grok based on `MODEL` env.
- **Fallback models** — `FALLBACK_MODELS=gpt-4o,claude-3-5-sonnet` cycles to next model on failure.
- **Direct LLM HTTP client** — `MODE=auto/direct` with `API_KEY` enables OpenAI-compatible direct HTTP calls for MCP clients without sampling support (LMStudio, VS Code extensions, etc.). Works with any OpenAI-compatible provider.
- Comprehensive test suite: 112 tests across parser, tokens, metrics, schema validation, prompts, LLM client, and server integration.
- Extracted library modules: `src/lib/parser.ts`, `src/lib/tokens.ts`, `src/lib/prompts.ts`, `src/lib/metrics.ts`, `src/lib/llm.ts`
- `@slbdn/mcp-tester` integration for MCP server testing
- Jest + ts-jest ESM test runner configuration
- `.npmrc` and `.npmignore` for publish configuration
- 22 example problems including 8 extremely hard CoT stress-tests for under-30B models

### Changed
- `AgenticCotSchema` now rejects `undefined` result values via `z.custom`
- Root `index.js` launcher checks for built `dist/` before delegating
- **`API_KEY` is now optional** for local endpoints (LMStudio, Ollama) — `isDirectModeConfigured()` returns true when `API_BASE_URL` is set or `MODE=direct`
- Truncation handling: **recovery-first, retry-second** — parses truncated JSON instantly before retrying with 1.5x budget to avoid MCP timeouts
- Default **timeout doubled**: 30s → 60s (`TIMEOUT` env var)
- Default **token budget more generous**: `overhead(650) + input×2, min 1024, max 4096` → `overhead(800) + input×4, min 2048, max 8192`
- `computeTokenBudget()` returns `{ budget, inputTokens }` to eliminate duplicate token counting
- Object results and reasoning are formatted with `JSON.stringify()` instead of `[object Object]`
- `callDirectLLM()` omits `Authorization` header when `API_KEY` is empty

## [1.0.0] - 2026-05-05

### Added
- Strict Chain-of-Thought enforcement MCP server with `{reasoning, result}` JSON output
- Multi-layer adaptive parser handling direct JSON, fenced blocks, XML/label heuristics, and brace-balanced nested JSON
- Automatic retry logic with configurable temperature ramping (`BASE_TEMP`, `TEMP_INCREMENT`)
- Token budgeting via `tiktoken` (`cl100k_base`) with character-count fallback
- Zod runtime validation for tool arguments and parsed CoT output
- Per-request rejection memo (no global mutable state)
- Configurable model hinting via `MODEL` environment variable
- Structured logging with `LOG_LEVEL` support (`DEBUG`, `INFO`, `WARN`, `ERROR`)
- TypeScript source (`src/index.ts`) with strict `tsconfig.json` and ESM output to `dist/`
- Root `index.js` launcher with build-check guard
- Standard `.gitignore`, MIT `LICENSE`, `README.md`, and `TODO.md`

### Fixed
- `McpError` constructor now uses correct `(ErrorCode, message)` signature
- Sampling method corrected from `sampling/create` to `sampling/createMessage`
- Response content parsed as single discriminated union object (not array)
- System prompt delivered via dedicated `systemPrompt` param (schema only allows `user`/`assistant` roles)
- Layer 4 parser replaced broken regex with proper brace-balancing scanner

### Removed
- Inert `STREAM` environment flag (Node.js MCP SDK does not support streaming)

[Unreleased]: https://github.com/islobodan/cotforce-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/islobodan/cotforce-mcp/releases/tag/v1.0.0
