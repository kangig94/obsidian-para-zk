import { isRecord } from "../records";
import { ensureFolder, parentFolder } from "../vault/files";
import { normalizeVaultPath } from "../vault/paths";
import { serializeFileWrite } from "../vault/write-serializer";
import type { WikiIngestLedgerRow, WorkflowContext } from "./context";
import { wikiLedgerPath } from "./locations";

export type AppendWikiIngestLedgerRowOptions = {
  wikiPath: string;
  sourcePath: string;
  sourceUpdated: unknown;
  sourceUpdatedMs: number | null | undefined;
};

export type WikiLedgerReadResult = {
  rows: WikiIngestLedgerRow[];
  latestRowsBySource: Map<string, WikiIngestLedgerRow>;
  ledger_warnings: string[];
};

export async function appendWikiIngestLedgerRow(
  ctx: WorkflowContext,
  options: AppendWikiIngestLedgerRowOptions
): Promise<WikiIngestLedgerRow> {
  const path = wikiLedgerPath(ctx.settings);
  return serializeFileWrite(path, async () => {
    let file = ctx.host.getFile(path);
    if (!file) {
      await ensureFolder(ctx.host, parentFolder(path));
      file = ctx.host.getFile(path) ?? await ctx.host.create(path, "");
    }

    const before = await ctx.host.read(file);
    const row: WikiIngestLedgerRow = {
      event: "cited",
      wiki_page: normalizeVaultPath(options.wikiPath),
      source_path: normalizeVaultPath(options.sourcePath),
      source_updated: ledgerJsonValue(options.sourceUpdated),
      source_updated_ms: typeof options.sourceUpdatedMs === "number" && Number.isFinite(options.sourceUpdatedMs)
        ? options.sourceUpdatedMs
        : null,
      at: new Date().toISOString()
    };
    const separator = before.length === 0 || before.endsWith("\n") ? "" : "\n";
    await ctx.host.modify(file, `${before}${separator}- ${JSON.stringify(row)}\n`);
    return row;
  });
}

export async function readWikiLedgerRows(ctx: WorkflowContext): Promise<WikiLedgerReadResult> {
  const file = ctx.host.getFile(wikiLedgerPath(ctx.settings));
  if (!file) {
    return {
      rows: [],
      latestRowsBySource: new Map(),
      ledger_warnings: []
    };
  }

  const content = await ctx.host.read(file);
  const rows: WikiIngestLedgerRow[] = [];
  const latestRowsBySource = new Map<string, WikiIngestLedgerRow>();
  const ledger_warnings: string[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const row = parseLedgerLine(line, index + 1, ledger_warnings);
    if (!row) return;
    rows.push(row);
    latestRowsBySource.set(row.source_path, row);
  });

  return {
    rows,
    latestRowsBySource,
    ledger_warnings
  };
}

function parseLedgerLine(line: string, lineNumber: number, warnings: string[]): WikiIngestLedgerRow | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  const match = trimmed.match(/^-\s+(\{.*\})$/);
  if (!match) {
    warnings.push(`line ${lineNumber}: malformed ledger row`);
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`line ${lineNumber}: malformed JSON: ${message}`);
    return undefined;
  }

  if (!isRecord(parsed) || parsed.event !== "cited") {
    warnings.push(`line ${lineNumber}: unsupported ledger event`);
    return undefined;
  }
  if (typeof parsed.wiki_page !== "string" || typeof parsed.source_path !== "string" || typeof parsed.at !== "string") {
    warnings.push(`line ${lineNumber}: missing required ledger fields`);
    return undefined;
  }

  const sourceUpdatedMs = parsed.source_updated_ms;
  return {
    event: "cited",
    wiki_page: normalizeVaultPath(parsed.wiki_page),
    source_path: normalizeVaultPath(parsed.source_path),
    source_updated: Object.prototype.hasOwnProperty.call(parsed, "source_updated") ? parsed.source_updated : null,
    source_updated_ms: typeof sourceUpdatedMs === "number" && Number.isFinite(sourceUpdatedMs) ? sourceUpdatedMs : null,
    at: parsed.at
  };
}

export function ledgerJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "object" && value !== null && "toISO" in value && typeof value.toISO === "function") {
    const iso = value.toISO();
    return typeof iso === "string" ? iso : null;
  }
  return value;
}
