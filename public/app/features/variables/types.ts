import { type ComponentType } from 'react';

import {
  BusEventWithPayload,
  type DataQuery,
  type DataSourceApi,
  type DataSourceJsonData,
  LoadingState,
  type QueryEditorProps,
  type BaseVariableModel,
  VariableHide,
  type TypedVariableModel,
} from '@grafana/data';
import { type TemplateSrv } from '@grafana/runtime';

import { NEW_VARIABLE_ID } from './constants';

export enum TransactionStatus {
  NotStarted = 'Not started',
  Fetching = 'Fetching',
  Completed = 'Completed',
}

export const initialVariableModelState: BaseVariableModel = {
  id: NEW_VARIABLE_ID,
  rootStateKey: null,
  name: '',
  // TODO: in a later PR, remove type and type this object to Partial<BaseVariableModel>
  type: 'query',
  global: false,
  index: -1,
  hide: VariableHide.dontHide,
  skipUrlSync: false,
  state: LoadingState.NotStarted,
  error: null,
  description: null,
};

/**
 * Props for legacy variable query editor components.
 *
 * `TQuery` defaults to `unknown` because the legacy variable query editor union
 * (see `VariableQueryEditorType`) is consumed by call sites that pass either a
 * plain `string` query (the legacy default for most datasources, e.g. Graphite,
 * InfluxDB query strings) or an object query shape (e.g. dashboard-scene's
 * `QueryVariable['state']['query']` union of `string | SceneDataQuery`). Using
 * `unknown` as the default preserves the original `any`-typed runtime semantics
 * while still requiring explicit consumers (such as `LegacyVariableQueryEditor`)
 * to narrow to the concrete `string` shape they actually expect.
 *
 * `onChange` is declared with method syntax (rather than function-property syntax)
 * to opt into TypeScript's bivariant parameter check. This is required because
 * the legacy editor union is heterogeneously typed: some editors call `onChange`
 * with `string`, others with `string | SceneDataQuery`, and the type system
 * cannot statically prove which editor will be selected at runtime by the
 * `isLegacyQueryEditor` guard. Method syntax restores the original `any`-era
 * bivariant compatibility while keeping the structural shape of the prop fixed.
 */
export interface VariableQueryEditorProps<TQuery = unknown, TDataSource = DataSourceApi> {
  query: TQuery;
  onChange(query: TQuery, definition: string): void;
  datasource: TDataSource;
  templateSrv: TemplateSrv;
}

export type VariableQueryEditorType<
  TQuery extends DataQuery = DataQuery,
  TOptions extends DataSourceJsonData = DataSourceJsonData,
> =
  | ComponentType<VariableQueryEditorProps>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeScript's invariance in QueryEditorProps's TVQuery generic parameter means we cannot statically accept editors with specialized TVQuery types (e.g., StandardVariableQueryEditor uses TVQuery=StandardVariableQuery, which is not assignable to nor from the default TQuery=DataQuery in covariant nor contravariant positions); preserving `any` here matches the original union semantics while still concretizing the DSType slot to DataSourceApi<TQuery, TOptions>.
  | ComponentType<QueryEditorProps<DataSourceApi<TQuery, TOptions>, TQuery, TOptions, any>>
  | null;

export interface VariablesChangedEvent {
  refreshAll: boolean;
  panelIds: number[];
  variable?: TypedVariableModel;
}

export class VariablesChanged extends BusEventWithPayload<VariablesChangedEvent> {
  static type = 'variables-changed';
}

export interface VariablesTimeRangeProcessDoneEvent {
  variableIds: string[];
}

export class VariablesTimeRangeProcessDone extends BusEventWithPayload<VariablesTimeRangeProcessDoneEvent> {
  static type = 'variables-time-range-process-done';
}

export class VariablesChangedInUrl extends BusEventWithPayload<VariablesChangedEvent> {
  static type = 'variables-changed-in-url';
}
