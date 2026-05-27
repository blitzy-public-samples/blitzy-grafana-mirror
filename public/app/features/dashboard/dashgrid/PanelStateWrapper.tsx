import { debounce } from 'lodash';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Subscription } from 'rxjs';

import {
  type AbsoluteTimeRange,
  AnnotationChangeEvent,
  type AnnotationEventUIModel,
  CoreApp,
  DashboardCursorSync,
  type DataFrame,
  type EventFilterOptions,
  type FieldConfigSource,
  getDataSourceRef,
  getDefaultTimeRange,
  LoadingState,
  type PanelData,
  type PanelPlugin,
  type PanelPluginMeta,
  PluginContextProvider,
  SetPanelAttentionEvent,
  type TimeRange,
  toDataFrameDTO,
  toUtc,
} from '@grafana/data';
import { RefreshEvent } from '@grafana/runtime';
import { type VizLegendOptions } from '@grafana/schema';
import {
  ErrorBoundary,
  PanelChrome,
  type PanelContext,
  PanelContextProvider,
  type SeriesVisibilityChangeMode,
  type AdHocFilterItem,
} from '@grafana/ui';
import { appEvents } from 'app/core/app_events';
import { profiler } from 'app/core/profiler';
import { annotationServer } from 'app/features/annotations/api';
import { applyPanelTimeOverrides } from 'app/features/dashboard/utils/panel';
import { getDatasourceSrv } from 'app/features/plugins/datasource_srv';
import { applyFilterFromTable } from 'app/features/variables/adhoc/actions';
import { onUpdatePanelSnapshotData } from 'app/plugins/datasource/grafana/utils';
import { changeSeriesColorConfigFactory } from 'app/plugins/panel/timeseries/overrides/colorSeriesConfigFactory';
import { dispatch } from 'app/store/store';
import { RenderEvent } from 'app/types/events';

import { getDashboardQueryRunner } from '../../query/state/DashboardQueryRunner/DashboardQueryRunner';
import { getTimeSrv } from '../services/TimeSrv';
import { type DashboardModel } from '../state/DashboardModel';
import { type PanelModel } from '../state/PanelModel';
import { getPanelChromeProps } from '../utils/getPanelChromeProps';
import { loadSnapshotData } from '../utils/loadSnapshotData';

import { PanelHeaderMenuWrapper } from './PanelHeader/PanelHeaderMenuWrapper';
import { PanelLoadTimeMonitor } from './PanelLoadTimeMonitor';
import { seriesVisibilityConfigFactory } from './SeriesVisibilityConfigFactory';
import { liveTimer } from './liveTimer';
import { PanelOptionsLogger } from './panelOptionsLogger';

const DEFAULT_PLUGIN_ERROR = 'Error in plugin';

export interface Props {
  panel: PanelModel;
  dashboard: DashboardModel;
  plugin: PanelPlugin;
  isViewing: boolean;
  isEditing: boolean;
  isInView: boolean;
  isDraggable?: boolean;
  width: number;
  height: number;
  onInstanceStateChange: (value: unknown) => void;
  timezone?: string;
  hideMenu?: boolean;
}

export interface State {
  isFirstLoad: boolean;
  renderCounter: number;
  errorMessage?: string;
  context: PanelContext;
  data: PanelData;
  liveTime?: TimeRange;
}

/**
 * Stable handle the {@link liveTimer} service uses to read per-panel props (width, isInView)
 * and notify the panel of new live time ranges. Created via {@link useRef} so its identity
 * is stable across renders; the values inside `props` are mutated in place each render so
 * the timer always reads the latest width / isInView. This handle replaces the previous
 * direct reference to the {@link PanelStateWrapper} class instance after the class→functional
 * conversion (AAP §0.6.1 row 18).
 */
export interface PanelStateWrapperLiveHandle {
  /** Mutable view of currently relevant props; updated in place on every render. */
  props: {
    width: number;
    isInView: boolean;
  };
  /** Invoked by `liveTimer.measure()` when a new live time range tick is due. */
  liveTimeChanged: (liveTime: TimeRange) => void;
}

