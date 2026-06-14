// Renders the stable CLI envelope as readable, token-light text — the default
// output of every `para-zk:*` command. The JSON envelope (format=json) stays the
// canonical machine surface that MCP and automation parse; this module never feeds
// them. Text mode used to echo a static per-command summary ("vault audited") and
// drop the payload, so callers were forced into JSON to see any data. Now text
// shows the data and JSON is opt-in.

type Envelope = Record<string, unknown>;

const ENVELOPE_META = new Set(["ok", "command"]);

export function renderCliText(command: string, payload: Envelope, summary: string): string {
  if (payload.ok === false) return summary; // summary is already `error: <message>`
  const body = renderBody(command, payload, summary);
  const warnings = stringList(payload.warnings).map((warning) => `warning: ${warning}`);
  return warnings.length > 0 ? [body, ...warnings].join("\n") : body;
}

function renderBody(command: string, payload: Envelope, summary: string): string {
  switch (command) {
    case "para-zk:audit": return renderAudit(payload);
    case "para-zk:list": return renderNoteList(payload);
    case "para-zk:wiki-ingest-candidates": return renderCandidates(payload);
    case "para-zk:describe": return renderSchema(payload, summary);
    default:
      return command.startsWith("para-zk:read")
        ? renderRead(payload)
        : renderMutation(payload, summary);
  }
}

// --- mutations (create / update / rename / delete / capture / setup / attach) ---

const MUTATION_SKIP = new Set([...ENVELOPE_META, "path", "warnings", "title", "opened"]);

function renderMutation(payload: Envelope, summary: string): string {
  const lines = [summary];
  if (typeof payload.path === "string") lines.push(`  path: ${payload.path}`);
  for (const [key, value] of Object.entries(payload)) {
    if (MUTATION_SKIP.has(key)) continue;
    if (isScalar(value)) {
      lines.push(`  ${key}: ${value}`);
    } else if (Array.isArray(value)) {
      const joined = summarizeItems(value);
      if (joined) lines.push(`  ${key}: ${joined}`);
    }
  }
  return lines.join("\n");
}

// --- reads (compact full surface, or exact key read) ---

const READ_META = new Set([...ENVELOPE_META, "mode", "path", "title", "type", "archived", "key", "value"]);

function renderRead(payload: Envelope): string {
  const header = readHeader(payload);
  if (payload.mode === "exact") {
    return [`${header}  ·  ${strOf(payload.key)}`, ...renderReadValue(payload.value)].join("\n");
  }
  const lines = [header];
  for (const [key, value] of Object.entries(payload)) {
    if (READ_META.has(key)) continue;
    lines.push(...renderSurfaceEntry(key, value));
  }
  return lines.join("\n");
}

function readHeader(payload: Envelope): string {
  const type = strOf(payload.type);
  const path = strOf(payload.path);
  const archived = payload.archived === true ? "  [archived]" : "";
  return type ? `${type}  ${path}${archived}` : `${path}${archived}`;
}

function renderSurfaceEntry(key: string, value: unknown): string[] {
  if (isRecord(value)) {
    // A compact read summarizes prose sections as `{chars}` and collections as `{count}`
    // (see workflows/read.ts compactReadMap); render those summaries, not the raw object.
    if (typeof value.chars === "number") return [`  ${key}: ${value.chars} chars`];
    if (typeof value.count === "number" && Object.keys(value).length === 1) {
      return [`  ${key}: ${value.count} items`];
    }
    return [`  ${key}:`, ...indentValue(value, "    ")];
  }
  if (isScalar(value)) return [`  ${key}: ${value}`];
  if (Array.isArray(value)) return [`  ${key}: ${summarizeItems(value) ?? "(empty)"}`];
  return [];
}

function renderReadValue(value: unknown): string[] {
  if (typeof value === "string") {
    return value === "" ? ["  (empty)"] : ["", ...value.split("\n")];
  }
  if (isCollectionPage(value)) return renderCollectionPage(value);
  if (isScalar(value)) return [`  ${value}`];
  if (value === null || value === undefined) return ["  (none)"];
  return indentValue(value, "  ");
}

