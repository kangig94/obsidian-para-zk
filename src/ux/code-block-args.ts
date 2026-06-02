/** Parse key/value arguments from PARA-ZK fenced code block source text. */
export function parseCodeBlockKeyValues(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}
