/** obj가 객체일 때 obj[key] 값을 반환하고, 아니면 undefined를 반환한다. */
export function getField(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== 'object') {
    return undefined;
  }
  return (obj as Record<string, unknown>)[key];
}

export function asString(obj: unknown, key: string): string | undefined {
  const value = getField(obj, key);
  return typeof value === 'string' ? value : undefined;
}

export function asArray(obj: unknown, key: string): unknown[] | undefined {
  const value = getField(obj, key);
  return Array.isArray(value) ? value : undefined;
}

export function asRecord(
  obj: unknown,
  key: string,
): Record<string, unknown> | undefined {
  const value = getField(obj, key);
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}
