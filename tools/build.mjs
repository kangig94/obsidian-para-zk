import { build, context } from "esbuild";
import { readFileSync, watch, writeFileSync } from "node:fs";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";

loadDotEnv();

const production = process.env.NODE_ENV === "production" || process.argv.includes("production");
const watchMode = process.argv.includes("--watch");
const filesToDeploy = ["main.js", "manifest.json", "styles.css"];
const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

// package.json is the single source of truth for the version. The build injects it
// (__VERSION__) and propagates it into every distribution manifest, so a release only
// edits package.json — no hand-syncing the seven places the version used to live.
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
syncManifestVersions(version);

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
  outfile: "main.js",
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
  outfile: "clients/para-zk-mcp.mjs",
  platform: "node",
  sourcemap: production ? false : "inline",
  target: "node18",
  treeShaking: true
};

async function buildCss() {
  const css = await readFile("assets/styles.css", "utf8");
  await writeFile("styles.css", css, "utf8");
}

async function syncToPlugin() {
  const pluginDir = process.env.OBSIDIAN_PLUGIN_DIR;
  if (!pluginDir) return;

  try {
    await access(pluginDir);
    await Promise.all(filesToDeploy.map((file) => copyFile(file, join(pluginDir, file))));
    console.log(`✓ Synced to ${pluginDir}`);
  } catch {
    // Build output is still valid when the optional local sync target is absent.
  }
}

async function afterBuild() {
  await buildCss();
  await syncToPlugin();
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
  await afterBuild();
}

// Propagate package.json's version into the static manifests that external installers
// read directly (Obsidian, the BRAT versions map, and the Claude Code / Codex plugin
// manifests). Each entry is rewritten only when it drifts, so a same-version rebuild is
// a no-op and CI's post-build `git diff --exit-code` catches any un-synced manifest.
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

  for (const path of [
    ".claude-plugin/marketplace.json",
    "clients/.claude-plugin/plugin.json",
    "clients/.codex-plugin/plugin.json"
  ]) {
    const json = JSON.parse(readFileSync(path, "utf8"));
    let changed = false;
    if (json.version !== undefined && json.version !== targetVersion) {
      json.version = targetVersion;
      changed = true;
    }
    if (json.plugins?.[0]?.version !== undefined && json.plugins[0].version !== targetVersion) {
      json.plugins[0].version = targetVersion;
      changed = true;
    }
    if (changed) {
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
