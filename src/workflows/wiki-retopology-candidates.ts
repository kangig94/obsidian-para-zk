import { PARA_ZK_PATHS } from "../layout";
import { fileFrontmatter, readType } from "../vault/frontmatter";
import { normalizeVaultPath } from "../vault/paths";
import { stripManagedPrelude } from "../vault/sections";
import type {
  WikiRetopologyCandidate,
  WikiRetopologyCandidatesOptions,
  WikiRetopologyCandidatesResult,
  WikiRetopologyConnection,
  WikiRetopologyGraph,
  WikiRetopologyGraphEdge,
  WorkflowContext
} from "./context";

const DOMAIN_INDEX_CONCEPT = "index";
const DEFAULT_LIMIT = 20;
const DEFAULT_GRAPH_DEPTH = 2;
const EXPLICIT_LINK_BOOST = 0.35;
const SCORE_PRECISION = 4;
const MAX_SHARED_TERMS = 8;
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "for",
  "from",
  "has",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with"
]);

type DomainIndex = {
  domain: string;
  title: string;
  path: string;
  vector: Map<string, number>;
  length: number;
};

export async function wikiRetopologyCandidates(
  ctx: WorkflowContext,
  options: WikiRetopologyCandidatesOptions = {}
): Promise<WikiRetopologyCandidatesResult> {
  const limit = normalizeLimit(options.limit);
  const indexes = await readDomainIndexes(ctx);
  const byDomain = new Map(indexes.map((index) => [index.domain, index]));
  const focus = normalizeDomainOption(options.domain, byDomain);
  const depth = normalizeDepth(options.depth);
  const graphEdges = indexGraphEdges(ctx, indexes);
  const adjacency = graphAdjacency(graphEdges);
  const candidates = focus
    ? candidatesForDomain(ctx, byDomain.get(focus)!, indexes)
    : candidatesForAll(ctx, indexes, graphEdges, adjacency, depth);
  const page = candidates.slice(0, limit);

  return {
    mode: focus ? "domain" : "global",
    ...(focus ? { domain: focus } : {}),
    depth,
    ...(focus ? { graph: graphForDomain(byDomain.get(focus)!, graphEdges, adjacency, depth) } : {}),
    count: candidates.length,
    limit,
    returned: page.length,
    has_more: page.length < candidates.length,
    candidates: page
  };
}

function normalizeLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("limit must be a non-negative integer");
  }
  return value;
}

function normalizeDepth(value: unknown): number {
  if (value === undefined) return DEFAULT_GRAPH_DEPTH;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("depth must be a non-negative integer");
  }
  return value;
}

function normalizeDomainOption(value: unknown, byDomain: Map<string, DomainIndex>): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new Error("domain must be a string");
  const domain = value.trim();
  if (!domain) return undefined;
  if (byDomain.has(domain)) return domain;

  const lower = domain.toLowerCase();
  const match = [...byDomain.keys()].find((candidate) => candidate.toLowerCase() === lower);
  if (match) return match;
  throw new Error(`domain index not found: ${domain}`);
}

async function readDomainIndexes(ctx: WorkflowContext): Promise<DomainIndex[]> {
  const wikiRoot = normalizeVaultPath(PARA_ZK_PATHS.wikiFolder);
  const indexes: DomainIndex[] = [];

  for (const file of ctx.host.getMarkdownFiles()) {
    const path = normalizeVaultPath(file.path);
    if (!path.startsWith(`${wikiRoot}/`)) continue;
    if (readType(fileFrontmatter(ctx, file)) !== "llm-wiki") continue;

    const segments = path.slice(wikiRoot.length + 1).split("/");
    if (segments.length !== 2 || file.basename !== DOMAIN_INDEX_CONCEPT) continue;

    const domain = segments[0];
    const content = await ctx.host.read(file);
    const body = stripManagedPrelude(content);
    const vector = indexVector(domain, body);
    indexes.push({
      domain,
      title: `${domain}/${DOMAIN_INDEX_CONCEPT}`,
      path,
      vector,
      length: vectorLength(vector)
    });
  }

  return indexes.sort((left, right) => left.domain.localeCompare(right.domain));
}

function candidatesForAll(
  ctx: WorkflowContext,
  indexes: DomainIndex[],
  edges: WikiRetopologyGraphEdge[],
  adjacency: Map<string, WikiRetopologyGraphEdge[]>,
  depth: number
): WikiRetopologyCandidate[] {
  const candidates: WikiRetopologyCandidate[] = [];
  for (let i = 0; i < indexes.length; i += 1) {
    for (let j = i + 1; j < indexes.length; j += 1) {
      candidates.push(candidateForPair(
        ctx,
        indexes[i],
        indexes[j],
        shortestConnection(indexes[i].domain, indexes[j].domain, edges, adjacency, depth)
      ));
    }
  }
  return candidates.sort(compareCandidates);
}

function candidatesForDomain(
  ctx: WorkflowContext,
  focus: DomainIndex,
  indexes: DomainIndex[]
): WikiRetopologyCandidate[] {
  return indexes
    .filter((index) => index.domain !== focus.domain)
    .map((index) => candidateForPair(ctx, focus, index))
    .sort(compareCandidates);
}

