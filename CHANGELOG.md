# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Output truncation detection** — `isTruncated()` in `src/lib/tokens.ts` with configurable `TRUNCATION_THRESHOLD` env var (default 0.95). Detects when LLM responses hit the token budget and retries with a conciseness hint.
- **Token usage exposure** — `sampleLLM` now tracks input/output/budget token counts. Successful and fallback responses include `📊 Token Usage: X in / Y out / Z budget`.
- **Token budget fine-tuning** — `REASONING_OVERHEAD` env var allows tuning the fixed overhead in budget computation (default 650).
- **Structured monitoring/metrics** — `src/lib/metrics.ts` tracks requests, success/fail rates, truncations, retries, sampling errors, parse latency, and average token usage. Metrics snapshot logged on SIGINT/SIGTERM shutdown.
- **User-supplied result schema** — optional `resultSchema` parameter on `solve_problem` validates the `result` field against a simple type-map (`{ key: "string" | "number" | "boolean" | "object" }`). Supports nested objects. Mismatches trigger retry.
- **Model-specific prompts** — `getSystemPrompt()` selects tuned system prompts for Claude, GPT-4, Gemini, and Grok based on `MODEL` env. Falls back to default for unknown models.
- **Fallback models** — `FALLBACK_MODELS=gpt-4o,claude-3-5-sonnet` cycles to next model on failure. Each model gets `MAX_RETRIES+1` attempts.
- **Direct LLM HTTP client** — `MODE=auto/direct` with `API_KEY` enables OpenAI-compatible direct HTTP calls for MCP clients without sampling support (LMStudio, VS Code extensions, etc.). Supports any OpenAI-compatible provider.
- Comprehensive test suite: 95+ tests across parser, tokens, metrics, schema validation, prompts, LLM client, and server integration
- Extracted library modules: `src/lib/parser.ts`, `src/lib/tokens.ts`, `src/lib/prompts.ts`, `src/lib/metrics.ts`
- `@slbdn/mcp-tester` integration for MCP server testing
- Jest + ts-jest ESM test runner configuration
- `.npmrc` and `.npmignore` for publish configuration

### Changed
- `AgenticCotSchema` now rejects `undefined` result values via `z.custom`
- Root `index.js` launcher checks for built `dist/` before delegating

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
