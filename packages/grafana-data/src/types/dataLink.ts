import { type ScopedVars } from './ScopedVars';
import { type ExploreCorrelationHelperData, type ExplorePanelsState } from './explore';
import { type LinkTarget } from './linkTarget';
import { type InterpolateFunction } from './panel';
import { type DataQuery } from './query';
import { type TimeRange } from './time';

/**
 * Callback info for DataLink click events
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `T = any` preserved for back-compat: DataLinkClickEvent.origin is consumed by panel plugins that access fields directly without narrowing
export interface DataLinkClickEvent<T = any> {
  origin: T;
  replaceVariables: InterpolateFunction | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rollback per AAP §0.9.2.11 trigger: `e: unknown` broke click handlers across fieldOverrides.ts, dataLinks.ts, table.ts that call `event.preventDefault()` / `event.ctrlKey` / `event.metaKey` directly without narrowing
  e?: any; // mouse|react event
}

/**
 * Data Links can be created by data source plugins or correlations.
 * Origin is set in DataLink object and indicates where the link was created.
 */
export enum DataLinkConfigOrigin {
  Datasource = 'Datasource',
  Correlations = 'Correlations',
  ExploreCorrelationsEditor = 'CorrelationsEditor',
}

/**
 * Link configuration. The values may contain variables that need to be
 * processed before showing the link to user.
 *
 * TODO: <T extends DataQuery> is not strictly true for internal links as we do not need refId for example but all
 *  data source defined queries extend this so this is more for documentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rollback per AAP §0.9.2.11 trigger: tightening default to `DataQuery` broke test fixtures and call sites in dataLinks.test.ts / fieldOverrides.test.ts that pass non-standard query shapes (e.g. `query: '12345'`, `query: { query: '...' }`) relying on `T = any` for structural back-compat
export interface DataLink<T extends DataQuery = any> {
  title: string;
  targetBlank?: boolean;

  // 3: The URL if others did not set it first
  url: string;

  // 2: If exists, use this to construct the URL
  // Not saved in JSON/DTO
  onBuildUrl?: (event: DataLinkClickEvent) => string;

  // 1: If exists, handle click directly
  // Not saved in JSON/DTO
  onClick?: (event: DataLinkClickEvent) => void;

  // If dataLink represents internal link this has to be filled. Internal link is defined as a query in a particular
  // data source that we want to show to the user. Usually this results in a link to explore but can also lead to
  // more custom onClick behaviour if needed.
  // @internal and subject to change in future releases
  internal?: InternalDataLink<T>;

  origin?: DataLinkConfigOrigin;
  meta?: {
    correlationData?: ExploreCorrelationHelperData;
    transformations?: DataLinkTransformationConfig[];
  };

  oneClick?: boolean;
}

/**
 * We provide tooltips with information about these to guide the user, please
 * check for validity when adding more transformation types.
 *
 * @internal
 */
export enum SupportedTransformationType {
  Regex = 'regex',
  Logfmt = 'logfmt',
}

/** @internal */
export interface DataLinkTransformationConfig {
  type: SupportedTransformationType;
  field?: string;
  expression?: string;
  mapValue?: string;
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rollback per AAP §0.9.2.11 trigger: tightening default to `DataQuery` cascades through DataLink<T>.internal: InternalDataLink<T> and breaks the same test fixtures / production sites that rely on `T = any`
export interface InternalDataLink<T extends DataQuery = any> {
  query: T | ((options: { replaceVariables: InterpolateFunction; scopedVars: ScopedVars }) => T);
  datasourceUid: string;
  datasourceName: string; // used as a title if `DataLink.title` is empty
  panelsState?: ExplorePanelsState;
  range?: TimeRange;
}

/**
 * Processed Link Model. The values are ready to use
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `T = any` preserved for back-compat: LinkModel.origin is heavily consumed by data link rendering across panel plugins
export interface LinkModel<T = any> {
  href: string;
  title: string;
  target: LinkTarget;
  origin: T;

  // When a click callback exists, this is passed the raw mouse|react event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rollback per AAP §0.9.2.11 trigger: (1) `e: unknown` broke click handlers that directly call event.preventDefault / event.ctrlKey in production code, (2) `origin?: T` introduced contravariant assignment failures where `LinkModel<Field<any>>` is no longer assignable to `LinkModel<unknown>` (function parameter contravariance)
  onClick?: (e: any, origin?: any) => void;
  oneClick?: boolean;

  /**
   * @alpha
   */
  interpolatedParams?: {
    query?: DataQuery;
    timeRange?: TimeRange;
  };
}

/**
 * Provides a way to produce links on demand
 *
 * TODO: ScopedVars in in GrafanaUI package!
 */
export interface LinkModelSupplier<T extends object> {
  getLinks(replaceVariables?: InterpolateFunction): Array<LinkModel<T>>;
}

export enum VariableOrigin {
  Series = 'series',
  Field = 'field',
  Fields = 'fields',
  Value = 'value',
  BuiltIn = 'built-in',
  Template = 'template',
}

export interface VariableSuggestion {
  value: string;
  label: string;
  documentation?: string;
  origin: VariableOrigin;
}

export enum VariableSuggestionsScope {
  Values = 'values',
}

export enum OneClickMode {
  Action = 'action',
  Link = 'link',
  Off = 'off',
}
