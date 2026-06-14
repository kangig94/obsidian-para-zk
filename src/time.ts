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
  if (typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function") {
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
