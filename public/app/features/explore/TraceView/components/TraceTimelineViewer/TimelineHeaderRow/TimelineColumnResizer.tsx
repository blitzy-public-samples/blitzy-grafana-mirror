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
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import type TNil from '../../types/TNil';
import DraggableManager from '../../utils/DraggableManager/DraggableManager';
import { type DraggableBounds, type DraggingUpdate } from '../../utils/DraggableManager/types';

export const getStyles = () => ({
  TimelineColumnResizer: css({
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  }),
  wrapper: css({
    bottom: 0,
    position: 'absolute',
    top: 0,
  }),
  dragger: css({
    borderLeft: '2px solid transparent',
    cursor: 'col-resize',
    height: '5000px',
    marginLeft: '-1px',
    position: 'absolute',
    top: 0,
    width: '1px',
    zIndex: 10,
    '&:hover': {
      borderLeft: '2px solid rgba(0, 0, 0, 0.3)',
    },
    '&::before': {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '-8px',
      right: 0,
      content: '" "',
    },
  }),
  draggerDragging: css({
    background: 'rgba(136, 0, 136, 0.05)',
    width: 'unset',
    '&::before': {
      left: -2000,
      right: -2000,
    },
  }),
  draggerDraggingLeft: css({
    borderLeft: '2px solid #808',
    borderRight: '1px solid #999',
  }),
  draggerDraggingRight: css({
    borderLeft: '1px solid #999',
    borderRight: '2px solid #808',
  }),
  gripIcon: css({
    position: 'absolute',
    top: 0,
    bottom: 0,
    '&::before, &::after': {
      borderRight: '1px solid #ccc',
      content: '" "',
      height: '9px',
      position: 'absolute',
      right: '9px',
      top: '25px',
    },
    '&::after': {
      right: '5px',
    },
  }),
  gripIconDragging: css({
    '&::before, &::after': {
      borderRight: '1px solid rgba(136, 0, 136, 0.5)',
    },
  }),
});

export type TimelineColumnResizerProps = {
  min: number;
  max: number;
  onChange: (newSize: number) => void;
  position: number;
  columnResizeHandleHeight: number;
};

export default function TimelineColumnResizer(props: TimelineColumnResizerProps) {
  const { position, columnResizeHandleHeight } = props;

  const [dragPosition, setDragPosition] = useState<number | TNil>(null);

  // Root element ref for measuring bounds during drag
  const rootElmRef = useRef<HTMLDivElement | null>(null);

  // Mirror of latest props for DraggableManager callbacks (which need to read
  // current min/max/onChange at call time, matching class-instance method
  // semantics — class methods always read the latest `this.props`).
  const propsRef = useRef(props);
  propsRef.current = props;

  // DraggableManager instance — created once, lazily, on first render so it
  // is available when render computes `dragManager.isDragging()`.
  //
  // CRITICAL: `resetBoundsOnResize: false` is passed so the DraggableManager
  // constructor is pure — i.e. it does NOT call `window.addEventListener('resize', ...)`
  // during construction. This eliminates the render-time side effect identified
  // in Checkpoint 10 review finding ("`DraggableManager` is constructed during
  // render via `if (draggerRef.current === null)` … performs a side effect during
  // render and can leak if a render is discarded before the cleanup effect runs").
  // With the constructor pure, the ref-null guard pattern is safe even in
  // StrictMode/aborted concurrent renders. The window resize listener is
  // registered explicitly inside the committed `useLayoutEffect` below so it
  // is only ever active for committed component instances and is always paired
  // with a corresponding `removeEventListener` cleanup.
  const dragManagerRef = useRef<DraggableManager | null>(null);
  if (dragManagerRef.current === null) {
    dragManagerRef.current = new DraggableManager({
      getBounds: (): DraggableBounds => {
        const rootElm = rootElmRef.current;
        if (!rootElm) {
          throw new Error('invalid state');
        }
        const { left: clientXLeft, width } = rootElm.getBoundingClientRect();
        const { min, max } = propsRef.current;
        return {
          clientXLeft,
          width,
          maxValue: max,
          minValue: min,
        };
      },
      onDragStart: ({ value }: DraggingUpdate) => {
        setDragPosition(value);
      },
      onDragMove: ({ value }: DraggingUpdate) => {
        setDragPosition(value);
      },
      onDragEnd: ({ manager, value }: DraggingUpdate) => {
        manager.resetBounds();
        setDragPosition(null);
        propsRef.current.onChange(value);
      },
      resetBoundsOnResize: false,
    });
  }

  // Register the window resize listener inside a committed effect and dispose
  // the DraggableManager on unmount. Because we passed `resetBoundsOnResize:
  // false` to the constructor, the manager does NOT register its own resize
  // listener — we register it here, ONCE per committed mount, with a
  // guaranteed cleanup path. This mirrors the original class's componentDidMount
  // + componentWillUnmount semantics while removing the render-time side effect.
  useLayoutEffect(() => {
    const dragManager = dragManagerRef.current;
    const onResize = () => {
      dragManager?.resetBounds();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      dragManager?.dispose();
    };
  }, []);

  const dragManager = dragManagerRef.current;

  let left;
  let draggerStyle: CSSProperties;
  left = `${position * 100}%`;
  const gripStyle = { left };
  let isDraggingLeft = false;
  let isDraggingRight = false;
  const styles = getStyles();

  if (dragManager.isDragging() && rootElmRef.current && dragPosition != null) {
    isDraggingLeft = dragPosition < position;
    isDraggingRight = dragPosition > position;
    // Draw a highlight from the current dragged position back to the original
    // position, e.g. highlight the change. Draw the highlight via `left` and
    // `right` css styles (simpler than using `width`).
    const draggerLeft = `${Math.min(position, dragPosition) * 100}%`;
    // subtract 1px for draggerRight to deal with the right border being off
    // by 1px when dragging left
    const draggerRight = `calc(${(1 - Math.max(position, dragPosition)) * 100}% - 1px)`;
    draggerStyle = { left: draggerLeft, right: draggerRight };
  } else {
    draggerStyle = gripStyle;
  }
  draggerStyle.height = columnResizeHandleHeight;

  const isDragging = isDraggingLeft || isDraggingRight;
  return (
    <div className={styles.TimelineColumnResizer} ref={rootElmRef} data-testid="TimelineColumnResizer">
      <div
        className={cx(styles.gripIcon, isDragging && styles.gripIconDragging)}
        style={gripStyle}
        data-testid="TimelineColumnResizer--gripIcon"
      />
      <div
        aria-hidden
        className={cx(
          styles.dragger,
          isDragging && styles.draggerDragging,
          isDraggingRight && styles.draggerDraggingRight,
          isDraggingLeft && styles.draggerDraggingLeft
        )}
        onMouseDown={dragManager.handleMouseDown}
        style={draggerStyle}
        data-testid="TimelineColumnResizer--dragger"
      />
    </div>
  );
}
