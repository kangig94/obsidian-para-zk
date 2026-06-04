export function readOptionalCode<T extends string>(
  value: string | undefined,
  parse: (value: string | undefined) => T | undefined,
  field: string,
  allowed: string
): T | undefined {
  if (value === undefined) return undefined;
  const code = parse(value);
  if (code) return code;
  throw new Error(`${field} must be one of: ${allowed} (received: ${value})`);
}
