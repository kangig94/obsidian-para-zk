import { describe, expect, it } from "vitest";
import {
  dateFromCli,
  formatDateTimeMinutes,
  isoWeekInfo,
  localDate,
  localTime,
  relativeTimeParts
} from "../../src/time";
import { formatRelativeTime } from "../../src/i18n";

describe("localDate / localTime", () => {
  it("zero-pads date and time fields", () => {
    const date = new Date(2026, 0, 5, 9, 7);
    expect(localDate(date)).toBe("2026-01-05");
    expect(localTime(date)).toBe("09:07");
  });
});

describe("dateFromCli", () => {
  it("parses an ISO date string at local midnight", () => {
    expect(localDate(dateFromCli("2026-06-05"))).toBe("2026-06-05");
  });

  it("falls back to the current date for missing input", () => {
    expect(dateFromCli(undefined)).toBeInstanceOf(Date);
  });

  it("rejects invalid date strings instead of normalizing them", () => {
    expect(() => dateFromCli("not-a-date")).toThrow("date must be YYYY-MM-DD");
    expect(() => dateFromCli("2026-02-31")).toThrow("date must be a valid YYYY-MM-DD");
  });
});

describe("formatDateTimeMinutes", () => {
  it("normalizes ISO `T` and drops seconds to `YYYY-MM-DD HH:MM`", () => {
    expect(formatDateTimeMinutes("2026-06-10T08:30")).toBe("2026-06-10 08:30");
    expect(formatDateTimeMinutes("2026-06-10 08:30")).toBe("2026-06-10 08:30");
    expect(formatDateTimeMinutes("2026-06-10T08:30:45")).toBe("2026-06-10 08:30");
  });

  it("returns undefined for unparseable values", () => {
    expect(formatDateTimeMinutes("")).toBeUndefined();
    expect(formatDateTimeMinutes("{{created}}")).toBeUndefined();
    expect(formatDateTimeMinutes(undefined)).toBeUndefined();
  });
});

describe("relativeTimeParts", () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const now = new Date(2026, 5, 14, 12, 0).getTime();
  const ago = (ms: number) => relativeTimeParts(now - ms, now);

  it("buckets by age and degrades to absolute past 30 days", () => {
    expect(ago(0)).toEqual({ unit: "just-now" });
    expect(ago(30_000)).toEqual({ unit: "just-now" }); // < 1 min
    expect(ago(42 * MIN)).toEqual({ unit: "minutes", minutes: 42 });
    expect(ago(3 * HOUR + 12 * MIN)).toEqual({ unit: "hours", hours: 3, minutes: 12 });
    expect(ago(2 * HOUR)).toEqual({ unit: "hours", hours: 2, minutes: 0 });
    expect(ago(5 * DAY)).toEqual({ unit: "days", days: 5 });
    expect(ago(29 * DAY)).toEqual({ unit: "days", days: 29 });
    expect(ago(30 * DAY)).toEqual({ unit: "absolute" }); // horizon is inclusive of absolute
  });

  it("pins each bucket's lower-bound and horizon fence-posts", () => {
    expect(ago(MIN)).toEqual({ unit: "minutes", minutes: 1 }); // first non-just-now
    expect(ago(MIN - 1)).toEqual({ unit: "just-now" });
    expect(ago(HOUR)).toEqual({ unit: "hours", hours: 1, minutes: 0 }); // first hours value
    expect(ago(DAY)).toEqual({ unit: "days", days: 1 }); // first days value
    expect(ago(30 * DAY - 1)).toEqual({ unit: "days", days: 29 }); // last relative value
  });

  it("clamps future timestamps to just-now", () => {
    expect(relativeTimeParts(now + 5 * MIN, now)).toEqual({ unit: "just-now" });
  });
});

describe("formatRelativeTime", () => {
  it("renders Korean phrases and omits a zero-minute component", () => {
    expect(formatRelativeTime({ unit: "just-now" }, "ko")).toBe("방금");
    expect(formatRelativeTime({ unit: "minutes", minutes: 42 }, "ko")).toBe("42분 전");
    expect(formatRelativeTime({ unit: "hours", hours: 3, minutes: 12 }, "ko")).toBe("3시간 12분 전");
    expect(formatRelativeTime({ unit: "hours", hours: 2, minutes: 0 }, "ko")).toBe("2시간 전");
    expect(formatRelativeTime({ unit: "days", days: 5 }, "ko")).toBe("5일 전");
  });

  it("renders English phrases", () => {
    expect(formatRelativeTime({ unit: "just-now" }, "en")).toBe("just now");
    expect(formatRelativeTime({ unit: "minutes", minutes: 42 }, "en")).toBe("42m ago");
    expect(formatRelativeTime({ unit: "hours", hours: 3, minutes: 12 }, "en")).toBe("3h 12m ago");
    expect(formatRelativeTime({ unit: "hours", hours: 2, minutes: 0 }, "en")).toBe("2h ago");
    expect(formatRelativeTime({ unit: "days", days: 5 }, "en")).toBe("5d ago");
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
