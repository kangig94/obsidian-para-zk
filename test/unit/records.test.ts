import { describe, expect, it } from "vitest";
import { hasOwn, isRecord } from "../../src/records";

describe("isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("rejects arrays, null, and primitives", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
    expect(isRecord(3)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe("hasOwn", () => {
  it("checks own properties without accepting prototype properties", () => {
    const value = Object.create({ inherited: true }) as Record<string, unknown>;
    value.own = true;

    expect(hasOwn(value, "own")).toBe(true);
    expect(hasOwn(value, "inherited")).toBe(false);
  });
});
