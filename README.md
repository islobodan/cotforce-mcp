```markdown
# CotForce-MCP

> **Strict Chain‑of‑Thought Enforcement MCP Server**  
> Forces LLMs to produce structured `{reasoning, result}` JSON, with adaptive parsing, retry logic, token budgeting (via tiktoken), and configurable model.

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)

---

## 🚀 Features

- **Rigid CoT enforcement** – forces any LLM to output valid JSON `{reasoning, result}` via strict system prompts and few‑shot examples.
- **Adaptive multi‑layer parser** – four fallback layers (direct JSON, fenced blocks, heuristic labels, regex extraction) handle chaotic LLM outputs.
- **Automatic retry with temperature increase** – up to 3 attempts (configurable) with increasing temperature and correction suffixes.
- **Token budgeting with tiktoken** – accurate token counting using OpenAI's `cl100k_base` encoding, with fallback to character heuristic.
- **Configurable model** – set `MODEL` environment variable to hint a specific model; leave unset for host default.
- **Structured logging** – timestamped, level‑filtered logs to stderr (supports `LOG_LEVEL`).
- **Rejection memory** – stores recent failures to adapt prompts and improve compliance over time.
- **Full MCP compliance** – implements `tools/list`, `tools/call`, and `sampling/createMessage`.

---

## 📦 Installation

```bash
npm install cotforce-mcp
# or
git clone https://github.com/islobodan/cotforce-mcp
cd cotforce-mcp
npm install
```

## 🔧 Configuration

The server is configured via environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL` | *(not set)* | Model name hint (e.g. `claude-3-5-sonnet`, `gpt-4o`). If empty, no hint sent – MCP host decides. |
| `MAX_RETRIES` | `2` | Number of retry attempts before returning raw output. |
| `BASE_TEMP` | `0.1` | Initial sampling temperature. |
| `TEMP_INCREMENT` | `0.2` | Temperature added per retry attempt. |
| `TIMEOUT` | `30000` | Sampling timeout in ms. |
| `LOG_LEVEL` | `INFO` | One of `DEBUG`, `INFO`, `WARN`, `ERROR`. |

### Example

```bash
MODEL=gpt-4o MAX_RETRIES=3 BASE_TEMP=0.2 TEMP_INCREMENT=0.15 LOG_LEVEL=DEBUG npx cotforce-mcp
```

> **Note:** `STREAM` has been removed — the Node.js MCP SDK does not support token-by-token streaming responses.

## 🧪 Usage

### As an MCP Tool

Add to your MCP client configuration (e.g. Claude Desktop, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cotforce": {
      "command": "node",
      "args": ["/path/to/cotforce-mcp/dist/index.js"],
      "env": {
        "MODEL": "claude-3-5-sonnet",
        "MAX_RETRIES": "2"
      }
    }
  }
}
```

### Call the Tool

```json
{
  "name": "solve_problem",
  "arguments": {
    "prompt": "What is 7 * 8 + 2?"
  }
}
```

### Example Response

```json
{
  "content": [{
    "type": "text",
    "text": "🤖 Agentic CoT Result:\n\n**Reasoning:** Step 1: Multiply 7 * 8 = 56. Step 2: Add 2 to get 58.\n\n**Answer:** 58"
  }]
}
```

If parsing fails after all retries, the server returns the raw LLM output with a warning.

---

## 📚 API

### Tool: `solve_problem`

- **Input**: `{ prompt: string }` – the problem to solve.
- **Output**: either:
  - **Success** – structured CoT result.
  - **Soft failure** – raw LLM output if parsing fails after all retries.

### Sampling Internals

Uses MCP native `sampling/createMessage` to call the configured LLM. The system prompt includes few‑shot examples and a strict schema constraint.

---

## 🧠 How It Works

1. **System prompt** enforces JSON output with `reasoning` and `result`.
2. **Multi‑layer parser** attempts to extract valid JSON from the raw response (even if wrapped in markdown, XML tags, or labels).
3. **Retry logic** – if parsing fails, the server injects a correction suffix and increases temperature, then tries again.
4. **Rejection memory** stores a snippet of the last failure to contextualise the next call.
5. **Token budgeting** uses `tiktoken` to estimate input tokens and sets `maxTokens` dynamically (capped between 1024 and 4096).

---

## 🛠️ Development

```bash
git clone <repo>
cd cotforce-mcp
npm install
npm run build      # compile TypeScript to dist/
npm run dev        # tsc --watch
npm test           # jest + @slbdn/mcp-tester integration tests
npm run test:smoke # quick smoke test via mcp-tester CLI
npm run test:tools # list available tools via mcp-tester CLI
```

### Build
TypeScript source lives in `src/index.ts` and compiles to `dist/index.js`. Run `npm run build` before starting.

### Testing
Uses [`@slbdn/mcp-tester`](https://www.npmjs.com/package/@slbdn/mcp-tester) for automated MCP server testing. Includes Jest matchers (`toHaveTool`, `toReturnTextContaining`, etc.) and a CLI for quick smoke tests.

---

## ⚠️ Limitations & Honest Assessment


- **No true production monitoring** – only structured logs; no aggregated metrics.
- **Token budget formula is heuristic** – may need tuning for very verbose models.
- **Model hints are suggestions** – the MCP host decides which model to use.
- See [TODO list](TODO.md) for planned improvements.

---

## 📄 License

MIT © Slobodan Ivkovic

---

## ⭐ Support

If you find CotForce-MCP useful, consider starring the repo and sharing your feedback!
```
