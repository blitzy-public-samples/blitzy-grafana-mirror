import { omitBy } from 'lodash';
import { type Observable, of, throwError } from 'rxjs';

import { deprecationWarning, validatePath } from '@grafana/data';
import { type BackendSrvRequest } from '@grafana/runtime';

export const parseInitFromOptions = (options: BackendSrvRequest): RequestInit => {
  const method = options.method;
  const headers = parseHeaders(options);
  const isAppJson = isContentTypeJson(headers);
  const body = parseBody(options, isAppJson);
  const credentials = parseCredentials(options);

  return {
    method,
    headers,
    // `parseBody` returns `BodyInit | null | undefined` after explicit runtime
    // narrowing, so `body` can be passed directly to `RequestInit.body` without
    // a type assertion.
    body,
    credentials,
    signal: options.abortSignal,
  };
};

interface HeaderParser {
  canParse: (options: BackendSrvRequest) => boolean;
  parse: (headers: Headers) => Headers;
}

const defaultHeaderParser: HeaderParser = {
  canParse: () => true,
  parse: (headers) => {
    const accept = headers.get('accept');
    if (accept) {
      return headers;
    }

    headers.set('accept', 'application/json, text/plain, */*');
    return headers;
  },
};

const parseHeaderByMethodFactory = (methodPredicate: string): HeaderParser => ({
  canParse: (options) => {
    const method = options?.method ? options?.method.toLowerCase() : '';
    return method === methodPredicate;
  },
  parse: (headers) => {
    const contentType = headers.get('content-type');
    if (contentType) {
      return headers;
    }

    headers.set('content-type', 'application/json');
    return headers;
  },
});

const postHeaderParser: HeaderParser = parseHeaderByMethodFactory('post');
const putHeaderParser: HeaderParser = parseHeaderByMethodFactory('put');
const patchHeaderParser: HeaderParser = parseHeaderByMethodFactory('patch');

const headerParsers = [postHeaderParser, putHeaderParser, patchHeaderParser, defaultHeaderParser];
const unsafeCharacters = /[^\u0000-\u00ff]/g;

/**
 * Header values can only contain ISO-8859-1 characters. If a header key or value contains characters outside of this, we will encode the whole value.
 * Since `encodeURI` also encodes spaces, we won't encode if the value doesn't contain any unsafe characters.
 */
function sanitizeHeader(v: string) {
  return unsafeCharacters.test(v) ? encodeURI(v) : v;
}

export const parseHeaders = (options: BackendSrvRequest) => {
  const safeHeaders: Record<string, string> = {};
  for (let [key, value] of Object.entries(options.headers ?? {})) {
    // Header values are `unknown` per BackendSrvRequest's public type; coerce to
    // string before sanitization so the runtime behavior (string round-trip)
    // is unchanged.
    safeHeaders[sanitizeHeader(key)] = sanitizeHeader(String(value));
  }
  const headers = new Headers(safeHeaders);
  const parsers = headerParsers.filter((parser) => parser.canParse(options));
  const combinedHeaders = parsers.reduce((prev, parser) => {
    return parser.parse(prev);
  }, headers);

  return combinedHeaders;
};

export const isContentTypeJson = (headers: Headers) => {
  if (!headers) {
    return false;
  }

  const contentType = headers.get('content-type');
  if (
    contentType &&
    [
      'application/json',
      'application/json-patch+json',
      'application/merge-patch+json',
      'application/strategic-merge-patch+json',
    ].includes(contentType.toLowerCase())
  ) {
    return true;
  }

  return false;
};

export const parseBody = (options: BackendSrvRequest, isAppJson: boolean): BodyInit | null | undefined => {
  if (!options) {
    return undefined;
  }

  // `options.data` is typed `unknown` on BackendSrvRequest (per the
  // `<T = unknown>` defaulting introduced in @grafana/runtime). The branches
  // below narrow `data` via runtime checks rather than via a type assertion,
  // which lets us advertise an explicit `BodyInit | null | undefined` return
  // type that flows directly into `RequestInit.body` at the call site.
  const data = options.data;

  if (data == null) {
    return undefined;
  }
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof Blob) {
    return data;
  }

  if (isAppJson) {
    // JSON.stringify accepts `unknown` and returns a string — always BodyInit.
    return JSON.stringify(data);
  }

  // URL-encoded form body. URLSearchParams' constructor accepts
  // `URLSearchParams | string | string[][] | Record<string, string>`. After the
  // narrows above, `data` is one of: an existing `URLSearchParams` instance
  // (passthrough), an array (treated as the `string[][]` init form), a non-null
  // object (treated as the `Record<string, string>` init form via
  // `Object.entries`), or some other primitive (number, boolean) that we
  // coerce to a string. Inner values are passed through `String()` to match
  // URLSearchParams' default value-coercion behavior, preserving the prior
  // implementation's runtime semantics.
  if (data instanceof URLSearchParams) {
    return data;
  }
  if (Array.isArray(data)) {
    const entries: string[][] = data.map((pair) =>
      Array.isArray(pair) && pair.length >= 2 ? [String(pair[0]), String(pair[1])] : ['', '']
    );
    return new URLSearchParams(entries);
  }
  if (typeof data === 'object') {
    const entries: string[][] = Object.entries(data).map(([key, value]) => [key, String(value)]);
    return new URLSearchParams(entries);
  }
  return new URLSearchParams(String(data));
};

