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
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

import { stylesFactory } from '@grafana/ui';

import type TNil from '../../types/TNil';
import DraggableManager from '../../utils/DraggableManager/DraggableManager';
import { type DraggableBounds, type DraggingUpdate } from '../../utils/DraggableManager/types';
import { type TUpdateViewRangeTimeFunction, type ViewRangeTime, type ViewRangeTimeUpdate } from '../types';

// exported for testing
export const getStyles = stylesFactory(() => {
  return {
    TimelineViewingLayer: css({
      label: 'TimelineViewingLayer',
      bottom: 0,
      cursor: 'vertical-text',
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    }),
    TimelineViewingLayerCursorGuide: css({
      label: 'TimelineViewingLayerCursorGuide',
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: '1px',
      backgroundColor: 'red',
    }),
    TimelineViewingLayerDragged: css({
      label: 'TimelineViewingLayerDragged',
      position: 'absolute',
      top: 0,
      bottom: 0,
    }),
    TimelineViewingLayerDraggedDraggingLeft: css({
      label: 'TimelineViewingLayerDraggedDraggingLeft',
      borderLeft: '1px solid',
    }),
    TimelineViewingLayerDraggedDraggingRight: css({
      label: 'TimelineViewingLayerDraggedDraggingRight',
      borderRight: '1px solid',
    }),
    TimelineViewingLayerDraggedShiftDrag: css({
      label: 'TimelineViewingLayerDraggedShiftDrag',
      backgroundColor: 'rgba(68, 68, 255, 0.2)',
      borderColor: '#44f',
    }),
    TimelineViewingLayerDraggedReframeDrag: css({
      label: 'TimelineViewingLayerDraggedReframeDrag',
      backgroundColor: 'rgba(255, 68, 68, 0.2)',
      borderColor: '#f44',
    }),
    TimelineViewingLayerFullOverlay: css({
      label: 'TimelineViewingLayerFullOverlay',
      bottom: 0,
      cursor: 'col-resize',
      left: 0,
      position: 'fixed',
      right: 0,
      top: 0,
      userSelect: 'none',
    }),
  };
});

export type TimelineViewingLayerProps = {
  /**
   * `boundsInvalidator` is an arbitrary prop that lets the component know the
   * bounds for dragging need to be recalculated. In practice, the name column
   * width serves fine for this.
   */
  boundsInvalidator: number | null | undefined;
  updateNextViewRangeTime: (update: ViewRangeTimeUpdate) => void;
  updateViewRangeTime: TUpdateViewRangeTimeFunction;
  viewRangeTime: ViewRangeTime;
};

type TDraggingLeftLayout = {
  isDraggingLeft: boolean;
  left: string;
  width: string;
};

type TOutOfViewLayout = {
  isOutOfView: true;
};

function isOutOfView(layout: TDraggingLeftLayout | TOutOfViewLayout): layout is TOutOfViewLayout {
  return Reflect.has(layout, 'isOutOfView');
}

/**
 * Map from a sub range to the greater view range, e.g, when the view range is
 * the middle half ([0.25, 0.75]), a value of 0.25 befomes 3/8.
 * @returns {number}
 */
function mapFromViewSubRange(viewStart: number, viewEnd: number, value: number) {
  return viewStart + value * (viewEnd - viewStart);
}

/**
 * Map a value from the view ([0, 1]) to a sub-range, e.g, when the view range is
 * the middle half ([0.25, 0.75]), a value of 3/8 becomes 1/4.
 * @returns {number}
 */
function mapToViewSubRange(viewStart: number, viewEnd: number, value: number) {
  return (value - viewStart) / (viewEnd - viewStart);
}

/**
 * Get the layout for the "next" view range time, e.g. the difference from the
 * drag start and the drag end. This is driven by `shiftStart`, `shiftEnd` or
 * `reframe` on `props.viewRangeTime`, not by the current state of the
 * component. So, it reflects in-progress dragging from the span minimap.
 */
function getNextViewLayout(start: number, position: number): TDraggingLeftLayout | TOutOfViewLayout {
  let [left, right] = start < position ? [start, position] : [position, start];
  if (left >= 1 || right <= 0) {
    return { isOutOfView: true };
  }
  if (left < 0) {
    left = 0;
  }
  if (right > 1) {
    right = 1;
  }
  return {
    isDraggingLeft: start > position,
    left: `${left * 100}%`,
    width: `${(right - left) * 100}%`,
  };
}

/**
 * Render the visual indication of the "next" view range.
 */
function getMarkers(viewStart: number, viewEnd: number, from: number, to: number, isShift: boolean): ReactNode {
  const mappedFrom = mapToViewSubRange(viewStart, viewEnd, from);
  const mappedTo = mapToViewSubRange(viewStart, viewEnd, to);
  const layout = getNextViewLayout(mappedFrom, mappedTo);
  if (isOutOfView(layout)) {
    return null;
  }
  const { isDraggingLeft, left, width } = layout;
  const styles = getStyles();
  const cls = cx({
    [styles.TimelineViewingLayerDraggedDraggingRight]: !isDraggingLeft,
    [styles.TimelineViewingLayerDraggedReframeDrag]: !isShift,
    [styles.TimelineViewingLayerDraggedShiftDrag]: isShift,
  });
  return (
    // Dynamic drag-marker position and width from view-range mapping; cannot be statically classed.
    <div
      className={cx(styles.TimelineViewingLayerDragged, styles.TimelineViewingLayerDraggedDraggingLeft, cls)}
      style={{ left, width }}
      data-testid="Dragged"
    />
  );
}

