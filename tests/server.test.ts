import { MCPClient, setupJestMatchers } from "@slbdn/mcp-tester";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "index.js");

describe("CotForce-MCP Server", () => {
  let client: MCPClient;

  beforeAll(async () => {
    setupJestMatchers();
    client = new MCPClient({
      name: "cotforce-test-client",
      version: "1.0.0",
    });
    await client.start({
      command: "node",
      args: [serverPath],
    });
  });

  afterAll(async () => {
    if (client.isConnected()) {
      await client.stop();
    }
  });

  it("should list tools", async () => {
    const tools = await client.listTools();
    expect(tools).toHaveTool("solve_problem");
    expect(tools).toHaveToolCount(1);
  });

  it("should call solve_problem and return structured result", async () => {
    const result = await client.callTool({
      name: "solve_problem",
      arguments: { prompt: "What is 7 * 8 + 2?" },
    });

    expect(result).toReturnTextContaining("Reasoning:");
    expect(result).toReturnTextContaining("Answer:");
  });

  it("should reject invalid arguments", async () => {
    await expect(
      client.callTool({
        name: "solve_problem",
        arguments: {},
      })
    ).rejects.toThrow();
  });
});
