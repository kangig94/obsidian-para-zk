import { expect } from "vitest";

export function expectGeneratedReferenceId(id: unknown): asserts id is string {
  expect(id).toEqual(expect.any(String));
  if (typeof id !== "string") return;
  expect(id).toMatch(/^[a-z0-9]{6}$/i);
  expect(id).toMatch(/[a-z]/i);
}
