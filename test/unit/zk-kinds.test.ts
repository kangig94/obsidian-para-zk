import { describe, expect, it } from "vitest";
import {
  PROMOTION_ZK_KIND_CODE_HELP,
  ZK_KIND_CODE_HELP,
  normalizePromotionKind,
  normalizeZkKind,
  parsePromotionKind,
  parseZkKind
} from "../../src/zk/kinds";

describe("parseZkKind", () => {
  it("maps lower-case codes to display kinds", () => {
    expect(parseZkKind("fleeting")).toBe("Fleeting");
    expect(parseZkKind("literature")).toBe("Literature");
    expect(parseZkKind("permanent")).toBe("Permanent");
  });

  it("is case-sensitive and rejects unknown or missing codes", () => {
    expect(parseZkKind("Fleeting")).toBeUndefined();
    expect(parseZkKind("bogus")).toBeUndefined();
    expect(parseZkKind(undefined)).toBeUndefined();
  });
});

describe("parsePromotionKind", () => {
  it("accepts only literature and permanent", () => {
    expect(parsePromotionKind("literature")).toBe("Literature");
    expect(parsePromotionKind("permanent")).toBe("Permanent");
    expect(parsePromotionKind("fleeting")).toBeUndefined();
  });
});

describe("normalize helpers", () => {
  it("apply documented fallbacks", () => {
    expect(normalizeZkKind(undefined)).toBe("Fleeting");
    expect(normalizeZkKind("literature")).toBe("Literature");
    expect(normalizePromotionKind(undefined)).toBe("Permanent");
    expect(normalizePromotionKind("literature")).toBe("Literature");
  });
});

describe("code help strings", () => {
  it("list the accepted codes", () => {
    expect(ZK_KIND_CODE_HELP).toBe("fleeting|literature|permanent");
    expect(PROMOTION_ZK_KIND_CODE_HELP).toBe("literature|permanent");
  });
});