export async function parseResponseBody<T>(
  response: Response,
  responseType?: 'json' | 'text' | 'arraybuffer' | 'blob'
): Promise<T> {
  if (responseType) {
    switch (responseType) {
      case 'arraybuffer':
        // this specifically returns a Promise<ArrayBuffer>
        // TODO refactor this function to remove the type assertions
        return response.arrayBuffer() as Promise<T>;

      case 'blob':
        // this specifically returns a Promise<Blob>
        // TODO refactor this function to remove the type assertions
        return response.blob() as Promise<T>;

      case 'json':
        // An empty string is not a valid JSON.
        // Sometimes (unfortunately) our APIs declare their Content-Type as JSON, however they return an empty body.
        if (response.headers.get('Content-Length') === '0') {
          console.warn(`${response.url} returned an invalid JSON`);
          return {} as T;
        }
        return await response.json();

      case 'text':
        // this specifically returns a Promise<string>
        // TODO refactor this function to remove the type assertions
        return response.text() as Promise<T>;
    }
  }

  const textData = await response.text(); // this could be just a string, prometheus requests for instance
  try {
    return JSON.parse(textData); // majority of the requests this will be something that can be parsed
  } catch {}
  return textData as T;
}

function serializeParams(data: Record<string, unknown>): string {
  // Values arrive typed as `unknown` (the field type on `BackendSrvRequest.params`).
  // The runtime invariant — enforced by callers across the codebase — is that
  // remaining values are strings, numbers, booleans, or arrays of those
  // primitives. Inner values are passed through `String()` before
  // `encodeURIComponent` to preserve the prior implementation's behavior of
  // coercing primitives to their string form for URL encoding.
  return Object.keys(data)
    .map((key) => {
      const value = data[key];
      if (Array.isArray(value)) {
        return value
          .map((arrayValue) => `${encodeURIComponent(key)}=${encodeURIComponent(String(arrayValue))}`)
          .join('&');
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    })
    .join('&');
}

/**
 * Formats and validates the URL.
 * If options.validatePath is true, this will throw an exception if the URL fails validation.
 * @param options - The options to parse.
 * @returns An observable that emits the parsed URL or an error if the URL fails validation.
 */
export const parseUrlFromOptions = (options: BackendSrvRequest): Observable<string> => {
  try {
    // `options.params` values are typed `unknown` on BackendSrvRequest. Drop
    // undefined entries and empty arrays/strings; non-array, non-string truthy
    // values (numbers, booleans) are preserved for serialization.
    const cleanParams = omitBy(options.params, (v) => {
      if (v === undefined) {
        return true;
      }
      if (Array.isArray(v) || typeof v === 'string') {
        return v.length === 0;
      }
      return false;
    });
    // After omitBy the values are still typed `unknown`. `serializeParams`
    // accepts `Record<string, unknown>` and coerces inner values via `String()`
    // for the URL-encoded output, preserving the prior runtime behavior of
    // passing raw values to `encodeURIComponent`.
    const serializedParams = serializeParams(cleanParams);

    const url = options.validatePath //
      ? validatePath(options.url)
      : options.url;

    return options.params && serializedParams.length ? of(`${url}?${serializedParams}`) : of(url);
  } catch (error) {
    return throwError(() => error);
  }
};

export const parseCredentials = (options: BackendSrvRequest): RequestCredentials => {
  if (!options) {
    return options;
  }

  if (options.credentials) {
    return options.credentials;
  }

  if (options.withCredentials) {
    deprecationWarning('BackendSrvRequest', 'withCredentials', 'credentials');
    return 'include';
  }

  return 'same-origin';
};
