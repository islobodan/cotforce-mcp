# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.2] - 2026-05-07

### Fixed
- Direct HTTP fetch timeout: added `AbortSignal.timeout()` with `TIMEOUT` env var (default 120s for direct mode). Slow local models (e.g. Gemma 4B ~82s) no longer cause MCP client timeout.

## [1.1.1] - 2026-05-07

### Changed
- Minimum token budget bumped: 2048 → 4096. Complex reasoning (e.g., SEND+MORE) now fits without truncation.

## [1.1.0] - 2026-05-07

### Added
- **Plugin architecture for parsers** — `CotParser` interface + `ParserPipeline` class. 5 built-in parser plugins. Custom parsers via `addParser()`/`removeParser()`. `COT_PARSERS` env var.
- **CoT result caching** — `CACHE_TTL` (default 1h), `CACHE_MAX_ENTRIES` (default 100). Cache key includes prompt + resultSchema.
- **Structured tool results** — separate content blocks for reasoning, result, and metadata. Host model reads them independently.
- **Multi-session rejection memory** — sliding window of last 10 failures. 8 failure patterns detected. Preemptive `[SESSION MEMORY]` hints.
- **Progress notification streaming** — streams LLM response via `notifications/progress` with `💭` prefix when `progressToken` is set.
- **Multi-turn CoT** — optional `history` parameter on `solve_problem` for iterative reasoning.
- **Output truncation detection** — `isTruncated()` with configurable `TRUNCATION_THRESHOLD`. Recovery-first: parses truncated JSON before retrying.
- **`finish_reason` detection** — `callDirectLLM()` returns `finish_reason` from LLM API.
- **Token usage exposure** — input/output/budget counts in responses.
- **`estimateTokens()`** — lightweight char-based heuristic for budget math. `countTokens()` uses lazy-loaded tiktoken.
- **Token budget fine-tuning** — `REASONING_OVERHEAD` (default 800). Formula: `overhead + inputTokens × 4`, min 2048, max 8192.
- **Metrics + concurrency guard** — tracks requests, success/fail, latency, token avg. `MetricsGuard` for concurrent safety.
- **User-supplied result schema** — optional type-map validation. Mismatch triggers retry.
- **Model-specific prompts** — tuned prompts for Claude, GPT-4, Gemini, Grok + small model prompt (Qwen, Gemma, Llama, Mistral, Phi). Prefix matching for long model names.
- **Fallback models** — `FALLBACK_MODELS` cycles through models on failure.
- **Direct LLM HTTP client** — `MODE=auto/direct` with OpenAI-compatible API. Works with LMStudio, Ollama.
- Comprehensive test suite: **151 tests** (11 suites).
- Extracted library modules: `parser.ts`, `tokens.ts`, `prompts.ts`, `metrics.ts`, `llm.ts`, `cache.ts`, `rejection-memory.ts`
- 22 example problems in `EXAMPLES.md`
- `.mcp.json` for auto-discovery by Cursor, VS Code, Windsurf

### Changed
- `AgenticCotSchema` rejects `undefined` result values
- `API_KEY` **optional** for local endpoints (LMStudio, Ollama)
- Truncation: **recovery-first, retry-second**
- Default **timeout**: 60s, **token budget**: 2048–8192
- `computeTokenBudget()` returns `{ budget, inputTokens }` — no double-counting
- Tool results: **structured blocks** instead of single text blob
- `callDirectLLM()` omits `Authorization` header when `API_KEY` empty
- Error sanitization: `sanitizeErrorText()` redacts API keys
- Error propagation: `Error.cause` preserved in `McpError` wrappers
- Silent catch blocks: replaced with debug logging
- Magic numbers: replaced with named constants

### Fixed
- Section numbering: sequential 1→12
- `MAX_RETRIES` single constant (was: 3 duplicate parses)
- `_tokenCount` → `tokenCount` (param was used, not unused)
- `formatResult` catches `JSON.stringify` errors (circular refs)
- Model prompt matching: prefix fallback for long names like `gemma-4-e4b-it-mlx`

## [1.0.0] - 2026-05-05

### Added
- Strict Chain-of-Thought enforcement with `{reasoning, result}` JSON output
- Multi-layer adaptive parser (4 layers)
- Retry logic with temperature ramping (`BASE_TEMP`, `TEMP_INCREMENT`)
- Token budgeting via `tiktoken` with character-count fallback
- Zod validation for tool args and parsed output
- Per-request rejection memo
- Configurable model hinting via `MODEL` env
- TypeScript source with strict `tsconfig.json`
- Root `index.js` launcher
- `.gitignore`, `LICENSE`, `README.md`, `TODO.md`

### Fixed
- `McpError` constructor signature
- Sampling method: `sampling/create` → `createMessage`
- Response parsing: discriminated union, not array
- System prompt via dedicated `systemPrompt` param
- Layer 4 regex → brace-balancing scanner

### Removed
- Inert `STREAM` flag

[Unreleased]: https://github.com/islobodan/cotforce-mcp/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/islobodan/cotforce-mcp/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/islobodan/cotforce-mcp/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/islobodan/cotforce-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/islobodan/cotforce-mcp/releases/tag/v1.0.0
