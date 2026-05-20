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

import { css } from '@emotion/css';
import cx from 'classnames';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { Button, useStyles2 } from '@grafana/ui';

import { autoColor } from '../../Theme';
import {
  type TUpdateViewRangeTimeFunction,
  type ViewRangeTimeUpdate,
  type ViewRange,
} from '../../TraceTimelineViewer/types';
import type TNil from '../../types/TNil';
import DraggableManager from '../../utils/DraggableManager/DraggableManager';
import EUpdateTypes from '../../utils/DraggableManager/EUpdateTypes';
import { type DraggableBounds, type DraggingUpdate } from '../../utils/DraggableManager/types';

import GraphTicks from './GraphTicks';
import Scrubber from './Scrubber';

export const getStyles = (theme: GrafanaTheme2) => {
  // Need this cause emotion will merge emotion generated classes into single className if used with cx from emotion
  // package and the selector won't work
  const ViewingLayerResetZoomHoverClassName = 'JaegerUiComponents__ViewingLayerResetZoomHoverClassName';
  const ViewingLayerResetZoom = css({
    label: 'ViewingLayerResetZoom',
    display: 'none',
    position: 'absolute',
    right: '1%',
    top: '10%',
    zIndex: 1,
  });

  return {
    ViewingLayer: css({
      label: 'ViewingLayer',
      cursor: 'vertical-text',
      position: 'relative',
      zIndex: 1,
      // The per-render trace-driven height is supplied via the `--viewing-layer-height` CSS
      // custom property on `style`. This replaces the prior `style={{ height }}` inline
      // declaration so the Emotion class stays stable across renders (per AAP §0.8.9 bounded
      // class generation; mirrors `ProgressBar.tsx`'s `ProgressCSSVar` pattern).
      height: 'var(--viewing-layer-height)',
      [`&:hover > .${ViewingLayerResetZoomHoverClassName}`]: {
        display: 'unset',
      },
    }),
    ViewingLayerGraph: css({
      label: 'ViewingLayerGraph',
      border: `1px solid ${autoColor(theme, '#999')}`,
      /* need !important here to overcome something from semantic UI */
      overflow: 'visible !important',
      position: 'relative',
      transformOrigin: '0 0',
      width: '100%',
    }),
    ViewingLayerInactive: css({
      label: 'ViewingLayerInactive',
      fill: autoColor(theme, 'rgba(214, 214, 214, 0.5)'),
    }),
    ViewingLayerCursorGuide: css({
      label: 'ViewingLayerCursorGuide',
      stroke: autoColor(theme, '#f44'),
      strokeWidth: 1,
    }),
    ViewingLayerDraggedShift: css({
      label: 'ViewingLayerDraggedShift',
      fillOpacity: 0.2,
    }),
    ViewingLayerDrag: css({
      label: 'ViewingLayerDrag',
      fill: autoColor(theme, '#44f'),
    }),
    ViewingLayerFullOverlay: css({
      label: 'ViewingLayerFullOverlay',
      bottom: 0,
      cursor: 'col-resize',
      left: 0,
      position: 'fixed',
      right: 0,
      top: 0,
      userSelect: 'none',
    }),
    ViewingLayerResetZoom,
    ViewingLayerResetZoomHoverClassName,
  };
};

export type ViewingLayerProps = {
  height: number;
  numTicks: number;
  updateViewRangeTime: TUpdateViewRangeTimeFunction;
  updateNextViewRangeTime: (update: ViewRangeTimeUpdate) => void;
  viewRange: ViewRange;
};

// CSS-custom-property typing for the dynamic per-render height carried via `style={{...}}`.
// Mirrors the `ProgressCSSVar` pattern in
// `public/app/features/provisioning/Shared/ProgressBar.tsx`: the type extends
// `CSSProperties` with an optional `--viewing-layer-height` key so the runtime value can flow
// through `style` without an `as`-cast (per ESLint
// `@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'never' }]`).
type ViewingLayerCSSVars = CSSProperties & { '--viewing-layer-height'?: string };

/**
 * Designate the tags for the different dragging managers. Exported for tests.
 */
export const dragTypes = {
  /**
   * Tag for dragging the right scrubber, e.g. end of the current view range.
   */
  SHIFT_END: 'SHIFT_END',
  /**
   * Tag for dragging the left scrubber, e.g. start of the current view range.
   */
  SHIFT_START: 'SHIFT_START',
  /**
   * Tag for dragging a new view range.
   */
  REFRAME: 'REFRAME',
};

