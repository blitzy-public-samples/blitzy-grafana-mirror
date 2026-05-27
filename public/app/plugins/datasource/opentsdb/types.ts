import { type DataQuery, type DataSourceJsonData } from '@grafana/data';

/**
 * OpenTSDB tag dictionary: tag-key string → tag-value string.
 * Used for both query-time tag filters and response-time tag annotations.
 */
export type OpenTsdbTags = Record<string, string>;

export interface OpenTsdbQuery extends DataQuery {
  // migrating to react
  // metrics section
  metric?: string;
  aggregator?: string;
  alias?: string;

  //downsample section
  downsampleInterval?: string;
  downsampleAggregator?: string;
  downsampleFillPolicy?: string;
  disableDownsampling?: boolean;

  //filters
  filters?: OpenTsdbFilter[];

  tags?: OpenTsdbTags;

  // annotation attrs
  fromAnnotations?: boolean;
  isGlobal?: boolean;
  target?: string;
  name?: string;

  // rate
  shouldComputeRate?: boolean;
  isCounter?: boolean;
  counterMax?: string;
  counterResetValue?: string;
  explicitTags?: boolean;
}

export interface OpenTsdbOptions extends DataSourceJsonData {
  tsdbVersion?: number;
  tsdbResolution?: number;
  lookupLimit?: number;
}

export type LegacyAnnotation = {
  fromAnnotations?: boolean;
  isGlobal?: boolean;
  target?: string;
  name?: string;
};

export type OpenTsdbFilter = {
  type: string;
  tagk: string;
  filter: string;
  groupBy: boolean;
};

/**
 * OpenTSDB rate computation options for counter-style metrics.
 * Sent inside a query payload to /api/query when rate=true.
 *
 * Note: upstream OpenTSDB API has historically used both `resetValue` and `ResetValue` (pascal-case)
 * in different versions; both spellings are accepted here for compatibility with the existing
 * `convertTargetToQuery` logic in datasource.ts.
 */
export interface OpenTsdbRateOptions {
  counter?: boolean;
  counterMax?: number;
  resetValue?: number;
  ResetValue?: number;
  dropResets?: boolean;
}

/**
 * Fields that exist only on the OpenTSDB HTTP API query payload (after conversion from OpenTsdbQuery).
 * These are produced by datasource.ts#convertTargetToQuery and serialized into the request body.
 */
export interface OpenTsdbApiOnlyFields {
  rate?: boolean;
  rateOptions?: OpenTsdbRateOptions;
  downsample?: string;
  index?: number;
}

/**
 * Internal query representation used by datasource.ts during query interpolation and conversion.
 * Combines the user-facing OpenTsdbQuery (with all editor fields) and the API-only fields layered
 * on by convertTargetToQuery before POSTing to /api/query.
 */
export type OpenTsdbInternalQuery = OpenTsdbQuery & OpenTsdbApiOnlyFields;

/**
 * Request body POSTed to OpenTSDB /api/query endpoint.
 */
export interface OpenTsdbApiRequest {
  start: number | null;
  end?: number;
  queries: OpenTsdbInternalQuery[];
  msResolution: boolean;
  globalAnnotations: boolean;
  showQuery?: boolean;
}

/**
 * OpenTSDB-shaped datapoints: epoch (seconds-or-ms-resolution) keyed by string → numeric value.
 */
export type OpenTsdbDps = Record<string, number>;

/**
 * Single annotation record returned in the OpenTSDB query response (per-series and global).
 */
export interface OpenTsdbAnnotation {
  description: string;
  startTime: number;
}

/**
 * Single metric series item in the OpenTSDB /api/query response array.
 */
export interface OpenTsdbMetricData {
  metric: string;
  tags: OpenTsdbTags;
  aggregateTags: string[];
  dps: OpenTsdbDps;
  query?: { index: number };
  annotations?: OpenTsdbAnnotation[];
  globalAnnotations?: OpenTsdbAnnotation[];
}

/**
 * Single result row from OpenTSDB /api/search/lookup endpoint.
 */
export interface OpenTsdbLookupResultItem {
  tags: OpenTsdbTags;
}