// ------------------------------------------------------------------
// Pure helpers (formerly instance methods on the class) — extracted so
// they can be referenced both from the functional component and inline
// without depending on `this`.
// ------------------------------------------------------------------

function getInitialPanelDataState(): PanelData {
  return {
    state: LoadingState.NotStarted,
    series: [],
    timeRange: getDefaultTimeRange(),
  };
}

function getPanelContextAppValue(isEditing: boolean, isViewing: boolean): CoreApp {
  if (isEditing) {
    return CoreApp.PanelEditor;
  }
  if (isViewing) {
    return CoreApp.PanelViewer;
  }
  return CoreApp.Dashboard;
}

function hasPanelSnapshotFor(panel: PanelModel): boolean {
  return Boolean(panel.snapshotData && panel.snapshotData.length);
}

function wantsQueryExecutionFor(plugin: PanelPlugin, panel: PanelModel): boolean {
  return !(plugin.meta.skipDataQuery || hasPanelSnapshotFor(panel));
}

function shouldSignalRenderingCompleted(loadingState: LoadingState, pluginMeta: PanelPluginMeta): boolean {
  return (
    loadingState === LoadingState.Done ||
    loadingState === LoadingState.Streaming ||
    loadingState === LoadingState.Error ||
    // `skipDataQuery` is `boolean | undefined`; coerce to boolean to satisfy the explicit return type.
    Boolean(pluginMeta.skipDataQuery)
  );
}

function skipFirstRenderFor(
  loadingState: LoadingState,
  isFirstLoad: boolean,
  plugin: PanelPlugin,
  panel: PanelModel
): boolean {
  return (
    wantsQueryExecutionFor(plugin, panel) &&
    isFirstLoad &&
    (loadingState === LoadingState.Loading || loadingState === LoadingState.NotStarted)
  );
}

// ------------------------------------------------------------------
// Internal callback-shape used by the constructor-time PanelContext to
// reach the *latest* closures via a single ref. This avoids both the
// chicken-and-egg problem of building the context before the closures
// exist and the stale-closure problem of capturing them at mount time.
// ------------------------------------------------------------------

interface CallbacksRefShape {
  getSync: () => DashboardCursorSync;
  onSeriesColorChange: (label: string, color: string) => void;
  onToggleSeriesVisibility: (label: string | string[] | null, mode: SeriesVisibilityChangeMode) => void;
  onAnnotationCreate: (event: AnnotationEventUIModel) => Promise<void>;
  onAnnotationUpdate: (event: AnnotationEventUIModel) => Promise<void>;
  onAnnotationDelete: (id: string) => Promise<void>;
  onInstanceStateChange: (value: unknown) => void;
  onToggleLegendSort: (sortKey: string) => void;
  onAddAdHocFilter: (filter: AdHocFilterItem) => void;
  onUpdateData: (frames: DataFrame[]) => Promise<boolean>;
}

