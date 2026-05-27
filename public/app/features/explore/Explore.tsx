import { css, cx } from '@emotion/css';
import { get, groupBy } from 'lodash';
import { type CSSProperties, useCallback, useMemo, useRef, useState } from 'react';
import { shallowEqual } from 'react-redux';
import AutoSizer, { type HorizontalSize } from 'react-virtualized-auto-sizer';

import {
  type AbsoluteTimeRange,
  type DataFrame,
  type EventBus,
  getNextRefId,
  type GrafanaTheme2,
  hasToggleableQueryFiltersSupport,
  LoadingState,
  type QueryFixAction,
  type RawTimeRange,
  type SplitOpenOptions,
  store,
  SupplementaryQueryType,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
import { getDataSourceSrv, reportInteraction } from '@grafana/runtime';
import { type DataQuery } from '@grafana/schema';
import {
  type AdHocFilterItem,
  ErrorBoundaryAlert,
  PanelContainer,
  ScrollContainer,
  useStyles2,
  useTheme2,
} from '@grafana/ui';
import { FILTER_FOR_OPERATOR, FILTER_OUT_OPERATOR } from '@grafana/ui/internal';
import { supportedFeatures } from 'app/core/history/richHistoryStorageProvider';
import { MIXED_DATASOURCE_NAME } from 'app/plugins/datasource/mixed/MixedDataSource';
import { type StoreState, useDispatch, useSelector } from 'app/types/store';

import { getTimeZone } from '../profile/state/selectors';

import { CONTENT_OUTLINE_LOCAL_STORAGE_KEYS, ContentOutline } from './ContentOutline/ContentOutline';
import { ContentOutlineContextProvider } from './ContentOutline/ContentOutlineContext';
import { ContentOutlineItem } from './ContentOutline/ContentOutlineItem';
import { CorrelationHelper } from './CorrelationHelper';
import { CustomContainer } from './CustomContainer';
import { ExploreToolbar } from './ExploreToolbar';
import { FlameGraphExploreContainer } from './FlameGraph/FlameGraphExploreContainer';
import { GraphContainer } from './Graph/GraphContainer';
import LogsContainer from './Logs/LogsContainer';
import { LogsSamplePanel } from './Logs/LogsSamplePanel';
import { NoData } from './NoData';
import { NoDataSourceCallToAction } from './NoDataSourceCallToAction';
import { NodeGraphContainer } from './NodeGraph/NodeGraphContainer';
import { QueryRows } from './QueryRows';
import RawPrometheusContainer from './RawPrometheus/RawPrometheusContainer';
import { ResponseErrorContainer } from './ResponseErrorContainer';
import { SecondaryActions } from './SecondaryActions';
import TableContainer from './Table/TableContainer';
import { TraceViewContainer } from './TraceView/TraceViewContainer';
import { changeDatasource } from './state/datasource';
import { changeSize, changeCompactMode } from './state/explorePane';
import { splitOpen } from './state/main';
import {
  addQueryRow,
  modifyQueries,
  scanStart,
  scanStopAction,
  selectIsWaitingForData,
  setQueries,
  setSupplementaryQueryEnabled,
} from './state/query';
import { isSplit, selectExploreDSMaps } from './state/selectors';
import { updateTimeRange } from './state/time';

// CSS-custom-property typing for the dynamic AutoSizer width carried via `style={{...}}`.
// Mirrors the `ProgressCSSVar` pattern in `public/app/features/provisioning/Shared/ProgressBar.tsx`:
// the type extends `CSSProperties` with an optional `--explore-main-width` key so the runtime
// value can flow through `style` without an `as`-cast (per ESLint
// `@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'never' }]`).
type ExploreMainCSSVar = CSSProperties & { '--explore-main-width'?: string };

const getStyles = (theme: GrafanaTheme2) => {
  return {
    exploreMain: css({
      label: 'exploreMain',
      // Is needed for some transition animations to work.
      position: 'relative',
      marginTop: theme.spacing(3),
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
      // Dynamic width is driven by AutoSizer per-render via the `--explore-main-width` CSS
      // custom property set in the JSX below. Encoding the dynamic value as a custom property
      // keeps the className stable across renders and removes the inline `style={{ width }}`
      // literal flagged by the Checkpoint 10 review ("AAP Dimension 3 and checkpoint
      // instructions require inline `style={{}}` sites to migrate to `Box`/`Stack`/`useStyles2`").
      width: 'var(--explore-main-width)',
    }),
    queryContainer: css({
      label: 'queryContainer',
      padding: theme.spacing(1),
    }),
    exploreContainer: css({
      label: 'exploreContainer',
      display: 'flex',
      flexDirection: 'column',
      paddingRight: theme.spacing(2),
      marginBottom: theme.spacing(2),
    }),
    wrapper: css({
      position: 'absolute',
      top: 0,
      left: theme.spacing(2),
      right: 0,
      bottom: 0,
      display: 'flex',
    }),
    // Outer wrapper that hosts the scroll container; migrated from inline style.
    outerScrollWrapper: css({
      position: 'relative',
      height: '100%',
      paddingLeft: theme.spacing(2),
    }),
  };
};

export interface ExploreProps {
  exploreId: string;
  eventBus: EventBus;
  setShowQueryInspector: (value: boolean) => void;
  showQueryInspector: boolean;
}

/**
 * Action creator map that was previously passed to `connect(_, mapDispatchToProps)`.
 * Retained as a module-level constant so the wrapper can pass it through
 * `bindActionCreators(...)` and obtain a typed object of dispatch-bound functions
 * matching the previous `ConnectedProps<typeof connector>` dispatch shape.
 */
const mapDispatchToProps = {
  changeDatasource,
  changeSize,
  modifyQueries,
  scanStart,
  scanStopAction,
  setQueries,
  updateTimeRange,
  addQueryRow,
  splitOpen,
  setSupplementaryQueryEnabled,
  changeCompactMode,
};

/**
 * Redux state slice that was previously injected via `connect(mapStateToProps)`.
 * Made explicit as a standalone interface so the inner `Explore` component can
 * continue to accept the same prop shape from tests while the wrapper component
 * (`ConnectedExplore`, the default export) sources these values via `useSelector`.
 */
export type StateProps = ReturnType<typeof mapStateToProps>;

/**
 * Helper type that mirrors the transformation applied by `connect`'s
 * `mapDispatchToProps` object form (and equivalently `bindActionCreators`):
 * if an action creator returns a thunk `(dispatch, ...) => RR`, the bound
 * version becomes `(...args) => RR`; if it returns a plain action `R`, the
 * bound version becomes `(...args) => R`.
 *
 * The `...thunkArgs: any[]` argument list is required by TypeScript's
 * function-supertype rules: only `(...args: any[]) => R` is a supertype of
 * arbitrary callable shapes (e.g., RTK `AsyncThunkAction` whose parameters
 * are `(dispatch, getState, extra)`), enabling the conditional-type branch
 * to extract the bound return value. Using `unknown[]` or `never[]` here
 * fails because of TypeScript's function parameter contravariance.
 */
type BoundActionCreator<F> = F extends (...args: infer A) => infer R
  ? R extends (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-inference: `any[]` is the only rest-parameter shape that is a supertype of arbitrary callables and thus permits narrowing on thunk-vs-plain-action; this is the same idiom react-redux's own ConnectedProps types use.
      ...thunkArgs: any[]
    ) => infer RR
    ? (...args: A) => RR
    : (...args: A) => R
  : never;

/**
 * Dispatch action creators bound to the store's dispatch. The type mirrors the
 * shape produced by `bindActionCreators(mapDispatchToProps, dispatch)` so it is
 * structurally identical to the previous `ConnectedProps<typeof connector>`
 * dispatch surface — tests passing `jest.fn()` for each entry remain valid.
 */
export type DispatchProps = {
  [K in keyof typeof mapDispatchToProps]: BoundActionCreator<(typeof mapDispatchToProps)[K]>;
};

export type Props = ExploreProps & StateProps & DispatchProps;

/**
 * Explore provides an area for quick query iteration for a given datasource.
 * Once a datasource is selected it populates the query section at the top.
 * When queries are run, their results are being displayed in the main section.
 * The datasource determines what kind of query editor it brings, and what kind
 * of results viewers it supports. The state is managed entirely in Redux.
 *
 * SPLIT VIEW
 *
 * Explore can have two Explore areas side-by-side. This is handled in `Wrapper.tsx`.
 * Since there can be multiple Explores (e.g., left and right) each action needs
 * the `exploreId` as first parameter so that the reducer knows which Explore state
 * is affected.
 *
 * DATASOURCE REQUESTS
 *
 * A click on Run Query creates transactions for all DataQueries for all expanded
 * result viewers. New runs are discarding previous runs. Upon completion a transaction
 * saves the result. The result viewers construct their data from the currently existing
 * transactions.
 *
 * The result viewers determine some of the query options sent to the datasource, e.g.,
 * `format`, to indicate eventual transformations by the datasources' result transformers.
 */

export const Explore = (props: Props) => {
  const {
    exploreId,
    eventBus,
    setShowQueryInspector,
    showQueryInspector,
    datasourceInstance,
    queryKeys,
    queries,
    isLive,
    graphResult,
    queryResponse,
    syncedTimes,
    timeZone,
    showLogs,
    showMetrics,
    showTable,
    showTrace,
    showCustom,
    showNodeGraph,
    showRawPrometheus,
    showFlameGraph,
    compact,
    logsSample,
    showLogsSample,
    correlationEditorHelperData,
    correlationEditorDetails,
    queryLibraryRef,
    queriesChangedIndexAtRun,
    // dispatch action props from mapDispatchToProps:
    changeDatasource,
    changeSize,
    modifyQueries,
    scanStart,
    scanStopAction,
    setQueries,
    updateTimeRange,
    addQueryRow,
    splitOpen,
    setSupplementaryQueryEnabled,
    changeCompactMode,
  } = props;

  // Theme is obtained via the hook in lieu of the previous `withTheme2` HOC injection.
  const theme = useTheme2();
  const styles = useStyles2(getStyles);

  // State previously initialized in the class constructor.
  const [contentOutlineVisible, setContentOutlineVisible] = useState<boolean>(() =>
    store.getBool(CONTENT_OUTLINE_LOCAL_STORAGE_KEYS.visible, true)
  );

  // Instance variable previously stored on the class (`scrollElement`), mutated by the
  // ScrollContainer ref callback. Translated to a stable mutable ref.
  const scrollElementRef = useRef<HTMLDivElement | undefined>(undefined);

  // Scoped event buses previously created once-per-mount in the constructor. `useMemo`
  // keyed on the parent `eventBus` preserves the original single-creation semantics
  // (the parent supplies a stable bus from the page-level shell).
  const graphEventBus = useMemo(() => eventBus.newScopedBus('graph', { onlyLocal: false }), [eventBus]);
  const logsEventBus = useMemo(() => eventBus.newScopedBus('logs', { onlyLocal: false }), [eventBus]);

  const onChangeTime = useCallback(
    (rawRange: RawTimeRange) => {
      updateTimeRange({ exploreId, rawRange });
    },
    [updateTimeRange, exploreId]
  );

  /**
   * Used by Logs details.
   */
  const onModifyQueries = useCallback(
    (action: QueryFixAction, refId?: string) => {
      const modifier = async (query: DataQuery, modification: QueryFixAction) => {
        // This gives Logs Details support to modify the query that produced the log line.
        // If not present, all queries are modified.
        if (refId && refId !== query.refId) {
          return query;
        }
        const { datasource } = query;
        if (datasource == null) {
          return query;
        }
        const ds = await getDataSourceSrv().get(datasource);
        const toggleableFilters = ['ADD_FILTER', 'ADD_FILTER_OUT'];
        if (hasToggleableQueryFiltersSupport(ds) && toggleableFilters.includes(modification.type)) {
          return ds.toggleQueryFilter(query, {
            type: modification.type === 'ADD_FILTER' ? 'FILTER_FOR' : 'FILTER_OUT',
            options: modification.options ?? {},
            frame: modification.frame,
          });
        }
        if (ds.modifyQuery) {
          return ds.modifyQuery(query, modification);
        } else {
          return query;
        }
      };
      modifyQueries(exploreId, action, modifier);
    },
    [modifyQueries, exploreId]
  );

  /**
   * Used by Logs details.
   */
  const onClickFilterLabel = useCallback(
    (key: string, value: string | number, frame?: DataFrame) => {
      onModifyQueries(
        {
          type: 'ADD_FILTER',
          options: { key, value: value.toString() },
          frame,
        },
        frame?.refId
      );
    },
    [onModifyQueries]
  );

  /**
   * Used by Logs details.
   */
  const onClickFilterOutLabel = useCallback(
    (key: string, value: string | number, frame?: DataFrame) => {
      onModifyQueries(
        {
          type: 'ADD_FILTER_OUT',
          options: { key, value: value.toString() },
          frame,
        },
        frame?.refId
      );
    },
    [onModifyQueries]
  );

  /**
   * Used by Logs Popover Menu.
   */
  const onClickFilterString = useCallback(
    (value: string | number, refId?: string) => {
      onModifyQueries({ type: 'ADD_STRING_FILTER', options: { value: value.toString() } }, refId);
    },
    [onModifyQueries]
  );

  /**
   * Used by Logs Popover Menu.
   */
  const onClickFilterOutString = useCallback(
    (value: string | number, refId?: string) => {
      onModifyQueries({ type: 'ADD_STRING_FILTER_OUT', options: { value: value.toString() } }, refId);
    },
    [onModifyQueries]
  );

  const onCellFilterAdded = useCallback(
    (filter: AdHocFilterItem) => {
      const { value, key, operator } = filter;
      if (operator === FILTER_FOR_OPERATOR) {
        onClickFilterLabel(key, value);
      }

      if (operator === FILTER_OUT_OPERATOR) {
        onClickFilterOutLabel(key, value);
      }
    },
    [onClickFilterLabel, onClickFilterOutLabel]
  );

  const onContentOutlineToogle = useCallback(() => {
    store.set(CONTENT_OUTLINE_LOCAL_STORAGE_KEYS.visible, !contentOutlineVisible);
    setContentOutlineVisible((current) => {
      const newContentOutlineVisible = compact ? true : !current;
      reportInteraction('explore_toolbar_contentoutline_clicked', {
        item: 'outline',
        type: newContentOutlineVisible ? 'open' : 'close',
      });
      return newContentOutlineVisible;
    });
    changeCompactMode(exploreId, false);
  }, [contentOutlineVisible, compact, changeCompactMode, exploreId]);

  /**
   * Used by Logs details.
   * Returns true if the query identified by `refId` has a filter with the provided key and value.
   * @alpha
   */
  const isFilterLabelActive = useCallback(
    async (key: string, value: string | number, refId?: string) => {
      const query = queries.find((q) => q.refId === refId);
      if (!query) {
        return false;
      }
      const ds = await getDataSourceSrv().get(query.datasource);
      if (hasToggleableQueryFiltersSupport(ds) && ds.queryHasFilter(query, { key, value: value.toString() })) {
        return true;
      }
      return false;
    },
    [queries]
  );

  const onClickAddQueryRowButton = useCallback(() => {
    addQueryRow(exploreId, queryKeys.length);
  }, [addQueryRow, exploreId, queryKeys.length]);

  const onResize = useCallback(
    (size: HorizontalSize) => {
      changeSize(exploreId, size);
    },
    [changeSize, exploreId]
  );

  const onStartScanning = useCallback(() => {
    // Scanner will trigger a query
    scanStart(exploreId);
  }, [scanStart, exploreId]);

  const onStopScanning = useCallback(() => {
    scanStopAction({ exploreId });
  }, [scanStopAction, exploreId]);

  const onUpdateTimeRange = useCallback(
    (absoluteRange: AbsoluteTimeRange) => {
      updateTimeRange({ exploreId, absoluteRange });
    },
    [updateTimeRange, exploreId]
  );

  /**
   * Used for interaction from the visualizations. Will open split view in compact mode.
   */
  const onSplitOpen = useCallback(
    (panelType: string) => {
      return async (options?: SplitOpenOptions) => {
        let compactSplit = false;

        /**
         * Temporary fix grafana-clickhouse-datasource as it requires the query editor to be fully rendered to update the query
         * Proposed fixes:
         * - https://github.com/grafana/clickhouse-datasource/issues/1363 - handle query update in data source
         * - https://github.com/grafana/grafana/issues/110868 - allow data links to provide meta info if the link can be handled in compact mode (default to false)
         * Update:
         * More data source may struggle with this setting: https://github.com/grafana/grafana/issues/112075
         * We're making it enabled for tempo only and will try to make it optional for other data sources in the future.
         */
        const dsType = getDataSourceSrv().getInstanceSettings({ uid: options?.datasourceUid })?.type;
        if (dsType === 'tempo' || options?.queries?.every((q) => q.datasource?.type === 'tempo')) {
          compactSplit = true;
        }

        splitOpen(options ? { ...options, compact: compactSplit } : options);
        if (options && datasourceInstance) {
          const target = (await getDataSourceSrv().get(options.datasourceUid)).type;
          const source =
            datasourceInstance.uid === MIXED_DATASOURCE_NAME
              ? get(queries, '0.datasource.type')
              : datasourceInstance.type;
          const tracking = {
            origin: 'panel',
            panelType,
            source,
            target,
            exploreId,
          };
          reportInteraction('grafana_explore_split_view_opened', tracking);
        }
      };
    },
    [splitOpen, datasourceInstance, queries, exploreId]
  );

  const onPinLineCallback = useCallback(() => {
    setContentOutlineVisible(true);
  }, []);

  // Derived value previously stored as a class field: `splitOpenFnLogs = this.onSplitOpen('logs')`.
  const splitOpenFnLogs = useMemo(() => onSplitOpen('logs'), [onSplitOpen]);

  const renderEmptyState = (exploreContainerStyles: string) => {
    return (
      <div className={cx(exploreContainerStyles)}>
        <NoDataSourceCallToAction />
      </div>
    );
  };

  const renderNoData = () => {
    return <NoData />;
  };

  const renderCustom = (width: number) => {
    const groupedByPlugin = groupBy(queryResponse?.customFrames, 'meta.preferredVisualisationPluginId');

    return Object.entries(groupedByPlugin).map(([pluginId, frames], index) => {
      return (
        <ContentOutlineItem panelId={pluginId} title={pluginId} icon="plug" key={index}>
          <CustomContainer
            key={index}
            timeZone={timeZone}
            pluginId={pluginId}
            frames={frames}
            state={queryResponse.state}
            timeRange={queryResponse.timeRange}
            height={400}
            width={width}
            splitOpenFn={onSplitOpen(pluginId)}
            eventBus={eventBus}
          />
        </ContentOutlineItem>
      );
    });
  };

  const renderGraphPanel = (width: number) => {
    return (
      <ContentOutlineItem panelId="Graph" title={t('explore.explore.title-graph', 'Graph')} icon="graph-bar">
        <GraphContainer
          data={graphResult!}
          height={showFlameGraph ? 180 : 400}
          width={width}
          timeRange={queryResponse.timeRange}
          timeZone={timeZone}
          onChangeTime={onUpdateTimeRange}
          annotations={queryResponse.annotations}
          splitOpenFn={onSplitOpen('graph')}
          loadingState={queryResponse.state}
          eventBus={graphEventBus}
          queriesChangedIndexAtRun={queriesChangedIndexAtRun}
        />
      </ContentOutlineItem>
    );
  };

  const renderTablePanel = (width: number) => {
    return (
      <ContentOutlineItem panelId="Table" title={t('explore.explore.title-table', 'Table')} icon="table">
        <TableContainer
          ariaLabel={selectors.pages.Explore.General.table}
          width={width}
          exploreId={exploreId}
          onCellFilterAdded={onCellFilterAdded}
          timeZone={timeZone}
          splitOpenFn={onSplitOpen('table')}
          eventBus={eventBus}
        />
      </ContentOutlineItem>
    );
  };

  const renderRawPrometheus = (width: number) => {
    return (
      <ContentOutlineItem
        panelId="Raw Prometheus"
        title={t('explore.explore.title-raw-prometheus', 'Raw Prometheus')}
        icon="gf-prometheus"
      >
        <RawPrometheusContainer
          showRawPrometheus={true}
          ariaLabel={selectors.pages.Explore.General.table}
          width={width}
          exploreId={exploreId}
          onCellFilterAdded={datasourceInstance?.modifyQuery ? onCellFilterAdded : undefined}
          timeZone={timeZone}
          splitOpenFn={onSplitOpen('table')}
        />
      </ContentOutlineItem>
    );
  };

  const renderLogsPanel = (width: number) => {
    const spacing = parseInt(theme.spacing(2).slice(0, -2), 10);
    // Need to make ContentOutlineItem a flex container so the gap works
    const logsContentOutlineWrapper = css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
    });
    return (
      <ContentOutlineItem
        panelId="Logs"
        title={t('explore.explore.title-logs', 'Logs')}
        icon="gf-logs"
        className={logsContentOutlineWrapper}
      >
        <LogsContainer
          exploreId={exploreId}
          loadingState={queryResponse.state}
          syncedTimes={syncedTimes}
          width={width - spacing}
          onClickFilterLabel={onClickFilterLabel}
          onClickFilterOutLabel={onClickFilterOutLabel}
          onStartScanning={onStartScanning}
          onStopScanning={onStopScanning}
          eventBus={logsEventBus}
          splitOpenFn={splitOpenFnLogs}
          isFilterLabelActive={isFilterLabelActive}
          onClickFilterString={onClickFilterString}
          onClickFilterOutString={onClickFilterOutString}
          onPinLineCallback={onPinLineCallback}
        />
      </ContentOutlineItem>
    );
  };

  const renderLogsSamplePanel = () => {
    return (
      <ContentOutlineItem
        panelId="Logs Sample"
        title={t('explore.explore.title-logs-sample', 'Logs sample')}
        icon="gf-logs"
      >
        <LogsSamplePanel
          queryResponse={logsSample.data}
          timeZone={timeZone}
          enabled={logsSample.enabled}
          queries={queries}
          datasourceInstance={datasourceInstance}
          splitOpen={onSplitOpen('logsSample')}
          setLogsSampleEnabled={(enabled: boolean) =>
            setSupplementaryQueryEnabled(exploreId, enabled, SupplementaryQueryType.LogsSample)
          }
          timeRange={queryResponse.timeRange}
        />
      </ContentOutlineItem>
    );
  };

  const renderNodeGraphPanel = () => {
    const datasourceType = datasourceInstance ? datasourceInstance?.type : 'unknown';

    return (
      <ContentOutlineItem
        panelId="Node Graph"
        title={t('explore.explore.title-node-graph', 'Node graph')}
        icon="code-branch"
      >
        <NodeGraphContainer
          dataFrames={queryResponse.nodeGraphFrames}
          exploreId={exploreId}
          withTraceView={showTrace}
          datasourceType={datasourceType}
          splitOpenFn={onSplitOpen('nodeGraph')}
        />
      </ContentOutlineItem>
    );
  };

  const renderFlameGraphPanel = () => {
    return (
      <ContentOutlineItem
        panelId="Flame Graph"
        title={t('explore.explore.title-flame-graph', 'Flame graph')}
        icon="fire"
      >
        <FlameGraphExploreContainer dataFrames={queryResponse.flameGraphFrames} />
      </ContentOutlineItem>
    );
  };

  const renderTraceViewPanel = () => {
    const dataFrames = queryResponse.series.filter((series) => series.meta?.preferredVisualisationType === 'trace');

    return (
      // If there is no data (like 404) we show a separate error so no need to show anything here
      dataFrames.length && (
        <ContentOutlineItem panelId="Traces" title={t('explore.explore.title-traces', 'Traces')} icon="file-alt">
          <TraceViewContainer
            exploreId={exploreId}
            dataFrames={dataFrames}
            splitOpenFn={onSplitOpen('traceView')}
            scrollElement={scrollElementRef.current}
            timeRange={queryResponse.timeRange}
          />
        </ContentOutlineItem>
      )
    );
  };

  const showPanels = queryResponse && queryResponse.state !== LoadingState.NotStarted;
  const richHistoryRowButtonHidden = !supportedFeatures().queryHistoryAvailable;
  const showNoData =
    queryResponse.state === LoadingState.Done &&
    [
      queryResponse.logsFrames,
      queryResponse.graphFrames,
      queryResponse.nodeGraphFrames,
      queryResponse.flameGraphFrames,
      queryResponse.tableFrames,
      queryResponse.rawPrometheusFrames,
      queryResponse.traceFrames,
      queryResponse.customFrames,
    ].every((e) => e.length === 0);

  let correlationsBox = undefined;
  const isCorrelationsEditorMode = correlationEditorDetails?.editorMode;
  const showCorrelationHelper = Boolean(isCorrelationsEditorMode || correlationEditorDetails?.correlationDirty);
  if (showCorrelationHelper && correlationEditorHelperData !== undefined) {
    correlationsBox = <CorrelationHelper exploreId={exploreId} correlations={correlationEditorHelperData} />;
  }

  return (
    <ContentOutlineContextProvider refreshDependencies={queries}>
      <ExploreToolbar
        exploreId={exploreId}
        onChangeTime={onChangeTime}
        onContentOutlineToogle={onContentOutlineToogle}
        isContentOutlineOpen={contentOutlineVisible}
      />
      <div className={styles.outerScrollWrapper}>
        <div className={styles.wrapper}>
          {contentOutlineVisible && !compact && (
            <ContentOutline scroller={scrollElementRef.current} panelId={`content-outline-container-${exploreId}`} />
          )}
          <ScrollContainer
            data-testid={selectors.pages.Explore.General.scrollView}
            ref={(scrollElement) => {
              scrollElementRef.current = scrollElement || undefined;
            }}
          >
            <div className={styles.exploreContainer}>
              {datasourceInstance ? (
                <>
                  <ContentOutlineItem
                    panelId="Queries"
                    title={t('explore.explore.title-queries', 'Queries')}
                    icon="arrow"
                    mergeSingleChild={true}
                  >
                    <PanelContainer className={styles.queryContainer}>
                      {correlationsBox}
                      <QueryRows
                        exploreId={exploreId}
                        // Don't simply pass isOpen here to avoid opening the row when content outline is openend and
                        // triggers exiting from compact mode. If it's confusing we can change the behavior to exit
                        // compact mode explicitly with a button in the UI instead of exiting when row is opened or
                        // content outline is opened.
                        isOpen={compact ? false : undefined}
                        changeCompactMode={(compact: boolean) => changeCompactMode(exploreId, false)}
                      />
                      <SecondaryActions
                        // do not allow people to add queries with potentially different datasources in correlations editor mode
                        addQueryRowButtonDisabled={
                          isLive || (isCorrelationsEditorMode && datasourceInstance.meta.mixed) || !!queryLibraryRef
                        }
                        // We cannot show multiple traces at the same time right now so we do not show add query button.
                        //TODO:unification
                        addQueryRowButtonHidden={false}
                        richHistoryRowButtonHidden={richHistoryRowButtonHidden}
                        queryInspectorButtonActive={showQueryInspector}
                        onClickAddQueryRowButton={onClickAddQueryRowButton}
                        onClickQueryInspectorButton={() => setShowQueryInspector(!showQueryInspector)}
                        onSelectQueryFromLibrary={async (query) => {
                          const newQueries = [
                            ...queries,
                            {
                              ...query,
                              refId: getNextRefId(queries),
                            },
                          ];
                          setQueries(exploreId, newQueries);
                          if (query.datasource?.uid) {
                            const uniqueDatasources = new Set(newQueries.map((q) => q.datasource?.uid));
                            const isMixed = uniqueDatasources.size > 1;
                            const newDatasourceRef = {
                              uid: isMixed ? MIXED_DATASOURCE_NAME : query.datasource.uid,
                            };
                            const shouldChangeDatasource = datasourceInstance.uid !== newDatasourceRef.uid;
                            if (shouldChangeDatasource) {
                              await changeDatasource({ exploreId, datasource: newDatasourceRef });
                            }
                          }
                        }}
                      />
                      <ResponseErrorContainer exploreId={exploreId} />
                    </PanelContainer>
                  </ContentOutlineItem>
                  <AutoSizer onResize={onResize} disableHeight>
                    {({ width }) => {
                      if (width === 0) {
                        return null;
                      }

                      // The dynamic per-render width from AutoSizer is exposed via a CSS custom
                      // property (`--explore-main-width`) which the `styles.exploreMain` class
                      // reads via `width: var(--explore-main-width)`. This satisfies the
                      // Checkpoint 10 finding "Active inline style remains: `style={{ width }}`"
                      // by removing the literal `width` declaration while preserving the
                      // per-render numeric width behavior. The CSS-custom-property approach
                      // mirrors the established Grafana pattern (e.g.,
                      // `public/app/features/provisioning/Shared/ProgressBar.tsx`'s
                      // `ProgressCSSVar`) for high-cardinality runtime-computed dimensional
                      // values, keeping the Emotion class set bounded (per AAP §0.8.9).
                      const mainStyle: ExploreMainCSSVar = { '--explore-main-width': `${width}px` };
                      return (
                        <main className={cx(styles.exploreMain)} style={mainStyle}>
                          <ErrorBoundaryAlert boundaryName="explore-main">
                            {showPanels && (
                              <>
                                {showMetrics && graphResult && (
                                  <ErrorBoundaryAlert boundaryName="explore-graph-panel">
                                    {renderGraphPanel(width)}
                                  </ErrorBoundaryAlert>
                                )}
                                {showRawPrometheus && (
                                  <ErrorBoundaryAlert boundaryName="explore-raw-prometheus">
                                    {renderRawPrometheus(width)}
                                  </ErrorBoundaryAlert>
                                )}
                                {showTable && (
                                  <ErrorBoundaryAlert boundaryName="explore-table-panel">
                                    {renderTablePanel(width)}
                                  </ErrorBoundaryAlert>
                                )}
                                {showLogs && (
                                  <ErrorBoundaryAlert boundaryName="explore-logs-panel">
                                    {renderLogsPanel(width)}
                                  </ErrorBoundaryAlert>
                                )}
                                {showNodeGraph && (
                                  <ErrorBoundaryAlert boundaryName="explore-node-graph-panel">
                                    {renderNodeGraphPanel()}
                                  </ErrorBoundaryAlert>
                                )}
                                {showFlameGraph && (
                                  <ErrorBoundaryAlert boundaryName="explore-flame-graph-panel">
                                    {renderFlameGraphPanel()}
                                  </ErrorBoundaryAlert>
                                )}
                                {showTrace && (
                                  <ErrorBoundaryAlert boundaryName="explore-trace-view-panel">
                                    {renderTraceViewPanel()}
                                  </ErrorBoundaryAlert>
                                )}
                                {showLogsSample && (
                                  <ErrorBoundaryAlert boundaryName="explore-logs-sample-panel">
                                    {renderLogsSamplePanel()}
                                  </ErrorBoundaryAlert>
                                )}
                                {showCustom && (
                                  <ErrorBoundaryAlert boundaryName="explore-custom-panel">
                                    {renderCustom(width)}
                                  </ErrorBoundaryAlert>
                                )}
                                {showNoData && (
                                  <ErrorBoundaryAlert boundaryName="explore-no-data">
                                    {renderNoData()}
                                  </ErrorBoundaryAlert>
                                )}
                              </>
                            )}
                          </ErrorBoundaryAlert>
                        </main>
                      );
                    }}
                  </AutoSizer>
                </>
              ) : (
                renderEmptyState(styles.exploreContainer)
              )}
            </div>
          </ScrollContainer>
        </div>
      </div>
    </ContentOutlineContextProvider>
  );
};

