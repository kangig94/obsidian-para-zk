import type { ResourceCreateKind, ZkKind } from "../types";

export const ZK_KIND_CODES = ["spark", "digest", "permanent"] as const;
const RESOURCE_CREATE_KIND_CODES = ["digest", "permanent"] as const;

export type ZkKindCode = typeof ZK_KIND_CODES[number];

// A ZK note's stored surface type equals its kind code (spark/digest/permanent).
// There is no `zk_` namespace prefix: ZK-ness is carried by the folder, just as a
// resource isn't typed `para_resource` for living under PARA/Resources.
export function isZkType(type: string): boolean {
  return (ZK_KIND_CODES as readonly string[]).includes(type);
}

export const ZK_KIND_CODE_HELP = codeHelp(ZK_KIND_CODES);
export const RESOURCE_CREATE_KIND_CODE_HELP = codeHelp(RESOURCE_CREATE_KIND_CODES);

const ZK_KIND_BY_CODE: Record<ZkKindCode, ZkKind> = {
  spark: "Spark",
  digest: "Digest",
  permanent: "Permanent"
};

const ZK_CODE_BY_KIND: Record<ZkKind, ZkKindCode> = {
  Spark: "spark",
  Digest: "digest",
  Permanent: "permanent"
};

// Locale-neutral code for a ZkKind — the form result envelopes expose, matching the
// `kind=` input codes (so CLI/MCP output and input speak the same vocabulary).
export function zkKindCode(kind: ZkKind): ZkKindCode {
  return ZK_CODE_BY_KIND[kind];
}

export function parseZkKind(value: string | undefined): ZkKind | undefined {
  const code = parseCode(value, ZK_KIND_CODES);
  return code ? ZK_KIND_BY_CODE[code] : undefined;
}

export function parseResourceCreateKind(value: string | undefined): ResourceCreateKind | undefined {
  const kind = parseZkKind(value);
  return kind === "Digest" || kind === "Permanent" ? kind : undefined;
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
