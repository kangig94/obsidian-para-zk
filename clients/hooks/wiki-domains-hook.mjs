// SessionStart hook: inject ambient awareness of the PARA-ZK LLM-Wiki domains
// available on this machine, so the assistant consults the wiki for in-domain
// questions instead of answering blind.
//
// Reads ONLY the Obsidian vault registry (~/.config/obsidian/obsidian.json) and each
// vault's LLM-Wiki folder listing — zero dependency on a running Obsidian or the
// para-zk runtime. The wiki root is the `<vault>/LLM-Wiki` convention; this hook reads no
// plugin settings (a zero-dependency disk walk on the default path). A domain is an immediate
// subfolder of that root holding at least one llm-wiki page (a `.md` whose frontmatter `type`
// is llm-wiki), matching the canonical para-zk:wiki-domains filter. Any failure degrades to
// silence (no output, exit 0) so a session never breaks on this hook.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WIKI_ROOT = "LLM-Wiki";

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
    if (domains.length > 0) roster.push({ name: path.basename(vaultPath), vaultPath, domains });
  }
  return roster;
}

export function renderContext(roster) {
  const lines = [
    "<para-zk-wiki>",
    "This machine has PARA-ZK LLM-Wiki(s) — concept pages organized by domain.",
    "When a question falls in a domain below, consult the wiki before answering and cite the pages you use. Otherwise ignore this block.",
    ""
  ];
  for (const vault of roster) {
    lines.push(`Vault "${vault.name}" (vault-path=${vault.vaultPath}) — domains:`);
    lines.push(`  ${vault.domains.join(", ")}`);
  }
  lines.push(
    "",
    "How to consult (always through the para-zk CLI — never read vault files by raw path):",
    "  0. If Obsidian is not running, ASK the user before launching it: optsidian open-gui vault-path=<vault-path> — then continue.",
    '  1. Read the domain hub:  optsidian para-zk:read-llm-wiki title="<domain>/index"   (maps the domain; follow the wikilinks in its body to the relevant concept page)',
    "  2. Narrow if needed:     optsidian para-zk:list type=llm-wiki query=<domain>/<keyword>",
    '  3. Read a page:          optsidian para-zk:read-llm-wiki title="<domain>/<concept>" key=body   (also key=backlinks, key=references)',
    "</para-zk-wiki>"
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
