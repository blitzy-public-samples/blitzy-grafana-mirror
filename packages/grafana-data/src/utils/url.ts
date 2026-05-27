/**
 * @preserve jquery-param (c) 2015 KNOWLEDGECODE | MIT
 */

import { isDateTime } from '../datetime/moment_wrapper';
import { type ExploreUrlState, type URLRange } from '../types/explore';
import { type RawTimeRange } from '../types/time';

/**
 * Type to represent the value of a single query variable.
 *
 * @public
 */
export type UrlQueryValue = string | number | boolean | string[] | number[] | boolean[] | undefined | null;

/**
 * Type to represent the values parsed from the query string.
 *
 * @public
 */
export type UrlQueryMap = Record<string, UrlQueryValue>;

function renderUrl(path: string, query: UrlQueryMap | undefined): string {
  if (query && Object.keys(query).length > 0) {
    path += '?' + toUrlParams(query);
  }
  return path;
}

function encodeURIComponentAsAngularJS(val: EncodeURIComponentParams, pctEncodeSpaces?: boolean) {
  return encodeURIComponent(val)
    .replace(/%40/gi, '@')
    .replace(/%3A/gi, ':')
    .replace(/%24/g, '$')
    .replace(/%2C/gi, ',')
    .replace(/%3B/gi, ';')
    .replace(/%20/g, pctEncodeSpaces ? '%20' : '+')
    .replace(/[!'()*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
}

type EncodeURIComponentParams = Parameters<typeof encodeURIComponent>[0];
/**
 *  Encodes URL parameters in the style of AngularJS.
 *  Use `serializeParams` to encode parameters using `encodeURIComponent` instead.
 */
function toUrlParams(a: unknown, encodeAsAngularJS = true) {
  const s: string[] = [];
  const rbracket = /\[\]$/;

  const encodingFunction = encodeAsAngularJS
    ? (value: EncodeURIComponentParams, pctEncodeSpaces?: boolean) =>
        encodeURIComponentAsAngularJS(value, pctEncodeSpaces)
    : (value: EncodeURIComponentParams, _: boolean) => encodeURIComponent(value);

  // Local type guard so that flow analysis narrows `unknown` -> `unknown[]` inside the
  // `if (isArray(obj))` branches below without introducing runtime changes.
  const isArray = (obj: unknown): obj is unknown[] => {
    return Object.prototype.toString.call(obj) === '[object Array]';
  };

  const add = (k: string, v: unknown) => {
    v = typeof v === 'function' ? v() : v === null ? '' : v === undefined ? '' : v;
    // `encodeURIComponent` accepts any non-symbol value at runtime via implicit `ToString`
    // coercion, so this cast preserves the original `any`-permissive runtime semantics.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    s[s.length] = encodingFunction(k, true) + '=' + encodingFunction(v as EncodeURIComponentParams, true);
  };

  const buildParams = (prefix: string, obj: unknown) => {
    let i, len, key;

    if (prefix) {
      if (isArray(obj)) {
        for (i = 0, len = obj.length; i < len; i++) {
          if (rbracket.test(prefix)) {
            add(prefix, obj[i]);
          } else {
            buildParams(prefix, obj[i]);
          }
        }
      } else if (obj && String(obj) === '[object Object]') {
        // `String(obj) === '[object Object]'` is not a TS type guard, so cast to allow
        // property iteration / index access without altering runtime behavior.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const objRecord = obj as Record<string, unknown>;
        for (key in objRecord) {
          buildParams(prefix + '[' + key + ']', objRecord[key]);
        }
      } else {
        add(prefix, obj);
      }
    } else if (isArray(obj)) {
      for (i = 0, len = obj.length; i < len; i++) {
        // The no-prefix array branch follows the jquery-param `{name, value}` pair
        // convention; cast preserves the original runtime semantics (a non-conforming
        // entry would throw on `.name`/`.value` access identically before and after).
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const item = obj[i] as { name: string; value: unknown };
        add(item.name, item.value);
      }
    } else {
      // Same rationale as above: cast to `Record<string, unknown>` for object iteration.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const objRecord = obj as Record<string, unknown>;
      for (key in objRecord) {
        buildParams(key, objRecord[key]);
      }
    }
    return s;
  };

  return buildParams('', a).join('&');
}

/**
 * Converts params into a URL-encoded query string.
 *
 * @param params data to serialize
 * @returns A URL-encoded string representing the provided data.
 */
function serializeParams(params: unknown): string {
  return toUrlParams(params, false);
}

function appendQueryToUrl(url: string, stringToAppend: string) {
  if (stringToAppend !== undefined && stringToAppend !== null && stringToAppend !== '') {
    const pos = url.indexOf('?');
    if (pos !== -1) {
      if (url.length - pos > 1) {
        url += '&';
      }
    } else {
      url += '?';
    }
    url += stringToAppend;
  }

  return url;
}

/**
 * Return search part (as object) of current url
 */
function getUrlSearchParams(): UrlQueryMap {
  const search = window.location.search.substring(1);
  const searchParamsSegments = search.split('&');
  const params: UrlQueryMap = {};
  for (const p of searchParamsSegments) {
    const keyValuePair = p.split('=');
    if (keyValuePair.length > 1) {
      // key-value param
      const key = decodeURIComponent(keyValuePair[0]);
      const value = decodeURIComponent(keyValuePair[1]);
      if (key in params) {
        // At runtime `params[key]` is always a `string[]` when this branch fires
        // (set by the `params[key] = [value]` assignment below on first occurrence).
        params[key] = [...(params[key] as string[]), value];
      } else {
        params[key] = [value];
      }
    } else if (keyValuePair.length === 1) {
      // boolean param
      const key = decodeURIComponent(keyValuePair[0]);
      params[key] = true;
    }
  }
  return params;
}

/**
 * Parses an escaped url query string into key-value pairs.
 * Attribution: Code dervived from https://github.com/angular/angular.js/master/src/Angular.js#L1396
 * @returns {Object.<string,boolean|Array>}
 */
export function parseKeyValue(keyValue: string) {
  // The accumulator is intentionally typed as `any` to preserve the public API surface
  // of `urlUtil.parseKeyValue` for downstream consumers that assign its return into a
  // narrower `UrlQueryMap` shape (e.g. `packages/grafana-data/src/utils/location.ts` and
  // `packages/grafana-runtime/src/services/LocationService.tsx`). Tightening to
  // `Record<string, unknown>` was attempted per AAP §0.8.6 but caused cross-module
  // breakage outside this batch's scope; the AAP §0.9.2.11 rollback trigger explicitly
  // permits retaining `any` here with a justification.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public API surface preserved for backward compat with downstream consumers
  const obj: any = {};
  const parts = (keyValue || '').split('&');

  for (let keyValue of parts) {
    let splitPoint: number | undefined;
    let key: string | undefined;
    let val: string | undefined | boolean;

    if (keyValue) {
      key = keyValue = keyValue.replace(/\+/g, '%20');
      splitPoint = keyValue.indexOf('=');

      if (splitPoint !== -1) {
        key = keyValue.substring(0, splitPoint);
        val = keyValue.substring(splitPoint + 1);
      }

      key = tryDecodeURIComponent(key);

      if (key !== undefined) {
        val = val !== undefined ? tryDecodeURIComponent(val as string) : true;

        let parsedVal: unknown;
        if (typeof val === 'string' && val !== '') {
          parsedVal = val === 'true' || val === 'false' ? val === 'true' : val;
        } else {
          parsedVal = val;
        }

        if (!obj.hasOwnProperty(key)) {
          // `isNaN` performs implicit `Number` coercion on its argument at runtime;
          // wrapping with `Number(...)` is a no-op at runtime while satisfying the
          // `isNaN(number)` signature now that `parsedVal` is typed as `unknown`.
          obj[key] = isNaN(Number(parsedVal)) ? val : parsedVal;
        } else if (Array.isArray(obj[key])) {
          obj[key].push(val);
        } else {
          obj[key] = [obj[key], isNaN(Number(parsedVal)) ? val : parsedVal];
        }
      }
    }
  }

  return obj;
}

function tryDecodeURIComponent(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return undefined;
  }
}

export const urlUtil = {
  renderUrl,
  toUrlParams,
  appendQueryToUrl,
  getUrlSearchParams,
  parseKeyValue,
  serializeParams,
};

/**
 * Create an string that is used in URL to represent the Explore state. This is basically just a stringified json
 * that is used as a state of a single Explore pane so it does not represent full Explore URL so some properties
 * may be omitted (they will be filled in with default values).
 *
 * @param urlState
 * @param compact this parameter is deprecated and will be removed in a future release.
 */
export function serializeStateToUrlParam(urlState: Partial<ExploreUrlState>, compact?: boolean): string {
  if (compact !== undefined) {
    console.warn('`compact` parameter is deprecated and will be removed in a future release');
  }
  return JSON.stringify(urlState);
}

/**
 * Converts RawTimeRange to a string that is stored in the URL
 * - relative - stays as it is (e.g. "now")
 * - absolute - converted to ms
 */
export const toURLRange = (range: RawTimeRange): URLRange => {
  let from = range.from;
  if (isDateTime(from)) {
    from = from.valueOf().toString();
  }

  let to = range.to;
  if (isDateTime(to)) {
    to = to.valueOf().toString();
  }

  return {
    from,
    to,
  };
};
