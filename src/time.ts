export function localDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function localTime(date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Must stay tolerant of update-time-on-edit ISO timestamps in created/updated frontmatter.
export function frontmatterTimeMs(value: unknown): number | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.getTime();
  }
  if (hasToMillis(value)) {
    const millis = value.toMillis();
    return typeof millis === "number" && Number.isFinite(millis) ? millis : undefined;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const dateParts = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (dateParts) {
    return new Date(
      Number(dateParts[1]),
      Number(dateParts[2]) - 1,
      Number(dateParts[3]),
      Number(dateParts[4] ?? 0),
      Number(dateParts[5] ?? 0),
      Number(dateParts[6] ?? 0)
    ).getTime();
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

function hasToMillis(value: unknown): value is { toMillis: () => unknown } {
  const candidate = value as { toMillis?: unknown } | null;
  return typeof candidate?.toMillis === "function";
}

export function minutesFromMs(ms: number): string {
  const date = new Date(ms);
  return `${localDate(date)} ${localTime(date)}`;
}

// Normalize a frontmatter timestamp to a human `YYYY-MM-DD HH:MM` (drops the ISO `T`
// and any seconds). Returns undefined when the value is not a parseable timestamp, so
// the caller can fall back to the raw text.
export function formatDateTimeMinutes(value: unknown): string | undefined {
  const ms = frontmatterTimeMs(value);
  return ms === undefined ? undefined : minutesFromMs(ms);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_HORIZON_MS = 30 * DAY_MS;

export type RelativeTime =
  | { unit: "just-now" }
  | { unit: "minutes"; minutes: number }
  | { unit: "hours"; hours: number; minutes: number }
  | { unit: "days"; days: number }
  | { unit: "absolute" };

// The buckets that map to a phrase; "absolute" is rendered as a plain date instead.
export type RelativePhrase = Exclude<RelativeTime, { unit: "absolute" }>;

// Bucket the age of a timestamp for relative display. Beyond the 30-day horizon (and for
// future timestamps clamped to "just-now") the caller renders an absolute date instead.
export function relativeTimeParts(thenMs: number, nowMs: number): RelativeTime {
  const diff = nowMs - thenMs;
  if (diff < MINUTE_MS) return { unit: "just-now" };
  if (diff < HOUR_MS) return { unit: "minutes", minutes: Math.floor(diff / MINUTE_MS) };
  if (diff < DAY_MS) {
    return { unit: "hours", hours: Math.floor(diff / HOUR_MS), minutes: Math.floor((diff % HOUR_MS) / MINUTE_MS) };
  }
  if (diff < RELATIVE_HORIZON_MS) return { unit: "days", days: Math.floor(diff / DAY_MS) };
  return { unit: "absolute" };
}

export function dateFromCli(value: string | undefined): Date {
  if (!value) return new Date();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`date must be YYYY-MM-DD: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    throw new Error(`date must be a valid YYYY-MM-DD: ${value}`);
  }
  return parsed;
}

export function isoWeekInfo(date = new Date()): {
  weekIso: string;
  weekStart: string;
  weekEnd: string;
} {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay() || 7;
  const thursday = new Date(current);
  thursday.setDate(current.getDate() + 4 - day);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const daysSinceYearStart = (thursday.getTime() - yearStart.getTime()) / 86400000;
  const week = Math.ceil((daysSinceYearStart + 1) / 7);

  const start = new Date(current);
  start.setDate(current.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    weekIso: `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`,
    weekStart: localDate(start),
    weekEnd: localDate(end)
  };
}