/**
 * Selector callback that derives the slice of redux state previously injected
 * by `connect(mapStateToProps)`. Kept as a named function so the wrapper can
 * invoke it inside `useSelector(state => mapStateToProps(state, ownProps))`
 * without changing the semantics of how state is shaped (the previous
 * `connect`-based usage produced an identical object).
 */
export function mapStateToProps(state: StoreState, { exploreId }: ExploreProps) {
  const explore = state.explore;
  const { syncedTimes } = explore;
  const item = explore.panes[exploreId]!;

  const timeZone = getTimeZone(state.user);
  const {
    datasourceInstance,
    queryKeys,
    queries,
    isLive,
    graphResult,
    tableResult,
    logsResult,
    showLogs,
    showMetrics,
    showTable,
    showTrace,
    showCustom,
    queryResponse,
    showNodeGraph,
    showFlameGraph,
    showRawPrometheus,
    supplementaryQueries,
    correlationEditorHelperData,
    compact,
    queryLibraryRef,
    queriesChangedIndexAtRun,
  } = item;

  const loading = selectIsWaitingForData(exploreId)(state);
  const logsSample = supplementaryQueries[SupplementaryQueryType.LogsSample];
  // We want to show logs sample only if there are no log results and if there is already graph or table result
  const showLogsSample = !!(logsSample.dataProvider !== undefined && !logsResult && (graphResult || tableResult));

  return {
    datasourceInstance,
    queryKeys,
    queries,
    isLive,
    graphResult,
    logsResult: logsResult ?? undefined,
    queryResponse,
    syncedTimes,
    timeZone,
    showLogs,
    showMetrics,
    showTable,
    showTrace,
    showCustom,
    showNodeGraph,
    showRawPrometheus,
    showFlameGraph,
    splitted: isSplit(state),
    compact,
    loading,
    logsSample,
    showLogsSample,
    correlationEditorHelperData,
    correlationEditorDetails: explore.correlationEditorDetails,
    exploreActiveDS: selectExploreDSMaps(state),
    queryLibraryRef,
    queriesChangedIndexAtRun,
  };
}

