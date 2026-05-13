import { type DataSourceRef as CommonDataSourceRef, type DataSourceRef, type DataTopic } from '../common/common.gen';
import * as raw from '../raw/dashboard/x/types.gen';

import { type DataQuery } from './common.types';

export type { CommonDataSourceRef as DataSourceRef };

export interface Panel<TOptions = Record<string, unknown>, TCustomFieldConfig = Record<string, unknown>>
  extends Omit<raw.Panel, 'fieldConfig'> {
  fieldConfig?: FieldConfigSource<TCustomFieldConfig>;
}

export interface RowPanel extends Omit<raw.RowPanel, 'panels'> {
  panels: Panel[];
}

export enum VariableHide {
  dontHide,
  hideLabel,
  hideVariable,
  inControlsMenu,
}

export interface VariableModel extends Omit<raw.VariableModel, 'datasource'> {
  datasource?: DataSourceRef | null;
}

export interface Dashboard extends Omit<raw.Dashboard, 'templating' | 'annotations' | 'panels'> {
  panels?: Array<Panel | RowPanel>;
  annotations?: AnnotationContainer;
  templating?: {
    list?: VariableModel[];
  };
}

export interface AnnotationQuery<TQuery extends DataQuery = DataQuery>
  extends Omit<raw.AnnotationQuery, 'target' | 'datasource'> {
  datasource?: DataSourceRef | null;
  target?: TQuery;
  // TODO: When migrating to snapshot queries, remove this property.
  // With snapshot queries annotations become a part of the panel snapshot data.
  snapshotData?: unknown;
}

export interface AnnotationContainer extends Omit<raw.AnnotationContainer, 'list'> {
  list?: AnnotationQuery[]; // use the version from this file
}

export interface FieldConfig<TOptions = Record<string, unknown>> extends raw.FieldConfig {
  custom?: TOptions & Record<string, unknown>;
}

export interface FieldConfigSource<TOptions = Record<string, unknown>> extends Omit<raw.FieldConfigSource, 'defaults'> {
  defaults: FieldConfig<TOptions>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `TConfig = any` preserved for back-compat per AAP §0.8.7 (public API preservation): MatcherConfig is re-exported via @grafana/schema (packages/grafana-schema/src/index.ts → ./index.gen.ts) and consumed via @grafana/data (packages/grafana-data/src/types/transformations.ts); narrowing the default to `unknown` cascades to out-of-scope consumers (packages/grafana-data/src/transformations/transformers/filter.ts, public/app/plugins/panel/timeseries/migrations.test.ts, etc.) that rely on implicit `any` property access on `options` and nested matcher options
export interface MatcherConfig<TConfig = any> extends raw.MatcherConfig {
  options?: TConfig;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `TOptions = any` preserved for back-compat per AAP §0.8.7 (public API preservation): DataTransformerConfig is re-exported via @grafana/schema (packages/grafana-schema/src/index.ts → ./index.gen.ts) and consumed via @grafana/data (packages/grafana-data/src/types/transformations.ts); narrowing the default to `unknown` cascades to out-of-scope consumers (packages/grafana-data/src/transformations/transformDataFrame.ts, public/app/features/dashboard/state/DashboardMigrator.ts, public/app/plugins/panel/table/migrations.ts, etc.) that spread or directly access `config.options` without prior type narrowing
export interface DataTransformerConfig<TOptions = any> extends raw.DataTransformerConfig {
  options: TOptions;
  topic?: DataTopic;
}

export interface TimeOption extends raw.TimeOption {}

export interface TimePickerConfig extends raw.TimePickerConfig {}

export const defaultDashboard = raw.defaultDashboard as Dashboard;
export const defaultVariableModel = {
  ...raw.defaultVariableModel,
} as VariableModel;
export const defaultTimePickerConfig = raw.defaultTimePickerConfig as TimePickerConfig;
export const defaultPanel: Partial<Panel> = raw.defaultPanel;
export const defaultRowPanel: Partial<Panel> = raw.defaultRowPanel;
export const defaultFieldConfig: Partial<FieldConfig> = raw.defaultFieldConfig;
export const defaultFieldConfigSource: Partial<FieldConfigSource> = raw.defaultFieldConfigSource;
export const defaultMatcherConfig: Partial<MatcherConfig> = raw.defaultMatcherConfig;
export const defaultAnnotationQuery: Partial<AnnotationQuery> = raw.defaultAnnotationQuery as AnnotationQuery;
export const defaultAnnotationContainer: Partial<AnnotationContainer> =
  raw.defaultAnnotationContainer as AnnotationContainer;
