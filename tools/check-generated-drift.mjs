#!/usr/bin/env node
import { execFileSync } from "node:child_process";

// .claude-plugin/marketplace.json is intentionally absent: only `build:release` advances
// its immutable tag ref. Normal CI builds must not rewrite or require a pending release pin.
const generatedFiles = [
  "manifest.json",
  "versions.json",
  "clients/.claude-plugin/plugin.json",
  "clients/.codex-plugin/plugin.json",
  "clients/para-zk-mcp.mjs",
  "clients/para-zk-mcp.mjs.sha256"
];

const output = execFileSync("git", ["status", "--porcelain", "--", ...generatedFiles], {
  encoding: "utf8"
}).trim();
const changed = output ? output.split(/\r?\n/) : [];

if (changed.length > 0) {
  console.error("Generated build artifacts are out of date. Run `pnpm run build` and commit:");
  for (const line of changed) {
    console.error(`- ${line}`);
  }
  process.exit(1);
}

console.log("Generated build artifacts match the committed tree.");
