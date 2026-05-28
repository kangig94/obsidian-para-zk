import type { PromotionZkKind, ZkKind } from "../types";

export function normalizeZkKind(value: string | undefined, fallback: ZkKind = "Fleeting"): ZkKind {
  const normalized = (value ?? "").trim().toLowerCase();
  if (["f", "fleeting", "zk_fleeting"].includes(normalized)) return "Fleeting";
  if (["l", "literature", "lit", "zk_literature"].includes(normalized)) return "Literature";
  if (["p", "permanent", "perm", "zk_permanent"].includes(normalized)) return "Permanent";
  return fallback;
}

export function normalizePromotionKind(value: string | undefined, fallback: PromotionZkKind = "Permanent"): PromotionZkKind {
  const kind = normalizeZkKind(value, fallback);
  return kind === "Fleeting" ? fallback : kind;
}
