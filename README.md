# CotForce-MCP

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> **"Give brains to your small models."**  
> CotForce enforces step-by-step Chain-of-Thought, turning 4B parameter models into methodical reasoners.

---

### Why this exists

A **4-billion-parameter Gemma** cannot solve SEND + MORE = MONEY. It's a classic cryptarithmetic puzzle — 8 unique digits, 5 columns, 4 carry values. A bare 4B model guesses randomly. It hallucinates digits. It loses track of carries after column 2.

**The same model, with CotForce:**

```
Step 1: Analyze the leftmost column. S+M+C3 = MO. Max sum is 19998. ∴ M=1.
Step 2: S+1+C3 = 10+O. With M=1 and carry, O must be 0.
Step 3: D+E = Y+10C1 → C1=1. Now R+C1=9 → C1=0→R=9 (used), C1=1→R=8.
...
Step 11: All digits assigned. 9567 + 1085 = 10652. Verified.
```

**11 structured reasoning steps. Zero hallucinations. Correct answer.**

CotForce doesn't make small models smarter. It forces them to **think before they speak** — which is often all they need.

---

### ⚡ Two modes — one line of config

CotForce uses the **MCP sampling protocol** (`sampling/createMessage`) to call LLMs. If your client supports it (Claude Desktop, Cursor), nothing extra is needed.

If not — or if you're using a **local model** like Gemma via LMStudio — switch to direct HTTP mode:

```json
{
  "mcpServers": {
    "cotforce": {
      "command": "node",
      "args": ["node_modules/@slbdn/cotforce-mcp/index.js"],
      "env": {
        "MODE": "direct",
        "API_BASE_URL": "http://localhost:1234/v1",
        "MODEL": "gemma-4-e4b-it-mlx"
      }
    }
  }
}
```

That's it. The same 4B Gemma that couldn't solve SEND+MORE=MONEY above — now with CotForce, working locally through LMStudio.

---

## 🚀 Features

- **Rigid CoT enforcement** — forces any LLM to output valid JSON `{reasoning, result}` via strict system prompts and few‑shot examples.
- **Adaptive multi‑layer parser** — plug-in architecture with 5 built-in parsers (direct JSON, fenced blocks, XML/labels, brace-balanced, truncated recovery) in a priority-sorted pipeline. Add custom parsers via `CotParser` interface. Select parsers via `COT_PARSERS` env var.
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
- **Comprehensive test suite** — 133 tests covering parser pipeline, token budgeting, metrics, schema validation, retry loop, progress notifications, caching, and MCP server integration.

---

## 📦 Installation

```bash
npm install @slbdn/cotforce-mcp
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
| `TIMEOUT` | `60000` | Sampling timeout in ms. |
| `CACHE_TTL` | `3600000` | Result cache TTL in ms (default 1 hour). Set to `0` to disable. |
| `CACHE_MAX_ENTRIES` | `100` | Maximum cached results before evicting oldest. |
| `COT_PARSERS` | *(all)* | Comma-separated parser names to use (e.g., `direct-json,fenced-block`). Skips others. |
| `TRUNCATION_THRESHOLD` | `0.95` | Ratio of output/budget that triggers truncation detection. Attempts truncated JSON recovery first, then retries with 1.5x budget. |
| `REASONING_OVERHEAD` | `800` | Fixed token overhead added to the budget formula. Increase for verbose models. |
| `FALLBACK_MODELS` | *(not set)* | Comma-separated list of fallback models (e.g. `gpt-4o,claude-3-5-sonnet`). Cycled on failure. |
| `MODE` | `auto` | `auto`, `sampling`, or `direct`. `auto` uses direct HTTP when `API_KEY` is set and client lacks sampling support. |
| `API_KEY` | *(not set)* | LLM API key for direct HTTP mode. Optional for local endpoints (LMStudio, Ollama). Required for remote providers (OpenAI, Anthropic, etc.). |
| `API_BASE_URL` | `https://api.openai.com` | Base URL for direct HTTP mode. Change for LMStudio (`http://localhost:1234/v1`) or other providers. |
| `LOG_LEVEL` | `INFO` | One of `DEBUG`, `INFO`, `WARN`, `ERROR`. |

### Example

```bash
MODEL=gpt-4o MAX_RETRIES=3 BASE_TEMP=0.2 TEMP_INCREMENT=0.15 LOG_LEVEL=DEBUG npx @slbdn/cotforce-mcp
```

---

## 🧪 Usage

### As an MCP Tool

Add to your MCP client configuration. A `.mcp.json` file is included in the package for auto-discovery by clients like Cursor, VS Code, and Windsurf. Copy the relevant config below to your client's settings:

**With MCP sampling** (Claude Desktop):

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
        "API_BASE_URL": "http://localhost:1234/v1",
        "MODEL": "local-model",
        "MAX_RETRIES": "2"
      }
    }
  }
}
```

> **Note:** `API_KEY` is optional for local endpoints like LMStudio or Ollama. It is required for remote providers like OpenAI or Anthropic.

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
    "text": "🤖 Agentic CoT Result:\n\n**Reasoning:** Step 1: Multiply 7 * 8 = 56. Step 2: Add 2 to get 58.\n\n**Answer:** 58\n\n📊 Token Usage: 42 in / 150 out / 2048 budget"
  }]
}
```

If parsing fails after all retries, the server returns the raw LLM output with a warning.

---
## 🧩 Custom Parsers

The parser is a priority-sorted pipeline of plugins. Five built-in parsers run in order:

