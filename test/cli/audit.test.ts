import { beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

type AuditFinding = {
  code: string;
  severity: string;
  path: string;
  type?: string;
  detail: Record<string, unknown>;
  fix: string;
};

type AuditResult = Record<string, unknown> & {
  counts: Record<string, number>;
  findings: AuditFinding[];
  fixed?: Array<Record<string, unknown>>;
};

beforeEach(() => {
  cli = createCliHarness();
});

function markdown(frontmatter: string[], body = ""): string {
  return ["---", ...frontmatter, "---", body].join("\n");
}

async function createNote(path: string, frontmatter: string[], body = ""): Promise<void> {
  await cli.app.vault.create(path, markdown(frontmatter, body));
}

function dateDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day} 00:00`;
}

async function seedAuditVault(): Promise<{
  brokenPath: string;
  danglingPath: string;
  idlessProjectPath: string;
  idlessAreaPath: string;
  orphanPath: string;
  outgoingOnlyPermanentPath: string;
  sparkPath: string;
  permanentPath: string;
  recentDraftPermanentPath: string;
  cleanResourcePath: string;
}> {
  const hubPath = "PARA/Projects/Hub/Hub.md";
  const brokenPath = "PARA/Projects/Broken/Broken.md";
  const danglingPath = "PARA/Projects/Dangling/Dangling.md";
  const idlessProjectPath = "PARA/Projects/Idless Project/Idless Project.md";
  const idlessAreaPath = "PARA/Areas/Idless Area.md";
  const orphanPath = "PARA/Resources/Orphan Resource.md";
  const outgoingOnlyPermanentPath = "Zettelkasten/Permanent/Outgoing Only Permanent.md";
  const sparkPath = "Zettelkasten/Sparks/Stale Spark.md";
  const permanentPath = "Zettelkasten/Permanent/Stale Permanent.md";
  const recentDraftPermanentPath = "Zettelkasten/Permanent/Recent Draft Permanent.md";
  const cleanResourcePath = "PARA/Resources/Clean Resource.md";

  await createNote(hubPath, ["type: project", `created: ${dateDaysAgo(1)}`, "updated:"]);
  await createNote(
    brokenPath,
    ["type: project", `created: ${dateDaysAgo(1)}`, "updated:"],
    "Body points at [[Missing Body Target]]."
  );
  await createNote(
    danglingPath,
    [
      "type: project",
      `created: ${dateDaysAgo(1)}`,
      "updated:",
      "references:",
      "  - link: \"[[Missing Registry Target]]\"",
      "    id: abc123"
    ]
  );
  await createNote(
    idlessProjectPath,
    [
      "type: project",
      `created: ${dateDaysAgo(1)}`,
      "updated:",
      "references:",
      "  - https://example.com/project"
    ]
  );
  await createNote(
    idlessAreaPath,
    [
      "type: area",
      `created: ${dateDaysAgo(1)}`,
      "updated:",
      "references:",
      "  - link: https://example.com/area"
    ]
  );
  await createNote(
    orphanPath,
    ["type: resource", `created: ${dateDaysAgo(1)}`, "updated:"],
    "No links here."
  );
  await createNote(
    outgoingOnlyPermanentPath,
    ["type: permanent", `created: ${dateDaysAgo(20)}`, `updated: ${dateDaysAgo(20)}`, "maturity: refined"],
    `Only outgoing, linked to [[${hubPath}]].`
  );
  await createNote(
    sparkPath,
    ["type: spark", `created: ${dateDaysAgo(10)}`, "updated:", "processed: false"]
  );
  await createNote(
    permanentPath,
    ["type: permanent", `created: ${dateDaysAgo(20)}`, `updated: ${dateDaysAgo(15)}`, "maturity: draft"],
    `Still draft, but linked to [[${hubPath}]].`
  );
  await createNote(
    recentDraftPermanentPath,
    ["type: permanent", `created: ${dateDaysAgo(20)}`, `updated: ${dateDaysAgo(1)}`, "maturity: draft"],
    `Recent draft, linked to [[${hubPath}]].`
  );
  await createNote(
    cleanResourcePath,
    ["type: resource", `created: ${dateDaysAgo(1)}`, "updated:"],
    `Cleanly linked to [[${hubPath}]].`
  );
  await createNote(
    "Zettelkasten/Sparks/Fresh Spark.md",
    ["type: spark", `created: ${dateDaysAgo(1)}`, "updated:", "processed: false"]
  );
  await createNote(
    "Zettelkasten/Permanent/Refined Permanent.md",
    ["type: permanent", `created: ${dateDaysAgo(20)}`, `updated: ${dateDaysAgo(20)}`, "maturity: refined"],
    `Linked to [[${hubPath}]].`
  );
  await createNote(
    "Templates/para-zk/template_resource.md",
    ["type: resource"],
    "Template files are ignored."
  );

  return {
    brokenPath,
    danglingPath,
    idlessProjectPath,
    idlessAreaPath,
    orphanPath,
    outgoingOnlyPermanentPath,
    sparkPath,
    permanentPath,
    recentDraftPermanentPath,
    cleanResourcePath
  };
}

function asAudit(result: Record<string, unknown>): AuditResult {
  return result as AuditResult;
}

function codes(result: AuditResult): string[] {
  return result.findings.map((finding) => finding.code);
}

describe("audit", () => {
  it("reports all deterministic checks and stays silent on clean notes", async () => {
    const paths = await seedAuditVault();

    const result = asAudit(await cli.run("para-zk:audit", { limit: "all" }));

    expect(result).toMatchObject({
      ok: true,
      command: "para-zk:audit",
      count: 7,
      returned: 7,
      has_more: false
    });
    expect(result.counts).toMatchObject({
      broken_link: 1,
      dangling_reference: 1,
      idless_reference: 2,
      orphan_note: 1,
      unprocessed_spark: 1,
      stale_draft_permanent: 1
    });
    expect(codes(result)).toEqual([
      "broken_link",
      "dangling_reference",
      "idless_reference",
      "idless_reference",
      "orphan_note",
      "unprocessed_spark",
      "stale_draft_permanent"
    ]);
    expect(result.findings.find((finding) => finding.code === "broken_link")).toMatchObject({
      severity: "high",
      path: paths.brokenPath,
      detail: { target: "Missing Body Target", count: 1 }
    });
    expect(result.findings.find((finding) => finding.code === "dangling_reference")).toMatchObject({
      severity: "high",
      path: paths.danglingPath,
      detail: { index: 0, link: "[[Missing Registry Target]]", target: "Missing Registry Target" }
    });
    expect(result.findings.find((finding) => finding.code === "orphan_note")).toMatchObject({
      severity: "medium",
      path: paths.orphanPath,
      type: "resource"
    });
    expect(result.findings.find((finding) => finding.code === "unprocessed_spark")).toMatchObject({
      severity: "low",
      path: paths.sparkPath,
      type: "spark"
    });
    expect(result.findings.find((finding) => finding.code === "stale_draft_permanent")).toMatchObject({
      severity: "low",
      path: paths.permanentPath,
      type: "permanent"
    });
    expect(result.findings.some((finding) =>
      finding.code === "orphan_note" && finding.path === paths.outgoingOnlyPermanentPath
    )).toBe(false);
    expect(result.findings.some((finding) =>
      finding.code === "stale_draft_permanent" && finding.path === paths.recentDraftPermanentPath
    )).toBe(false);
    expect(result.findings.some((finding) => finding.path === paths.cleanResourcePath)).toBe(false);
    expect(result.findings.some((finding) => finding.path.startsWith("Templates/"))).toBe(false);
  });

  it("filters by check, severity, and type", async () => {
    const paths = await seedAuditVault();

    const broken = asAudit(await cli.run("para-zk:audit", { check: "broken_link" }));
    expect(broken.count).toBe(1);
    expect(broken.findings[0]).toMatchObject({ code: "broken_link", path: paths.brokenPath });

    const high = asAudit(await cli.run("para-zk:audit", { severity: "high", limit: "all" }));
    expect(codes(high)).toEqual(["broken_link", "dangling_reference"]);
    expect(high.findings.every((finding) => finding.severity === "high")).toBe(true);

    const spark = asAudit(await cli.run("para-zk:audit", { type: "spark", limit: "all" }));
    expect(spark.count).toBe(1);
    expect(spark.findings[0]).toMatchObject({ code: "unprocessed_spark", path: paths.sparkPath });
  });

  it("paginates over the flat filtered findings list", async () => {
    const paths = await seedAuditVault();

    const full = asAudit(await cli.run("para-zk:audit", { limit: "all" }));
    const page = asAudit(await cli.run("para-zk:audit", { offset: "1", limit: "2" }));

    expect(page).toMatchObject({
      count: full.count,
      offset: 1,
      limit: 2,
      returned: 2,
      has_more: true
    });
    expect(page.findings).toEqual(full.findings.slice(1, 3));
    expect(page.findings.map((finding) => ({ code: finding.code, path: finding.path }))).toEqual([
      { code: "dangling_reference", path: paths.danglingPath },
      { code: "idless_reference", path: paths.idlessAreaPath }
    ]);
  });

  it("previews id-less references without writing, then fix=true backfills them vault-wide and is idempotent", async () => {
    const paths = await seedAuditVault();
    const beforeProject = cli.app.readPath(paths.idlessProjectPath);
    const beforeArea = cli.app.readPath(paths.idlessAreaPath);

    const preview = asAudit(await cli.run("para-zk:audit", { check: "idless_reference", limit: "all" }));
    expect(preview.counts.idless_reference).toBe(2);
    expect(preview.fixed).toBeUndefined();
    expect(cli.app.readPath(paths.idlessProjectPath)).toBe(beforeProject);
    expect(cli.app.readPath(paths.idlessAreaPath)).toBe(beforeArea);
    expect(cli.app.readPath(paths.idlessProjectPath)).not.toContain("id:");
    expect(cli.app.readPath(paths.idlessAreaPath)).not.toContain("id:");

    const fixed = asAudit(await cli.run("para-zk:audit", { fix: "true", limit: "all" }));
    expect(fixed.fixed).toEqual([
      { code: "idless_reference", path: paths.idlessAreaPath, action: "backfillReferenceIds" },
      { code: "idless_reference", path: paths.idlessProjectPath, action: "backfillReferenceIds" }
    ]);
    expect(fixed.counts.idless_reference).toBe(0);
    expect(codes(fixed)).not.toContain("idless_reference");
    expect(cli.app.readPath(paths.idlessProjectPath)).toContain("id:");
    expect(cli.app.readPath(paths.idlessAreaPath)).toContain("id:");

    const second = asAudit(await cli.run("para-zk:audit", { fix: "true", limit: "all" }));
    expect(second.fixed).toEqual([]);
    expect(second.counts.idless_reference).toBe(0);
  });

  it("audits llm-wiki links and references but excludes llm-wiki from orphan notes", async () => {
    await cli.run("para-zk:create-resource", { title: "Canonical Source", open: "false" });
    await cli.run("para-zk:create-llm-wiki", {
      title: "AI/Normal Wiki",
      body: "[[PARA/Resources/Canonical Source.md]] [[LLM-Wiki/Broken Wiki.md]]",
      open: "false"
    });
    await cli.run("para-zk:update-llm-wiki", {
      title: "Normal Wiki",
      key: "references",
      op: "insert",
      value_json: JSON.stringify({
        link: "[[PARA/Resources/Canonical Source.md]]",
        description: "Canonical source"
      })
    });
    await createNote(
      "LLM-Wiki/Broken Wiki.md",
      [
        "type: llm-wiki",
        `created: ${dateDaysAgo(1)}`,
        "updated:",
        "references:",
        "  - link: \"[[Missing Registry Target]]\"",
        "    id: abc123",
        "  - https://example.com/idless"
      ],
      "Body points at [[Missing Body Target]]. [[LLM-Wiki/AI/Normal Wiki.md]]"
    );

    const result = asAudit(await cli.run("para-zk:audit", { type: "llm-wiki", limit: "all" }));

    expect(result).toMatchObject({
      ok: true,
      count: 3,
      returned: 3
    });
    expect(codes(result)).toEqual([
      "broken_link",
      "dangling_reference",
      "idless_reference"
    ]);
    expect(result.counts).toMatchObject({
      broken_link: 1,
      dangling_reference: 1,
      idless_reference: 1
    });
    expect(result.counts.orphan_note ?? 0).toBe(0);
    expect(result.findings.every((finding) => finding.path === "LLM-Wiki/Broken Wiki.md")).toBe(true);
    expect(result.findings.every((finding) => finding.type === "llm-wiki")).toBe(true);
    expect(result.findings.some((finding) => finding.code === "orphan_note")).toBe(false);
    expect(result.findings.some((finding) => finding.path === "LLM-Wiki/AI/Normal Wiki.md")).toBe(false);
  });

  it("flags a canonical note that links upward into an llm-wiki note", async () => {
    await createNote("LLM-Wiki/Wiki Page.md", ["type: llm-wiki"], "Wiki body.");
    await createNote(
      "PARA/Resources/Upward Source.md",
      ["type: resource", `created: ${dateDaysAgo(1)}`, "updated:"],
      "Wrong direction: [[LLM-Wiki/Wiki Page.md]]."
    );

    const result = asAudit(await cli.run("para-zk:audit", { check: "upward_wiki_link", limit: "all" }));

    expect(result).toMatchObject({
      ok: true,
      count: 1,
      returned: 1
    });
    expect(result.findings[0]).toMatchObject({
      code: "upward_wiki_link",
      severity: "medium",
      path: "PARA/Resources/Upward Source.md",
      detail: { target: "LLM-Wiki/Wiki Page.md" }
    });
  });

  it("does not flag a wiki page that cites a canonical note", async () => {
    await createNote("PARA/Resources/Canonical Source.md", ["type: resource", `created: ${dateDaysAgo(1)}`, "updated:"]);
    await createNote(
      "LLM-Wiki/Wiki Page.md",
      ["type: llm-wiki"],
      "Correct direction: [[PARA/Resources/Canonical Source.md]]."
    );

    const result = asAudit(await cli.run("para-zk:audit", { check: "upward_wiki_link", limit: "all" }));

    expect(result).toMatchObject({
      ok: true,
      count: 0,
      returned: 0,
      findings: []
    });
  });

  it("flags an llm-wiki page no other wiki page links to (orphan_wiki_page, advisory only)", async () => {
    // Hub <-> Member are cross-linked (the web). Stranded has no links at all. Upward Only is
    // linked only by a canonical note, which does NOT count (canonical->wiki is the anti-pattern).
    await createNote("LLM-Wiki/Hub.md", ["type: llm-wiki"], "Hub links to [[LLM-Wiki/Member.md]].");
    await createNote("LLM-Wiki/Member.md", ["type: llm-wiki"], "Member links back to [[LLM-Wiki/Hub.md]].");
    await createNote("LLM-Wiki/Stranded.md", ["type: llm-wiki"], "No wiki page links here.");
    await createNote(
      "PARA/Resources/Citing Note.md",
      ["type: resource", `created: ${dateDaysAgo(1)}`, "updated:"],
      "Upward link [[LLM-Wiki/Upward Only.md]]."
    );
    await createNote("LLM-Wiki/Upward Only.md", ["type: llm-wiki"], "Only a canonical note points here.");

    const result = asAudit(await cli.run("para-zk:audit", { check: "orphan_wiki_page", limit: "all" }));

    // Cross-linked Hub/Member are NOT orphans; a canonical inbound link does not rescue Upward Only.
    expect(result.findings.map((finding) => finding.path)).toEqual([
      "LLM-Wiki/Stranded.md",
      "LLM-Wiki/Upward Only.md"
    ]);
    expect(result.findings.every((finding) =>
      finding.code === "orphan_wiki_page" && finding.severity === "low" && finding.type === "llm-wiki"
    )).toBe(true);
    expect(result.findings[0].detail).toMatchObject({ inbound_wiki_links: 0 });
  });

  it("rejects aliases and dryRun at the CLI boundary", async () => {
    const alias = await cli.run("para-zk:audit", { checkCode: "broken_link" });
    expect(alias.ok).toBe(false);
    expect(String(alias.error)).toContain("Use check instead of checkCode");

    const dryRun = await cli.run("para-zk:audit", { dryRun: "true" });
    expect(dryRun.ok).toBe(false);
    expect(String(dryRun.error)).toContain("dryRun is not accepted");
  });
});
