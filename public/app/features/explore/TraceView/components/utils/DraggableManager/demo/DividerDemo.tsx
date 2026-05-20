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
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

import DraggableManager from '../DraggableManager';
import { type DraggableBounds, type DraggingUpdate } from '../types';

type DividerDemoProps = {
  position: number;
  updateState: (update: { dividerPosition: number }) => void;
};

// CSS custom property intersection type replaces the previous inline `style={{}}` literal
// while preserving the dynamic divider horizontal position per AAP Dimension 3.
type DividerDemoCSSVars = CSSProperties & {
  '--divider-demo-divider-left'?: string;
};

export default function DividerDemo({ position, updateState }: DividerDemoProps) {
  const realmRef = useRef<HTMLDivElement | null>(null);
  const styles = useStyles2(getStyles);

  const getDraggingBounds = useCallback((): DraggableBounds => {
    if (!realmRef.current) {
      throw new Error('invalid state');
    }
    const { left: clientXLeft, width } = realmRef.current.getBoundingClientRect();
    return {
      clientXLeft,
      width,
      maxValue: 0.98,
      minValue: 0.02,
    };
  }, []);

  const handleDragEvent = useCallback(
    ({ value }: DraggingUpdate) => {
      updateState({ dividerPosition: value });
    },
    [updateState]
  );

  // CRITICAL: `resetBoundsOnResize: false` is passed so the DraggableManager constructor is
  // pure — it does NOT call `window.addEventListener('resize', ...)` from useMemo's lazy init.
  // The resize listener is registered inside a committed effect below, mirroring the safe
  // pattern adopted across the TraceView DraggableManager consumers per the AAP.
  const dragManager = useMemo(
    () =>
      new DraggableManager({
        getBounds: getDraggingBounds,
        onDragEnd: handleDragEvent,
        onDragMove: handleDragEvent,
        onDragStart: handleDragEvent,
        resetBoundsOnResize: false,
      }),
    [getDraggingBounds, handleDragEvent]
  );

  // Register the window resize listener inside a committed effect and dispose the
  // DraggableManager on unmount. This avoids the StrictMode/concurrent-rendering hazard
  // of registering global listeners during render-time construction.
  useEffect(() => {
    const onResize = () => {
      dragManager.resetBounds();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      dragManager.dispose();
    };
  }, [dragManager]);

  // Dynamic per-render divider horizontal position passed via CSS custom property.
  const dividerStyle: DividerDemoCSSVars = {
    '--divider-demo-divider-left': `${position * 100}%`,
  };

  return (
    <div className={styles.realm} ref={realmRef}>
      <div
        aria-hidden
        className={styles.divider}
        onMouseDown={dragManager.handleMouseDown}
        style={dividerStyle}
      />
    </div>
  );
}

// Theme-aware styles migrated from `./DividerDemo.css` per AAP Dimension 3 (legacy className → useStyles2).
// The original CSS is preserved value-for-value; the `divider`'s dynamic horizontal position is consumed
// via the `--divider-demo-divider-left` CSS custom property to retain Dimension 3's no-inline-style rule.
const getStyles = (_theme: GrafanaTheme2) => ({
  realm: css({
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  }),
  divider: css({
    background: '#888',
    borderBottom: 'none',
    borderTop: 'none',
    border: '1px solid #a9dccc',
    bottom: 0,
    cursor: 'col-resize',
    position: 'absolute',
    top: 0,
    width: '4px',
    left: 'var(--divider-demo-divider-left)',
    '&::before': {
      bottom: 0,
      content: "' '",
      left: '-2px',
      position: 'absolute',
      right: '-2px',
      top: 0,
    },
  }),
});
