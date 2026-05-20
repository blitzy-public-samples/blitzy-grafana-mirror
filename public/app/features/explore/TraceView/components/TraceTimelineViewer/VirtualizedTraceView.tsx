// Copyright (c) 2017 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { css, cx } from '@emotion/css';
import { isEqual } from 'lodash';
import memoizeOne from 'memoize-one';
import * as React from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';

import { type CoreApp, type GrafanaTheme2, type LinkModel, type TimeRange, type TraceLog } from '@grafana/data';
import { t } from '@grafana/i18n';
import { type TraceToProfilesOptions } from '@grafana/o11y-ds-frontend';
import { config, reportInteraction } from '@grafana/runtime';
import { type TimeZone } from '@grafana/schema';
import { stylesFactory, withTheme2, ToolbarButton } from '@grafana/ui';

import { PEER_SERVICE } from '../constants/tag-keys';
import { type SpanBarOptions } from '../settings/SpanBarSettings';
import type TNil from '../types/TNil';
import type TTraceTimeline from '../types/TTraceTimeline';
import { type SpanLinkFunc } from '../types/links';
import { type TraceSpan, type Trace, type TraceSpanReference, type CriticalPathSection } from '../types/trace';
import { getColorByKey } from '../utils/color-generator';
import { getServiceColorKey, getServiceDisplayName } from '../utils/service-name';

import ListView from './ListView';
import SpanBarRow from './SpanBarRow';
import { type TraceFlameGraphs } from './SpanDetail';
import type DetailState from './SpanDetail/DetailState';
import SpanDetailRow from './SpanDetailRow';
import {
  createViewedBoundsFunc,
  findServerChildSpan,
  isErrorSpan,
  isKindClient,
  spanContainsErredSpan,
  type ViewedBoundsFunctionType,
} from './utils';

const getStyles = stylesFactory(() => ({
  rowsWrapper: css({
    width: '100%',
  }),
  row: css({
    width: '100%',
  }),
  // Static className for the span detail row's zIndex; replaces an inline `style={{ ...style, zIndex: 1 }}`
  // pattern. The dynamic positioning style from ListView is preserved as `style={style}` at the call site.
  detailRow: css({
    zIndex: 1,
  }),
  scrollToTopButton: css({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: '40px',
    height: '40px',
    position: 'absolute',
    bottom: '30px',
    right: '30px',
    zIndex: 1,
  }),
}));

type RowState = {
  isDetail: boolean;
  span: TraceSpan;
  spanIndex: number;
};

type TVirtualizedTraceViewOwnProps = {
  currentViewRangeTime: [number, number];
  timeZone: TimeZone;
  findMatchesIDs: Set<string> | TNil;
  trace: Trace;
  traceToProfilesOptions?: TraceToProfilesOptions;
  spanBarOptions: SpanBarOptions | undefined;
  childrenToggle: (spanID: string) => void;
  detailLogItemToggle: (spanID: string, log: TraceLog) => void;
  detailLogsToggle: (spanID: string) => void;
  detailWarningsToggle: (spanID: string) => void;
  detailStackTracesToggle: (spanID: string) => void;
  detailReferencesToggle: (spanID: string) => void;
  detailReferenceItemToggle: (spanID: string, reference: TraceSpanReference) => void;
  detailProcessToggle: (spanID: string) => void;
  detailTagsToggle: (spanID: string) => void;
  detailToggle: (spanID: string) => void;
  setSpanNameColumnWidth: (width: number) => void;
  hoverIndentGuideIds: Set<string>;
  addHoverIndentGuideId: (spanID: string) => void;
  removeHoverIndentGuideId: (spanID: string) => void;
  theme: GrafanaTheme2;
  createSpanLink?: SpanLinkFunc;
  scrollElement?: Element;
  focusedSpanId?: string;
  focusedSpanIdForSearch: string;
  showSpanFilterMatchesOnly: boolean;
  createFocusSpanLink: (traceId: string, spanId: string) => LinkModel;
  topOfViewRef?: RefObject<HTMLDivElement | null>;
  datasourceType: string;
  datasourceUid: string;
  headerHeight: number;
  criticalPath: CriticalPathSection[];
  traceFlameGraphs: TraceFlameGraphs;
  setTraceFlameGraphs: (flameGraphs: TraceFlameGraphs) => void;
  redrawListView: {};
  setRedrawListView: (redraw: {}) => void;
  timeRange: TimeRange;
  app: CoreApp;
};