// --- collection pages (key=references and other paginated reads) ---

function isCollectionPage(value: unknown): value is Envelope {
  return isRecord(value) && "items" in value && "has_more" in value;
}

function renderCollectionPage(page: Envelope): string[] {
  const count = typeof page.count === "number" ? page.count : undefined;
  const lines = [count !== undefined ? `${count} items` : "items"];
  const items = page.items;
  if (Array.isArray(items)) {
    for (const item of items) lines.push(`  ${itemLine(item)}`);
  } else if (isRecord(items)) {
    for (const [id, item] of Object.entries(items)) lines.push(`  ${id}  ${itemLine(item)}`);
  }
  const hint = paginationHint(page);
  if (hint) lines.push(`  ${hint}`);
  return lines;
}

// --- audit ---

function renderAudit(payload: Envelope): string {
  const counts = isRecord(payload.counts) ? payload.counts : {};
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const fixed = Array.isArray(payload.fixed) ? payload.fixed : [];
  const nonzero = Object.entries(counts).filter(([, count]) => typeof count === "number" && count > 0);

  const lines: string[] = [];
  if (nonzero.length > 0) {
    lines.push(nonzero.map(([code, count]) => `${code}: ${count}`).join("  ·  "));
  } else if (findings.length === 0 && fixed.length === 0) {
    lines.push("no findings");
  }

  const records = findings.filter(isRecord);
  const multipleCheckCodes = new Set(records.map((finding) => finding.code)).size > 1;
  for (const group of groupByPath(records)) {
    lines.push(group.path);
    for (const finding of group.findings) lines.push(`  ${findingLine(finding, multipleCheckCodes)}`);
  }

  const hint = paginationHint(payload);
  if (hint) lines.push(hint);
  if (fixed.length > 0) {
    const actions = fixed.map((item) => isRecord(item) ? strOf(item.action) : "").filter(Boolean);
    lines.push(`fixed: ${actions.join(", ")} (${fixed.length})`);
  }
  return lines.join("\n");
}

function groupByPath(findings: Envelope[]): { path: string; findings: Envelope[] }[] {
  const groups = new Map<string, Envelope[]>();
  for (const finding of findings) {
    const path = strOf(finding.path);
    const group = groups.get(path) ?? [];
    group.push(finding);
    groups.set(path, group);
  }
  return [...groups.entries()].map(([path, grouped]) => ({ path, findings: grouped }));
}

function findingLine(finding: Envelope, showCode: boolean): string {
  const detail = isRecord(finding.detail) ? finding.detail : {};
  const prefix = showCode ? `[${strOf(finding.code)}] ` : "";
  const link = typeof detail.link === "string" ? detail.link : undefined;
  if (link && typeof detail.resolved === "string") return `${prefix}${link} -> ${detail.resolved}`;
  if (link && detail.ambiguous === true) {
    const candidates = stringList(detail.candidates);
    return `${prefix}${link}  AMBIGUOUS (${candidates.length}: ${candidates.join(", ")})`;
  }
  if (link) return `${prefix}${link}`;
  const compact = inlineRecord(detail, ["index"]);
  return `${prefix}${compact || strOf(finding.fix)}`.trim();
}

// --- list / candidates ---

function renderNoteList(payload: Envelope): string {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const count = typeof payload.count === "number" ? payload.count : items.length;
  const lines: string[] = [];

  if (typeof payload.root === "string") {
    // Single-type listing: items are root-relative name strings; type and root stated once.
    const type = strOf(payload.type) || "note";
    lines.push(`${count} ${type}${count === 1 ? "" : "s"} · root: ${payload.root}`);
    for (const item of items) lines.push(`  ${strOf(item)}`);
  } else {
    // Mixed/multi-root/archived listing: each item is {name, type}.
    const archived = payload.archived === true ? " (archived)" : "";
    lines.push(`${count} notes${archived}`);
    for (const item of items) {
      if (isRecord(item)) lines.push(`  ${strOf(item.type)}  ${strOf(item.name)}`);
    }
  }
  const hint = paginationHint(payload);
  if (hint) lines.push(hint);
  return lines.join("\n");
}

