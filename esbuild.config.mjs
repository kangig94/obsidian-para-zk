import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const production = process.argv.includes("production");
const artifactDir = path.join("dist", "obsidian-plugin");

await esbuild.build({
  banner: {
    js: "/* PARA-ZK Obsidian plugin */"
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: [
    "obsidian",
    "electron",
    "@codemirror/*"
  ],
  format: "cjs",
  logLevel: "info",
  minify: production,
  outfile: "main.js",
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "es2022",
  treeShaking: true
});

fs.mkdirSync(artifactDir, { recursive: true });
fs.copyFileSync("manifest.json", path.join(artifactDir, "manifest.json"));
fs.copyFileSync("main.js", path.join(artifactDir, "main.js"));
if (fs.existsSync("styles.css")) {
  fs.copyFileSync("styles.css", path.join(artifactDir, "styles.css"));
}