/**
 * `TimelineViewingLayer` is rendered on top of the TimelineHeaderRow time
 * labels; it handles showing the current view range and handles mouse UX for
 * modifying it.
 */
export default function TimelineViewingLayer(props: TimelineViewingLayerProps) {
  const { boundsInvalidator, viewRangeTime } = props;

  // Root element ref for measuring bounds during drag.
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Mirror of latest props for DraggableManager callbacks (which need to read
  // current viewRangeTime / updateNextViewRangeTime / updateViewRangeTime at
  // call time, matching class-instance method semantics — class methods
  // always read the latest `this.props`).
  const propsRef = useRef(props);
  propsRef.current = props;

  // DraggableManager instance — created once, lazily, on first render so it
  // is available when render passes its handlers to the JSX. This mirrors the
  // original constructor's eager initialization.
  const draggerReframeRef = useRef<DraggableManager | null>(null);
  if (draggerReframeRef.current === null) {
    draggerReframeRef.current = new DraggableManager({
      getBounds: (): DraggableBounds => {
        const root = rootRef.current;
        if (!root) {
          throw new Error('invalid state');
        }
        const { left: clientXLeft, width } = root.getBoundingClientRect();
        return { clientXLeft, width };
      },
      onMouseMove: ({ value }: DraggingUpdate) => {
        const [viewStart, viewEnd] = propsRef.current.viewRangeTime.current;
        const cursor = mapFromViewSubRange(viewStart, viewEnd, value);
        propsRef.current.updateNextViewRangeTime({ cursor });
      },
      onMouseLeave: () => {
        propsRef.current.updateNextViewRangeTime({ cursor: undefined });
      },
      onDragStart: ({ value }: DraggingUpdate) => {
        const { current, reframe } = propsRef.current.viewRangeTime;
        const [viewStart, viewEnd] = current;
        const shift = mapFromViewSubRange(viewStart, viewEnd, value);
        const anchor = reframe ? reframe.anchor : shift;
        propsRef.current.updateNextViewRangeTime({ reframe: { anchor, shift } });
      },
      onDragMove: ({ value }: DraggingUpdate) => {
        const { current, reframe } = propsRef.current.viewRangeTime;
        const [viewStart, viewEnd] = current;
        const shift = mapFromViewSubRange(viewStart, viewEnd, value);
        const anchor = reframe ? reframe.anchor : shift;
        propsRef.current.updateNextViewRangeTime({ reframe: { anchor, shift } });
      },
      onDragEnd: ({ manager, value }: DraggingUpdate) => {
        const { current, reframe } = propsRef.current.viewRangeTime;
        const [viewStart, viewEnd] = current;
        const shift = mapFromViewSubRange(viewStart, viewEnd, value);
        const anchor = reframe ? reframe.anchor : shift;
        const [start, end] = shift < anchor ? [shift, anchor] : [anchor, shift];
        manager.resetBounds();
        propsRef.current.updateViewRangeTime(start, end, 'timeline-header');
      },
    });
  }

  // Reset bounds when boundsInvalidator changes (replaces
  // UNSAFE_componentWillReceiveProps). This effect runs after the first
  // render too, but on the first render the manager has no cached bounds, so
  // resetBounds() is a no-op. Subsequent renders where boundsInvalidator
  // changes invalidate the cached bounds.
  useEffect(() => {
    draggerReframeRef.current?.resetBounds();
  }, [boundsInvalidator]);

  // Equivalent to componentWillUnmount: dispose of the DraggableManager when
  // the component unmounts. useLayoutEffect with [] deps guarantees the
  // cleanup runs once on unmount, matching the class semantic exactly.
  useLayoutEffect(() => {
    const draggerReframe = draggerReframeRef.current;
    return () => {
      draggerReframe?.dispose();
    };
  }, []);

  const draggerReframe = draggerReframeRef.current;

  const { current, cursor, reframe, shiftEnd, shiftStart } = viewRangeTime;
  const [viewStart, viewEnd] = current;
  const haveNextTimeRange = reframe != null || shiftEnd != null || shiftStart != null;
  let cusrorPosition: string | TNil;
  if (!haveNextTimeRange && cursor != null && cursor >= viewStart && cursor <= viewEnd) {
    cusrorPosition = `${mapToViewSubRange(viewStart, viewEnd, cursor) * 100}%`;
  }
  const styles = getStyles();
  return (
    <div
      aria-hidden
      className={styles.TimelineViewingLayer}
      ref={rootRef}
      onMouseDown={draggerReframe.handleMouseDown}
      onMouseLeave={draggerReframe.handleMouseLeave}
      onMouseMove={draggerReframe.handleMouseMove}
      data-testid="TimelineViewingLayer"
    >
      {cusrorPosition != null && (
        // Dynamic per-render cursor-guide position from pointer location; cannot be statically classed.
        <div
          className={styles.TimelineViewingLayerCursorGuide}
          style={{ left: cusrorPosition }}
          data-testid="TimelineViewingLayer--cursorGuide"
        />
      )}
      {reframe != null && getMarkers(viewStart, viewEnd, reframe.anchor, reframe.shift, false)}
      {shiftEnd != null && getMarkers(viewStart, viewEnd, viewEnd, shiftEnd, true)}
      {shiftStart != null && getMarkers(viewStart, viewEnd, viewStart, shiftStart, true)}
    </div>
  );
}
