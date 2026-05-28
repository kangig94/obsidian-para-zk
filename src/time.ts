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

export function localDateTimeSpace(date = new Date()): string {
  return `${localDate(date)} ${localTime(date)}`;
}

export function dateFromCli(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
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
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

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
