import { build, context } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, watch, writeFileSync } from "node:fs";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";

loadDotEnv();

const production = process.env.NODE_ENV === "production" || process.argv.includes("production");
const watchMode = process.argv.includes("--watch");
const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

// build/ holds the complete Obsidian deployment shape (main.js + manifest.json +
// styles.css); it is gitignored and shipped as release assets. main.js is emitted there
// by esbuild, styles.css is copied from assets/, and manifest.json is staged from the
// repo root (its committed source) at build time. The optional local vault sync copies
// these straight into a plugin folder.
const filesToDeploy = ["main.js", "manifest.json", "styles.css"];

// package.json is the single source of truth for the version. The build injects it
// (__VERSION__) and propagates it into every distribution manifest, so a release only
// edits package.json without hand-syncing generated distribution files.
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
syncManifestVersions(version);

const mcpBundlePath = "clients/para-zk-mcp.mjs";
const mcpHashPath = `${mcpBundlePath}.sha256`;

const pluginBuildOptions = {
  banner: {
    js: "/* PARA-ZK Obsidian plugin */"
  },
  bundle: true,
  define: {
    __VERSION__: JSON.stringify(version)
  },
  entryPoints: ["src/main.ts"],
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    ...nodeBuiltins
  ],
  format: "cjs",
  logLevel: "info",
  minify: production,
  outfile: "build/main.js",
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "es2022",
  treeShaking: true
};

const mcpBuildOptions = {
  banner: {
    js: "#!/usr/bin/env node"
  },
  bundle: true,
  define: {
    __VERSION__: JSON.stringify(version)
  },
  entryPoints: ["src/mcp/server.ts"],
  external: nodeBuiltins,
  format: "esm",
  logLevel: "info",
  minify: production,
  // The MCP bundle stays committed under clients/ — the Claude Code / Codex marketplace
  // ships that folder via git clone and runs no build step at install time.
  outfile: mcpBundlePath,
  platform: "node",
  sourcemap: production ? false : "inline",
  target: "node18",
  treeShaking: true
};

async function buildCss() {
  await mkdir("build", { recursive: true });
  const css = await readFile("assets/styles.css", "utf8");
  await writeFile("build/styles.css", css, "utf8");
}

async function syncToPlugin() {
  const pluginDir = process.env.OBSIDIAN_PLUGIN_DIR;
  if (!pluginDir) return;

  try {
    await access(pluginDir);
    await Promise.all(filesToDeploy.map((file) => copyFile(join("build", file), join(pluginDir, file))));
    console.log(`✓ Synced to ${pluginDir}`);
  } catch {
    // Build output is still valid when the optional local sync target is absent.
  }
}

async function afterBuild() {
  await buildCss();
  // Stage the committed root manifest into the build/ deployment shape (and as a release asset).
  await copyFile("manifest.json", "build/manifest.json");
  await syncToPlugin();
}

async function writeMcpBundleHash() {
  const bundle = await readFile(mcpBundlePath);
  const hash = createHash("sha256").update(bundle).digest("hex");
  await writeFile(mcpHashPath, `${hash}  ${mcpBundlePath}\n`, "utf8");
}

if (watchMode) {
  const pluginCtx = await context({
    ...pluginBuildOptions,
    plugins: [
      {
        name: "para-zk-after-build",
        setup(buildApi) {
          buildApi.onEnd(async (result) => {
            if (result.errors.length > 0) return;
            await afterBuild();
          });
        }
      }
    ]
  });
  const mcpCtx = await context(mcpBuildOptions);
  await pluginCtx.watch();
  await mcpCtx.watch();
  await afterBuild();

  watch("assets/styles.css", async () => {
    await afterBuild();
  });

  const syncTarget = process.env.OBSIDIAN_PLUGIN_DIR ? ` (auto-sync to ${process.env.OBSIDIAN_PLUGIN_DIR})` : "";
  console.log(`Watching PARA-ZK build${syncTarget}`);
} else {
  await build(pluginBuildOptions);
  await build(mcpBuildOptions);
  await writeMcpBundleHash();
  await afterBuild();
}

// Propagate package.json's version into the static manifests that external installers
// read directly (Obsidian, the BRAT versions map, and the Claude Code / Codex plugin
// manifests). Each entry is rewritten only when it drifts, so a same-version rebuild is
// a no-op and CI's post-build generated-artifact check catches any un-synced manifest.
function syncManifestVersions(targetVersion) {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  if (manifest.version !== targetVersion) {
    manifest.version = targetVersion;
    writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  }

  // versions.json maps each released plugin version to its minAppVersion (Obsidian/BRAT
  // update check). Add the current version on first sight; never rewrite history.
  const versions = JSON.parse(readFileSync("versions.json", "utf8"));
  if (!(targetVersion in versions)) {
    versions[targetVersion] = manifest.minAppVersion;
    writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
  }

  // The marketplace catalog (.claude-plugin/marketplace.json) is intentionally excluded:
  // it is a hand-maintained deployment pin (git-subdir + tag ref) whose plugin version is
  // resolved from the pinned tag's plugin.json, so build/version scripts must never rewrite
  // it. Only the plugin manifests below track package.json's version.
  for (const path of [
    "clients/.claude-plugin/plugin.json",
    "clients/.codex-plugin/plugin.json"
  ]) {
    const json = JSON.parse(readFileSync(path, "utf8"));
    if (json.version !== undefined && json.version !== targetVersion) {
      json.version = targetVersion;
      writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
    }
  }
}

function loadDotEnv() {
  try {
    const text = readFileSyncUtf8(".env");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env is optional.
  }
}

function readFileSyncUtf8(path) {
  return readFileSync(path, "utf8");
}
