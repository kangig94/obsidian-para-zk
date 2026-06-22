import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRoster, renderContext } from "../../clients/hooks/wiki-domains-hook.mjs";
import { wikiDomains } from "../../src/workflows";
import { createTestContext } from "../harness/vault";

const PAGE = "---\ntype: llm-wiki\n---\n";

const tempRoots: string[] = [];
function tempRoot(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "para-zk-hook-"));
  tempRoots.push(dir);
  return dir;
}
afterEach(() => {
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

// Materialize a vault dir on disk: optional para-zk install + LLM-Wiki pages
// (paths relative to LLM-Wiki/, e.g. "ai/index" -> <vault>/LLM-Wiki/ai/index.md).
function makeVault(root: string, name: string, opts: { paraZk?: boolean; pages?: string[] } = {}): string {
  const vault = path.join(root, name);
  mkdirSync(vault, { recursive: true });
  if (opts.paraZk ?? true) mkdirSync(path.join(vault, ".obsidian", "plugins", "para-zk"), { recursive: true });
  for (const page of opts.pages ?? []) {
    const file = path.join(vault, "LLM-Wiki", `${page}.md`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, PAGE);
  }
  return vault;
}

function writeRegistry(root: string, vaultPaths: string[]): string {
  const vaults: Record<string, { path: string; open: boolean }> = {};
  vaultPaths.forEach((vaultPath, index) => {
    vaults[`v${index}`] = { path: vaultPath, open: index === 0 };
  });
  const registry = path.join(root, "obsidian.json");
  writeFileSync(registry, JSON.stringify({ vaults }));
  return registry;
}

describe("wiki-domains SessionStart hook", () => {
  it("registers the SessionStart context hook once", () => {
    const hooksPath = path.resolve("clients/hooks/hooks.json");
    const config = JSON.parse(readFileSync(hooksPath, "utf8")) as {
      hooks?: {
        SessionStart?: Array<{ hooks?: Array<{ command?: string }>; matcher?: string }>;
      };
    };
    const entries = config.hooks?.SessionStart ?? [];
    const commands = entries
      .flatMap((entry) => entry.hooks ?? [])
      .map((hook) => hook.command)
      .filter((command): command is string => typeof command === "string");

    expect(commands.filter((command) => command.includes("wiki-domains-hook.mjs"))).toHaveLength(1);
    expect(entries.map((entry) => entry.matcher)).toEqual(["startup|resume|clear|compact"]);
  });

  it("enumerates the same domain set as the wiki-domains workflow (drift guard)", async () => {
    const pages = ["ai/index", "ai/ppo", "ai/diffusion-policy", "robotics/twist", "perception/index", "floating"];
    const root = tempRoot();
    const vault = makeVault(root, "VaultA", { pages });

    const roster = buildRoster(writeRegistry(root, [vault]));
    expect(roster).toHaveLength(1);
    const toolDomains = roster[0].domains;

    // Same layout through the canonical workflow on the in-memory mock host.
    const { ctx, app } = createTestContext();
    for (const page of pages) await app.vault.create(`LLM-Wiki/${page}.md`, PAGE);
    const workflow = await wikiDomains(ctx, { limit: "all" });
    const workflowDomains = workflow.domains.map((domain) => domain.domain).sort((a, b) => a.localeCompare(b));

    expect(toolDomains).toEqual(workflowDomains);
    expect(toolDomains).toEqual(["ai", "perception", "robotics"]); // flat "floating" page excluded by both
  });

  it("excludes a subfolder whose .md files lack type: llm-wiki — matching the workflow", async () => {
    const root = tempRoot();
    const vault = makeVault(root, "VaultA", { pages: ["ai/index"] });
    const draft = path.join(vault, "LLM-Wiki", "draft", "note.md");
    mkdirSync(path.dirname(draft), { recursive: true });
    writeFileSync(draft, "no frontmatter, not a wiki page\n");

    const toolDomains = buildRoster(writeRegistry(root, [vault]))[0].domains;

    const { ctx, app } = createTestContext();
    await app.vault.create("LLM-Wiki/ai/index.md", PAGE);
    await app.vault.create("LLM-Wiki/draft/note.md", "no frontmatter, not a wiki page\n");
    const workflowDomains = (await wikiDomains(ctx, { limit: "all" })).domains.map((domain) => domain.domain);

    expect(toolDomains).toEqual(["ai"]); // "draft" excluded: no llm-wiki page — same as the workflow
    expect(workflowDomains).not.toContain("draft");
  });

  it("surfaces only contract-level (depth-2) domains: a depth-3-only page is not a domain", async () => {
    // Off-contract: a wiki page nested below <domain>/<concept>. The hook enumerates direct
    // children only (the 2-level contract), so such a folder is not surfaced — a deliberate
    // boundary vs the workflow's looser first-path-segment rule.
    const root = tempRoot();
    const vault = makeVault(root, "VaultA", { pages: ["ai/index"] });
    const deep = path.join(vault, "LLM-Wiki", "beta", "sub", "page.md");
    mkdirSync(path.dirname(deep), { recursive: true });
    writeFileSync(deep, PAGE);

    expect(buildRoster(writeRegistry(root, [vault]))[0].domains).toEqual(["ai"]); // "beta" has no direct page

    const { ctx, app } = createTestContext();
    await app.vault.create("LLM-Wiki/ai/index.md", PAGE);
    await app.vault.create("LLM-Wiki/beta/sub/page.md", PAGE);
    const workflowDomains = (await wikiDomains(ctx, { limit: "all" })).domains.map((domain) => domain.domain);
    expect(workflowDomains).toContain("beta"); // the workflow's first-segment rule does surface it (off-contract)
  });

  it("skips a registered vault without para-zk installed", () => {
    const root = tempRoot();
    const withPlugin = makeVault(root, "VaultA", { pages: ["ai/index"] });
    const without = makeVault(root, "VaultB", { paraZk: false, pages: ["bio/index"] });

    const roster = buildRoster(writeRegistry(root, [withPlugin, without]));
    expect(roster.map((vault) => vault.name)).toEqual(["VaultA"]);
  });

  it("skips a para-zk vault whose wiki has no domain folders", () => {
    const root = tempRoot();
    const flat = makeVault(root, "Flat", { pages: ["floating"] }); // only a flat page
    const empty = makeVault(root, "Empty", { pages: [] }); // no LLM-Wiki content

    expect(buildRoster(writeRegistry(root, [flat, empty]))).toEqual([]);
  });

  it("does not treat a markdown-less subfolder as a domain", () => {
    const root = tempRoot();
    const vault = makeVault(root, "V", { pages: ["ai/index"] });
    mkdirSync(path.join(vault, "LLM-Wiki", "scratch"), { recursive: true }); // empty subfolder

    expect(buildRoster(writeRegistry(root, [vault]))[0].domains).toEqual(["ai"]);
  });

  it("rosters multiple para-zk vaults that have wiki domains, in registry order", () => {
    const root = tempRoot();
    const alpha = makeVault(root, "Alpha", { pages: ["ai/index"] });
    const beta = makeVault(root, "Beta", { pages: ["econ/index", "econ/markets"] });

    const roster = buildRoster(writeRegistry(root, [alpha, beta])).map((vault) => ({
      name: vault.name,
      domains: vault.domains
    }));
    expect(roster).toEqual([
      { name: "Alpha", domains: ["ai"] },
      { name: "Beta", domains: ["econ"] }
    ]);
  });

  it("returns an empty roster (silent) on a missing or unparseable registry", () => {
    expect(buildRoster("/no/such/registry.json")).toEqual([]);
    expect(buildRoster("")).toEqual([]);
    const root = tempRoot();
    const garbage = path.join(root, "obsidian.json");
    writeFileSync(garbage, "{ not valid json");
    expect(buildRoster(garbage)).toEqual([]);
  });

  it("honors an explicit OBSIDIAN_CONFIG override authoritatively (no fallback)", () => {
    const root = tempRoot();
    const vault = makeVault(root, "VaultA", { pages: ["ai/index"] });
    const registry = writeRegistry(root, [vault]);
    const previous = process.env.OBSIDIAN_CONFIG;
    try {
      process.env.OBSIDIAN_CONFIG = registry;
      expect(buildRoster().map((entry) => entry.name)).toEqual(["VaultA"]); // no-arg → resolved via env
      process.env.OBSIDIAN_CONFIG = path.join(root, "missing.json");
      expect(buildRoster()).toEqual([]); // missing override → silent, never falls back to the real machine
    } finally {
      if (previous === undefined) delete process.env.OBSIDIAN_CONFIG;
      else process.env.OBSIDIAN_CONFIG = previous;
    }
  });

  it("renders a context block with domains, vault-path, the CLI recipe, and guardrails", () => {
    const block = renderContext([{ name: "VaultA", vaultPath: "/v/VaultA", domains: ["ai", "robotics"] }]);
    expect(block).toContain("<para-zk-wiki>");
    expect(block).toContain('Vault "VaultA" (vault-path=/v/VaultA)');
    expect(block).toContain("ai, robotics");
    expect(block).toContain("never read vault files by raw path");
    expect(block).toContain('para-zk:read-llm-wiki title="<domain>/index"');
    expect(block).toContain("optsidian open-gui vault-path=<vault-path>");
    expect(renderContext([])).toContain("<para-zk-wiki>"); // safe to call with an empty roster
  });
});
