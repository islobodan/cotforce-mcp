# CotForce-MCP

> **Strict Chain‑of‑Thought Enforcement MCP Server**  
> Forces LLMs to produce structured `{reasoning, result}` JSON, with adaptive parsing, retry logic, token budgeting (via tiktoken), and configurable model.

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)

---

## 🚀 Features

- **Rigid CoT enforcement** — forces any LLM to output valid JSON `{reasoning, result}` via strict system prompts and few‑shot examples.
- **Adaptive multi‑layer parser** — four fallback layers handle chaotic LLM outputs:
  1. Direct JSON (with code‑fence stripping)
  2. JSON inside markdown fenced blocks
  3. XML / heuristic label extraction (`<reasoning>`, `Reasoning:`)
  4. Brace‑balancing scanner for nested JSON objects
- **Zod runtime validation** — validates tool arguments and parsed CoT output with strict schemas.
- **Automatic retry with temperature increase** — up to 3 attempts (configurable) with increasing temperature and correction suffixes.
- **Per‑request rejection memo** — no global mutable state; safe under concurrent tool calls.
- **Token budgeting with tiktoken** — accurate token counting using OpenAI's `cl100k_base` encoding, with fallback to character heuristic. Tweak via `REASONING_OVERHEAD`.
- **Configurable model** — set `MODEL` environment variable to hint a specific model; leave unset for host default.
- **Model-specific prompts** — automatically selects tuned system prompts for Claude, GPT-4, Gemini, and Grok based on `MODEL`.
- **Universal compatibility** — works with MCP sampling (Claude Desktop) **or** direct LLM HTTP calls (OpenAI, LMStudio, Ollama, any OpenAI-compatible API). Set `API_KEY` to use direct mode.
- **Structured logging** — timestamped, level‑filtered logs to stderr (supports `LOG_LEVEL`).
- **Output truncation detection** — detects when the LLM response hits the token limit and retries with a conciseness hint (`TRUNCATION_THRESHOLD`).
- **Token usage exposure** — every response includes input / output / budget token counts so callers can optimize.
- **User-supplied result schema** — optional `resultSchema` parameter validates the `result` field type‑map; mismatches trigger retry.
- **Structured metrics** — in-memory counters for requests, success/fail rates, truncations, retries, latency, and token usage. Logged on shutdown.
- **Comprehensive test suite** — 80+ tests covering parser layers, token budgeting, metrics, schema validation, and MCP server integration.

---

## 📦 Installation

```bash
npm install cotforce-mcp
# or
git clone https://github.com/islobodan/cotforce-mcp
cd cotforce-mcp
npm install
npm run build
```

Requires **Node.js ≥ 18**.

---

## 🔧 Configuration

The server is configured via environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL` | *(not set)* | Model name hint (e.g. `claude-3-5-sonnet`, `gpt-4o`). If empty, no hint sent – MCP host decides. |
| `MAX_RETRIES` | `2` | Number of retry attempts before returning raw output. |
| `BASE_TEMP` | `0.1` | Initial sampling temperature. |
| `TEMP_INCREMENT` | `0.2` | Temperature added per retry attempt. |
| `TIMEOUT` | `30000` | Sampling timeout in ms. |
| `TRUNCATION_THRESHOLD` | `0.95` | Ratio of output/budget that triggers truncation warning and conciseness retry. |
| `REASONING_OVERHEAD` | `650` | Fixed token overhead added to the budget formula. Increase for verbose models. |
| `FALLBACK_MODELS` | *(not set)* | Comma-separated list of fallback models (e.g. `gpt-4o,claude-3-5-sonnet`). Cycled on failure. |
| `MODE` | `auto` | `auto`, `sampling`, or `direct`. `auto` uses direct HTTP when `API_KEY` is set and client lacks sampling support. |
| `API_KEY` | *(not set)* | LLM API key for direct HTTP mode. Enables OpenAI-compatible providers (OpenAI, LMStudio, Ollama, etc.). |
| `API_BASE_URL` | `https://api.openai.com` | Base URL for direct HTTP mode. Change for LMStudio (`http://localhost:1234/v1`) or other providers. |
| `LOG_LEVEL` | `INFO` | One of `DEBUG`, `INFO`, `WARN`, `ERROR`. |

### Example

```bash
MODEL=gpt-4o MAX_RETRIES=3 BASE_TEMP=0.2 TEMP_INCREMENT=0.15 LOG_LEVEL=DEBUG npx cotforce-mcp
```

---

## 🧪 Usage

### As an MCP Tool

Add to your MCP client configuration (e.g. Claude Desktop, `claude_desktop_config.json`):

**With MCP sampling** (Claude Desktop):
```json
{
  "mcpServers": {
    "cotforce": {
      "command": "node",
      "args": ["/path/to/cotforce-mcp/index.js"],
      "env": {
        "MODEL": "claude-3-5-sonnet",
        "MAX_RETRIES": "2"
      }
    }
  }
}
```

