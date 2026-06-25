#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const violations = [
  ...checkManifest(),
  ...checkReleaseAttestations(),
  ...checkSourcePatterns(),
  ...checkCssPatterns()
];

if (violations.length > 0) {
  console.error("Obsidian review lint failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Obsidian review lint passed");

function checkManifest() {
  const manifest = readJson("manifest.json");
  const packageJson = readJson("package.json");
  const versions = readJson("versions.json");
  const result = [];

  if (/\bobsidian\b/i.test(String(manifest.description ?? ""))) {
    result.push("manifest.json description must not include the word \"Obsidian\"");
  }

  const name = String(manifest.name ?? "");
  const letters = name.match(/\p{L}/gu) ?? [];
  if (letters.length > 0 && letters.every((letter) => letter === letter.toUpperCase())) {
    result.push("manifest.json name should not be all caps");
  }

  if (manifest.version !== packageJson.version) {
    result.push(`manifest.json version (${manifest.version}) must match package.json version (${packageJson.version})`);
  }

  if (versions[packageJson.version] !== manifest.minAppVersion) {
    result.push(`versions.json entry for ${packageJson.version} must match manifest minAppVersion ${manifest.minAppVersion}`);
  }

  const obsidianDependency = packageJson.devDependencies?.obsidian;
  if (obsidianDependency !== manifest.minAppVersion) {
    result.push(`devDependency obsidian (${obsidianDependency}) must be pinned exactly to minAppVersion ${manifest.minAppVersion}`);
  }

  return result;
}

function checkReleaseAttestations() {
  const workflow = readText(".github/workflows/release.yml");
  const required = [
    "attestations: write",
    "id-token: write",
    "artifact-metadata: write",
    "actions/attest@",
    "build/main.js",
    "build/styles.css"
  ];

  return required
    .filter((needle) => !workflow.includes(needle))
    .map((needle) => `.github/workflows/release.yml must include ${needle}`);
}

function checkSourcePatterns() {
  const sourceFiles = listFiles("src", (path) => path.endsWith(".ts"));
  const result = [];
  const sourceRules = [
    {
      pattern: /\bimport\s+[^;]*["']node:(?:child_process|url)["']/,
      message: "avoid static Node builtin imports that the review lint flags"
    },
    {
      pattern: /\bimport\s+[^;]*["'](?:child_process|url)["']/,
      message: "avoid static Node builtin imports that the review lint flags"
    },
    {
      pattern: /\bimport\(\s*(?!["'`])/,
      message: "dynamic import() must use a string literal"
    },
    {
      pattern: /\bnew\s+Server\s*\(/,
      message: "use McpServer instead of deprecated Server"
    },
    {
      pattern: /@modelcontextprotocol\/sdk\/server\/index\.js/,
      message: "use @modelcontextprotocol/sdk/server/mcp.js instead of deprecated Server import"
    },
    {
      pattern: /\.style\.[A-Za-z_$][\w$]*\s*=/,
      message: "set styles with CSS classes or setProperty/setCss* helpers, not static style assignments"
    },
    {
      pattern: /\bsetWarning\s*\(/,
      message: "use destructive-button compatibility helper instead of deprecated setWarning()"
    },
    {
      pattern: /\bglobalThis\b/,
      message: "use window/activeWindow-compatible APIs instead of globalThis"
    },
    {
      pattern: /\bdocument\./,
      message: "use activeDocument instead of document for popout compatibility"
    },
    {
      pattern: /\binstanceof\s+HTMLElement\b/,
      message: "use .instanceOf(HTMLElement) for cross-window safe checks"
    },
    {
      pattern: /\bas\s+ArrayBuffer\b/,
      message: "avoid unnecessary ArrayBuffer assertions"
    },
    {
      pattern: /\bunknown\s*\|\s*undefined\b|\bundefined\s*\|\s*unknown\b/,
      message: "avoid unions where unknown overrides undefined"
    },
    {
      pattern: /"current"\s*\|\s*string|"open"\s*\|\s*string|"done"\s*\|\s*string/,
      message: "avoid literal unions overridden by string"
    },
    {
      pattern: /\[[^\]\n]*(?<!\\)\\\/[^\]\n]*\]/,
      message: "avoid unnecessary escaped slashes inside regex character classes"
    },
    {
      pattern: /\bthis\.display\s*\(/,
      message: "do not call deprecated display(); call the private render helper instead"
    },
    {
      pattern: /\bensureTaskShard\b/,
      message: "keep removed unused ensureTaskShard helper out of the source"
    }
  ];

  for (const file of sourceFiles) {
    const rel = toRepoPath(file);
    const text = readFileSync(file, "utf8");
    for (const rule of sourceRules) {
      if (rule.pattern.test(text)) {
        result.push(`${rel}: ${rule.message}`);
      }
    }

    if (!rel.startsWith("src/mcp/") && /\.obsidian(?:\/|["'`])/.test(text)) {
      result.push(`${rel}: use vault.configDir/obsidianConfigPath for config-folder paths`);
    }

    if (/\.vault\.(?:delete|trash)\s*\(/.test(text) || /\bVault\.(?:delete|trash)\s*\(/.test(text)) {
      result.push(`${rel}: use fileManager.trashFile() instead of Vault.delete()/Vault.trash()`);
    }
  }

  return result;
}

function checkCssPatterns() {
  const cssFiles = listFiles("assets", (path) => path.endsWith(".css"));
  const result = [];
  const cssRules = [
    { pattern: /!important\b/, message: "avoid !important" },
    { pattern: /:has\s*\(/, message: "avoid :has selectors" },
    { pattern: /(^|[;{}\s])columns\s*:/, message: "avoid partially supported multicolumn CSS" },
    { pattern: /(^|[;{}\s])column-(?:count|gap|rule|span|width)\s*:/, message: "avoid partially supported multicolumn CSS" }
  ];

  for (const file of cssFiles) {
    const rel = toRepoPath(file);
    const text = readFileSync(file, "utf8");
    for (const rule of cssRules) {
      if (rule.pattern.test(text)) {
        result.push(`${rel}: ${rule.message}`);
      }
    }
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function readText(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function listFiles(path, predicate) {
  const root = join(repoRoot, path);
  const result = [];
  visit(root, result, predicate);
  return result;
}

function visit(path, result, predicate) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      visit(child, result, predicate);
    } else if (entry.isFile() && predicate(child)) {
      result.push(child);
    }
  }
}

function toRepoPath(path) {
  return relative(repoRoot, path).replace(/\\/g, "/");
}
