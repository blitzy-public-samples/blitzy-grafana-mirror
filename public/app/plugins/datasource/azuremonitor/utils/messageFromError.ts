import { isValidElement } from 'react';

import { type AzureMonitorErrorish } from '../types/types';

export function messageFromElement(error: AzureMonitorErrorish): AzureMonitorErrorish | undefined {
  if (isValidElement(error)) {
    return error;
  } else {
    return messageFromError(error);
  }
}

// Type guard for plain object values. Used to narrow `unknown` so the
// optional-chained property access on the heterogeneous error shapes this
// function handles (Azure REST API errors, legacy Angular errors, generic JS
// Error) remains type-safe without a type assertion — which would otherwise
// violate `@typescript-eslint/consistent-type-assertions` per AAP §0.8.5.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Reads a chain of nested property keys from an unknown value, mirroring an
// optional-chained property access. Returns the final value (typed `unknown`),
// or `undefined` if any intermediate step is not a record. Callers continue
// to narrow the returned value before use.
function readNested(value: unknown, ...keys: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (!isObject(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

export default function messageFromError(error: unknown): string | undefined {
  if (!isObject(error)) {
    return undefined;
  }

  if (typeof error.message === 'string') {
    return error.message;
  }

  const dataErrorMessage = readNested(error, 'data', 'error', 'message');
  if (typeof dataErrorMessage === 'string') {
    return dataErrorMessage;
  }

  // Copied from the old Angular code - this might be checking for errors in places
  // that the new code just doesnt use.
  // As new error objects are discovered they should be added to the above code, rather
  // than below
  const maybeAMessage =
    readNested(error, 'error', 'data', 'error', 'innererror', 'innererror', 'message') ||
    readNested(error, 'error', 'data', 'error', 'innererror', 'message') ||
    readNested(error, 'error', 'data', 'error', 'message') ||
    readNested(error, 'error', 'data', 'message') ||
    readNested(error, 'data', 'message') ||
    error;

  if (typeof maybeAMessage === 'string') {
    return maybeAMessage;
  }

  // Preserve the original `maybeAMessage && maybeAMessage.toString()` runtime
  // behavior: any truthy object whose `toString` is callable is stringified.
  // Falsy values (null/undefined/0/false/'') are skipped, matching the original
  // truthiness gate. We narrow via `isObject` and check that `toString` is a
  // function before invoking it (some objects like `Object.create(null)` lack
  // a callable `toString`).
  if (isObject(maybeAMessage)) {
    const stringifier = maybeAMessage.toString;
    if (typeof stringifier === 'function') {
      const result = stringifier.call(maybeAMessage);
      if (typeof result === 'string') {
        return result;
      }
    }
  }

  return undefined;
}
