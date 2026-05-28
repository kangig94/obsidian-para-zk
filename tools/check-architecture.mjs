import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

const repoRoot = process.cwd();
const srcRoot = join(repoRoot, "src");
const forbiddenBasenames = new Set([
  "helper.ts",
  "helpers.ts",
  "util.ts",
  "utils.ts",
  "shared.ts",
  "shared-utils.ts"
]);

const files = listSourceFiles(srcRoot);
const violations = [
  ...checkContentBlankNames(files),
  ...checkSharedDirectory(files),
  ...checkReExports(files),
  ...checkLayerBoundaries(files)
];

if (violations.length > 0) {
  console.error("Architecture lint failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Architecture lint passed");

function listSourceFiles(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...listSourceFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      result.push(path);
    }
  }
  return result;
}

function checkContentBlankNames(sourceFiles) {
  return sourceFiles.flatMap((file) => {
    const basename = file.split(/[\\/]/).pop();
    return basename && forbiddenBasenames.has(basename)
      ? [`${toRepoPath(file)} uses content-blank filename '${basename}'`]
      : [];
  });
}

function checkSharedDirectory(sourceFiles) {
  return sourceFiles.flatMap((file) => {
    const repoPath = toRepoPath(file);
    return repoPath.startsWith("src/shared/")
      ? [`${repoPath} is under src/shared; use a role-specific module instead`]
      : [];
  });
}

function checkReExports(sourceFiles) {
  return sourceFiles.flatMap((file) => {
    if (file.endsWith("index.ts")) return [];
    const text = readFileSync(file, "utf8");
    const hasForeignReExport = /^\s*export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["'][^"']+["'];?/m.test(text);
    return hasForeignReExport
      ? [`${toRepoPath(file)} re-exports names from another module; import from the canonical owner instead`]
      : [];
  });
}

function checkLayerBoundaries(sourceFiles) {
  const violations = [];

  for (const file of sourceFiles) {
    const source = toRepoPath(file);
    const imports = parseImports(readFileSync(file, "utf8"));
    for (const specifier of imports) {
      const target = resolveImport(file, specifier);
      if (!target) continue;

      const targetPath = toRepoPath(target);
      if (source.startsWith("src/runtime/") && (targetPath.startsWith("src/ux/") || targetPath.startsWith("src/cli/"))) {
        violations.push(`${source} imports ${targetPath}; runtime must not depend on UX or CLI`);
      }
      if (source.startsWith("src/cli/") && targetPath.startsWith("src/ux/")) {
        violations.push(`${source} imports ${targetPath}; CLI must not depend on UX`);
      }
      if (source.startsWith("src/ux/") && targetPath.startsWith("src/cli/")) {
        violations.push(`${source} imports ${targetPath}; UX must not depend on CLI`);
      }
      if ((source === "src/workflows.ts" || source === "src/templates.ts")
        && (targetPath.startsWith("src/cli/") || targetPath.startsWith("src/ux/") || targetPath.startsWith("src/runtime/"))) {
        violations.push(`${source} imports ${targetPath}; core workflow/template modules must stay UI/runtime independent`);
      }
    }
  }

  return violations;
}

function parseImports(text) {
  const imports = [];
  const importRe = /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportRe = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  const exportFromRe = /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+["']([^"']+)["']/g;

  for (const re of [importRe, dynamicImportRe, exportFromRe]) {
    for (let match = re.exec(text); match; match = re.exec(text)) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function resolveImport(sourceFile, specifier) {
  if (!specifier.startsWith(".")) return undefined;

  const base = normalize(resolve(dirname(sourceFile), specifier));
  const candidates = [
    base,
    `${base}.ts`,
    join(base, "index.ts")
  ];

  return candidates.find((candidate) => existsSync(candidate) && candidate.startsWith(srcRoot));
}

function toRepoPath(path) {
  return relative(repoRoot, path).replace(/\\/g, "/");
}