function graphForDomain(
  root: DomainIndex,
  edges: WikiRetopologyGraphEdge[],
  adjacency: Map<string, WikiRetopologyGraphEdge[]>,
  depth: number
): WikiRetopologyGraph {
  const visits = new Map<string, { distance: number; path: string[] }>([
    [root.domain, { distance: 0, path: [root.domain] }]
  ]);
  const queue = [root.domain];

  while (queue.length > 0) {
    const domain = queue.shift()!;
    const visit = visits.get(domain)!;
    if (visit.distance >= depth) continue;
    for (const edge of adjacency.get(domain) ?? []) {
      const next = edge.domains[0] === domain ? edge.domains[1] : edge.domains[0];
      if (visits.has(next)) continue;
      visits.set(next, {
        distance: visit.distance + 1,
        path: [...visit.path, next]
      });
      queue.push(next);
    }
  }

  const nodes = [...visits.entries()]
    .map(([domain, visit]) => ({
      domain,
      index: `${domain}/${DOMAIN_INDEX_CONCEPT}`,
      distance: visit.distance,
      path: visit.path
    }))
    .sort((left, right) => left.distance - right.distance || left.domain.localeCompare(right.domain));
  const visibleEdges = edges.filter((edge) => visits.has(edge.domains[0]) && visits.has(edge.domains[1]));

  return {
    root: root.domain,
    depth,
    nodes,
    edges: visibleEdges
  };
}

function indexGraphEdges(ctx: WorkflowContext, indexes: DomainIndex[]): WikiRetopologyGraphEdge[] {
  const byPath = new Map(indexes.map((index) => [index.path, index]));
  const byKey = new Map<string, WikiRetopologyGraphEdge>();

  for (const source of indexes) {
    const targets = ctx.host.resolvedLinks()[source.path] ?? {};
    for (const [targetPath, count] of Object.entries(targets)) {
      if (typeof count !== "number" || count <= 0) continue;
      const target = byPath.get(normalizeVaultPath(targetPath));
      if (!target || target.domain === source.domain) continue;

      const [left, right] = source.domain.localeCompare(target.domain) <= 0
        ? [source, target]
        : [target, source];
      const key = `${left.domain}\0${right.domain}`;
      const edge = byKey.get(key) ?? {
        domains: [left.domain, right.domain],
        indexes: [left.title, right.title],
        links: []
      };
      edge.links.push({ from: source.title, to: target.title });
      byKey.set(key, edge);
    }
  }

  return [...byKey.values()]
    .map((edge) => ({
      ...edge,
      links: edge.links.sort((a, b) => `${a.from}\0${a.to}`.localeCompare(`${b.from}\0${b.to}`))
    }))
    .sort((a, b) => a.domains.join("\0").localeCompare(b.domains.join("\0")));
}

function graphAdjacency(edges: WikiRetopologyGraphEdge[]): Map<string, WikiRetopologyGraphEdge[]> {
  const adjacency = new Map<string, WikiRetopologyGraphEdge[]>();
  for (const edge of edges) {
    for (const domain of edge.domains) {
      const list = adjacency.get(domain) ?? [];
      list.push(edge);
      adjacency.set(domain, list);
    }
  }
  for (const list of adjacency.values()) {
    list.sort((left, right) => left.domains.join("\0").localeCompare(right.domains.join("\0")));
  }
  return adjacency;
}

function shortestConnection(
  from: string,
  to: string,
  edges: WikiRetopologyGraphEdge[],
  adjacency: Map<string, WikiRetopologyGraphEdge[]>,
  depth: number
): WikiRetopologyConnection {
  const byKey = new Map(edges.map((edge) => [edge.domains.join("\0"), edge]));
  const visits = new Map<string, { distance: number; path: string[] }>([
    [from, { distance: 0, path: [from] }]
  ]);
  const queue = [from];

  while (queue.length > 0) {
    const domain = queue.shift()!;
    const visit = visits.get(domain)!;
    if (domain === to) break;
    if (visit.distance >= depth) continue;
    for (const edge of adjacency.get(domain) ?? []) {
      const next = edge.domains[0] === domain ? edge.domains[1] : edge.domains[0];
      if (visits.has(next)) continue;
      visits.set(next, {
        distance: visit.distance + 1,
        path: [...visit.path, next]
      });
      queue.push(next);
    }
  }

  const hit = visits.get(to);
  if (!hit) {
    return {
      connected: false,
      depth,
      distance: null,
      path: [],
      edges: []
    };
  }

  return {
    connected: true,
    depth,
    distance: hit.distance,
    path: hit.path,
    edges: pathEdges(hit.path, byKey)
  };
}

function pathEdges(path: string[], byKey: Map<string, WikiRetopologyGraphEdge>): WikiRetopologyGraphEdge[] {
  const edges: WikiRetopologyGraphEdge[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const [left, right] = path[index].localeCompare(path[index + 1]) <= 0
      ? [path[index], path[index + 1]]
      : [path[index + 1], path[index]];
    const edge = byKey.get(`${left}\0${right}`);
    if (edge) edges.push(edge);
  }
  return edges;
}

