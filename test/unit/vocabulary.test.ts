import { describe, expect, it } from "vitest";
import {
  PRIORITY_CODE_HELP,
  PROJECT_STATUS_CODE_HELP,
  RESOURCE_KIND_CODES,
  SUBNOTE_TYPE_CODES,
  parsePriorityCode,
  parseProjectStatusCode,
  priorityLabel,
  projectStatusLabel,
  resourceKindLabel,
  subnoteTypeLabel
} from "../../src/vocabulary";

describe("code parsing", () => {
  it("accepts known codes and rejects unknown ones", () => {
    expect(parseProjectStatusCode("in_progress")).toBe("in_progress");
    expect(parseProjectStatusCode("archived")).toBe("archived");
    expect(parseProjectStatusCode("bogus")).toBeUndefined();
    expect(parsePriorityCode("high")).toBe("high");
  });
});

describe("code help strings", () => {
  it("enumerate the canonical codes", () => {
    expect(PROJECT_STATUS_CODE_HELP).toBe("idea|in_progress|paused|done|archived");
    expect(PRIORITY_CODE_HELP).toBe("low|medium|high");
  });
});

describe("localized labels", () => {
  it("render non-empty labels that differ between locales", () => {
    const en = projectStatusLabel("in_progress", "en");
    const ko = projectStatusLabel("in_progress", "ko");
    expect(en).toBeTruthy();
    expect(ko).toBeTruthy();
    expect(en).not.toBe(ko);
    expect(priorityLabel("high", "en")).toBeTruthy();
  });

  it("localizes the built-in Resource kind suggestions", () => {
    for (const code of RESOURCE_KIND_CODES) {
      expect(resourceKindLabel(code, "en")).toBeTruthy();
      expect(resourceKindLabel(code, "ko")).toBeTruthy();
      expect(resourceKindLabel(code, "ko")).not.toBe(resourceKindLabel(code, "en"));
    }
  });

  it("localizes the built-in Subnote kind suggestions", () => {
    for (const code of SUBNOTE_TYPE_CODES) {
      expect(subnoteTypeLabel(code, "en")).toBeTruthy();
      expect(subnoteTypeLabel(code, "ko")).toBeTruthy();
      expect(subnoteTypeLabel(code, "ko")).not.toBe(subnoteTypeLabel(code, "en"));
    }
  });
});