const PanelStateWrapperInternal = (props: Props) => {
  const { panel, dashboard, plugin, isViewing, isEditing, isInView, width, height, onInstanceStateChange, hideMenu } =
    props;

  // ============ Service refs (stable across renders) ============
  // `getTimeSrv()` returns the lazily-initialized singleton TimeSrv. Captured
  // once via useRef so that we hold the same reference for the full lifetime
  // of this panel, matching the original `private readonly timeSrv = getTimeSrv();`.
  const timeSrvRef = useRef(getTimeSrv());
  const timeSrv = timeSrvRef.current;

  // The shared event-filter object — must keep identity stable because the
  // dashboard scoped event bus retains a reference to it and reads
  // `onlyLocal` on every published event. The functional version mutates
  // `eventFilterRef.current.onlyLocal` in `renderPanelContent`, exactly
  // matching the class field `private eventFilter: EventFilterOptions`.
  const eventFilterRef = useRef<EventFilterOptions>({ onlyLocal: true });

  // panelOptionsLogger is created lazily DURING THE FIRST RENDER (not in a
  // mount effect) when this panel is being edited (PanelEditor app). The
  // class component initialized this in the constructor, so the logger had
  // to be available before the very first render — including the render
  // that produces an error caught by <ErrorBoundary>. If initialization
  // were deferred to a mount effect, an error thrown by a panel on first
  // render would invoke `onPanelError` → `logPanelChangesOnError()` before
  // the effect ran, dereferencing an undefined ref and causing a secondary
  // crash. The `panelOptionsLoggerInitializedRef` sentinel prevents
  // re-initialization on subsequent renders (matching constructor-once
  // semantics), and the conditional ensures we only allocate the logger in
  // PanelEditor mode (matching the class's `componentDidMount` guard for
  // CoreApp.PanelEditor — see review finding C-5/PanelStateWrapper).
  const panelOptionsLoggerRef = useRef<PanelOptionsLogger | undefined>(undefined);
  const panelOptionsLoggerInitializedRef = useRef<boolean>(false);
  if (!panelOptionsLoggerInitializedRef.current) {
    panelOptionsLoggerInitializedRef.current = true;
    if (getPanelContextAppValue(isEditing, isViewing) === CoreApp.PanelEditor) {
      panelOptionsLoggerRef.current = new PanelOptionsLogger(panel.getOptions(), panel.fieldConfig, {
        panelId: String(panel.id),
        panelType: panel.type,
        panelTitle: panel.title,
      });
    }
  }

  // ============ State (formerly this.state in the class) ============
  // The class kept all six fields on a single State object and frequently
  // did partial updates via setState({a, b, c, d}). In React 18 multiple
  // setState calls within the same execution are automatically batched, so
  // independent useState calls preserve the original "single re-render per
  // event" semantics without needing useReducer.
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [renderCounter, setRenderCounter] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [data, setData] = useState<PanelData>(() => getInitialPanelDataState());
  const [liveTime, setLiveTime] = useState<TimeRange | undefined>(undefined);

  // ============ callbacksRef — fresh-closure indirection for PanelContext ============
  // The PanelContext stored on state holds method references that are
  // captured ONCE at mount time (matching the class's `this.state.context =
  // {...constructor-bound methods...}`). To preserve fresh-closure semantics
  // for those methods, the context's function fields call through this ref,
  // and the ref's current functions are updated on every render below.
  const callbacksRef = useRef<CallbacksRefShape>({
    getSync: () => DashboardCursorSync.Off,
    onSeriesColorChange: () => {},
    onToggleSeriesVisibility: () => {},
    onAnnotationCreate: async () => {},
    onAnnotationUpdate: async () => {},
    onAnnotationDelete: async () => {},
    onInstanceStateChange: () => {},
    onToggleLegendSort: () => {},
    onAddAdHocFilter: () => {},
    onUpdateData: async () => false,
  });

  // ============ Initial PanelContext (created once, exactly as the constructor did) ============
  // The wrapper functions here are stable across renders (the PanelContext
  // object identity never changes for the panel lifetime) but they delegate
  // to the LATEST closures via callbacksRef.current.X — preserving the
  // class behavior where `this.onSeriesColorChange = (...) => { ... }`
  // always referred to the latest instance method.
  const [context, setContext] = useState<PanelContext>(() => {
    // Build the scoped event bus exactly as the constructor did, using the
    // ref-held mutable filter object so future mutations are visible.
    const eventBus = dashboard.events.newScopedBus(`panel:${panel.id}`, eventFilterRef.current);
    return {
      eventsScope: '__global_',
      eventBus,
      app: getPanelContextAppValue(isEditing, isViewing),
      sync: () => callbacksRef.current.getSync(),
      onSeriesColorChange: (label, color) => callbacksRef.current.onSeriesColorChange(label, color),
      onToggleSeriesVisibility: (label, mode) => callbacksRef.current.onToggleSeriesVisibility(label, mode),
      onAnnotationCreate: (event) => callbacksRef.current.onAnnotationCreate(event),
      onAnnotationUpdate: (event) => callbacksRef.current.onAnnotationUpdate(event),
      onAnnotationDelete: (id) => callbacksRef.current.onAnnotationDelete(id),
      onInstanceStateChange: (value) => callbacksRef.current.onInstanceStateChange(value),
      onToggleLegendSort: (sortKey) => callbacksRef.current.onToggleLegendSort(sortKey),
      canAddAnnotations: dashboard.canAddAnnotations.bind(dashboard),
      canEditAnnotations: dashboard.canEditAnnotations.bind(dashboard),
      canDeleteAnnotations: dashboard.canDeleteAnnotations.bind(dashboard),
      canExecuteActions: dashboard.canExecuteActions.bind(dashboard),
      onAddAdHocFilter: (filter) => callbacksRef.current.onAddAdHocFilter(filter),
      onUpdateData: (frames) => callbacksRef.current.onUpdateData(frames),
    };
  });

  // ============ Per-render closures (the actual implementations) ============
  // These functions read live state / props from the enclosing render's
  // closure, so they reflect the latest values every time. They are
  // captured by callbacksRef.current.X immediately below.

  // Due to the mutable panel model we read graphTooltip on every call.
  const getSync = () => (isEditing ? DashboardCursorSync.Off : dashboard.graphTooltip);

  const onOptionsChange = useCallback(
    (options: object) => {
      panel.updateOptions(options);
    },
    [panel]
  );

  const onFieldConfigChange = useCallback(
    (config: FieldConfigSource) => {
      panel.updateFieldConfig(config);
    },
    [panel]
  );

  const onSeriesColorChange = (label: string, color: string) => {
    onFieldConfigChange(changeSeriesColorConfigFactory(label, color, panel.fieldConfig));
  };

  const onSeriesVisibilityChange = (label: string | string[] | null, mode: SeriesVisibilityChangeMode) => {
    if (typeof label !== 'string') {
      return;
    }
    onFieldConfigChange(seriesVisibilityConfigFactory(label, mode, panel.fieldConfig, data.series));
  };

  const onToggleLegendSort = (sortKey: string) => {
    const legendOptions: VizLegendOptions = panel.options.legend;

    // We don't want to do anything when legend options are not available
    if (!legendOptions) {
      return;
    }

    let sortDesc = legendOptions.sortDesc;
    let sortBy = legendOptions.sortBy;
    if (sortKey !== sortBy) {
      sortDesc = undefined;
    }

    // if already sort ascending, disable sorting
    if (sortDesc === false) {
      sortBy = undefined;
      sortDesc = undefined;
    } else {
      sortDesc = !sortDesc;
      sortBy = sortKey;
    }

    onOptionsChange({
      ...panel.options,
      legend: { ...legendOptions, sortBy, sortDesc },
    });
  };

  const onInstanceStateChangeInternal = (value: unknown) => {
    // Forward to the parent first (preserves the class's call order:
    // `this.props.onInstanceStateChange(value)` then `this.setState(...)`).
    onInstanceStateChange(value);
    setContext((prev) => ({ ...prev, instanceState: value }));
  };

  const onAnnotationCreate = async (event: AnnotationEventUIModel) => {
    const isRegion = event.from !== event.to;
    const anno = {
      dashboardUID: dashboard.uid,
      panelId: panel.id,
      isRegion,
      time: event.from,
      timeEnd: isRegion ? event.to : 0,
      tags: event.tags,
      text: event.description,
    };
    await annotationServer().save(anno);
    getDashboardQueryRunner().run({ dashboard, range: timeSrv.timeRange() });
    context.eventBus.publish(new AnnotationChangeEvent(anno));
  };

  const onAnnotationDelete = async (id: string) => {
    await annotationServer().delete({ id });
    getDashboardQueryRunner().run({ dashboard, range: timeSrv.timeRange() });
    context.eventBus.publish(new AnnotationChangeEvent({ id }));
  };

  const onAnnotationUpdate = async (event: AnnotationEventUIModel) => {
    const isRegion = event.from !== event.to;
    const anno = {
      id: event.id,
      dashboardUID: dashboard.uid,
      panelId: panel.id,
      isRegion,
      time: event.from,
      timeEnd: isRegion ? event.to : 0,
      tags: event.tags,
      text: event.description,
    };
    await annotationServer().update(anno);

    getDashboardQueryRunner().run({ dashboard, range: timeSrv.timeRange() });
    context.eventBus.publish(new AnnotationChangeEvent(anno));
  };

  const onAddAdHocFilter = (filter: AdHocFilterItem) => {
    const { key, value, operator } = filter;

    // When the datasource is null/undefined (for a default datasource), we use getInstanceSettings
    // to find the real datasource ref for the default datasource.
    const datasourceInstance = getDatasourceSrv().getInstanceSettings(panel.datasource);
    const datasourceRef = datasourceInstance && getDataSourceRef(datasourceInstance);
    if (!datasourceRef) {
      return;
    }

    dispatch(applyFilterFromTable({ datasource: datasourceRef, key, operator, value }));
  };

  const onUpdateData = (frames: DataFrame[]): Promise<boolean> => {
    return onUpdatePanelSnapshotData(panel, frames);
  };

  // Refresh / data-update / render callbacks: these are invoked from RxJS
  // subscriptions wired up in the mount-only effect. Because the subscription
  // captures its callback ONCE at subscribe time but we need each invocation
  // to read the LATEST state and props, we keep the implementation in a ref
  // (the "fresh closure" pattern). The subscription only ever calls
  // `onRefreshRef.current()` etc., so the latest closure always runs.
  const onRefreshRef = useRef<() => void>(() => {});
  const onRenderRef = useRef<() => void>(() => {});
  const onDataUpdateRef = useRef<(data: PanelData) => void>(() => {});

  // Implementation captured each render so that the next invocation reads
  // current values for isInView, width, data, isFirstLoad, errorMessage, etc.
  onRefreshRef.current = () => {
    if (!dashboard.snapshot && !isInView) {
      panel.refreshWhenInView = true;
      return;
    }

    const timeData = applyPanelTimeOverrides(panel, timeSrv.timeRange());

    // Issue Query
    if (wantsQueryExecutionFor(plugin, panel)) {
      if (width < 0) {
        return;
      }

      panel.refreshWhenInView = false;
      panel.runAllPanelQueries({
        dashboardUID: dashboard.uid,
        dashboardTimezone: dashboard.getTimezone(),
        dashboardTitle: dashboard.title,
        timeData,
        width,
      });
    } else {
      // The panel should render on refresh as well if it doesn't have a query, like clock panel
      // React 18 automatically batches these updates into a single re-render,
      // matching the original setState({...}) semantics.
      setData((prev) => ({ ...prev, timeRange: timeSrv.timeRange() }));
      setRenderCounter((c) => c + 1);
      setLiveTime(undefined);
    }
  };

  onRenderRef.current = () => {
    setRenderCounter((c) => c + 1);
  };

  // Updates the response with information from the stream.
  // The next is outside a react synthetic event but React 18 still batches.
  onDataUpdateRef.current = (newData: PanelData) => {
    // Ignore this data update if we are now a non data panel
    if (plugin.meta.skipDataQuery) {
      setData(getInitialPanelDataState());
      return;
    }

    let nextIsFirstLoad = isFirstLoad;
    let nextErrorMessage: string | undefined;

    switch (newData.state) {
      case LoadingState.Loading:
        // Skip updating state data if it is already in loading state
        // This is to avoid rendering partial loading responses
        if (data.state === LoadingState.Loading) {
          return;
        }
        break;
      case LoadingState.Error: {
        const { error, errors } = newData;
        if (errors?.length) {
          if (errors.length === 1) {
            nextErrorMessage = errors[0].message;
          } else {
            nextErrorMessage = 'Multiple errors found. Click for more details';
          }
        } else if (error) {
          // Mirrors original: only assign when different from current errorMessage
          if (errorMessage !== error.message) {
            nextErrorMessage = error.message;
          }
        }
        break;
      }
      case LoadingState.Done:
        // If we are doing a snapshot save data in panel model
        if (dashboard.snapshot) {
          panel.snapshotData = newData.series.map((frame) => toDataFrameDTO(frame));
        }
        if (nextIsFirstLoad) {
          nextIsFirstLoad = false;
        }
        break;
    }

    // React 18 batches these four state updates into a single re-render,
    // preserving the class's `setState({ isFirstLoad, errorMessage, data, liveTime })` semantics.
    setIsFirstLoad(nextIsFirstLoad);
    setErrorMessage(nextErrorMessage);
    setData(newData);
    setLiveTime(undefined);
  };

  // Annotation-related, instance-state, and ad-hoc-filter callbacks are
  // invoked through the PanelContext, which reads them through callbacksRef.
  // Pointing the ref at the freshly-defined closure on every render is the
  // moral equivalent of the class's `this.X = (...) => { ... }` always
  // pointing at the latest instance method.
  callbacksRef.current.getSync = getSync;
  callbacksRef.current.onSeriesColorChange = onSeriesColorChange;
  callbacksRef.current.onToggleSeriesVisibility = onSeriesVisibilityChange;
  callbacksRef.current.onAnnotationCreate = onAnnotationCreate;
  callbacksRef.current.onAnnotationUpdate = onAnnotationUpdate;
  callbacksRef.current.onAnnotationDelete = onAnnotationDelete;
  callbacksRef.current.onInstanceStateChange = onInstanceStateChangeInternal;
  callbacksRef.current.onToggleLegendSort = onToggleLegendSort;
  callbacksRef.current.onAddAdHocFilter = onAddAdHocFilter;
  callbacksRef.current.onUpdateData = onUpdateData;

  // ============ Error handlers (passed directly to <ErrorBoundary />) ============
  const logPanelChangesOnError = useCallback(() => {
    // The class used non-null assertion here; the ref starts undefined and is
    // populated only when the panel is opened in the PanelEditor.
    panelOptionsLoggerRef.current!.logChanges(panel.getOptions(), panel.fieldConfig);
  }, [panel]);

  const onPanelError = useCallback(
    (error: Error) => {
      if (getPanelContextAppValue(isEditing, isViewing) === CoreApp.PanelEditor) {
        logPanelChangesOnError();
      }

      const nextMessage = error.message || DEFAULT_PLUGIN_ERROR;

      // Preserve the class's "only setState if changed" optimization to avoid
      // an extra render when ErrorBoundary keeps reporting the same error.
      setErrorMessage((prev) => (prev !== nextMessage ? nextMessage : prev));
    },
    [isEditing, isViewing, logPanelChangesOnError]
  );

  const onPanelErrorRecover = useCallback(() => {
    setErrorMessage(undefined);
  }, []);

  const onChangeTimeRange = useCallback(
    (timeRange: AbsoluteTimeRange) => {
      timeSrv.setTime({
        from: toUtc(timeRange.from),
        to: toUtc(timeRange.to),
      });
    },
    [timeSrv]
  );

  // ============ liveTimer handle (replaces external use of `this`) ============
  // Created once via useRef so its identity is stable for the panel's
  // lifetime — liveTimer stores the reference once when listen() is called
  // and compares by reference in remove() / updateInterval(). We mutate
  // `props` in place each render so liveTimer always reads the latest
  // width / isInView; we also overwrite `liveTimeChanged` so the timer
  // invokes the latest closure (which can call setLiveTime correctly).
  const liveHandleRef = useRef<PanelStateWrapperLiveHandle | null>(null);
  if (liveHandleRef.current === null) {
    liveHandleRef.current = {
      props: { width, isInView },
      liveTimeChanged: () => {},
    };
  }
  liveHandleRef.current.props.width = width;
  liveHandleRef.current.props.isInView = isInView;
  liveHandleRef.current.liveTimeChanged = (newLiveTime: TimeRange) => {
    if (data.timeRange) {
      const delta = newLiveTime.to.valueOf() - data.timeRange.to.valueOf();
      if (delta < 100) {
        // 10hz
        console.log('Skip tick render', panel.title, delta);
        return;
      }
    }
    setLiveTime(newLiveTime);
  };

  // ============ setPanelAttention helpers ============
  // The class declared a stable `debouncedSetPanelAttention = debounce(...)`
  // bound once in the constructor. In functional form, useCallback gives a
  // stable identity for `setPanelAttention` (it depends only on panel.id),
  // and useMemo re-derives the debounced wrapper whenever that callback
  // identity changes. The trailing useEffect cancels the debounce on
  // unmount or when the wrapper is replaced (matches an implicit cleanup
  // the class never had to worry about but is required to avoid leaks).
  const setPanelAttention = useCallback(() => {
    appEvents.publish(new SetPanelAttentionEvent({ panelId: panel.id }));
  }, [panel.id]);

  const debouncedSetPanelAttention = useMemo(() => debounce(setPanelAttention, 100), [setPanelAttention]);

  useEffect(() => {
    return () => {
      debouncedSetPanelAttention.cancel();
    };
  }, [debouncedSetPanelAttention]);

  // ============ Mount-only effect (replaces componentDidMount + componentWillUnmount) ============
  // The subscription wiring, snapshot-data path, dashboard.panelInitialized
  // call, and liveTimer registration all happen exactly once when the panel
  // first mounts — matching the class's componentDidMount. The cleanup
  // function matches componentWillUnmount: unsubscribe + liveTimer.remove.
  // The panelOptionsLogger initialization happens DURING the first render
  // above (not here), so it is available to onPanelError on the first paint.
  useEffect(() => {
    const subs = new Subscription();

    // Subscribe to panel events — these RxJS subscribers invoke the ref
    // callbacks so they always run the latest closure even though they
    // are wired up only once.
    subs.add(panel.events.subscribe(RefreshEvent, () => onRefreshRef.current()));
    subs.add(panel.events.subscribe(RenderEvent, () => onRenderRef.current()));

    dashboard.panelInitialized(panel);

    // Move snapshot data into the query response (mirrors the original
    // early-return path: no query runner subscription, no liveTimer.listen).
    if (hasPanelSnapshotFor(panel)) {
      setData(loadSnapshotData(panel, dashboard));
      setIsFirstLoad(false);
      return () => {
        subs.unsubscribe();
        if (liveHandleRef.current) {
          liveTimer.remove(liveHandleRef.current);
        }
      };
    }

    if (!wantsQueryExecutionFor(plugin, panel)) {
      setIsFirstLoad(false);
    }

    subs.add(
      panel
        .getQueryRunner()
        .getData({ withTransforms: true, withFieldConfig: true })
        .subscribe({
          next: (newData) => onDataUpdateRef.current(newData),
        })
    );

    // Listen for live timer events. The handle is created above before
    // this effect runs (refs are initialized during render), so the `!`
    // assertion is safe.
    liveTimer.listen(liveHandleRef.current!);

    return () => {
      subs.unsubscribe();
      if (liveHandleRef.current) {
        liveTimer.remove(liveHandleRef.current);
      }
    };
    // Mount-only effect — semantics mirror componentDidMount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============ componentDidUpdate decomposition ============
  // The original componentDidUpdate did three independent diff-based checks.
  // Each maps to its own focused useEffect with explicit dependencies so we
  // preserve "only act when this value actually changed" semantics.

  // Effect 1 — keep PanelContext.app in sync with the isEditing/isViewing pair.
  const currentApp = getPanelContextAppValue(isEditing, isViewing);
  useEffect(() => {
    if (context.app !== currentApp) {
      setContext((prev) => ({ ...prev, app: currentApp }));
    }
  }, [currentApp, context.app]);

  // Effect 2 — handle isInView transitions. Mirrors the original `if (isInView !== prevProps.isInView)` block:
  // when the panel scrolls into view, if a deferred refresh was requested via
  // `panel.refreshWhenInView`, fire it now. We need a prev-ref because the
  // original used the prevProps argument; useEffect's dep change-only firing
  // means the effect runs on the *new* value, so we read isInView directly.
  const prevIsInViewRef = useRef(isInView);
  useEffect(() => {
    if (isInView !== prevIsInViewRef.current) {
      if (isInView && panel.refreshWhenInView) {
        onRefreshRef.current();
      }
      prevIsInViewRef.current = isInView;
    }
  }, [isInView, panel]);

  // Effect 3 — when the panel width changes, ask liveTimer to recompute its
  // tick interval (millisPerPixel depends on width).
  const prevWidthRef = useRef(width);
  useEffect(() => {
    if (width !== prevWidthRef.current) {
      if (liveHandleRef.current) {
        liveTimer.updateInterval(liveHandleRef.current);
      }
      prevWidthRef.current = width;
    }
  }, [width]);

  // ============ Render-time helper (formerly renderPanelContent) ============
  // Closes over the latest render's state — same as `this.renderPanelContent`
  // inside the class's render() did.
  const renderPanelContent = (innerWidth: number, innerHeight: number) => {
    const { state: loadingState } = data;

    // do not render component until we have first data
    if (skipFirstRenderFor(loadingState, isFirstLoad, plugin, panel)) {
      return null;
    }

    // This is only done to increase a counter that is used by backend
    // image rendering to know when to capture image
    if (shouldSignalRenderingCompleted(loadingState, plugin.meta)) {
      profiler.renderingCompleted();
    }

    const PanelComponent = plugin.panel!;
    const timeRange = liveTime ?? data.timeRange ?? timeSrv.timeRange();
    const panelOptions = panel.getOptions();

    // Update the event filter (dashboard settings may have changed).
    // Yes this is called on every render — matches the class. Mutating
    // the ref keeps the same object identity that the scoped event bus
    // already holds, so the change is immediately visible.
    eventFilterRef.current.onlyLocal = dashboard.graphTooltip === 0;

    return (
      <>
        <PanelContextProvider value={context}>
          <PluginContextProvider meta={plugin.meta}>
            <PanelComponent
              id={panel.id}
              data={data}
              title={panel.title}
              timeRange={timeRange}
              timeZone={dashboard.getTimezone()}
              options={panelOptions}
              fieldConfig={panel.fieldConfig}
              transparent={panel.transparent}
              width={innerWidth}
              height={innerHeight}
              renderCounter={renderCounter}
              replaceVariables={panel.replaceVariables}
              onOptionsChange={onOptionsChange}
              onFieldConfigChange={onFieldConfigChange}
              onChangeTimeRange={onChangeTimeRange}
              eventBus={dashboard.events}
            />
            {errorMessage === undefined && (
              <PanelLoadTimeMonitor panelType={plugin.meta.id} panelId={panel.id} panelTitle={panel.title} />
            )}
          </PluginContextProvider>
        </PanelContextProvider>
      </>
    );
  };

  // ============ Render (PanelChrome wrapper — exact same shape as the class) ============
  const { transparent } = panel;
  const panelChromeProps = getPanelChromeProps({ ...props, data });

  // Shift the hover menu down if it's on the top row so it doesn't get clipped by topnav
  const hoverHeaderOffset = (panel.gridPos?.y ?? 0) === 0 ? -16 : undefined;

  const menu = (
    <div data-testid="panel-dropdown">
      <PanelHeaderMenuWrapper panel={panel} dashboard={dashboard} loadingState={data.state} />
    </div>
  );

  return (
    <PanelChrome
      width={width}
      height={height}
      title={panelChromeProps.title}
      loadingState={data.state}
      statusMessage={errorMessage}
      statusMessageOnClick={panelChromeProps.onOpenErrorInspect}
      description={panelChromeProps.description}
      titleItems={panelChromeProps.titleItems}
      menu={hideMenu ? undefined : menu}
      dragClass={panelChromeProps.dragClass}
      dragClassCancel="grid-drag-cancel"
      padding={panelChromeProps.padding}
      hoverHeaderOffset={hoverHeaderOffset}
      hoverHeader={panelChromeProps.hasOverlayHeader()}
      displayMode={transparent ? 'transparent' : 'default'}
      onCancelQuery={panelChromeProps.onCancelQuery}
      onFocus={() => setPanelAttention()}
      onMouseEnter={() => setPanelAttention()}
      onMouseMove={() => debouncedSetPanelAttention()}
    >
      {(innerWidth, innerHeight) => (
        <>
          <ErrorBoundary
            boundaryName="panel-state-wrapper"
            dependencies={[data, plugin, panel.getOptions()]}
            onError={onPanelError}
            onRecover={onPanelErrorRecover}
          >
            {({ error }) => {
              if (error) {
                return null;
              }
              return renderPanelContent(innerWidth, innerHeight);
            }}
          </ErrorBoundary>
        </>
      )}
    </PanelChrome>
  );
};

PanelStateWrapperInternal.displayName = 'PanelStateWrapper';

// memo preserves the PureComponent shallow-equality optimization the class
// had via `extends PureComponent`. Parent re-renders that pass the same
// props (by reference) will not re-render this panel.
export const PanelStateWrapper = memo(PanelStateWrapperInternal);