function candidateForPair(
  ctx: WorkflowContext,
  left: DomainIndex,
  right: DomainIndex,
  connection?: WikiRetopologyConnection
): WikiRetopologyCandidate {
  const explicitLinks = explicitIndexLinks(ctx, left, right);
  const baseScore = cosine(left, right);
  const score = roundScore(Math.min(1, baseScore + explicitLinks.length * EXPLICIT_LINK_BOOST));
  const sharedTerms = topSharedTerms(left, right);
  const evidence = candidateEvidence(sharedTerms, explicitLinks);
  return {
    domains: [left.domain, right.domain],
    indexes: [left.title, right.title],
    score,
    shared_terms: sharedTerms,
    explicit_links: explicitLinks,
    evidence,
    ...(connection ? { connection } : {})
  };
}

function explicitIndexLinks(
  ctx: WorkflowContext,
  left: DomainIndex,
  right: DomainIndex
): Array<{ from: string; to: string }> {
  const links = ctx.host.resolvedLinks();
  const result: Array<{ from: string; to: string }> = [];
  for (const [source, target] of [
    [left, right],
    [right, left]
  ] as Array<[DomainIndex, DomainIndex]>) {
    const targets = links[source.path] ?? {};
    for (const [targetPath, count] of Object.entries(targets)) {
      if (typeof count !== "number" || count <= 0) continue;
      if (wikiDomainFromPath(targetPath) !== target.domain) continue;
      result.push({
        from: source.title,
        to: titleFromWikiPath(targetPath)
      });
    }
  }
  return result.sort((a, b) => `${a.from}\0${a.to}`.localeCompare(`${b.from}\0${b.to}`));
}

function wikiDomainFromPath(path: string): string | undefined {
  const normalized = normalizeVaultPath(path);
  const wikiRoot = normalizeVaultPath(PARA_ZK_PATHS.wikiFolder);
  if (!normalized.startsWith(`${wikiRoot}/`)) return undefined;
  const segments = normalized.slice(wikiRoot.length + 1).split("/");
  return segments.length >= 2 ? segments[0] : undefined;
}

function titleFromWikiPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  const wikiRoot = normalizeVaultPath(PARA_ZK_PATHS.wikiFolder);
  const relative = normalized.startsWith(`${wikiRoot}/`)
    ? normalized.slice(wikiRoot.length + 1)
    : normalized;
  return relative.replace(/\.md$/i, "");
}

function candidateEvidence(shared: string[], explicitLinks: Array<{ from: string; to: string }>): string[] {
  const evidence: string[] = [];
  if (shared.length > 0) evidence.push(`shared terms: ${shared.join(", ")}`);
  for (const link of explicitLinks) evidence.push(`index link: ${link.from} -> ${link.to}`);
  return evidence;
}

function compareCandidates(left: WikiRetopologyCandidate, right: WikiRetopologyCandidate): number {
  const score = right.score - left.score;
  if (score !== 0) return score;
  const links = right.explicit_links.length - left.explicit_links.length;
  if (links !== 0) return links;
  return left.domains.join("\0").localeCompare(right.domains.join("\0"));
}

function indexVector(domain: string, body: string): Map<string, number> {
  const vector = new Map<string, number>();
  for (const token of tokens(domain)) addWeight(vector, token, 3);
  for (const token of tokens(body)) addWeight(vector, token, 1);
  return vector;
}

function addWeight(vector: Map<string, number>, token: string, weight: number): void {
  vector.set(token, (vector.get(token) ?? 0) + weight);
}

function tokens(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, " $1 ")
    .replace(/`[^`]*`/g, " ");
  const matches = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  return matches.filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function vectorLength(vector: Map<string, number>): number {
  let sum = 0;
  for (const weight of vector.values()) sum += weight * weight;
  return Math.sqrt(sum);
}

function cosine(left: DomainIndex, right: DomainIndex): number {
  if (left.length === 0 || right.length === 0) return 0;
  let dot = 0;
  const [small, large] = left.vector.size <= right.vector.size
    ? [left.vector, right.vector]
    : [right.vector, left.vector];
  for (const [token, leftWeight] of small.entries()) {
    const rightWeight = large.get(token);
    if (rightWeight !== undefined) dot += leftWeight * rightWeight;
  }
  return dot / (left.length * right.length);
}

function topSharedTerms(left: DomainIndex, right: DomainIndex): string[] {
  const terms: Array<{ token: string; weight: number }> = [];
  for (const [token, leftWeight] of left.vector.entries()) {
    const rightWeight = right.vector.get(token);
    if (rightWeight === undefined) continue;
    terms.push({ token, weight: Math.min(leftWeight, rightWeight) });
  }
  return terms
    .sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token))
    .slice(0, MAX_SHARED_TERMS)
    .map((entry) => entry.token);
}

function roundScore(value: number): number {
  return Number(value.toFixed(SCORE_PRECISION));
}
