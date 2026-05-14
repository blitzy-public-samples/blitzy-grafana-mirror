// Core Grafana history https://github.com/grafana/grafana/blob/v11.0.0-preview/public/app/plugins/datasource/prometheus/types.ts
import { type DataSourceJsonData } from '@grafana/data';
import { type DataQuery } from '@grafana/schema';

import { type Prometheus as GenPromQuery } from './dataquery';
import { type QueryBuilderLabelFilter, type QueryEditorMode } from './querybuilder/shared/types';

export interface PromQuery extends GenPromQuery, DataQuery {
  /**
   * Timezone offset to align start & end time on backend
   */
  utcOffsetSec?: number;
  valueWithRefId?: boolean;
  showingGraph?: boolean;
  showingTable?: boolean;
  hinting?: boolean;
  interval?: string;
  fromExploreMetrics?: boolean;
}

export enum PrometheusCacheLevel {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  None = 'None',
}

export enum PromApplication {
  Cortex = 'Cortex',
  Mimir = 'Mimir',
  Prometheus = 'Prometheus',
  Thanos = 'Thanos',
}

export interface PromOptions extends DataSourceJsonData {
  timeInterval?: string;
  queryTimeout?: string;
  httpMethod?: string;
  customQueryParameters?: string;
  disableMetricsLookup?: boolean;
  exemplarTraceIdDestinations?: ExemplarTraceIdDestination[];
  prometheusType?: PromApplication;
  prometheusVersion?: string;
  cacheLevel?: PrometheusCacheLevel;
  defaultEditor?: QueryEditorMode;
  incrementalQuerying?: boolean;
  incrementalQueryOverlapWindow?: string;
  disableRecordingRules?: boolean;
  allowAsRecordingRulesTarget?: boolean;
  sigV4Auth?: boolean;
  oauthPassThru?: boolean;
  seriesEndpoint?: boolean;
  seriesLimit?: number;
}

export type ExemplarTraceIdDestination = {
  name: string;
  url?: string;
  urlDisplayLabel?: string;
  datasourceUid?: string;
};

export interface PromQueryRequest extends PromQuery {
  step?: number;
  requestId?: string;
  start: number;
  end: number;
  headers?: Record<string, unknown>;
}

export interface PromMetricsMetadataItem {
  type: string;
  help: string;
  unit?: string;
}

export interface PromMetricsMetadata {
  [metric: string]: PromMetricsMetadataItem;
}

export type PromValue = [number, string];

export interface PromMetric {
  __name__?: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Index signature must remain `any` because TypeScript requires optional named properties (here `__name__?: string` with effective type `string | undefined`) to be subtypes of the index signature; tightening to `string`, `string | undefined`, or `unknown` produces downstream TypeScript errors in src/result_transformer.ts (getLabelValue function) which is OUT OF SCOPE per AAP §0.3.2 (Files Remaining UNCHANGED). Prometheus label values are always strings per the HTTP API contract; expressing this type-correctly requires updating consumers of PromMetric.
  [index: string]: any;
}

export interface PromBuildInfoResponse {
  data: {
    application?: string;
    version: string;
    revision: string;
    features?: {
      ruler_config_api?: 'true' | 'false';
      alertmanager_config_api?: 'true' | 'false';
      query_sharding?: 'true' | 'false';
      federated_rules?: 'true' | 'false';
    };
    [key: string]: unknown;
  };
  status: 'success';
}

/**
 * Auto = query.legendFormat == '__auto'
 * Verbose = query.legendFormat == null/undefined/''
 * Custom query.legendFormat.length > 0 && query.legendFormat !== '__auto'
 */
export enum LegendFormatMode {
  Auto = '__auto',
  Verbose = '__verbose',
  Custom = '__custom',
}

export enum PromVariableQueryType {
  LabelNames,
  LabelValues,
  MetricNames,
  VarQueryResult,
  SeriesQuery,
  ClassicQuery,
}

export interface PromVariableQuery extends DataQuery {
  query?: string;
  expr?: string;
  qryType?: PromVariableQueryType;
  label?: string;
  metric?: string;
  varQuery?: string;
  seriesQuery?: string;
  labelFilters?: QueryBuilderLabelFilter[];
  match?: string;
  classicQuery?: string;
}

export type StandardPromVariableQuery = {
  query: string;
  refId: string;
};

// Rules that we fetch from Prometheus
export type RawRecordingRules = {
  name: string;
  file: string;
  rules: Rule[];
  interval?: number;
  limit?: number;
};

// A single recording rule with its labels and the query it represents
// In this object, there may be other fields but those are the ones we care for now
export type Rule = {
  name: string;
  query: string;
  duration?: number;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  alerts?: AlertInfo[];
  type: 'alerting' | 'recording';
};

export type AlertInfo = {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: string;
  activeAt: string;
  value: string;
};

// Extracted recording rules with labels
// We parse and extract the rules because
// there might be multiple rules with same name but different labels and queries
export type RuleQueryMapping = {
  [key: string]: Array<{
    query: string;
    labels?: Record<string, string>;
  }>;
};

export type RecordingRuleIdentifier = {
  expandedQuery: string;
  identifier?: string;
  identifierValue?: string;
};
