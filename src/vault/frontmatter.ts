export function yamlScalar(value: string | undefined): string {
  if (!value) return "";
  return JSON.stringify(value);
}

export function frontmatterLinks(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}
