import { build, context } from "esbuild";
import { readFileSync, watch } from "node:fs";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";

loadDotEnv();

const production = process.env.NODE_ENV === "production" || process.argv.includes("production");
const watchMode = process.argv.includes("--watch");
const filesToDeploy = ["main.js", "manifest.json", "styles.css"];
const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

const pluginBuildOptions = {
  banner: {
    js: "/* PARA-ZK Obsidian plugin */"
  },
  bundle: true,
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