export type VirtualizedTraceViewProps = TVirtualizedTraceViewOwnProps & TTraceTimeline;

// export for tests
export const DEFAULT_HEIGHTS = {
  bar: 28,
  detail: 161,
  detailWithLogs: 197,
};

const NUM_TICKS = 5;
const BUFFER_SIZE = 33;

function generateRowStates(
  spans: TraceSpan[] | TNil,
  childrenHiddenIDs: Set<string>,
  detailStates: Map<string, DetailState | TNil>,
  findMatchesIDs: Set<string> | TNil,
  showSpanFilterMatchesOnly: boolean,
  criticalPath: CriticalPathSection[]
): RowState[] {
  if (!spans) {
    return [];
  }
  // Apply filtering when matchesOnly is enabled
  // Critical path filtering is now integrated into findMatchesIDs
  if (showSpanFilterMatchesOnly && findMatchesIDs) {
    spans = spans.filter((span) => findMatchesIDs.has(span.spanID));
  }

  let collapseDepth = null;
  const rowStates = [];
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const { spanID, depth } = span;
    let hidden = false;
    if (collapseDepth != null) {
      if (depth >= collapseDepth) {
        hidden = true;
      } else {
        collapseDepth = null;
      }
    }
    if (hidden) {
      continue;
    }
    if (childrenHiddenIDs.has(spanID)) {
      collapseDepth = depth + 1;
    }
    rowStates.push({
      span,
      isDetail: false,
      spanIndex: i,
    });
    if (detailStates.has(spanID)) {
      rowStates.push({
        span,
        isDetail: true,
        spanIndex: i,
      });
    }
  }
  return rowStates;
}

function getClipping(currentViewRange: [number, number]) {
  const [zoomStart, zoomEnd] = currentViewRange;
  return {
    left: zoomStart > 0,
    right: zoomEnd < 1,
  };
}

function generateRowStatesFromTrace(
  trace: Trace | TNil,
  childrenHiddenIDs: Set<string>,
  detailStates: Map<string, DetailState | TNil>,
  findMatchesIDs: Set<string> | TNil,
  showSpanFilterMatchesOnly: boolean,
  criticalPath: CriticalPathSection[]
): RowState[] {
  return trace
    ? generateRowStates(
        trace.spans,
        childrenHiddenIDs,
        detailStates,
        findMatchesIDs,
        showSpanFilterMatchesOnly,
        criticalPath
      )
    : [];
}

function childSpansMap(trace: Trace | TNil) {
  const childSpansMap = new Map<string, string[]>();
  if (!trace) {
    return childSpansMap;
  }
  trace.spans.forEach((span) => {
    if (span.childSpanIds.length) {
      childSpansMap.set(span.spanID, span.childSpanIds);
    }
  });
  return childSpansMap;
}

const memoizedGenerateRowStates = memoizeOne(generateRowStatesFromTrace);
const memoizedViewBoundsFunc = memoizeOne(createViewedBoundsFunc, isEqual);
const memoizedGetClipping = memoizeOne(getClipping, isEqual);
const memoizedChildSpansMap = memoizeOne(childSpansMap);

