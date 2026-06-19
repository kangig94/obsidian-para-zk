import { fileFrontmatter, readType } from "../vault/frontmatter";
import { normalizeVaultPath } from "../vault/paths";
import type { WikiDomainSummary, WikiDomainsOptions, WikiDomainsResult, WorkflowContext } from "./context";

// A domain's hub is `<domain>/index.md` — exactly one folder under the wiki root,
// the deterministic per-domain entry point an LLM reads first. It is not a concept
// page, so it is excluded from `pages`; `hasIndex` reports it instead.
const DOMAIN_INDEX_CONCEPT = "index";

type DomainTally = { pages: number; hasIndex: boolean };

// Lists the LLM-Wiki domains — the folders directly under the wiki root — as the
// entry-point roster for reading the wiki. Each domain reports its concept-page
// count (excluding the index hub) and whether its `<domain>/index` hub exists, so a
// caller can read `<domain>/index` first and fall back to `list` when it is absent.
export async function wikiDomains(
  ctx: WorkflowContext,
  options: WikiDomainsOptions = {}
): Promise<WikiDomainsResult> {
  const wikiRoot = normalizeVaultPath(ctx.settings.paths.wikiFolder);
  const tallies = new Map<string, DomainTally>();

  for (const file of ctx.host.getMarkdownFiles()) {
    const path = normalizeVaultPath(file.path);
    if (!path.startsWith(`${wikiRoot}/`)) continue;
    if (readType(fileFrontmatter(ctx, file)) !== "llm-wiki") continue;

    const segments = path.slice(wikiRoot.length + 1).split("/");
    // A domain-less flat page (depth 1) belongs to no domain folder; the contract
    // files every page under exactly one `<domain>/` level, so it is not a domain.
    if (segments.length < 2) continue;

    const domain = segments[0];
    const isIndex = segments.length === 2 && file.basename === DOMAIN_INDEX_CONCEPT;
    const tally = tallies.get(domain) ?? { pages: 0, hasIndex: false };
    if (isIndex) tally.hasIndex = true;
    else tally.pages += 1;
    tallies.set(domain, tally);
  }

  const domains: WikiDomainSummary[] = [...tallies.entries()]
    .map(([domain, tally]) => ({ domain, pages: tally.pages, has_index: tally.hasIndex }))
    .sort((left, right) => left.domain.localeCompare(right.domain));

  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit === "all" ? domains.length : Math.max(0, options.limit ?? 50);
  const page = domains.slice(offset, offset + limit);

  return {
    count: domains.length,
    offset,
    limit: options.limit === "all" ? "all" : limit,
    returned: page.length,
    has_more: offset + page.length < domains.length,
    domains: page
  };
}
