import { access, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { readFileSync } from "node:fs";

loadDotEnv();

const pluginDir = process.env.OBSIDIAN_PLUGIN_DIR;
const filesToDeploy = ["main.js", "manifest.json", "styles.css"];

if (!pluginDir) {
  console.error("OBSIDIAN_PLUGIN_DIR is not set. Add it to .env or export it in the shell.");
  process.exit(1);
}

try {
  await access(pluginDir);
  await Promise.all(filesToDeploy.map((file) => copyFile(file, join(pluginDir, file))));
  console.log(`✓ Synced to ${pluginDir}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to sync: ${message}`);
  process.exit(1);
}

function loadDotEnv() {
  try {
    const text = readFileSync(".env", "utf8");
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