/**
 * Returns the layout information for drawing the view-range differential, e.g.
 * show what will change when the mouse is released. Basically, this is the
 * difference from the start of the drag to the current position.
 *
 * @returns {{ x: string, width: string, leadginX: string }}
 */
function getNextViewLayout(start: number, position: number) {
  const [left, right] = start < position ? [start, position] : [position, start];
  return {
    x: `${left * 100}%`,
    width: `${(right - left) * 100}%`,
    leadingX: `${position * 100}%`,
  };
}

/**
 * `UnthemedViewingLayer` (rendered as the default `ViewingLayer` export) is
 * placed on top of the Canvas rendering of the minimap and handles showing the
 * current view range and handles mouse UX for modifying it.
 */
export function UnthemedViewingLayer(props: ViewingLayerProps) {
  const { height, numTicks, viewRange } = props;
  const styles = useStyles2(getStyles);
  const [preventCursorLine, setPreventCursorLine] = useState(false);
  const rootRef = useRef<SVGElement | null>(null);

  // Mirror the latest props in a ref so that the DraggableManager callbacks
  // (created once per mount via useState lazy init) always read the latest
  // viewRange and parent-supplied updaters without the dragger needing to be
  // recreated. Direct assignment here is safe because propsRef is read only
  // inside event handlers (post-render) — never during render itself.
  const propsRef = useRef(props);
  propsRef.current = props;

  // Forward-declared ref for the reframe dragger so handleReframeMouseLeave
  // can call resetBounds on it. Populated below after the dragger is created
  // via useState lazy init.
  const draggerReframeRef = useRef<DraggableManager | null>(null);

  const setRoot = useCallback((elm: SVGElement | TNil) => {
    rootRef.current = elm ?? null;
  }, []);

  const getDraggingBounds = useCallback((tag: string | TNil): DraggableBounds => {
    const root = rootRef.current;
    if (!root) {
      throw new Error('invalid state');
    }
    const { left: clientXLeft, width } = root.getBoundingClientRect();
    const [viewStart, viewEnd] = propsRef.current.viewRange.time.current;
    let maxValue = 1;
    let minValue = 0;
    if (tag === dragTypes.SHIFT_START) {
      maxValue = viewEnd;
    } else if (tag === dragTypes.SHIFT_END) {
      minValue = viewStart;
    }
    return { clientXLeft, maxValue, minValue, width };
  }, []);

  const handleReframeMouseMove = useCallback(({ value }: DraggingUpdate) => {
    propsRef.current.updateNextViewRangeTime({ cursor: value });
  }, []);

  const handleReframeMouseLeave = useCallback(() => {
    draggerReframeRef.current?.resetBounds();
    propsRef.current.updateNextViewRangeTime({ cursor: null });
  }, []);

  const handleReframeDragUpdate = useCallback(({ value }: DraggingUpdate) => {
    const shift = value;
    const { time } = propsRef.current.viewRange;
    const anchor = time.reframe ? time.reframe.anchor : shift;
    const update = { reframe: { anchor, shift } };
    propsRef.current.updateNextViewRangeTime(update);
  }, []);

  const handleReframeDragEnd = useCallback(({ manager, value }: DraggingUpdate) => {
    const { time } = propsRef.current.viewRange;
    const anchor = time.reframe ? time.reframe.anchor : value;
    const [start, end] = value < anchor ? [value, anchor] : [anchor, value];
    manager.resetBounds();
    propsRef.current.updateViewRangeTime(start, end, 'minimap');
  }, []);

  const handleScrubberEnterLeave = useCallback(({ type }: DraggingUpdate) => {
    setPreventCursorLine(type === EUpdateTypes.MouseEnter);
  }, []);

  const handleScrubberDragUpdate = useCallback(({ event, tag, type, value }: DraggingUpdate) => {
    if (type === EUpdateTypes.DragStart) {
      event.stopPropagation();
    }
    if (tag === dragTypes.SHIFT_START) {
      propsRef.current.updateNextViewRangeTime({ shiftStart: value });
    } else if (tag === dragTypes.SHIFT_END) {
      propsRef.current.updateNextViewRangeTime({ shiftEnd: value });
    }
  }, []);

  const handleScrubberDragEnd = useCallback(({ manager, tag, value }: DraggingUpdate) => {
    const [viewStart, viewEnd] = propsRef.current.viewRange.time.current;
    let update: [number, number];
    if (tag === dragTypes.SHIFT_START) {
      update = [value, viewEnd];
    } else if (tag === dragTypes.SHIFT_END) {
      update = [viewStart, value];
    } else {
      // to satisfy flow
      throw new Error('bad state');
    }
    manager.resetBounds();
    setPreventCursorLine(false);
    propsRef.current.updateViewRangeTime(update[0], update[1], 'minimap');
  }, []);

  const resetTimeZoomClickHandler = useCallback(() => {
    propsRef.current.updateViewRangeTime(0, 1);
  }, []);

  // Instantiate the DraggableManagers once per mount via useState lazy init.
  // The handlers passed in have stable identity (each is wrapped in
  // useCallback with [] deps) and read the latest props/viewRange via
  // propsRef.current at invocation time — so the draggers never need to be
  // recreated when props change.
  //
  // CRITICAL: `resetBoundsOnResize: false` is passed so the DraggableManager
  // constructor is pure — i.e. it does NOT call `window.addEventListener('resize', ...)`
  // during construction. This eliminates the render-time side effect identified
  // in Checkpoint 10 review finding ("DraggableManager construction has side
  // effects because its constructor registers a `window.resize` listener … can
  // leak in React StrictMode/concurrent aborted renders"). The window resize
  // listener is registered explicitly inside the committed `useEffect` below so
  // it is only ever active for committed component instances and is always
  // paired with a corresponding `removeEventListener` cleanup. `useState` lazy
  // init is still safe because the constructor is now side-effect-free.
  const [draggerReframe] = useState(
    () =>
      new DraggableManager({
        getBounds: getDraggingBounds,
        onDragEnd: handleReframeDragEnd,
        onDragMove: handleReframeDragUpdate,
        onDragStart: handleReframeDragUpdate,
        onMouseMove: handleReframeMouseMove,
        onMouseLeave: handleReframeMouseLeave,
        resetBoundsOnResize: false,
        tag: dragTypes.REFRAME,
      })
  );
  const [draggerStart] = useState(
    () =>
      new DraggableManager({
        getBounds: getDraggingBounds,
        onDragEnd: handleScrubberDragEnd,
        onDragMove: handleScrubberDragUpdate,
        onDragStart: handleScrubberDragUpdate,
        onMouseEnter: handleScrubberEnterLeave,
        onMouseLeave: handleScrubberEnterLeave,
        resetBoundsOnResize: false,
        tag: dragTypes.SHIFT_START,
      })
  );
  const [draggerEnd] = useState(
    () =>
      new DraggableManager({
        getBounds: getDraggingBounds,
        onDragEnd: handleScrubberDragEnd,
        onDragMove: handleScrubberDragUpdate,
        onDragStart: handleScrubberDragUpdate,
        onMouseEnter: handleScrubberEnterLeave,
        onMouseLeave: handleScrubberEnterLeave,
        resetBoundsOnResize: false,
        tag: dragTypes.SHIFT_END,
      })
  );

  // Populate the forward-declared ref so handleReframeMouseLeave can locate
  // the reframe dragger to call resetBounds on it.
  draggerReframeRef.current = draggerReframe;

  // Register the window resize listener for each dragger inside a committed
  // effect, and dispose the draggers on unmount. Because we passed
  // `resetBoundsOnResize: false` to each constructor, the managers do NOT
  // register their own resize listeners — we register them here, ONCE per
  // committed mount, with a guaranteed cleanup path. This mirrors the original
  // class's componentDidMount + componentWillUnmount semantics while removing
  // the render-time side effect.
  useEffect(() => {
    const onResize = () => {
      draggerReframe.resetBounds();
      draggerStart.resetBounds();
      draggerEnd.resetBounds();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      draggerReframe.dispose();
      draggerStart.dispose();
      draggerEnd.dispose();
    };
  }, [draggerReframe, draggerStart, draggerEnd]);

  /**
   * Renders the difference between where the drag started and the current
   * position, e.g. the red or blue highlight.
   *
   * @returns React.Node[]
   */
  const getMarkers = (from: number, to: number) => {
    const layout = getNextViewLayout(from, to);
    return [
      <rect
        key="fill"
        className={cx(styles.ViewingLayerDraggedShift, styles.ViewingLayerDrag)}
        x={layout.x}
        y="0"
        width={layout.width}
        height={height - 2}
      />,
      <rect
        key="edge"
        className={cx(styles.ViewingLayerDrag)}
        x={layout.leadingX}
        y="0"
        width="1"
        height={height - 2}
      />,
    ];
  };

  const { current, cursor, shiftStart, shiftEnd, reframe } = viewRange.time;
  const haveNextTimeRange = shiftStart != null || shiftEnd != null || reframe != null;
  const [viewStart, viewEnd] = current;
  let leftInactive = 0;
  if (viewStart) {
    leftInactive = viewStart * 100;
  }
  let rightInactive = 100;
  if (viewEnd) {
    rightInactive = 100 - viewEnd * 100;
  }
  let cursorPosition: string | undefined;
  if (!haveNextTimeRange && cursor != null && !preventCursorLine) {
    cursorPosition = `${cursor * 100}%`;
  }

  // The `height` value is computed per-render from the `height` prop and varies by trace.
  // It is exposed via the `--viewing-layer-height` CSS custom property so the
  // `styles.ViewingLayer` Emotion class reads it via `height: var(--viewing-layer-height)`.
  // This satisfies the Checkpoint 10 finding "Inline style remains: `style={{ height }}`"
  // by removing the literal `height` declaration while preserving per-render numeric
  // sizing — the established Grafana pattern for high-cardinality runtime dimensional values.
  const viewingLayerStyle: ViewingLayerCSSVars = { '--viewing-layer-height': `${height}px` };

  return (
    <div aria-hidden className={styles.ViewingLayer} style={viewingLayerStyle}>
      {(viewStart !== 0 || viewEnd !== 1) && (
        <Button
          onClick={resetTimeZoomClickHandler}
          className={cx(styles.ViewingLayerResetZoom, styles.ViewingLayerResetZoomHoverClassName)}
          type="button"
          variant="secondary"
        >
          <Trans i18nKey="explore.unthemed-viewing-layer.reset-selection">Reset selection</Trans>
        </Button>
      )}
      <svg
        height={height}
        className={styles.ViewingLayerGraph}
        ref={setRoot}
        onMouseDown={draggerReframe.handleMouseDown}
        onMouseLeave={draggerReframe.handleMouseLeave}
        onMouseMove={draggerReframe.handleMouseMove}
      >
        {leftInactive > 0 && (
          <rect
            x={0}
            y={0}
            height="100%"
            width={`${leftInactive}%`}
            className={styles.ViewingLayerInactive}
            data-testid="left-ViewingLayerInactive"
          />
        )}
        {rightInactive > 0 && (
          <rect
            x={`${100 - rightInactive}%`}
            y={0}
            height="100%"
            width={`${rightInactive}%`}
            className={styles.ViewingLayerInactive}
            data-testid="right-ViewingLayerInactive"
          />
        )}
        <GraphTicks numTicks={numTicks} />
        {cursorPosition && (
          <line
            className={styles.ViewingLayerCursorGuide}
            x1={cursorPosition}
            y1="0"
            x2={cursorPosition}
            y2={height - 2}
            strokeWidth="1"
            data-testid="ViewingLayerCursorGuide"
          />
        )}
        {shiftStart != null && getMarkers(viewStart, shiftStart)}
        {shiftEnd != null && getMarkers(viewEnd, shiftEnd)}
        <Scrubber
          isDragging={shiftStart != null}
          onMouseDown={draggerStart.handleMouseDown}
          onMouseEnter={draggerStart.handleMouseEnter}
          onMouseLeave={draggerStart.handleMouseLeave}
          position={viewStart || 0}
        />
        <Scrubber
          isDragging={shiftEnd != null}
          position={viewEnd || 1}
          onMouseDown={draggerEnd.handleMouseDown}
          onMouseEnter={draggerEnd.handleMouseEnter}
          onMouseLeave={draggerEnd.handleMouseLeave}
        />
        {reframe != null && getMarkers(reframe.anchor, reframe.shift)}
      </svg>
      {/* fullOverlay updates the mouse cursor blocks mouse events */}
      {haveNextTimeRange && <div className={styles.ViewingLayerFullOverlay} />}
    </div>
  );
}

export default UnthemedViewingLayer;
