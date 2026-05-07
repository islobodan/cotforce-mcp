import { MCPClient, setupJestMatchers } from "@slbdn/mcp-tester";
import { AddressInfo } from "net";
import http from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "index.js");

/**
 * Mock HTTP server that returns controlled LLM responses per call count.
 */
function createMockLLMServer(
  responses: Array<{
    status?: number;
    body: string;
    finishReason?: string;
  }>
): { port: number; close: () => void; callCount: () => number } {
  let callCount = 0;
  const server = http.createServer((req, res) => {
    // Collect body for validation
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));

    req.on("end", () => {
      const idx = Math.min(callCount, responses.length - 1);
      const resp = responses[idx];
      callCount++;

      // Parse the model from the request
      const parsed = JSON.parse(body);
      const model = parsed.model || "test-model";
      const promptTokens = body.length / 3.5;

      res.writeHead(resp.status || 200, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          id: "cmpl-test",
          object: "chat.completion",
          created: Date.now(),
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: resp.body },
              finish_reason: resp.finishReason || "stop",
              logprobs: null,
            },
          ],
          usage: {
            prompt_tokens: Math.ceil(promptTokens),
            completion_tokens: Math.ceil(resp.body.length / 3.5),
            total_tokens: Math.ceil(promptTokens + resp.body.length / 3.5),
          },
        })
      );
    });
  });

  server.listen(0); // random port
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => server.close(),
    callCount: () => callCount,
  };
}

describe("Retry Loop Integration", () => {
  let client: MCPClient;
  let mockServer: ReturnType<typeof createMockLLMServer>;

  /** Extract text content from MCP tool result, handling discriminated union. */
  function getText(result: { content: Array<{ type: string; text?: string }> }): string {
    return result.content[0]?.text ?? "";
  }

  beforeAll(() => {
    setupJestMatchers();
  });

  afterEach(async () => {
    if (client?.isConnected()) {
      await client.stop();
    }
    if (mockServer) {
      mockServer.close();
    }
  });

  async function startClient(envOverrides: Record<string, string>) {
    client = new MCPClient({
      name: "cotforce-test-client",
      version: "1.0.0",
    });
    await client.start({
      command: "node",
      args: [serverPath],
      env: {
        ...process.env as Record<string, string>,
        MODE: "direct",
        MAX_RETRIES: "2",
        API_KEY: "test-key",
        ...envOverrides,
      },
    });
  }

  describe("Parse failures exhaust retries", () => {
    it("returns fallback when all retries return non-JSON", async () => {
      mockServer = createMockLLMServer([
        { body: "I think the answer is 42." },
        { body: "The answer is definitely 42." },
        { body: "I'm sure it's 42." },
      ]);

      await startClient({
        API_BASE_URL: `http://localhost:${mockServer.port}/v1`,
        MODEL: "test-model",
      });

      const result = await client.callTool({
        name: "solve_problem",
        arguments: { prompt: "What is 6 * 7?" },
      });

      // Should return a fallback since all attempts returned non-JSON
      expect(result.content).toBeDefined();
      const text = getText(result);
      expect(text).toContain("could not be parsed");
      expect(text).toContain("42");
      expect(mockServer.callCount()).toBe(3); // MAX_RETRIES + 1
    });
  });

  describe("Truncated recovery", () => {
    it("recovers reasoning from truncated JSON", async () => {
      mockServer = createMockLLMServer([
        {
          body: '{"reasoning": "Step 1: 6 * 7 = 42. Step 2: The answer is 42.',
          finishReason: "length",
        },
      ]);

      await startClient({
        API_BASE_URL: `http://localhost:${mockServer.port}/v1`,
        MODEL: "test-model",
      });

      const result = await client.callTool({
        name: "solve_problem",
        arguments: { prompt: "What is 6 * 7?" },
      });

      // Should recover from truncated response without retrying
      const text = getText(result);
      expect(text).toContain("6 * 7");
      expect(text).toContain("[Response truncated]");
      expect(mockServer.callCount()).toBe(1); // No retry needed
    });
  });

  describe("Schema mismatch triggers retry", () => {
    it("retries when result does not match schema", async () => {
      mockServer = createMockLLMServer([
        {
          // First: result is a string, not an object with "value" key
          body: '{"reasoning": "I calculated it.", "result": "42"}',
        },
        {
          // Second: correct structure { value: 42 }
          body: '{"reasoning": "Step 1: 6 * 7 = 42.", "result": {"value": 42}}',
        },
      ]);

      await startClient({
        API_BASE_URL: `http://localhost:${mockServer.port}/v1`,
        MODEL: "test-model",
      });

      const result = await client.callTool({
        name: "solve_problem",
        arguments: {
          prompt: "What is 6 * 7?",
          resultSchema: { value: "number" },
        },
      });

      // First attempt returns { result: "42" } which doesn't have { value: number }
      // so schema validation fails and retries
      // Second attempt should succeed
      const text = getText(result);
      expect(text).toContain("Step 1: 6 * 7 = 42.");
      expect(mockServer.callCount()).toBe(2);
    });
  });

  describe("Fallback model switching", () => {
    it("switches model after exhausting retries on primary", async () => {
      mockServer = createMockLLMServer([
        // Primary: 3 attempts all fail
        { body: "I think it's 42." },
        { body: "The answer is 42." },
        { body: "Definitely 42." },
        // Fallback-1: 3 attempts all fail too
        { body: "Hmm, 42 perhaps." },
        { body: "I'd say 42." },
        { body: "It's 42." },
      ]);

      await startClient({
        API_BASE_URL: `http://localhost:${mockServer.port}/v1`,
        MODEL: "primary-model",
        FALLBACK_MODELS: "fallback-model",
      });

      const result = await client.callTool({
        name: "solve_problem",
        arguments: { prompt: "What is 6 * 7?" },
      });

      // Should try primary (3 attempts) + fallback (3 attempts) = 6 calls
      const text = getText(result);
      expect(text).toContain("could not be parsed");
      expect(mockServer.callCount()).toBe(6);
    });
  });
});