**With direct LLM HTTP** (LMStudio, OpenAI, Ollama):
```json
{
  "mcpServers": {
    "cotforce": {
      "command": "node",
      "args": ["/path/to/cotforce-mcp/index.js"],
      "env": {
        "MODE": "direct",
        "API_KEY": "your-api-key",
        "API_BASE_URL": "http://localhost:1234/v1",
        "MODEL": "local-model",
        "MAX_RETRIES": "2"
      }
    }
  }
}
```

> The root `index.js` is a launcher that delegates to `dist/index.js`. It guards against missing builds with a helpful error message.

### Call the Tool

```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "What is 7 * 8 + 2?"
  }
}
```

### With Result Schema Validation

```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "List the prime numbers between 10 and 20",
    "resultSchema": {
      "primes": "object",
      "count": "number"
    }
  }
}
```

If the `result` field doesn't match the schema, the server retries with a correction hint.

### More Examples

See [EXAMPLES.md](EXAMPLES.md) for 16 diverse examples including:
- Logic puzzles, probability, word problems
- Code analysis, regex, SQL queries
- Creative writing, recipe adaptation
- Nested JSON with schema validation
- Usage with different models and fallbacks

### Example Response

```json
{
  "content": [{
    "type": "text",
    "text": "🤖 Agentic CoT Result:\n\n**Reasoning:** Step 1: Multiply 7 * 8 = 56. Step 2: Add 2 to get 58.\n\n**Answer:** 58\n\n📊 Token Usage: 42 in / 150 out / 1024 budget"
  }]
}
```

If parsing fails after all retries, the server returns the raw LLM output with a warning.

---

## 📚 API

### Tool: `solve_problem`

- **Input**: `{ prompt: string }` — the problem to solve.
- **Output**: either:
  - **Success** — structured CoT result.
  - **Soft failure** — raw LLM output if parsing fails after all retries.

### Sampling Internals

Uses MCP native `sampling/createMessage` to call the configured LLM. The system prompt includes few‑shot examples and a strict schema constraint.

---

## 🏗️ Architecture

```
cotforce-mcp/
├── src/
│   ├── index.ts           # MCP server, tool handlers, sampling logic
│   └── lib/
│       ├── parser.ts      # Multi-layer CoT parser + Zod schemas
│       ├── tokens.ts      # tiktoken integration + budget computation
│       └── prompts.ts     # System prompt + correction suffix templates
├── tests/
│   ├── parser.test.ts     # 50 unit tests for parser layers
│   ├── tokens.test.ts     # 16 unit tests for token budgeting
│   └── server.test.ts     # 11 integration tests via @slbdn/mcp-tester
├── index.js               # Root launcher (delegates to dist/)
├── dist/                  # Compiled TypeScript output
└── package.json
```

---

## 🧠 How It Works

1. **System prompt** enforces JSON output with `reasoning` and `result`.
2. **Multi‑layer parser** attempts to extract valid JSON from the raw response (even if wrapped in markdown, XML tags, or labels).
3. **Retry logic** — if parsing fails, the server injects a correction suffix and increases temperature, then tries again.
4. **Rejection memory** stores a snippet of the last failure to contextualise the next call (scoped per‑request, thread‑safe).
5. **Token budgeting** uses `tiktoken` to estimate input tokens and sets `maxTokens` dynamically (capped between 1024 and 4096).

---

## 🛠️ Development

```bash
git clone https://github.com/islobodan/cotforce-mcp
cd cotforce-mcp
npm install
npm run build      # compile TypeScript to dist/
npm run dev        # tsc --watch
npm run typecheck  # type-check src/ and tests/
```

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript (`src/` → `dist/`) |
| `npm run dev` | Watch mode compilation |
| `npm run typecheck` | TypeScript type-checking for source and tests |
| `npm test` | Run full Jest test suite (65+ tests) |
| `npm run test:smoke` | Quick smoke test via `mcp-tester` CLI |
| `npm run test:tools` | List available tools via `mcp-tester` CLI |

### Testing

The test suite uses **Jest** with **ts-jest** (ESM) and **`@slbdn/mcp-tester`** for MCP server integration testing:

- **Parser tests** (`tests/parser.test.ts`) — 50 unit tests covering all 4 parser layers, edge cases, and `AgenticCotSchema` validation.
- **Token tests** (`tests/tokens.test.ts`) — 16 unit tests for `tiktoken` integration, budget computation, and encoding lifecycle.
- **Server tests** (`tests/server.test.ts`) — 11 integration tests for tool discovery, argument validation, server lifecycle, and concurrent calls.

Custom Jest matchers are available via `@slbdn/mcp-tester`:

```typescript
expect(tools).toHaveTool("solve_problem");
expect(tools).toHaveToolWithSchema("solve_problem");
expect(result).toReturnTextContaining("Reasoning:");
```

---

## ⚠️ Limitations & Honest Assessment

- **No true production monitoring** — only structured logs; no aggregated metrics.
- **Token budget formula is heuristic** — may need tuning for very verbose models.
- **Model hints are suggestions** — the MCP host decides which model to use.
- See [TODO list](TODO.md) for planned improvements.

---

## 📄 License

MIT © Slobodan Ivkovic

---

## ⭐ Support

If you find CotForce-MCP useful, consider starring the repo and sharing your feedback!
