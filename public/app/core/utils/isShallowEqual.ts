// From https://github.com/streamich/fast-shallow-equal

export function isShallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (!(a instanceof Object) || !(b instanceof Object)) {
    return false;
  }

  // After the instanceof checks both values are objects; widen to indexable records to inspect their own keys.
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  const length = keys.length;

  for (let i = 0; i < length; i++) {
    if (!(keys[i] in bRecord)) {
      return false;
    }
  }

  for (let i = 0; i < length; i++) {
    if (aRecord[keys[i]] !== bRecord[keys[i]]) {
      return false;
    }
  }

  return length === Object.keys(bRecord).length;
}