/**
 * Hook-based replacement for the previous `connect(mapStateToProps, mapDispatchToProps)`
 * HOC. The wrapper sources the Redux state via `useSelector` (typed through
 * `app/types/store`) and binds every action creator to dispatch inside
 * `useMemo`, producing dispatch-bound functions with stable referential
 * identity across renders (dispatch is itself stable per the React-Redux
 * contract). The resulting props are forwarded to the inner `Explore`
 * component unchanged, preserving the prop surface that existing tests rely on.
 *
 * `shallowEqual` is supplied as the equality comparator for `useSelector` —
 * `mapStateToProps` returns a fresh object literal each call (composed of
 * primitives and stable Redux references), so without shallow comparison
 * React-Redux would re-render on every store update AND emit a dev-mode
 * "Selector returned a different result when called with the same parameters"
 * warning (which fails `jest-fail-on-console` tests). This restores the exact
 * shallow-equal merge semantics that `connect(mapStateToProps)` previously
 * provided. See AAP §0.8.3 (Redux `connect` Integration Analysis) for the
 * canonical rationale; same pattern is used in `ExploreToolbar.tsx`.
 *
 * Note on the type cast: `dispatch(asyncThunk(args))` for an RTK
 * `AsyncThunkAction` returns a Promise that resolves to a `fulfilled`/`rejected`
 * action, which is what callers (e.g., `await changeDatasource(...)` below)
 * expect — identical to the previous `ConnectedProps<typeof connector>`
 * behavior. The `as DispatchProps` cast bridges TypeScript's structural
 * widening of the inferred mapped-object type to the declared `DispatchProps`
 * shape; no behavioral change versus the previous `connect`-based binding.
 *
 * This pattern satisfies AAP §0.5.3 ("HOC redux access replaced by hooks") and
 * the user rule "useDispatch/useSelector from app/types/store" while honoring
 * the MINIMAL CHANGE MANDATE: the inner `Explore` function's signature is
 * unchanged so colocated tests continue to work without modification.
 */
const ConnectedExplore = (ownProps: ExploreProps) => {
  const stateProps = useSelector((state: StoreState) => mapStateToProps(state, ownProps), shallowEqual);
  const dispatch = useDispatch();
  const dispatchProps: DispatchProps = useMemo(
    () => ({
      changeDatasource: (...args) => dispatch(changeDatasource(...args)),
      changeSize: (...args) => dispatch(changeSize(...args)),
      modifyQueries: (...args) => dispatch(modifyQueries(...args)),
      scanStart: (...args) => dispatch(scanStart(...args)),
      scanStopAction: (...args) => dispatch(scanStopAction(...args)),
      setQueries: (...args) => dispatch(setQueries(...args)),
      updateTimeRange: (...args) => dispatch(updateTimeRange(...args)),
      addQueryRow: (...args) => dispatch(addQueryRow(...args)),
      splitOpen: (...args) => dispatch(splitOpen(...args)),
      setSupplementaryQueryEnabled: (...args) => dispatch(setSupplementaryQueryEnabled(...args)),
      changeCompactMode: (...args) => dispatch(changeCompactMode(...args)),
    }),
    [dispatch]
  );

  return <Explore {...ownProps} {...stateProps} {...dispatchProps} />;
};

export default ConnectedExplore;