| Priority | Name | What it does |
|----------|------|-------------|
| 10 | `direct-json` | Parses whole output as JSON (strips ` ```json` fences) |
| 20 | `fenced-block` | Extracts JSON from markdown code blocks |
| 30 | `heuristic` | Looks for `<reasoning>`/`<result>` XML tags or `Reasoning:`/`Result:` labels |
| 40 | `brace-balanced` | Finds first balanced `{}` in arbitrary text |
| 50 | `truncated-recovery` | Salvages reasoning from truncated JSON (hit token limit) |

**Filter parsers via `COT_PARSERS` env var:**
```bash
COT_PARSERS=direct-json,fenced-block node index.js
```

**Write a custom parser:**
```ts
import { CotParser, AgenticCotSchema } from "@slbdn/cotforce-mcp";

class YamlParser implements CotParser {
  name = "yaml";
  priority = 35; // runs after heuristic, before brace-balanced

  parse(raw: string): { reasoning: string; result: unknown } | null {
    // Custom YAML parsing logic here
    return null; // return null if this output isn't YAML
  }
}
```

Then register it programmatically:
```ts
import { defaultParserPipeline, ParserPipeline } from "@slbdn/cotforce-mcp";
const pipeline = defaultParserPipeline();
pipeline.addParser(new YamlParser());
const result = pipeline.parse(rawText);
```

---

## 📚 API

### Tool: `solve_problem`

- **Input**: `{ prompt: string }` — the problem to solve.
- **Output**: either:
  - **Success** — structured CoT result.
  - **Soft failure** — raw LLM output if parsing fails after all retries.

### Sampling / LLM Calling

CotForce supports **two modes** for calling the LLM:

**MCP Sampling** (default with compatible clients):
- Uses MCP native `sampling/createMessage`
- Client selects and calls the model
- Requires client support (Claude Desktop, etc.)

**Direct HTTP** (for clients without sampling support):
- Calls OpenAI-compatible `/v1/chat/completions` directly
- Works with OpenAI, LMStudio, Ollama, and any compatible provider
- Activated automatically in `MODE=auto` when `API_KEY` is set and client lacks sampling
- Or force with `MODE=direct`

Both modes use the same system prompt with few‑shot examples and strict schema constraints.

---

## 🏗️ Architecture

```
cotforce-mcp/
├── src/
│   ├── index.ts           # MCP server, tool handlers, routing logic
│   └── lib/
│       ├── parser.ts      # Parser pipeline: CotParser interface + 5 plugin parsers + Zod schemas
│       ├── tokens.ts      # tiktoken integration + budget computation
│       ├── prompts.ts     # Model-specific system prompts
│       ├── metrics.ts     # In-memory request/performance counters
│       └── llm.ts         # Direct HTTP LLM client (OpenAI-compatible)
├── tests/
│   ├── cache.test.ts      # 10 unit tests for result caching
│   ├── parser.test.ts     # 47 unit tests for parser layers
│   ├── tokens.test.ts     # 23 unit tests for token budgeting
│   ├── schema.test.ts     # 8 unit tests for result schema validation
│   ├── metrics.test.ts    # 9 unit tests for metrics tracking
│   ├── prompts.test.ts    # 12 unit tests for model-specific prompts
│   ├── llm.test.ts        # 6 tests for direct mode detection
│   ├── retry.test.ts      # 4 integration tests for retry loop
│   ├── progress.test.ts   # 5 unit tests for progress notifications
│   └── server.test.ts     # 9 integration tests via @slbdn/mcp-tester
├── index.js               # Root launcher (delegates to dist/)
├── dist/                  # Compiled TypeScript output
└── package.json
```

---

## 🧠 How It Works

1. **System prompt** enforces JSON output with `reasoning` and `result`. Model-specific variants tuned for Claude, GPT-4, Gemini, Grok.
2. **Parser pipeline** runs 5 built-in parsers in priority order (direct JSON, fenced blocks, XML/labels, brace-balanced, truncated recovery). First valid match wins. Custom parsers can be added via `COT_PARSERS` env var and the `CotParser` interface.
3. **Retry logic** — if parsing fails, injects correction suffix and increases temperature. Supports fallback models (`FALLBACK_MODELS`) when primary model refuses.
4. **Rejection memory** stores a snippet of the last failure to contextualise the next call (scoped per‑request, thread‑safe).
5. **Token budgeting** uses `estimateTokens()` (lightweight heuristic) for budget math and `countTokens()` (tiktoken) for exact counts. Sets `maxTokens` dynamically (between 2048 and 8192) via formula `overhead + inputTokens × 4`. Detects truncation via `finish_reason: "length"` and attempts JSON recovery before retrying.

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
| `npm test` | Run full Jest test suite (133 tests) |
| `npm run test:smoke` | Quick smoke test via `mcp-tester` CLI |
| `npm run test:tools` | List available tools via `mcp-tester` CLI |

### Testing

The test suite uses **Jest** with **ts-jest** (ESM) and **`@slbdn/mcp-tester`** for MCP server integration testing:

- **Parser tests** (`tests/parser.test.ts`) — 47 unit tests covering all 5 parser plugins, edge cases, and `AgenticCotSchema` validation.
- **Token tests** (`tests/tokens.test.ts`) — 16 unit tests for `tiktoken` integration, budget computation, and `REASONING_OVERHEAD` tuning.
- **Schema tests** (`tests/schema.test.ts`) — 8 unit tests for user-supplied `resultSchema` validation.
- **Metrics tests** (`tests/metrics.test.ts`) — 9 unit tests for request counters, latency tracking, and token usage averages.
- **Prompt tests** (`tests/prompts.test.ts`) — 10 unit tests for model-specific prompt selection.
- **LLM tests** (`tests/llm.test.ts`) — 3 unit tests for direct HTTP mode detection.
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
