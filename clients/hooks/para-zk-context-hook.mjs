// SessionStart hook: inject ambient awareness of the PARA-ZK vaults and
// LLM-Wiki domains available on this machine, so the assistant consults the
// wiki for in-domain questions instead of answering blind.
//
// Reads ONLY the Obsidian vault registry (~/.config/obsidian/obsidian.json) and each
// vault's para-zk install marker plus its LLM-Wiki folder listing — zero dependency on a
// running Obsidian or the para-zk runtime. The wiki root is the `<vault>/LLM-Wiki` convention;
// this hook reads no plugin settings (a zero-dependency disk walk on the default path). A domain
// is an immediate subfolder of that root holding at least one llm-wiki page (a `.md` whose
// frontmatter `type` is llm-wiki), matching the canonical para-zk:wiki-domains filter. Any
// failure degrades to silence (no output, exit 0) so a session never breaks on this hook.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WIKI_ROOT = "LLM-Wiki";
const OPTSIDIAN_URL = "https://github.com/kangig94/optsidian";

function resolveRegistryPath() {
  // An explicit override is authoritative: use exactly it (buildRoster degrades to silence
  // if it is missing), never silently fall back to a different vault's registry.
  if (process.env.OBSIDIAN_CONFIG) return process.env.OBSIDIAN_CONFIG;
  const home = os.homedir();
  const candidates = [
    process.env.XDG_CONFIG_HOME && path.join(process.env.XDG_CONFIG_HOME, "obsidian", "obsidian.json"),
    path.join(home, ".config", "obsidian", "obsidian.json"),
    path.join(home, ".var", "app", "md.obsidian.Obsidian", "config", "obsidian", "obsidian.json"),
    path.join(home, "Library", "Application Support", "obsidian", "obsidian.json"),
    process.env.APPDATA && path.join(process.env.APPDATA, "obsidian", "obsidian.json")
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function registeredVaultPaths(registryPath) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const vaults = registry.vaults;
  if (!vaults || typeof vaults !== "object") return [];
  return Object.values(vaults)
    .map((entry) => entry && entry.path)
    .filter((vaultPath) => typeof vaultPath === "string");
}

function isParaZkVault(vaultPath) {
  return fs.existsSync(path.join(vaultPath, ".obsidian", "plugins", "para-zk"));
}

function envPathValue(env) {
  return env.PATH || env.Path || env.path || "";
}

function commandExistsOnPath(command, env = process.env) {
  const pathValue = envPathValue(env);
  if (!pathValue) return false;
  const extensions =
    process.platform === "win32" ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      try {
        fs.accessSync(path.join(dir, `${command}${extension}`), fs.constants.X_OK);
        return true;
      } catch {
        // Keep scanning PATH; the hook must never fail because a candidate is unreadable.
      }
    }
  }
  return false;
}

export function resolveCliCommand(env = process.env) {
  return commandExistsOnPath("optsidian", env) ? "optsidian" : "obsidian";
}

function sandboxNote(cliCommand) {
  if (cliCommand === "optsidian") {
    return "Sandbox note: optsidian CLI still runs inside the current sandbox and may fail to reach Obsidian. If CLI access fails for sandbox reasons, do not read vault files directly; use an unsandboxed path if available, or use the optsidian MCP command runner (`mcp__optsidian__command_run` / `command_run`) to access Obsidian from outside the sandbox.";
  }
  return "Sandbox note: if Obsidian CLI access fails because the vault path is outside the current sandbox, do not read vault files directly. Ask the user to run without that sandbox restriction, or use an available optsidian MCP command runner (`mcp__optsidian__command_run` / `command_run`) that can access Obsidian from outside the sandbox.";
}

