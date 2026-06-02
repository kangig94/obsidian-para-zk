import { describe, expect, it } from "vitest";
import { dateFromCli, isoWeekInfo, localDate, localDateTimeSpace, localTime } from "../../src/time";

describe("localDate / localTime / localDateTimeSpace", () => {
  it("zero-pads date and time fields", () => {
    const date = new Date(2026, 0, 5, 9, 7);
    expect(localDate(date)).toBe("2026-01-05");
    expect(localTime(date)).toBe("09:07");
    expect(localDateTimeSpace(date)).toBe("2026-01-05 09:07");
  });
});

describe("dateFromCli", () => {
  it("parses an ISO date string at local midnight", () => {
    expect(localDate(dateFromCli("2026-06-05"))).toBe("2026-06-05");
  });

  it("falls back to the current date for missing or invalid input", () => {
    expect(dateFromCli(undefined)).toBeInstanceOf(Date);
    expect(Number.isNaN(dateFromCli("not-a-date").getTime())).toBe(false);
  });
});

describe("isoWeekInfo", () => {
  it("returns the Monday-to-Sunday span and ISO week label", () => {
    const info = isoWeekInfo(new Date(2026, 0, 7)); // Wednesday
    expect(info.weekStart).toBe("2026-01-05");
    expect(info.weekEnd).toBe("2026-01-11");
    expect(info.weekIso).toMatch(/^2026-W\d{2}$/);
  });
});
