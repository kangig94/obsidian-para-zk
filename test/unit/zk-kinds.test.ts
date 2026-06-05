import { describe, expect, it } from "vitest";
import {
  RESOURCE_CREATE_KIND_CODE_HELP,
  ZK_KIND_CODE_HELP,
  normalizeZkKind,
  parseResourceCreateKind,
  parseZkKind
} from "../../src/zk/kinds";

describe("parseZkKind", () => {
  it("maps lower-case codes to display kinds", () => {
    expect(parseZkKind("spark")).toBe("Spark");
    expect(parseZkKind("source")).toBe("Source");
    expect(parseZkKind("permanent")).toBe("Permanent");
  });

  it("is case-sensitive and rejects unknown or missing codes", () => {
    expect(parseZkKind("Spark")).toBeUndefined();
    expect(parseZkKind("bogus")).toBeUndefined();
    expect(parseZkKind(undefined)).toBeUndefined();
  });
});

describe("parseResourceCreateKind", () => {
  it("accepts only source and permanent", () => {
    expect(parseResourceCreateKind("source")).toBe("Source");
    expect(parseResourceCreateKind("permanent")).toBe("Permanent");
    expect(parseResourceCreateKind("spark")).toBeUndefined();
  });
});

describe("normalize helpers", () => {
  it("apply documented fallbacks", () => {
    expect(normalizeZkKind(undefined)).toBe("Spark");
    expect(normalizeZkKind("source")).toBe("Source");
  });
});

describe("code help strings", () => {
  it("list the accepted codes", () => {
    expect(ZK_KIND_CODE_HELP).toBe("spark|source|permanent");
    expect(RESOURCE_CREATE_KIND_CODE_HELP).toBe("source|permanent");
  });
});