// A `.md` is a wiki page when its YAML frontmatter declares `type: llm-wiki` — the same
// condition the canonical wiki-domains workflow applies via the metadata cache. Parsed with a
// minimal frontmatter scan to keep the hook dependency-free.
function isWikiPage(file) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!block) return false;
  const typeLine = block[1].split(/\r?\n/).find((line) => /^type\s*:/.test(line));
  if (!typeLine) return false;
  const value = typeLine.slice(typeLine.indexOf(":") + 1).trim().replace(/^["']|["']$/g, "");
  return value === "llm-wiki";
}

// A domain folder holds at least one llm-wiki page as a direct child — the same filter as the
// canonical wiki-domains workflow, so a stray non-wiki draft under the wiki root never surfaces
// as a phantom domain. Short-circuits on the first wiki page: a well-formed domain costs one read.
function hasWikiPage(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return false;
  }
  return names.some((name) => name.endsWith(".md") && isWikiPage(path.join(dir, name)));
}

// Domains = immediate subfolders of <vault>/LLM-Wiki that hold at least one llm-wiki page.
// A shallow readdir per subfolder (no recursive walk) plus a short-circuited frontmatter
// `type` check — O(domains) reads for a well-formed wiki, even at "everything" scale.
function vaultDomains(vaultPath) {
  const root = path.join(vaultPath, WIKI_ROOT);
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && hasWikiPage(path.join(root, entry.name)))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export function buildRoster(registryPath = resolveRegistryPath()) {
  if (!registryPath) return [];
  let vaultPaths;
  try {
    vaultPaths = registeredVaultPaths(registryPath);
  } catch {
    return [];
  }
  const roster = [];
  for (const vaultPath of vaultPaths) {
    if (!isParaZkVault(vaultPath)) continue;
    const domains = vaultDomains(vaultPath);
    roster.push({ name: path.basename(vaultPath), vaultPath, domains });
  }
  return roster;
}

export function renderContext(roster, cliCommand = resolveCliCommand()) {
  const lines = [
    "<para-zk>",
    "This machine has PARA-ZK vault context. Listed domains are PARA-ZK LLM-Wiki concept pages organized by domain.",
    "When a question falls in a listed domain, consult the wiki before answering and cite the pages you use. Otherwise ignore the wiki lookup instructions.",
    ""
  ];
  for (const vault of roster) {
    if (vault.domains.length > 0) {
      lines.push(`Vault "${vault.name}" (vault-path=${vault.vaultPath}) — domains:`);
      lines.push(`  ${vault.domains.join(", ")}`);
    } else {
      lines.push(`Vault "${vault.name}" (vault-path=${vault.vaultPath}) — no LLM-Wiki domains detected.`);
    }
  }
  if (cliCommand !== "optsidian") {
    lines.push(
      "",
      `Search note: optsidian is not installed. If the user asks for vault-wide or full-text search that PARA-ZK list/read commands cannot satisfy, explain the limitation and suggest installing optsidian (${OPTSIDIAN_URL}) for Obsidian search/grep support.`
    );
  }
  lines.push(
    "",
    `Obsidian work guardrail: when the user asks you to work in a PARA-ZK vault above, first understand that vault's para-zk conventions and surface with \`${cliCommand} para-zk:conventions\` and \`${cliCommand} para-zk:describe\`, even if no LLM-Wiki domains are detected. Prefer PARA-ZK \`para-zk:*\` commands over generic \`${cliCommand}\` commands for typed vault operations; use generic commands only when PARA-ZK does not cover the requested operation.`,
    "",
    sandboxNote(cliCommand),
    "",
    "How to consult (always through the para-zk CLI — never read vault files by raw path):",
    `  0. If Obsidian is not running, ASK the user before launching it: ${cliCommand} open-gui vault-path=<vault-path> — then continue.`,
    `  1. Read the domain hub:  ${cliCommand} para-zk:read-llm-wiki title="<domain>/index"   (maps the domain; follow the wikilinks in its body to the relevant concept page)`,
    `  2. Narrow if needed:     ${cliCommand} para-zk:list type=llm-wiki query=<domain>/<keyword>`,
    `  3. Read a page:          ${cliCommand} para-zk:read-llm-wiki title="<domain>/<concept>" key=body   (also key=backlinks, key=references)`,
    "</para-zk>"
  );
  return lines.join("\n");
}

function main() {
  try {
    const roster = buildRoster();
    if (roster.length === 0) return;
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: renderContext(roster)
      }
    })}\n`);
  } catch {
    // Any failure degrades to silence; a session must never break on this hook.
  }
}

if (import.meta.main) {
  main();
}