function renderCandidates(payload: Envelope): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const lines = [listHeader(payload, "candidates")];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const reason = strOf(candidate.reason);
    const stale = Array.isArray(candidate.stale_llm_wikis) ? candidate.stale_llm_wikis : [];
    const staleNote = stale.length > 0 ? `  (stale: ${stale.map(itemLabel).join(", ")})` : "";
    lines.push(`  ${strOf(candidate.path)}${reason ? `  [${reason}]` : ""}${staleNote}`);
  }
  const hint = paginationHint(payload);
  if (hint) lines.push(hint);
  return lines.join("\n");
}

function listHeader(payload: Envelope, noun: string): string {
  const count = typeof payload.count === "number" ? payload.count : 0;
  const returned = typeof payload.returned === "number" ? payload.returned : count;
  return returned === count ? `${count} ${noun}` : `${returned} of ${count} ${noun}`;
}

// --- describe (schema dump) ---

function renderSchema(payload: Envelope, summary: string): string {
  const lines = [summary];
  for (const [key, value] of Object.entries(payload)) {
    if (ENVELOPE_META.has(key)) continue;
    if (isScalar(value)) lines.push(`${key}: ${value}`);
    else if (Array.isArray(value) && value.every(isScalar)) lines.push(`${key}: ${value.join(", ")}`);
    else lines.push(`${key}:`, ...indentValue(value, "  "));
  }
  return lines.join("\n");
}

// --- shared formatting ---

function paginationHint(page: Envelope): string | undefined {
  if (page.has_more !== true) return undefined;
  const offset = typeof page.offset === "number" ? page.offset : 0;
  const returned = typeof page.returned === "number" ? page.returned : 0;
  const shown = offset + returned;
  const count = typeof page.count === "number" ? page.count : undefined;
  return count !== undefined
    ? `… +${count - shown} more (${shown}/${count}; offset/limit or limit=all)`
    : "… more (offset/limit or limit=all)";
}

function indentValue(value: unknown, indent: string): string[] {
  if (value === null || value === undefined) return [`${indent}(none)`];
  if (isScalar(value)) return [`${indent}${value}`];
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return value.length > 0 ? [`${indent}${value.join(", ")}`] : [];
    return value.flatMap((entry) => indentValue(entry, indent));
  }
  return Object.entries(value as Envelope).flatMap(([key, entry]) => {
    if (isScalar(entry)) return [`${indent}${key}: ${entry}`];
    if (Array.isArray(entry) && entry.every(isScalar)) return [`${indent}${key}: ${entry.join(", ")}`];
    if (entry === null || entry === undefined) return [`${indent}${key}: (none)`];
    return [`${indent}${key}:`, ...indentValue(entry, `${indent}  `)];
  });
}

function summarizeItems(items: unknown[]): string | undefined {
  if (items.length === 0) return undefined;
  if (items.every(isScalar)) return items.join(", ");
  const labels = items.map(itemLabel);
  const shown = labels.slice(0, 6).join(", ");
  return labels.length > 6 ? `${shown}, +${labels.length - 6} more` : shown;
}

function itemLabel(item: unknown): string {
  if (isScalar(item)) return String(item);
  if (isRecord(item)) {
    const label = item.title ?? item.path ?? item.link ?? item.name;
    // created:true is the mutation-workflow flag for a freshly-created item (e.g. a
    // project's areas); a timestamp `created` is a string and so never matches here.
    if (typeof label === "string") return item.created === true ? `${label} (new)` : label;
  }
  return "item";
}

function itemLine(item: unknown): string {
  if (isScalar(item)) return String(item);
  if (!isRecord(item)) return String(item);
  const link = item.link ?? item.path ?? item.title;
  if (typeof link === "string") {
    const description = item.description;
    return typeof description === "string" && description ? `${link}  —  ${description}` : link;
  }
  return inlineRecord(item, []);
}

function inlineRecord(record: Envelope, skip: string[]): string {
  return Object.entries(record)
    .filter(([key, value]) => isScalar(value) && !skip.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isRecord(value: unknown): value is Envelope {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function strOf(value: unknown): string {
  return isScalar(value) ? String(value) : "";
}
