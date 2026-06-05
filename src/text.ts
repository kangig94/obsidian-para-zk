export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_\/]+/g, "_")
    .replace(/-/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "untitled";
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
