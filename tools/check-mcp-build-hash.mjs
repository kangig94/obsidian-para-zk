#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const bundlePath = "clients/para-zk-mcp.mjs";
const hashPath = `${bundlePath}.sha256`;

const expected = readFileSync(hashPath, "utf8").trim().split(/\s+/)[0]?.toLowerCase();
const actual = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");

if (!expected || expected !== actual) {
  console.error("MCP bundle hash mismatch.");
  console.error(`expected: ${expected || "(missing)"}`);
  console.error(`actual:   ${actual}`);
  console.error("Run `pnpm run build` and commit the regenerated MCP bundle/hash.");
  process.exit(1);
}

console.log(`MCP bundle hash ok: ${actual}`);
