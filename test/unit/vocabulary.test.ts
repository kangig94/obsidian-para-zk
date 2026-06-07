import { describe, expect, it } from "vitest";
import {
  PRIORITY_CODE_HELP,
  PROJECT_STATUS_CODE_HELP,
  RESOURCE_KIND_CODE_HELP,
  RESOURCE_KIND_CODES,
  SUBNOTE_TYPE_CODE_HELP,
  parsePriorityCode,
  parseProjectStatusCode,
  parseResourceKindCode,
  parseSubnoteTypeCode,
  priorityLabel,
  projectStatusLabel,
  resourceKindLabel
} from "../../src/vocabulary";

describe("code parsing", () => {
  it("accepts known codes and rejects unknown ones", () => {
    expect(parseProjectStatusCode("in_progress")).toBe("in_progress");
    expect(parseProjectStatusCode("archived")).toBe("archived");
    expect(parseProjectStatusCode("bogus")).toBeUndefined();
    expect(parsePriorityCode("high")).toBe("high");
    expect(parseSubnoteTypeCode("meeting")).toBe("meeting");
    expect(parseSubnoteTypeCode("nope")).toBeUndefined();
    expect(parseResourceKindCode("paper")).toBe("paper");
    expect(parseResourceKindCode("nope")).toBeUndefined();
  });
});

describe("code help strings", () => {
  it("enumerate the canonical codes", () => {
    expect(PROJECT_STATUS_CODE_HELP).toBe("idea|in_progress|paused|done|archived");
    expect(PRIORITY_CODE_HELP).toBe("low|medium|high");
    expect(SUBNOTE_TYPE_CODE_HELP.split("|")).toContain("meeting");
    expect(RESOURCE_KIND_CODE_HELP).toBe("paper|article|book|video|web|code|guide|other");
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

  it("gives every resource kind a real, locale-specific label in both ko and en", () => {
    for (const code of RESOURCE_KIND_CODES) {
      const en = resourceKindLabel(code, "en");
      const ko = resourceKindLabel(code, "ko");
      expect(en, code).toBeTruthy();
      expect(ko, code).toBeTruthy();
      // A missing ko entry would fall back to the English default — guard against that.
      expect(ko, code).not.toBe(en);
    }
  });
});
