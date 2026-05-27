import classNames from 'classnames';
import { cloneDeep, filter, uniqBy, uniqueId } from 'lodash';
import pluralize from 'pluralize';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type JSX } from 'react';

import {
  CoreApp,
  type DataSourceApi,
  type DataSourceInstanceSettings,
  DataSourcePluginContextProvider,
  type PluginExtensionQueryEditorRowAdaptiveTelemetryV1Context,
  type EventBusExtended,
  type HistoryItem,
  LoadingState,
  type PanelData,
  type QueryResultMetaNotice,
  type TimeRange,
  getDataSourceRef,
  PluginExtensionPoints,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { getDataSourceSrv, renderLimitedComponents, reportInteraction, usePluginComponents } from '@grafana/runtime';
import { type DataQuery } from '@grafana/schema';
import { Badge, ErrorBoundaryAlert, List } from '@grafana/ui';
import { OperationRowHelp } from 'app/core/components/QueryOperationRow/OperationRowHelp';
import {
  QueryOperationAction,
  QueryOperationToggleAction,
} from 'app/core/components/QueryOperationRow/QueryOperationAction';
import {
  QueryOperationRow,
  type QueryOperationRowRenderProps,
} from 'app/core/components/QueryOperationRow/QueryOperationRow';

import { useQueryLibraryContext } from '../../explore/QueryLibrary/QueryLibraryContext';
import { ExpressionDatasourceUID } from '../../expressions/types';

import { type QueryActionComponent, RowActionComponents } from './QueryActionComponent';
import { QueryEditorRowHeader } from './QueryEditorRowHeader';
import { QueryErrorAlert } from './QueryErrorAlert';
import { QueryLibraryEditingContainer } from './QueryLibraryEditingContainer';

export interface Props<TQuery extends DataQuery> {
  data: PanelData;
  query: TQuery;
  queries: TQuery[];
  id: string;
  index: number;
  dataSource: DataSourceInstanceSettings;
  onChangeDataSource?: (dsSettings: DataSourceInstanceSettings) => void;
  onDataSourceLoaded?: (instance: DataSourceApi) => void;
  renderHeaderExtras?: () => ReactNode;
  onAddQuery: (query: TQuery) => void;
  onRemoveQuery: (query: TQuery) => void;
  onChange: (query: TQuery) => void;
  onReplace?: (query: DataQuery) => void;
  onRunQuery: () => void;
  visualization?: ReactNode;
  hideHideQueryButton?: boolean;
  app?: CoreApp;
  range: TimeRange;
  history?: Array<HistoryItem<TQuery>>;
  eventBus?: EventBusExtended;
  hideActionButtons?: boolean;
  onQueryCopied?: () => void;
  onQueryRemoved?: () => void;
  onQueryToggled?: (queryStatus?: boolean | undefined) => void;
  onQueryOpenChanged?: (status?: boolean | undefined) => void;
  onQueryReplacedFromLibrary?: () => void;
  collapsable?: boolean;
  hideRefId?: boolean;
  queryLibraryRef?: string;
  onCancelQueryLibraryEdit?: () => void;
  isOpen?: boolean;
}

/**
 * Functional implementation of `QueryEditorRow`. Held as a separate symbol so the
 * exported `QueryEditorRow` can preserve the generic `<TQuery extends DataQuery>`
 * type parameter through `React.memo` via a type cast (see end of declaration).
 *
 * Converted from a class component (PureComponent<Props<TQuery>, State<TQuery>>)
 * to a hooks-based functional component:
 * - useState for previously class state (datasource, queriedDataSourceIdentifier, data, showingHelp)
 * - useRef for previously mutable instance fields (id, editorRef)
 * - useMemo for the once-per-instance dataSourceSrv reference
 * - useEffect for componentDidMount / componentDidUpdate semantics
 * - useCallback for handlers used as effect dependencies
 *
 * Wrapped with React.memo to preserve the original PureComponent shallow-equality
 * skip behavior required for performance when rendered inside drag-and-drop lists.
 */
const QueryEditorRowImpl = <TQuery extends DataQuery>(props: Props<TQuery>): JSX.Element | null => {
  // Memoize the data source service reference so it's stable across renders
  // (preserves the original `dataSourceSrv = getDataSourceSrv()` instance-field semantic).
  const dataSourceSrv = useMemo(() => getDataSourceSrv(), []);

  // Local component state — translated from class State<TQuery>.
  // Note: `isOpen` and `datasourceUid` fields from the original State interface were
  // declared but never read or written and have been removed (dead-state cleanup, no-op behaviorally).
  const [datasource, setDatasource] = useState<DataSourceApi<TQuery> | null>(null);
  const [queriedDataSourceIdentifier, setQueriedDataSourceIdentifier] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<PanelData | undefined>(undefined);
  const [showingHelp, setShowingHelp] = useState(false);

  // Stable refs translated from class instance fields.
  // `idRef` holds the unique DOM id (was `this.id` instance variable).
  // `editorRef` is forwarded to <SavedQueryButtons parentRef={...}> and the outermost wrapper <div>.
  const idRef = useRef<string>('');
  const editorRef = useRef<HTMLDivElement>(null);

  /**
   * When datasource variables are used the query.datasource.uid property is a string variable expression.
   * DataSourceSettings.uid can also be this variable expression.
   * This function always returns the current interpolated datasource uid.
   */
  const getInterpolatedDataSourceUID = useCallback((): string | undefined => {
    if (props.query.datasource) {
      const instanceSettings = dataSourceSrv.getInstanceSettings(props.query.datasource);
      return instanceSettings?.rawRef?.uid ?? instanceSettings?.uid;
    }

    return props.dataSource.rawRef?.uid ?? props.dataSource.uid;
  }, [props.query.datasource, props.dataSource, dataSourceSrv]);

  const loadDatasourceFn = useCallback(async () => {
    let ds: DataSourceApi;
    const interpolatedUID = getInterpolatedDataSourceUID();

    try {
      ds = await dataSourceSrv.get(interpolatedUID);
    } catch (error) {
      // If the DS doesn't exist, it fails. Getting with no args returns the default DS.
      ds = await dataSourceSrv.get();
    }

    if (typeof props.onDataSourceLoaded === 'function') {
      props.onDataSourceLoaded(ds);
    }

    setDatasource(ds as unknown as DataSourceApi<TQuery>);
    setQueriedDataSourceIdentifier(interpolatedUID);
  }, [getInterpolatedDataSourceUID, dataSourceSrv, props]);

  // Mount effect — replaces componentDidMount.
  // The initial id assignment and data filtering are handled by the per-prop effects below
  // (they run on first render with initial deps, matching the original mount-then-update sequence).
  // This effect intentionally runs only once to kick off the initial datasource load, matching
  // the original `componentDidMount → this.loadDatasource()` call.
  useEffect(() => {
    loadDatasourceFn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-assign the unique DOM id when `props.id` changes.
  // Mirrors original componentDidUpdate behavior:
  //   if (prevProps.id !== this.props.id) { this.id = uniqueId(this.props.id + '_'); }
  // Runs on mount as well (initial assignment), which is behaviorally equivalent to the
  // class's componentDidMount line `this.id = uniqueId(id + '_')`.
  useEffect(() => {
    idRef.current = uniqueId(props.id + '_');
  }, [props.id]);

  // Re-filter panel data whenever incoming `props.data` or `props.query.refId` changes.
  // Mirrors original componentDidUpdate behavior:
  //   if (data !== prevProps.data) { this.setState({ data: filterPanelDataToQuery(data, query.refId) }); }
  // Runs on mount as well, providing the initial filtered-data setState from componentDidMount.
  useEffect(() => {
    setData(filterPanelDataToQuery(props.data, props.query.refId));
  }, [props.data, props.query.refId]);

  // Reload the datasource when the interpolated UID drifts from the last queried identifier.
  // Mirrors original componentDidUpdate behavior:
  //   if (datasource && queriedDataSourceIdentifier !== this.getInterpolatedDataSourceUID()) {
  //     this.loadDatasource();
  //   }
  // The exhaustive-deps disable is preserved because this effect intentionally checks
  // identity once per render (calls `getInterpolatedDataSourceUID()` inside), matching the
  // original componentDidUpdate semantics that only re-load when the interpolated UID changes.
  useEffect(() => {
    if (datasource && queriedDataSourceIdentifier !== getInterpolatedDataSourceUID()) {
      loadDatasourceFn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasource, queriedDataSourceIdentifier, props.query.datasource, props.dataSource]);

  const getQueryEditor = (ds: DataSourceApi<TQuery>) => {
    if (!ds) {
      return;
    }

    switch (props.app) {
      case CoreApp.Explore:
        return (
          ds.components?.ExploreMetricsQueryField ||
          ds.components?.ExploreLogsQueryField ||
          ds.components?.ExploreQueryField ||
          ds.components?.QueryEditor
        );
      case CoreApp.PanelEditor:
      case CoreApp.Dashboard:
      default:
        return ds.components?.QueryEditor;
    }
  };

  const isWaitingForDatasourceToLoad = (): boolean => {
    // if we have not yet loaded the datasource into state, the
    // ds in props and the ds in state will have different values.
    return getInterpolatedDataSourceUID() !== queriedDataSourceIdentifier;
  };

  const renderPluginEditor = () => {
    const { query, onChange, queries, onRunQuery, onAddQuery, range, app = CoreApp.PanelEditor, history } = props;

    if (isWaitingForDatasourceToLoad()) {
      return null;
    }

    if (datasource) {
      const QueryEditor = getQueryEditor(datasource);

      if (QueryEditor) {
        return (
          <DataSourcePluginContextProvider instanceSettings={props.dataSource}>
            <QueryEditor
              key={datasource?.name}
              query={query}
              datasource={datasource}
              onChange={onChange}
              onRunQuery={onRunQuery}
              onAddQuery={onAddQuery}
              data={data}
              range={range}
              queries={queries}
              app={app}
              history={history}
            />
          </DataSourcePluginContextProvider>
        );
      }
    }

    return (
      <div>
        <Trans i18nKey="query-operation.query-editor-not-exported">
          Data source plugin does not export any Query Editor component
        </Trans>
      </div>
    );
  };

  const onRemoveQuery = () => {
    const { onRemoveQuery: onRemoveQueryProp, query, onQueryRemoved } = props;

    // Track expression query removal
    const isExpressionQuery = query.datasource?.uid === ExpressionDatasourceUID;
    if (isExpressionQuery && 'type' in query && query.type) {
      reportInteraction('dashboards_expression_interaction', {
        action: 'remove_expression',
        expression_type: query.type,
        context: 'panel_query_section',
      });
    }

    onRemoveQueryProp(query);

    if (onQueryRemoved) {
      onQueryRemoved();
    }
  };

  const onExitQueryLibraryEditingMode = () => {
    // Exit query library editing mode after successful update
    props.onCancelQueryLibraryEdit?.();
  };

  const onCopyQuery = () => {
    const { query, onAddQuery, onQueryCopied } = props;
    const copy = cloneDeep(query);
    onAddQuery(copy);

    if (onQueryCopied) {
      onQueryCopied();
    }
  };

  const onHideQuery = () => {
    const { query, onChange, onRunQuery, onQueryToggled } = props;
    onChange({ ...query, hide: !query.hide });
    onRunQuery();

    if (onQueryToggled) {
      onQueryToggled(query.hide);
    }

    reportInteraction('query_editor_row_hide_query_clicked', {
      hide: !query.hide,
    });
  };

  const onToggleHelp = () => {
    setShowingHelp((prev) => !prev);
  };

  const onClickExample = (query: TQuery) => {
    if (query.datasource === undefined) {
      query.datasource = getDataSourceRef(props.dataSource);
    }

    props.onChange({
      ...query,
      refId: props.query.refId,
    });
    onToggleHelp();
  };

  const onSelectQueryFromLibrary = (query: DataQuery) => {
    props.onQueryReplacedFromLibrary?.();
    props.onReplace?.(query);
  };

  const renderCollapsedText = (): string | null => {
    if (!datasource || typeof datasource.getQueryDisplayText !== 'function') {
      return null;
    }

    try {
      return datasource.getQueryDisplayText(props.query);
    } catch (error) {
      // Some datasource plugins may throw errors in getQueryDisplayText
      // Return null gracefully to prevent the query editor from crashing.
      return null;
    }
  };

  const renderWarnings = (type: string): JSX.Element | null => {
    return renderQueryEditorRowWarnings(props.data, props.query.refId, type);
  };

  const renderExtraActions = () => {
    const { query, queries, data: propsData, onAddQuery, dataSource, app } = props;

    const unscopedActions = RowActionComponents.getAllExtraRenderAction();

    let scopedActions: QueryActionComponent[] = [];

    if (app !== undefined) {
      scopedActions = RowActionComponents.getScopedExtraRenderAction(app);
    }

    const extraActions = [...unscopedActions, ...scopedActions]
      .map((action, index) =>
        action({
          query,
          queries,
          timeRange: propsData.timeRange,
          onAddQuery: onAddQuery as (query: DataQuery) => void,
          dataSource,
          key: index,
        })
      )
      .filter(Boolean);

    extraActions.push(renderWarnings('info'));
    extraActions.push(renderWarnings('warning'));
    extraActions.push(<AdaptiveTelemetryQueryActions key="adaptive-telemetry-actions" query={query} />);

    return extraActions;
  };

  const renderActions = (_rowProps: QueryOperationRowRenderProps) => {
    const { query, hideHideQueryButton = false, queryLibraryRef, app } = props;
    const isHidden = !!query.hide;

    const hasEditorHelp = datasource?.components?.QueryEditorHelp;
    const isEditingQueryLibrary = queryLibraryRef !== undefined;
    const isUnifiedAlerting = app === CoreApp.UnifiedAlerting;
    const isExpressionQuery = query.datasource?.uid === ExpressionDatasourceUID;

    return (
      <>
        {!isEditingQueryLibrary && !isUnifiedAlerting && !isExpressionQuery && (
          <SavedQueryButtons
            query={{
              ...query,
              datasource: datasource ? { uid: datasource.uid, type: datasource.type } : query.datasource,
            }}
            app={app}
            onUpdateSuccess={onExitQueryLibraryEditingMode}
            onSelectQuery={onSelectQueryFromLibrary}
            datasourceFilters={datasource?.name ? [datasource.name] : []}
            parentRef={editorRef}
          />
        )}

        {hasEditorHelp && (
          <QueryOperationToggleAction
            title={t('query-operation.header.datasource-help', 'Show data source help')}
            icon="question-circle"
            onClick={onToggleHelp}
            active={showingHelp}
          />
        )}
        {renderExtraActions()}
        {!isEditingQueryLibrary && (
          <QueryOperationAction
            title={t('query-operation.header.duplicate-query', 'Duplicate query')}
            icon="copy"
            onClick={onCopyQuery}
          />
        )}

        {!hideHideQueryButton ? (
          <QueryOperationToggleAction
            dataTestId={selectors.components.QueryEditorRow.actionButton('Hide response')}
            title={
              query.hide
                ? t('query-operation.header.show-response', 'Show response')
                : t('query-operation.header.hide-response', 'Hide response')
            }
            icon={isHidden ? 'eye-slash' : 'eye'}
            active={isHidden}
            onClick={onHideQuery}
          />
        ) : null}
        {!isEditingQueryLibrary && (
          <QueryOperationAction
            title={t('query-operation.header.remove-query', 'Remove query')}
            icon="trash-alt"
            onClick={onRemoveQuery}
          />
        )}
      </>
    );
  };

  const renderHeader = (rowProps: QueryOperationRowRenderProps) => {
    const { app, query, dataSource, onChangeDataSource, onChange, queries, renderHeaderExtras, hideRefId } = props;

    return (
      <QueryEditorRowHeader
        query={query}
        queries={queries}
        onChangeDataSource={onChangeDataSource}
        dataSource={dataSource}
        hidden={query.hide}
        onChange={onChange}
        collapsedText={!rowProps.isOpen ? renderCollapsedText() : null}
        renderExtras={() => <>{renderHeaderExtras && renderHeaderExtras()}</>}
        alerting={app === CoreApp.UnifiedAlerting}
        hideRefId={hideRefId}
      />
    );
  };

  const {
    query,
    index,
    visualization,
    collapsable,
    hideActionButtons,
    isOpen,
    onQueryOpenChanged,
    app,
    queryLibraryRef,
    onCancelQueryLibraryEdit,
  } = props;
  const isHidden = query.hide;
  const error =
    data?.error && data.error.refId === query.refId ? data.error : data?.errors?.find((e) => e.refId === query.refId);
  const rowClasses = classNames('query-editor-row', {
    'query-editor-row--disabled': isHidden,
    'gf-form-disabled': isHidden,
  });

  if (!datasource) {
    return null;
  }

  const editor = renderPluginEditor();
  const DatasourceCheatsheet = datasource.components?.QueryEditorHelp;

  const queryOperationRow = (
    <QueryOperationRow
      id={idRef.current}
      draggable={!hideActionButtons && !queryLibraryRef}
      collapsable={collapsable}
      index={index}
      headerElement={renderHeader}
      actions={hideActionButtons ? undefined : renderActions}
      isOpen={isOpen}
      onOpen={onQueryOpenChanged}
    >
      <div className={rowClasses} id={idRef.current}>
        <ErrorBoundaryAlert boundaryName="query-editor-operation-row">
          {showingHelp && DatasourceCheatsheet && (
            <OperationRowHelp>
              <DatasourceCheatsheet
                onClickExample={(query) => onClickExample(query)}
                query={props.query}
                datasource={datasource}
              />
            </OperationRowHelp>
          )}
          {editor}
        </ErrorBoundaryAlert>
        {error && <QueryErrorAlert error={error} query={query} />}
        {visualization}
      </div>
    </QueryOperationRow>
  );

  return (
    <div data-testid="query-editor-row" aria-label={selectors.components.QueryEditorRows.rows} ref={editorRef}>
      {queryLibraryRef && (
        <MaybeQueryLibraryEditingHeader
          query={query}
          app={app}
          queryLibraryRef={queryLibraryRef}
          onCancelEdit={onCancelQueryLibraryEdit}
          onUpdateSuccess={onExitQueryLibraryEditingMode}
          onSelectQuery={onSelectQueryFromLibrary}
        />
      )}
      {queryLibraryRef ? (
        <QueryLibraryEditingContainer>{queryOperationRow}</QueryLibraryEditingContainer>
      ) : (
        queryOperationRow
      )}
    </div>
  );
};

/**
 * Exported `QueryEditorRow` preserves the generic `<TQuery extends DataQuery>`
 * type parameter through `React.memo`. React.memo by itself erases the generic;
 * the type cast below restores it so call sites like
 * `<QueryEditorRow<AlertDataQuery> ... />` continue to type-check.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- required to preserve the generic <TQuery extends DataQuery> type parameter through React.memo
export const QueryEditorRow = memo(QueryEditorRowImpl) as <TQuery extends DataQuery>(
  props: Props<TQuery>
) => JSX.Element | null;

// Set displayName for React DevTools (assigned via cast because the post-cast
// type intentionally hides `displayName`).
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- required because the generic-preserving cast above hides the displayName property of the underlying memo component
(QueryEditorRow as React.NamedExoticComponent).displayName = 'QueryEditorRow';

/**
 * Pure helper used internally by `QueryEditorRow.renderWarnings`.
 * Extracted from the original class method so the logic remains unit-testable
 * after the class → functional conversion (the original test suite covers this
 * specifically and previously instantiated the class to call `renderWarnings`
 * directly — see QueryEditorRow.test.tsx).
 */
export function renderQueryEditorRowWarnings(data: PanelData, refId: string, type: string): JSX.Element | null {
  const dataFilteredByRefId = filterPanelDataToQuery(data, refId)?.series ?? [];

  const allWarnings = dataFilteredByRefId.reduce((acc: QueryResultMetaNotice[], serie) => {
    if (!serie.meta?.notices) {
      return acc;
    }

    const warnings = filter(serie.meta.notices, (item: QueryResultMetaNotice) => item.severity === type) ?? [];
    return acc.concat(warnings);
  }, []);

  const uniqueWarnings = uniqBy(allWarnings, 'text');

  const hasWarnings = uniqueWarnings.length > 0;
  if (!hasWarnings) {
    return null;
  }

  const key = 'query-' + type + 's';
  const colour = type === 'warning' ? 'orange' : 'blue';
  const iconName = type === 'warning' ? 'exclamation-triangle' : 'file-landscape-alt';

  const listItems = uniqueWarnings.map((warning) => warning.text);
  const serializedWarnings = <List items={listItems} renderItem={(item) => <>{item}</>} />;

  return (
    <Badge
      key={key}
      color={colour}
      icon={iconName}
      text={
        <>
          {uniqueWarnings.length} {pluralize(type, uniqueWarnings.length)}
        </>
      }
      tooltip={serializedWarnings}
    />
  );
}

/**
 * Get a version of the PanelData limited to the query we are looking at
 */
export function filterPanelDataToQuery(data: PanelData, refId: string): PanelData | undefined {
  const series = data.series.filter((series) => series.refId === refId);

  // If there was an error with no data and the panel is not in a loading state, pass it to the QueryEditors
  if (data.state !== LoadingState.Loading && (data.error || data.errors?.length) && !data.series.length) {
    return {
      ...data,
      state: LoadingState.Error,
    };
  }

  // Only say this is an error if the error links to the query
  let state = data.state;
  let error = data.errors?.find((e) => e.refId === refId);
  if (!error && data.error) {
    error = data.error.refId === refId ? data.error : undefined;
  }

  if (state !== LoadingState.Loading) {
    if (error) {
      state = LoadingState.Error;
    } else if (data.state === LoadingState.Error) {
      state = LoadingState.Done;
    }
  }

  const timeRange = data.timeRange;

  return {
    ...data,
    state,
    series,
    error,
    errors: error ? [error] : undefined,
    timeRange,
  };
}

// Will render anything only if saved query is enabled
function SavedQueryButtons(props: {
  query: DataQuery;
  app?: CoreApp;
  onUpdateSuccess?: () => void;
  onSelectQuery: (query: DataQuery) => void;
  datasourceFilters: string[];
  parentRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { renderSavedQueryButtons } = useQueryLibraryContext();
  return renderSavedQueryButtons(
    props.query,
    props.app,
    props.onUpdateSuccess,
    props.onSelectQuery,
    undefined,
    props.parentRef
  );
}

// Will render editing header only if query library is enabled
function MaybeQueryLibraryEditingHeader(props: {
  query: DataQuery;
  app?: CoreApp;
  queryLibraryRef?: string;
  onCancelEdit?: () => void;
  onUpdateSuccess?: () => void;
  onSelectQuery?: (query: DataQuery) => void;
}) {
  const { renderQueryLibraryEditingHeader } = useQueryLibraryContext();
  return renderQueryLibraryEditingHeader(
    props.query,
    props.app,
    props.queryLibraryRef,
    props.onCancelEdit,
    props.onUpdateSuccess,
    props.onSelectQuery
  );
}

function AdaptiveTelemetryQueryActions({ query }: { query: DataQuery }) {
  try {
    const { isLoading, components } = usePluginComponents<PluginExtensionQueryEditorRowAdaptiveTelemetryV1Context>({
      extensionPointId: PluginExtensionPoints.QueryEditorRowAdaptiveTelemetryV1,
    });

    if (isLoading || !components.length) {
      return null;
    }

    return renderLimitedComponents({
      props: { query, contextHints: ['queryeditorrow', 'header'] },
      components,
      limit: 1,
      pluginId: /grafana-adaptive.*/,
    });
  } catch (error) {
    // If `usePluginComponents` isn't properly resolved, tests will fail with 'setPluginComponentsHook(options) can only be used after the Grafana instance has started.'
    // This will be resolved in https://github.com/grafana/grafana/pull/92983
    // In this case, Return `null` like when there are no extensions.
    return null;
  }
}
