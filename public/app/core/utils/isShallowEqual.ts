// From https://github.com/streamich/fast-shallow-equal

/**
 * Type guard preserving the original `instanceof Object` runtime check while narrowing the
 * value to `Record<string, unknown>` so the indexing loops below type-check without using
 * `as` assertions. Using a type predicate here avoids adding a new
 * `@typescript-eslint/consistent-type-assertions` baseline entry per AAP §0.8.5.
 */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value instanceof Object;
}

export function isShallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (!isObjectRecord(a) || !isObjectRecord(b)) {
    return false;
  }

  const keys = Object.keys(a);
  const length = keys.length;

  for (let i = 0; i < length; i++) {
    if (!(keys[i] in b)) {
      return false;
    }
  }

  for (let i = 0; i < length; i++) {
    if (a[keys[i]] !== b[keys[i]]) {
      return false;
    }
  }

  return length === Object.keys(b).length;
}
