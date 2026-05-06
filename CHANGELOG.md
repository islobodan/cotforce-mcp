# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Output truncation detection** — `isTruncated()` in `src/lib/tokens.ts` with configurable `TRUNCATION_THRESHOLD` env var (default 0.95). Detects when LLM responses hit the token budget and retries with a conciseness hint.
- **Token usage exposure** — `sampleLLM` now tracks input/output/budget token counts. Successful and fallback responses include `📊 Token Usage: X in / Y out / Z budget`.
- Comprehensive test suite: 65+ tests across parser, tokens, and server integration
- Extracted library modules: `src/lib/parser.ts`, `src/lib/tokens.ts`, `src/lib/prompts.ts`
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
