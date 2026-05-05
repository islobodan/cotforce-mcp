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

  describe("Tool Discovery", () => {
    it("should list tools", async () => {
      const tools = await client.listTools();
      expect(tools).toHaveTool("solve_problem");
      expect(tools).toHaveToolCount(1);
    });

    it("should have solve_problem with correct schema", async () => {
      const tools = await client.listTools();
      expect(tools).toHaveToolWithSchema("solve_problem");

      const tool = tools.find((t: { name: string }) => t.name === "solve_problem");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Chain-of-Thought");
      expect(tool?.inputSchema).toMatchObject({
        type: "object",
        required: ["prompt"],
        properties: {
          prompt: {
            type: "string",
            description: "The problem to solve.",
          },
        },
      });
    });
  });

  describe("Invalid Arguments", () => {
    it("should reject missing prompt", async () => {
      await expect(
        client.callTool({
          name: "solve_problem",
          arguments: {},
        })
      ).rejects.toThrow();
    });

    it("should reject empty prompt", async () => {
      await expect(
        client.callTool({
          name: "solve_problem",
          arguments: { prompt: "" },
        })
      ).rejects.toThrow();
    });

    it("should reject wrong argument type", async () => {
      await expect(
        client.callTool({
          name: "solve_problem",
          arguments: { prompt: 123 },
        })
      ).rejects.toThrow();
    });

    it("should reject unknown tool", async () => {
      await expect(
        client.callTool({
          name: "nonexistent_tool",
          arguments: { prompt: "test" },
        })
      ).rejects.toThrow();
    });
  });

  describe("Server Lifecycle", () => {
    it("should be connected", () => {
      expect(client.isConnected()).toBe(true);
    });

    it("should reconnect after stop and start", async () => {
      await client.stop();
      expect(client.isConnected()).toBe(false);

      await client.start({
        command: "node",
        args: [serverPath],
      });
      expect(client.isConnected()).toBe(true);

      // Verify it still works after reconnect
      const tools = await client.listTools();
      expect(tools).toHaveTool("solve_problem");
    });
  });

  describe("Concurrent Connections", () => {
    it("should support multiple sequential calls", async () => {
      const results = await Promise.all([
        client.listTools(),
        client.listTools(),
        client.listTools(),
      ]);

      results.forEach((tools) => {
        expect(tools).toHaveTool("solve_problem");
      });
    });
  });
});
