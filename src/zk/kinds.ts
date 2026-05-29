import type { PromotionZkKind, ZkKind } from "../types";

const ZK_KIND_CODES = ["fleeting", "literature", "permanent"] as const;
const PROMOTION_ZK_KIND_CODES = ["literature", "permanent"] as const;

type ZkKindCode = typeof ZK_KIND_CODES[number];

export const ZK_KIND_CODE_HELP = codeHelp(ZK_KIND_CODES);
export const PROMOTION_ZK_KIND_CODE_HELP = codeHelp(PROMOTION_ZK_KIND_CODES);

const ZK_KIND_BY_CODE: Record<ZkKindCode, ZkKind> = {
  fleeting: "Fleeting",
  literature: "Literature",
  permanent: "Permanent"
};

export function parseZkKind(value: string | undefined): ZkKind | undefined {
  const code = parseCode(value, ZK_KIND_CODES);
  return code ? ZK_KIND_BY_CODE[code] : undefined;
}

export function parsePromotionKind(value: string | undefined): PromotionZkKind | undefined {
  const kind = parseZkKind(value);
  return kind === "Literature" || kind === "Permanent" ? kind : undefined;
}

export function normalizeZkKind(value: string | undefined, fallback: ZkKind = "Fleeting"): ZkKind {
  return parseZkKind(value) ?? fallback;
}

export function normalizePromotionKind(value: string | undefined, fallback: PromotionZkKind = "Permanent"): PromotionZkKind {
  return parsePromotionKind(value) ?? fallback;
}

function parseCode<T extends string>(value: string | undefined, codes: readonly T[]): T | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  return codes.find((code) => normalized === code);
}

function codeHelp(codes: readonly string[]): string {
  return codes.join("|");
}
