import { type ComponentType } from 'react';
import { type Observable } from 'rxjs';

import { type AnnotationQuery as SchemaAnnotationQuery, type DataQuery } from '@grafana/schema';

import { type DataFrame } from './dataFrame';
import { type QueryEditorProps } from './datasource';

/**
 * This JSON object is stored in the dashboard json model.
 */
export interface AnnotationQuery<TQuery extends DataQuery = DataQuery> extends SchemaAnnotationQuery<TQuery> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy snapshot data shape varies across dashboard versions; consumers (e.g. public/app/features/query/state/DashboardQueryRunner/SnapshotWorker.ts) pass this directly to processors that expect concrete shapes
  snapshotData?: any;

  // Convert a dataframe to an AnnotationEvent
  mappings?: AnnotationEventMappings;

  // When using the 'grafana' datasource, this may be dashboard
  type?: string;

  // Sadly plugins can set any property directly on the main object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnnotationQuery is a plugin-extensible type; consumers (e.g. @grafana/prometheus AnnotationQueryEditor) index arbitrary keys (titleFormat, tagKeys, textFormat, useValueForTime, refId, expr, step) directly on the query object
  [key: string]: any;
}

export interface AnnotationEvent {
  id?: string;
  annotation?: unknown;
  dashboardId?: number;
  /** May be null if it isn't set via the HTTP API */
  dashboardUID?: string | null;
  panelId?: number;
  userId?: number;
  login?: string;
  email?: string;
  avatarUrl?: string;
  time?: number;
  timeEnd?: number;
  isRegion?: boolean;
  title?: string;
  text?: string;
  type?: string;
  tags?: string[];
  color?: string;
  alertId?: number;
  newState?: string;

  // Currently used to merge annotations from alerts and dashboard
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- source carries a partial AnnotationQuery during persistence/migration; consumers (e.g. public/app/features/query/state/DashboardQueryRunner/utils.ts) assign it to AnnotationQuery<DataQuery> and access source.type without narrowing
  source?: any; // source.type === 'dashboard' -- should be AnnotationQuery
}

export interface AnnotationEventUIModel {
  // @todo this is actually a number, and sending a string will break the API response! https://github.com/grafana/grafana/issues/120097
  id?: string;
  from: number;
  to: number;
  tags: string[];
  description: string;
}

/**
 * @alpha -- any value other than `field` is experimental
 */
export enum AnnotationEventFieldSource {
  Field = 'field', // Default -- find the value with a matching key
  Text = 'text', // Write a constant string into the value
  Skip = 'skip', // Do not include the field
}

export interface AnnotationEventFieldMapping {
  source?: AnnotationEventFieldSource; // defaults to 'field'
  value?: string;
  regex?: string;
}

export type AnnotationEventMappings = Partial<Record<keyof AnnotationEvent, AnnotationEventFieldMapping>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DSType is intentionally unconstrained: plugin AnnotationQueryEditor components are typed against their own DataSourceApi subtype (e.g. PrometheusDatasource, SqlDatasource) and would fail the ComponentType<AnnotationQueryEditorProps<TQuery>> assignability check (contravariant parameter position) if DSType were narrowed to DataSourceApi<TQuery>
type AnnotationQueryEditorProps<TQuery extends DataQuery> = QueryEditorProps<any, TQuery> & {
  // Needs to be optional otherwise component not using these cannot be used, even though they are passed on and can be
  // just ignored if not used.
  annotation?: AnnotationQuery<TQuery>;
  onAnnotationChange?: (annotation: AnnotationQuery<TQuery>) => void;
};

/**
 * Since Grafana 7.2
 *
 * This offers a generic approach to annotation processing
 */
export interface AnnotationSupport<TQuery extends DataQuery = DataQuery, TAnno = AnnotationQuery<TQuery>> {
  /**
   * This hook lets you manipulate any existing stored values before running them though the processor.
   * This is particularly helpful when dealing with migrating old formats.  ie query as a string vs object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- json is heterogeneous legacy-format annotation data; in-tree implementations (public/app/plugins/datasource/{grafana,graphite,influxdb,opentsdb}/...) access json.target / json.type / json.limit / json.tags directly without narrowing, and narrowing to unknown breaks these consumers
  prepareAnnotation?(json: any): TAnno;

  /**
   * Convert the stored JSON model to a standard datasource query object.
   * This query will be executed in the datasource and the results converted into events.
   * Returning an undefined result will quietly skip query execution
   */
  prepareQuery?(anno: TAnno): TQuery | undefined;

  /**
   * When the standard frame > event processing is insufficient, this allows explicit control of the mappings
   */
  processEvents?(anno: TAnno, data: DataFrame[]): Observable<AnnotationEvent[] | undefined>;

  /**
   * Specify a custom QueryEditor for the annotation page. If not specified, the standard one will be used
   */
  QueryEditor?: ComponentType<AnnotationQueryEditorProps<TQuery>>;

  /**
   * Define this method if you want to pre-populate the editor with a default query
   */
  getDefaultQuery?(): Partial<TQuery>;
}
