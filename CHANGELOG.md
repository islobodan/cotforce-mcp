# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
