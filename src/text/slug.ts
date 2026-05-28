export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_\/]+/g, "_")
    .replace(/-/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "untitled";
}
