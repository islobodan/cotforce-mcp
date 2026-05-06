import { MCPClient } from "@slbdn/mcp-tester";

async function main(): Promise<void> {
  const client = new MCPClient({
    name: "cotforce-example",
    version: "1.0.0",
  });

  await client.start({
    command: "node",
    args: ["../index.js"],
    env: {
      MODEL: "gpt-4o",
      LOG_LEVEL: "INFO",
    },
  });

  // Example 1: Simple math
  const math = await client.callTool({
    name: "solve_problem",
    arguments: { prompt: "What is 7 * 8 + 2?" },
  });
  console.log("=== Math ===");
  console.log(math.content[0].text);

  // Example 2: With schema validation
  const primes = await client.callTool({
    name: "solve_problem",
    arguments: {
      prompt: "List all prime numbers between 10 and 20",
      resultSchema: {
        primes: "object",
        count: "number",
      },
    },
  });
  console.log("\n=== Primes with Schema ===");
  console.log(primes.content[0].text);

  // Example 3: Logic puzzle
  const puzzle = await client.callTool({
    name: "solve_problem",
    arguments: {
      prompt:
        "Three boxes are labeled 'Apples', 'Oranges', and 'Mixed'. All labels are wrong. You can pick one fruit from one box. How do you correctly relabel all boxes?",
    },
  });
  console.log("\n=== Logic Puzzle ===");
  console.log(puzzle.content[0].text);

  await client.stop();
}

main().catch(console.error);
