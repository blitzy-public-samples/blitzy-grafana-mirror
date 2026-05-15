// Core Grafana history https://github.com/grafana/grafana/blob/v11.0.0-preview/public/app/plugins/datasource/prometheus/querybuilder/shared/types.ts
/**
 * Shared types that can be reused by Loki and other data sources
 */
import { type ComponentType } from 'react';

import { type DataSourceApi, type RegistryItem, type SelectableValue, type TimeRange } from '@grafana/data';

import { type PromVisualQuery } from '../types';

export interface QueryBuilderLabelFilter {
  label: string;
  op: string;
  value: string;
}

export interface QueryBuilderOperation {
  id: string;
  params: QueryBuilderOperationParamValue[];
}

export interface QueryWithOperations {
  operations: QueryBuilderOperation[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- The default type parameter MUST remain `any` to preserve the bivariance escape hatch required by the `QueryBuilderAddOperationHandler<T>` alias declared later in this file for the operation-registry pattern: operation arrays in querybuilder/operations.ts, aggregations.ts, and binaryScalarOperations.ts contain heterogeneous `QueryBuilderOperationDef` entries whose `addOperationHandler` callbacks accept differently-typed `query` arguments (e.g., `PromVisualQuery`), and TypeScript's strict variance rejects `unknown` as a default because `unknown` cannot be assigned to those concrete callback parameter types. Narrowing to `unknown` produces 64 TS2322 contravariance errors across 5 consumer files (querybuilder/operations.ts:29, operationUtils.ts:180, aggregations.ts:67, binaryScalarOperations.ts:91, shared/OperationList.tsx:69); those consumer files are OUT OF SCOPE for the current checkpoint per AAP §0.6.4 batch boundaries, and refactoring them to declare `QueryBuilderOperationDef<PromVisualQuery>[]` at every operation-array declaration violates the AAP §0.9.2.12 minimal-change mandate. The `any` here also preserves the public API surface contract per AAP §0.8.7 — `QueryBuilderOperationDef` is exported and consumed by downstream plugin code via the `@grafana-app/source` TypeScript custom condition.
export interface QueryBuilderOperationDef<T = any> extends RegistryItem {
  documentation?: string;
  params: QueryBuilderOperationParamDef[];
  defaultParams: QueryBuilderOperationParamValue[];
  category: string;
  hideFromList?: boolean;
  alternativesKey?: string;
  /** Can be used to control operation placement when adding a new operations, lower are placed first */
  orderRank?: number;
  renderer: QueryBuilderOperationRenderer;
  addOperationHandler: QueryBuilderAddOperationHandler<T>;
  paramChangedHandler?: QueryBuilderOnParamChangedHandler;
  explainHandler?: QueryBuilderExplainOperationHandler;
  changeTypeHandler?: (op: QueryBuilderOperation, newDef: QueryBuilderOperationDef<T>) => QueryBuilderOperation;
}

type QueryBuilderAddOperationHandler<T> = (def: QueryBuilderOperationDef, query: T, modeller: VisualQueryModeller) => T;

type QueryBuilderExplainOperationHandler = (op: QueryBuilderOperation, def?: QueryBuilderOperationDef) => string;

type QueryBuilderOnParamChangedHandler = (
  index: number,
  operation: QueryBuilderOperation,
  operationDef: QueryBuilderOperationDef
) => QueryBuilderOperation;

type QueryBuilderOperationRenderer = (
  model: QueryBuilderOperation,
  def: QueryBuilderOperationDef,
  innerExpr: string
) => string;

export type QueryBuilderOperationParamValue = string | number | boolean;

export interface QueryBuilderOperationParamDef {
  name: string;
  type: 'string' | 'number' | 'boolean';
  options?: string[] | number[] | Array<SelectableValue<string>>;
  hideName?: boolean;
  restParam?: boolean;
  optional?: boolean;
  placeholder?: string;
  description?: string;
  minWidth?: number;
  editor?: ComponentType<QueryBuilderOperationParamEditorProps> | string;
  runQueryOnEnter?: boolean;
}

export interface QueryBuilderOperationParamEditorProps {
  onChange: (index: number, value: QueryBuilderOperationParamValue) => void;
  onRunQuery: () => void;
  /** Parameter index */
  index: number;
  operationId: string;
  query: PromVisualQuery;
  datasource: DataSourceApi;
  timeRange: TimeRange;
  paramDef: QueryBuilderOperationParamDef;
  queryModeller: VisualQueryModeller;
  value?: QueryBuilderOperationParamValue;
}

export enum QueryEditorMode {
  Code = 'code',
  Builder = 'builder',
}

export interface VisualQueryModeller {
  getOperationsForCategory(category: string): QueryBuilderOperationDef[];

  getAlternativeOperations(key: string): QueryBuilderOperationDef[];

  getCategories(): string[];

  getOperationDef(id: string): QueryBuilderOperationDef | undefined;
}

export interface VisualQueryBinary<T> {
  operator: string;
  vectorMatchesType?: 'on' | 'ignoring';
  vectorMatches?: string;
  query: T;
}

export interface PrometheusVisualQuery {
  metric?: string;
  labels: QueryBuilderLabelFilter[];
  operations: QueryBuilderOperation[];
  binaryQueries?: Array<VisualQueryBinary<PrometheusVisualQuery>>;
}
