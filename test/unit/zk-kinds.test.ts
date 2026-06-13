import { describe, expect, it } from "vitest";
import {
  RESOURCE_CREATE_KIND_CODE_HELP,
  ZK_KIND_CODE_HELP,
  isZkType,
  normalizeZkKind,
  parseResourceCreateKind,
  parseZkKind
} from "../../src/zk/kinds";

describe("parseZkKind", () => {
  it("maps lower-case codes to display kinds", () => {
    expect(parseZkKind("spark")).toBe("Spark");
    expect(parseZkKind("digest")).toBe("Digest");
    expect(parseZkKind("permanent")).toBe("Permanent");
  });

  it("is case-sensitive and rejects unknown or missing codes", () => {
    expect(parseZkKind("Spark")).toBeUndefined();
    expect(parseZkKind("bogus")).toBeUndefined();
    expect(parseZkKind(undefined)).toBeUndefined();
  });
});

describe("parseResourceCreateKind", () => {
  it("accepts only digest and permanent", () => {
    expect(parseResourceCreateKind("digest")).toBe("Digest");
    expect(parseResourceCreateKind("permanent")).toBe("Permanent");
    expect(parseResourceCreateKind("spark")).toBeUndefined();
  });
});

describe("normalize helpers", () => {
  it("apply documented fallbacks", () => {
    expect(normalizeZkKind(undefined)).toBe("Spark");
    expect(normalizeZkKind("digest")).toBe("Digest");
  });
});

describe("isZkType", () => {
  it("matches the bare ZK kind codes and rejects the dropped zk_ prefix form", () => {
    expect(isZkType("spark")).toBe(true);
    expect(isZkType("digest")).toBe(true);
    expect(isZkType("permanent")).toBe(true);
    expect(isZkType("zk_spark")).toBe(false);
    expect(isZkType("resource")).toBe(false);
    expect(isZkType("")).toBe(false);
  });
});

describe("code help strings", () => {
  it("list the accepted codes", () => {
    expect(ZK_KIND_CODE_HELP).toBe("spark|digest|permanent");
    expect(RESOURCE_CREATE_KIND_CODE_HELP).toBe("digest|permanent");
  });
});
