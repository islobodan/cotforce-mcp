#!/usr/bin/env node
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "dist", "index.js");

if (!existsSync(distPath)) {
  console.error(
    "[cotforce-mcp] Error: dist/index.js not found. Please run `npm run build` first."
  );
  process.exit(1);
}

await import(distPath);