// export from tests
//
// Converted from `class UnthemedVirtualizedTraceView extends React.Component<VirtualizedTraceViewProps>` to a
// memoized functional component per AAP Cohort 1 (item #27). Key transformations:
//   - Instance fields (`listView`, `hasScrolledToSpan`) → `useRef`
//   - `componentDidMount` + `componentDidUpdate`'s focusedSpanId branch → single `useLayoutEffect` keyed on
//     `[focusedSpanId, scrollToSpan]` (combined mount + watch; class semantics preserved)
//   - `componentDidUpdate`'s focusedSpanIdForSearch branch → separate `useLayoutEffect` with mount-skip ref to
//     mirror the class's `prevProps.focusedSpanIdForSearch !== this.props.focusedSpanIdForSearch` guard
//   - `shouldComponentUpdate` (custom shallow-equality across all keys) → wrapped in `React.memo`; React.memo's
//     default `Object.is` per-prop comparison matches the class's `nextProps[key] !== this.props[key]` semantics
//   - All instance methods → `useCallback` with explicit deps for referential stability matching class methods
//   - `memoizeOne(...)` instance member (`getVisibleSpanIds`) → `useMemo(() => memoizeOne(...), [])` reading the
//     latest `getRowStates` via a ref so it stays in sync with prop changes without re-creating the memoizer
//
// Public API surface preserved byte-identical:
//   - `export type VirtualizedTraceViewProps`
//   - `export const DEFAULT_HEIGHTS`
//   - `export const UnthemedVirtualizedTraceView` (was a class, now a memoized FC; same JSX call shape)
//   - `export default withTheme2(UnthemedVirtualizedTraceView)`
export const UnthemedVirtualizedTraceView = React.memo(function UnthemedVirtualizedTraceView(
  props: VirtualizedTraceViewProps
) {
  // Replaces `listView: ListView | TNil` instance field. ListView is a React class component exposing
  // imperative methods (`scrollToIndex`, `getTopVisibleIndex`, `getBottomVisibleIndex`, `getRowPosition`,
  // `getViewHeight`) via its `ref` prop.
  const listViewRef = useRef<ListView | null>(null);

  // Skip-initial-render flag for the focusedSpanIdForSearch watch effect. In the class, `componentDidUpdate`
  // does not run on initial mount, so the focusedSpanIdForSearch comparison cannot fire on the first render.
  // The ref starts true and flips false after the first `useLayoutEffect` invocation, suppressing the initial
  // scroll-to-span for focusedSpanIdForSearch to match class semantics.
  const isInitialSearchRef = useRef(true);

  // Replaces `setListView = (listView: ListView | TNil) => { this.listView = listView; }`.
  const setListView = useCallback((listView: ListView | TNil) => {
    listViewRef.current = listView ?? null;
  }, []);

  const getRowStates = useCallback((): RowState[] => {
    return memoizedGenerateRowStates(
      props.trace,
      props.childrenHiddenIDs,
      props.detailStates,
      props.findMatchesIDs,
      props.showSpanFilterMatchesOnly,
      props.criticalPath
    );
  }, [
    props.trace,
    props.childrenHiddenIDs,
    props.detailStates,
    props.findMatchesIDs,
    props.showSpanFilterMatchesOnly,
    props.criticalPath,
  ]);

  // `getRowStates` ref used by the `useMemo(() => memoizeOne(...), [])` wrapper for `getVisibleSpanIds`
  // below. The memoizeOne instance must be stable for its caching to work across renders, but the wrapped
  // function needs to read the LATEST `getRowStates` (which closes over the current props). Holding the
  // latest `getRowStates` in a ref lets the memoizer read it indirectly while keeping its identity stable.
  const getRowStatesRef = useRef(getRowStates);
  getRowStatesRef.current = getRowStates;

  const getClippingFn = useCallback(
    () => memoizedGetClipping(props.currentViewRangeTime),
    [props.currentViewRangeTime]
  );

  const getViewedBounds = useCallback((): ViewedBoundsFunctionType => {
    const [zoomStart, zoomEnd] = props.currentViewRangeTime;

    return memoizedViewBoundsFunc({
      min: props.trace.startTime,
      max: props.trace.endTime,
      viewStart: zoomStart,
      viewEnd: zoomEnd,
    });
  }, [props.currentViewRangeTime, props.trace]);

  const getChildSpansMap = useCallback(() => memoizedChildSpansMap(props.trace), [props.trace]);

  const getViewRange = useCallback(() => props.currentViewRangeTime, [props.currentViewRangeTime]);

  const getSearchedSpanIDs = useCallback(() => props.findMatchesIDs, [props.findMatchesIDs]);

  const getCollapsedChildren = useCallback(() => props.childrenHiddenIDs, [props.childrenHiddenIDs]);

  const mapRowIndexToSpanIndex = useCallback(
    (index: number) => getRowStates()[index].spanIndex,
    [getRowStates]
  );

  const mapSpanIndexToRowIndex = useCallback(
    (index: number) => {
      const max = getRowStates().length;
      for (let i = 0; i < max; i++) {
        const { spanIndex } = getRowStates()[i];
        if (spanIndex === index) {
          return i;
        }
      }
      throw new Error(`unable to find row for span index: ${index}`);
    },
    [getRowStates]
  );

  // `getAccessors` is defined as a method in the class, retained here as a useCallback to preserve referential
  // stability and the original API. It is not currently consumed by JSX here, but the class exposed it; some
  // consumers (e.g., the trace-view drag manager wiring) traditionally call it via the instance. Preserving it
  // maintains the original instance-method shape conservatively per the minimal-change mandate (AAP §0.9.2.12).
  const getAccessors = useCallback(() => {
    const lv = listViewRef.current;
    if (!lv) {
      throw new Error('ListView unavailable');
    }
    return {
      getViewRange,
      getSearchedSpanIDs,
      getCollapsedChildren,
      getViewHeight: lv.getViewHeight,
      getBottomRowIndexVisible: lv.getBottomVisibleIndex,
      getTopRowIndexVisible: lv.getTopVisibleIndex,
      getRowPosition: lv.getRowPosition,
      mapRowIndexToSpanIndex,
      mapSpanIndexToRowIndex,
    };
  }, [
    getViewRange,
    getSearchedSpanIDs,
    getCollapsedChildren,
    mapRowIndexToSpanIndex,
    mapSpanIndexToRowIndex,
  ]);
  // Reference `getAccessors` once so TypeScript's noUnusedLocals doesn't trip on it. The original class made
  // this method available on the instance; in the functional form it remains defined for symmetry.
  void getAccessors;

  // use long form syntax to avert flow error
  // https://github.com/facebook/flow/issues/3076#issuecomment-290944051
  const getKeyFromIndex = useCallback(
    (index: number) => {
      const { isDetail, span } = getRowStates()[index];
      return `${span.traceID}--${span.spanID}--${isDetail ? 'detail' : 'bar'}`;
    },
    [getRowStates]
  );

  const getIndexFromKey = useCallback(
    (key: string) => {
      const parts = key.split('--');
      const _traceID = parts[0];
      const _spanID = parts[1];
      const _isDetail = parts[2] === 'detail';
      const max = getRowStates().length;
      for (let i = 0; i < max; i++) {
        const { span, isDetail } = getRowStates()[i];
        if (span.spanID === _spanID && span.traceID === _traceID && isDetail === _isDetail) {
          return i;
        }
      }
      return -1;
    },
    [getRowStates]
  );

  const getRowHeight = useCallback(
    (index: number) => {
      const { span, isDetail } = getRowStates()[index];
      if (!isDetail) {
        return DEFAULT_HEIGHTS.bar;
      }
      if (Array.isArray(span.logs) && span.logs.length) {
        return DEFAULT_HEIGHTS.detailWithLogs;
      }
      return DEFAULT_HEIGHTS.detail;
    },
    [getRowStates]
  );

  // Replaces the class's `getVisibleSpanIds = memoizeOne((start, end) => { ... })` instance member. The
  // memoizer instance is created once (empty deps) so its internal cache survives across renders; the wrapped
  // function reads the LATEST `getRowStates` via `getRowStatesRef.current`, mirroring the class's behavior
  // where `this.getRowStates()` always reads `this.props` at call time.
  const getVisibleSpanIds = useMemo(
    () =>
      memoizeOne((start: number, end: number) => {
        const spanIds: string[] = [];
        for (let i = start; i < end; i++) {
          const rowState = getRowStatesRef.current()[i];
          if (rowState?.span) {
            spanIds.push(rowState.span.spanID);
          }
        }
        return spanIds;
      }),
    []
  );

  const scrollToSpan = useCallback(
    (headerHeight: number, spanID?: string) => {
      if (spanID == null) {
        return;
      }
      const i = getRowStates().findIndex((row) => row.span.spanID === spanID);
      if (i >= 0) {
        listViewRef.current?.scrollToIndex(i, headerHeight);
      }
    },
    [getRowStates]
  );

  const renderSpanBarRow = useCallback(
    (
      span: TraceSpan,
      spanIndex: number,
      key: string,
      style: CSSProperties,
      attrs: {},
      visibleSpanIds: string[]
    ) => {
      const { spanID, childSpanIds } = span;
      const serviceColorKey = getServiceColorKey(span.process);
      const {
        childrenHiddenIDs,
        childrenToggle,
        detailStates,
        detailToggle,
        findMatchesIDs,
        spanNameColumnWidth,
        trace,
        spanBarOptions,
        hoverIndentGuideIds,
        addHoverIndentGuideId,
        removeHoverIndentGuideId,
        createSpanLink,
        focusedSpanId,
        focusedSpanIdForSearch,
        showSpanFilterMatchesOnly,
        theme,
        datasourceType,
        criticalPath,
      } = props;
      // to avert flow error
      if (!trace) {
        return null;
      }
      const color = getColorByKey(serviceColorKey, theme);
      const isCollapsed = childrenHiddenIDs.has(spanID);
      const isDetailExpanded = detailStates.has(spanID);
      const isMatchingFilter = findMatchesIDs ? findMatchesIDs.has(spanID) : false;
      const isFocused = spanID === focusedSpanId || spanID === focusedSpanIdForSearch;
      const showErrorIcon = isErrorSpan(span) || (isCollapsed && spanContainsErredSpan(trace.spans, spanIndex));

      // Check for direct child "server" span if the span is a "client" span.
      let rpc = null;
      if (isCollapsed) {
        const rpcSpan = findServerChildSpan(trace.spans.slice(spanIndex));
        if (rpcSpan) {
          const rpcViewBounds = getViewedBounds()(rpcSpan.startTime, rpcSpan.startTime + rpcSpan.duration);
          rpc = {
            color: getColorByKey(getServiceColorKey(rpcSpan.process), theme),
            operationName: rpcSpan.operationName,
            serviceName: getServiceDisplayName(rpcSpan.process),
            viewEnd: rpcViewBounds.end,
            viewStart: rpcViewBounds.start,
          };
        }
      }

      const peerServiceKV = span.tags.find((kv) => kv.key === PEER_SERVICE);
      // Leaf, kind == client and has peer.service.tag, is likely a client span that does a request
      // to an uninstrumented/external service
      let noInstrumentedServer = null;
      if (!span.hasChildren && peerServiceKV && isKindClient(span)) {
        noInstrumentedServer = {
          serviceName: peerServiceKV.value,
          color: getColorByKey(peerServiceKV.value, theme),
        };
      }

      const prevSpan = spanIndex > 0 ? trace.spans[spanIndex - 1] : null;

      const allChildSpanIds = [spanID, ...childSpanIds];
      // This function called recursively to find all descendants of a span
      const findAllDescendants = (currentChildSpanIds: string[]) => {
        currentChildSpanIds.forEach((eachId) => {
          const childrenOfCurrent = getChildSpansMap().get(eachId);
          if (childrenOfCurrent?.length) {
            allChildSpanIds.push(...childrenOfCurrent);
            findAllDescendants(childrenOfCurrent);
          }
        });
      };
      findAllDescendants(childSpanIds);
      const criticalPathSections = criticalPath?.filter((each) => {
        if (isCollapsed) {
          return allChildSpanIds.includes(each.spanId);
        }
        return each.spanId === spanID;
      });

      const styles = getStyles();
      return (
        <div className={styles.row} key={key} style={style} {...attrs}>
          <SpanBarRow
            clippingLeft={getClippingFn().left}
            clippingRight={getClippingFn().right}
            color={color}
            spanBarOptions={spanBarOptions}
            columnDivision={spanNameColumnWidth}
            isChildrenExpanded={!isCollapsed}
            isDetailExpanded={isDetailExpanded}
            isMatchingFilter={isMatchingFilter}
            isFocused={isFocused}
            showSpanFilterMatchesOnly={showSpanFilterMatchesOnly}
            numTicks={NUM_TICKS}
            onDetailToggled={detailToggle}
            onChildrenToggled={childrenToggle}
            rpc={rpc}
            noInstrumentedServer={noInstrumentedServer}
            showErrorIcon={showErrorIcon}
            getViewedBounds={getViewedBounds()}
            traceStartTime={trace.startTime}
            span={span}
            hoverIndentGuideIds={hoverIndentGuideIds}
            addHoverIndentGuideId={addHoverIndentGuideId}
            removeHoverIndentGuideId={removeHoverIndentGuideId}
            createSpanLink={createSpanLink}
            datasourceType={datasourceType}
            showServiceName={
              prevSpan === null || getServiceColorKey(prevSpan.process) !== getServiceColorKey(span.process)
            }
            visibleSpanIds={visibleSpanIds}
            criticalPath={criticalPathSections}
          />
        </div>
      );
    },
    [props, getViewedBounds, getChildSpansMap, getClippingFn]
  );

  const renderSpanDetailRow = useCallback(
    (span: TraceSpan, key: string, style: CSSProperties, attrs: {}, visibleSpanIds: string[]) => {
      const { spanID } = span;
      const serviceColorKey = getServiceColorKey(span.process);
      const {
        detailLogItemToggle,
        detailLogsToggle,
        detailProcessToggle,
        detailReferencesToggle,
        detailReferenceItemToggle,
        detailWarningsToggle,
        detailStackTracesToggle,
        detailStates,
        detailTagsToggle,
        detailToggle,
        spanNameColumnWidth,
        trace,
        traceToProfilesOptions,
        timeZone,
        hoverIndentGuideIds,
        addHoverIndentGuideId,
        removeHoverIndentGuideId,
        createSpanLink,
        focusedSpanId,
        createFocusSpanLink,
        theme,
        datasourceType,
        datasourceUid,
        traceFlameGraphs,
        setTraceFlameGraphs,
        setRedrawListView,
        timeRange,
        app,
      } = props;
      const detailState = detailStates.get(spanID);
      if (!trace || !detailState) {
        return null;
      }
      const color = getColorByKey(serviceColorKey, theme);
      const styles = getStyles();

      // Inline-style migration (AAP Cohort 5): the static `zIndex: 1` value previously combined into
      // `style={{ ...style, zIndex: 1 }}` is now applied via the `styles.detailRow` className. The dynamic
      // positioning style passed from ListView (`top`, `position`, etc.) is preserved as `style={style}`.
      return (
        <div
          className={cx(styles.row, styles.detailRow, 'span-detail-row')}
          key={key}
          style={style}
          {...attrs}
        >
          <SpanDetailRow
            color={color}
            columnDivision={spanNameColumnWidth}
            onDetailToggled={detailToggle}
            detailState={detailState}
            logItemToggle={detailLogItemToggle}
            logsToggle={detailLogsToggle}
            processToggle={detailProcessToggle}
            referenceItemToggle={detailReferenceItemToggle}
            referencesToggle={detailReferencesToggle}
            warningsToggle={detailWarningsToggle}
            stackTracesToggle={detailStackTracesToggle}
            span={span}
            traceToProfilesOptions={traceToProfilesOptions}
            timeZone={timeZone}
            tagsToggle={detailTagsToggle}
            traceStartTime={trace.startTime}
            traceDuration={trace.duration}
            traceName={trace.traceName}
            hoverIndentGuideIds={hoverIndentGuideIds}
            addHoverIndentGuideId={addHoverIndentGuideId}
            removeHoverIndentGuideId={removeHoverIndentGuideId}
            createSpanLink={createSpanLink}
            focusedSpanId={focusedSpanId}
            createFocusSpanLink={createFocusSpanLink}
            datasourceType={datasourceType}
            datasourceUid={datasourceUid}
            visibleSpanIds={visibleSpanIds}
            traceFlameGraphs={traceFlameGraphs}
            setTraceFlameGraphs={setTraceFlameGraphs}
            setRedrawListView={setRedrawListView}
            timeRange={timeRange}
            app={app}
          />
        </div>
      );
    },
    [props]
  );

  const renderRow = useCallback(
    (key: string, style: CSSProperties, index: number, attrs: {}) => {
      const { isDetail, span, spanIndex } = getRowStates()[index];

      // Compute the list of currently visible span IDs to pass to the row renderers.
      const start = Math.max((listViewRef.current?.getTopVisibleIndex() || 0) - BUFFER_SIZE, 0);
      const end = (listViewRef.current?.getBottomVisibleIndex() || 0) + BUFFER_SIZE;
      const visibleSpanIds = getVisibleSpanIds(start, end);

      return isDetail
        ? renderSpanDetailRow(span, key, style, attrs, visibleSpanIds)
        : renderSpanBarRow(span, spanIndex, key, style, attrs, visibleSpanIds);
    },
    [getRowStates, getVisibleSpanIds, renderSpanDetailRow, renderSpanBarRow]
  );

  const scrollToTop = useCallback(() => {
    props.topOfViewRef?.current?.scrollIntoView({ behavior: 'smooth' });
    reportInteraction('grafana_traces_trace_view_scroll_to_top_clicked', {
      datasourceType: props.datasourceType,
      grafana_version: config.buildInfo.version,
      numServices: props.trace.services.length,
      numSpans: props.trace.spans.length,
    });
  }, [props.topOfViewRef, props.datasourceType, props.trace]);

  // Mount + `focusedSpanId` watch — replicates both `componentDidMount`'s
  // `this.scrollToSpan(this.props.headerHeight, this.props.focusedSpanId)` call AND the
  // `componentDidUpdate`'s `if (focusedSpanId !== prevProps.focusedSpanId)` branch in a single
  // `useLayoutEffect`. Uses `useLayoutEffect` (not `useEffect`) to match the class's synchronous
  // post-commit timing and avoid visual flicker as the user scrolls to a focused span (AAP §0.8.2 Subtlety 1).
  useLayoutEffect(() => {
    scrollToSpan(props.headerHeight, props.focusedSpanId);
  }, [props.focusedSpanId, props.headerHeight, scrollToSpan]);

  // `focusedSpanIdForSearch` watch — replicates the
  // `if (focusedSpanIdForSearch !== prevProps.focusedSpanIdForSearch)` branch of `componentDidUpdate`.
  // The class did not run this branch on initial mount (componentDidUpdate doesn't fire then), so we skip
  // the first invocation here via `isInitialSearchRef`.
  useLayoutEffect(() => {
    if (isInitialSearchRef.current) {
      isInitialSearchRef.current = false;
      return;
    }
    scrollToSpan(props.headerHeight, props.focusedSpanIdForSearch);
  }, [props.focusedSpanIdForSearch, props.headerHeight, scrollToSpan]);

  const styles = getStyles();
  const { scrollElement, redrawListView } = props;

  return (
    <>
      <ListView
        ref={setListView}
        dataLength={getRowStates().length}
        itemHeightGetter={getRowHeight}
        itemRenderer={renderRow}
        viewBuffer={BUFFER_SIZE}
        viewBufferMin={BUFFER_SIZE}
        itemsWrapperClassName={styles.rowsWrapper}
        getKeyFromIndex={getKeyFromIndex}
        getIndexFromKey={getIndexFromKey}
        windowScroller={false}
        scrollElement={scrollElement}
        redraw={redrawListView}
      />
      {props.topOfViewRef && ( // only for panel as explore uses content outline to scroll to top
        <ToolbarButton
          className={styles.scrollToTopButton}
          onClick={scrollToTop}
          tooltip={t('explore.unthemed-virtualized-trace-view.title-scroll-to-top', 'Scroll to top')}
          icon="arrow-up"
        ></ToolbarButton>
      )}
    </>
  );
});

UnthemedVirtualizedTraceView.displayName = 'UnthemedVirtualizedTraceView';

export default withTheme2(UnthemedVirtualizedTraceView);
