import { useCallback, useEffect, useState } from 'react';
import * as React from 'react';
import { connect, type ConnectedProps } from 'react-redux';

import {
  type AbsoluteTimeRange,
  hasLogsContextSupport,
  hasLogsContextUiSupport,
  type LoadingState,
  type LogRowModel,
  type RawTimeRange,
  type EventBus,
  type SplitOpen,
  type DataFrame,
  SupplementaryQueryType,
  type DataQueryResponse,
  type LogRowContextOptions,
  type DataSourceWithLogsContextSupport,
  type DataSourceApi,
  hasToggleableQueryFiltersSupport,
  type DataSourceWithQueryModificationSupport,
  hasQueryModificationSupport,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { getDataSourceSrv } from '@grafana/runtime';
import { type DataQuery } from '@grafana/schema';
import { PanelChrome } from '@grafana/ui';
import { MIXED_DATASOURCE_NAME } from 'app/plugins/datasource/mixed/MixedDataSource';
import { type GetFieldLinksFn } from 'app/plugins/panel/logs/types';
import { type ExploreItemState } from 'app/types/explore';
import { type StoreState } from 'app/types/store';

import { getTimeZone } from '../../profile/state/selectors';
import { loadSupplementaryQueryData, selectIsWaitingForData, setSupplementaryQueryEnabled } from '../state/query';
import { updateTimeRange, loadMoreLogs } from '../state/time';
import { LiveTailControls } from '../useLiveTailControls';
import { getFieldLinksForExplore } from '../utils/links';

import { LiveLogsWithTheme } from './LiveLogs';
import { Logs } from './Logs';
import { LogsCrossFadeTransition } from './utils/LogsCrossFadeTransition';

interface LogsContainerProps {
  width: number;
  exploreId: string;
  scanRange?: RawTimeRange;
  syncedTimes: boolean;
  loadingState: LoadingState;
  onClickFilterLabel: (key: string, value: string, frame?: DataFrame) => void;
  onClickFilterOutLabel: (key: string, value: string, frame?: DataFrame) => void;
  onStartScanning: () => void;
  onStopScanning: () => void;
  eventBus: EventBus;
  splitOpenFn: SplitOpen;
  isFilterLabelActive: (key: string, value: string, refId?: string) => Promise<boolean>;
  onClickFilterString: (value: string, refId?: string) => void;
  onClickFilterOutString: (value: string, refId?: string) => void;
  onPinLineCallback?: () => void;
}

type DataSourceInstance =
  | DataSourceApi<DataQuery>
  | (DataSourceApi<DataQuery> & DataSourceWithLogsContextSupport<DataQuery>)
  | (DataSourceApi<DataQuery> & DataSourceWithQueryModificationSupport<DataQuery>);

// Module-level helper extracted from the previous `private getQuery` class method. It does not reference
// component state or props, so it lives outside the component body to keep the functional component slim.
function getQuery(
  logsQueries: DataQuery[] | undefined,
  row: LogRowModel,
  datasourceInstance: DataSourceApi<DataQuery> & DataSourceWithLogsContextSupport<DataQuery>
) {
  // we need to find the query, and we need to be very sure that it's a query
  // from this datasource
  return (logsQueries ?? []).find(
    (q) => q.refId === row.dataFrame.refId && q.datasource != null && q.datasource.type === datasourceInstance.type
  );
}

function LogsContainer(props: Props) {
  const {
    // own props
    width,
    exploreId,
    loadingState,
    onClickFilterLabel,
    onClickFilterOutLabel,
    onStartScanning,
    onStopScanning,
    eventBus,
    splitOpenFn,
    isFilterLabelActive,
    onClickFilterString,
    onClickFilterOutString,
    onPinLineCallback,
    // connected state (from mapStateToProps)
    loading,
    logRows,
    logsMeta,
    logsSeries,
    logsQueries,
    visibleRange,
    scanning,
    timeZone,
    datasourceInstance,
    isLive,
    isPaused,
    clearedAtIndex,
    range,
    absoluteRange,
    logsVolume,
    panelState,
    logsFrames,
    // connected dispatch actions (from mapDispatchToProps)
    updateTimeRange,
    loadMoreLogs,
    loadSupplementaryQueryData,
    setSupplementaryQueryEnabled,
  } = props;

  // Replacement for `interface LogsContainerState { dsInstances: ... }`. The state holds the resolved
  // DataSourceApi instance per query refId. In mixed mode each query can target a different datasource,
  // so the map is rebuilt asynchronously via getDataSourceSrv().get(...).
  const [dsInstances, setDsInstances] = useState<Record<string, DataSourceInstance>>({});

  // Combined replacement for `componentDidMount()` + `componentDidUpdate(prevProps)` from the original
  // class. The original re-ran `updateDataSourceInstances` when `prevProps.logsQueries !== this.props.logsQueries`
  // and once at mount. We track `[logsQueries, datasourceInstance]` because both are read inside the effect
  // (also matches react-hooks/exhaustive-deps). The local `updatedDsInstances` object is intentionally a
  // fresh `{}` per invocation to preserve the original replacement semantics (the class did NOT merge with
  // previous state — see lines 91-131 of the source file).
  useEffect(() => {
    if (!logsQueries || !datasourceInstance) {
      return;
    }

    const updatedDsInstances: Record<string, DataSourceInstance> = {};

    // Not in mixed mode.
    if (datasourceInstance.uid !== MIXED_DATASOURCE_NAME) {
      logsQueries.forEach(({ refId }) => {
        updatedDsInstances[refId] = datasourceInstance;
      });
      setDsInstances(updatedDsInstances);
      return;
    }

    // Mixed mode.
    const dsPromises: Array<Promise<{ ds: DataSourceApi; refId: string }>> = [];
    for (const query of logsQueries) {
      if (!query.datasource) {
        continue;
      }
      const mustCheck =
        !updatedDsInstances[query.refId] || updatedDsInstances[query.refId].uid !== query.datasource.uid;
      if (mustCheck) {
        dsPromises.push(
          new Promise((resolve) => {
            getDataSourceSrv()
              .get(query.datasource)
              .then((ds) => {
                resolve({ ds, refId: query.refId });
              });
          })
        );
      }
    }

    if (!dsPromises.length) {
      return;
    }

    Promise.all(dsPromises).then((instances) => {
      instances.forEach(({ ds, refId }) => {
        updatedDsInstances[refId] = ds;
      });
      setDsInstances(updatedDsInstances);
    });
  }, [logsQueries, datasourceInstance]);

  const onChangeTime = useCallback(
    (newAbsoluteRange: AbsoluteTimeRange) => {
      updateTimeRange({ exploreId, absoluteRange: newAbsoluteRange });
    },
    [updateTimeRange, exploreId]
  );

  // Renamed from the class's `loadMoreLogs` method to `handleLoadMoreLogs` to avoid shadowing the
  // dispatch-bound action creator destructured above (which is also named `loadMoreLogs`). The JSX
  // prop name passed to <Logs> remains `loadMoreLogs={handleLoadMoreLogs}` to preserve the public API
  // accepted by <Logs>.
  const handleLoadMoreLogs = useCallback(
    (newAbsoluteRange: AbsoluteTimeRange) => {
      loadMoreLogs({ exploreId, absoluteRange: newAbsoluteRange });
    },
    [loadMoreLogs, exploreId]
  );

  const getLogRowContext = useCallback(
    async (row: LogRowModel, origRow: LogRowModel, options: LogRowContextOptions): Promise<DataQueryResponse> => {
      if (!origRow.dataFrame.refId || !dsInstances[origRow.dataFrame.refId]) {
        return Promise.resolve({
          data: [],
        });
      }

      const ds = dsInstances[origRow.dataFrame.refId];
      if (!hasLogsContextSupport(ds)) {
        return Promise.resolve({
          data: [],
        });
      }

      const query = getQuery(logsQueries, origRow, ds);
      return query
        ? ds.getLogRowContext(row, options, query)
        : Promise.resolve({
            data: [],
          });
    },
    [logsQueries, dsInstances]
  );

  const getLogRowContextQuery = useCallback(
    async (
      row: LogRowModel,
      options?: LogRowContextOptions,
      cacheFilters = true
    ): Promise<DataQuery | null> => {
      if (!row.dataFrame.refId || !dsInstances[row.dataFrame.refId]) {
        return Promise.resolve(null);
      }

      const ds = dsInstances[row.dataFrame.refId];
      if (!hasLogsContextSupport(ds)) {
        return Promise.resolve(null);
      }

      const query = getQuery(logsQueries, row, ds);
      return query && ds.getLogRowContextQuery
        ? ds.getLogRowContextQuery(row, options, query, cacheFilters)
        : Promise.resolve(null);
    },
    [logsQueries, dsInstances]
  );

  const getLogRowContextUi = useCallback(
    (row: LogRowModel, runContextQuery?: () => void): React.ReactNode => {
      if (!row.dataFrame.refId || !dsInstances[row.dataFrame.refId]) {
        return <></>;
      }

      const ds = dsInstances[row.dataFrame.refId];
      if (!hasLogsContextSupport(ds)) {
        return <></>;
      }

      const query = getQuery(logsQueries, row, ds);
      return query && hasLogsContextUiSupport(ds) && ds.getLogRowContextUi ? (
        ds.getLogRowContextUi(row, runContextQuery, query)
      ) : (
        <></>
      );
    },
    [logsQueries, dsInstances]
  );

  const showContextToggle = useCallback(
    (row?: LogRowModel): boolean => {
      if (!row?.dataFrame.refId || !dsInstances[row.dataFrame.refId]) {
        return false;
      }
      return hasLogsContextSupport(dsInstances[row.dataFrame.refId]);
    },
    [dsInstances]
  );

  const getFieldLinks = useCallback<GetFieldLinksFn>(
    (field, rowIndex, dataFrame, vars) => {
      return getFieldLinksForExplore({ field, rowIndex, splitOpenFn, range, dataFrame, vars });
    },
    [splitOpenFn, range]
  );

  const logDetailsFilterAvailable = useCallback(() => {
    return Object.values(dsInstances).some(
      (ds) => ds?.modifyQuery || hasQueryModificationSupport(ds) || hasToggleableQueryFiltersSupport(ds)
    );
  }, [dsInstances]);

  const filterValueAvailable = useCallback(() => {
    return Object.values(dsInstances).some(
      (ds) => hasQueryModificationSupport(ds) && ds?.getSupportedQueryModifications().includes('ADD_STRING_FILTER')
    );
  }, [dsInstances]);

  const filterOutValueAvailable = useCallback(() => {
    return Object.values(dsInstances).some(
      (ds) => hasQueryModificationSupport(ds) && ds?.getSupportedQueryModifications().includes('ADD_STRING_FILTER_OUT')
    );
  }, [dsInstances]);

  const loadLogsVolumeData = useCallback(() => {
    loadSupplementaryQueryData(exploreId, SupplementaryQueryType.LogsVolume);
  }, [loadSupplementaryQueryData, exploreId]);

  const onSetLogsVolumeEnabled = useCallback(
    (enabled: boolean) => {
      setSupplementaryQueryEnabled(exploreId, enabled, SupplementaryQueryType.LogsVolume);
    },
    [setSupplementaryQueryEnabled, exploreId]
  );

  if (!logRows) {
    return null;
  }

  return (
    <>
      <LogsCrossFadeTransition visible={isLive}>
        <PanelChrome title={t('explore.logs-container.label-logs', 'Logs')}>
          <LiveTailControls exploreId={exploreId}>
            {(controls) => (
              <LiveLogsWithTheme
                logRows={logRows}
                timeZone={timeZone}
                stopLive={controls.stop}
                isPaused={isPaused}
                onPause={controls.pause}
                onResume={controls.resume}
                onClear={controls.clear}
                clearedAtIndex={clearedAtIndex}
              />
            )}
          </LiveTailControls>
        </PanelChrome>
      </LogsCrossFadeTransition>
      <LogsCrossFadeTransition visible={!isLive}>
        <Logs
          exploreId={exploreId}
          datasourceType={datasourceInstance?.type}
          logRows={logRows}
          logsMeta={logsMeta}
          logsSeries={logsSeries}
          logsVolumeEnabled={logsVolume.enabled}
          onSetLogsVolumeEnabled={onSetLogsVolumeEnabled}
          logsVolumeData={logsVolume.data}
          logsQueries={logsQueries}
          width={width}
          splitOpen={splitOpenFn}
          loading={loading}
          loadingState={loadingState}
          loadLogsVolumeData={loadLogsVolumeData}
          onChangeTime={onChangeTime}
          loadMoreLogs={handleLoadMoreLogs}
          onClickFilterLabel={logDetailsFilterAvailable() ? onClickFilterLabel : undefined}
          onClickFilterOutLabel={logDetailsFilterAvailable() ? onClickFilterOutLabel : undefined}
          onStartScanning={onStartScanning}
          onStopScanning={onStopScanning}
          absoluteRange={absoluteRange}
          visibleRange={visibleRange}
          timeZone={timeZone}
          scanning={scanning}
          scanRange={range.raw}
          showContextToggle={showContextToggle}
          getRowContext={getLogRowContext}
          getRowContextQuery={getLogRowContextQuery}
          getLogRowContextUi={getLogRowContextUi}
          getFieldLinks={getFieldLinks}
          eventBus={eventBus}
          panelState={panelState}
          logsFrames={logsFrames}
          isFilterLabelActive={logDetailsFilterAvailable() ? isFilterLabelActive : undefined}
          range={range}
          onPinLineCallback={onPinLineCallback}
          onClickFilterString={filterValueAvailable() ? onClickFilterString : undefined}
          onClickFilterOutString={filterOutValueAvailable() ? onClickFilterOutString : undefined}
        />
      </LogsCrossFadeTransition>
    </>
  );
}

function mapStateToProps(state: StoreState, { exploreId }: { exploreId: string }) {
  const explore = state.explore;
  const item: ExploreItemState = explore.panes[exploreId]!;
  const {
    logsResult,
    scanning,
    datasourceInstance,
    isLive,
    isPaused,
    clearedAtIndex,
    range,
    absoluteRange,
    supplementaryQueries,
  } = item;
  const loading = selectIsWaitingForData(exploreId)(state);
  const panelState = item.panelsState;
  const timeZone = getTimeZone(state.user);
  const logsVolume = supplementaryQueries[SupplementaryQueryType.LogsVolume];

  return {
    loading,
    logRows: logsResult?.rows,
    logsMeta: logsResult?.meta,
    logsSeries: logsResult?.series,
    logsQueries: logsResult?.queries,
    visibleRange: logsResult?.visibleRange,
    scanning,
    timeZone,
    datasourceInstance,
    isLive,
    isPaused,
    clearedAtIndex,
    range,
    absoluteRange,
    logsVolume,
    panelState,
    logsFrames: item.queryResponse.logsFrames,
  };
}

const mapDispatchToProps = {
  updateTimeRange,
  loadMoreLogs,
  loadSupplementaryQueryData,
  setSupplementaryQueryEnabled,
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;
type Props = LogsContainerProps & PropsFromRedux;

export default connector(LogsContainer);
