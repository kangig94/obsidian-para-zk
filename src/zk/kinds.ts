import type { ResourceCreateKind, ZkKind } from "../types";

const ZK_KIND_CODES = ["spark", "source", "permanent"] as const;
const RESOURCE_CREATE_KIND_CODES = ["source", "permanent"] as const;

type ZkKindCode = typeof ZK_KIND_CODES[number];

export const ZK_KIND_CODE_HELP = codeHelp(ZK_KIND_CODES);
export const RESOURCE_CREATE_KIND_CODE_HELP = codeHelp(RESOURCE_CREATE_KIND_CODES);

const ZK_KIND_BY_CODE: Record<ZkKindCode, ZkKind> = {
  spark: "Spark",
  source: "Source",
  permanent: "Permanent"
};

export function parseZkKind(value: string | undefined): ZkKind | undefined {
  const code = parseCode(value, ZK_KIND_CODES);
  return code ? ZK_KIND_BY_CODE[code] : undefined;
}

export function parseResourceCreateKind(value: string | undefined): ResourceCreateKind | undefined {
  const kind = parseZkKind(value);
  return kind === "Source" || kind === "Permanent" ? kind : undefined;
}

export function normalizeZkKind(value: string | undefined, fallback: ZkKind = "Spark"): ZkKind {
  return parseZkKind(value) ?? fallback;
}

function parseCode<T extends string>(value: string | undefined, codes: readonly T[]): T | undefined {
  const normalized = (value ?? "").trim();
  return codes.find((code) => normalized === code);
}

function codeHelp(codes: readonly string[]): string {
  return codes.join("|");
}
