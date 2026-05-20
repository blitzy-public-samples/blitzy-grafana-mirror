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

import type TNil from '../../../types/TNil';
import DraggableManager from '../DraggableManager';
import { type DraggableBounds, type DraggingUpdate } from '../types';

type TUpdate = {
  regionCursor?: number | null;
  regionDragging?: [number, number] | null;
};

type RegionDemoProps = {
  regionCursor: number | TNil;
  regionDragging: [number, number] | TNil;
  updateState: (update: TUpdate) => void;
};

// CSS custom property intersection types replace the previous inline `style={{}}` literals
// while preserving the dynamic region/cursor positioning per AAP Dimension 3.
type RegionDemoRegionCSSVars = CSSProperties & {
  '--region-demo-region-left'?: string;
  '--region-demo-region-right'?: string;
};

type RegionDemoCursorCSSVars = CSSProperties & {
  '--region-demo-region-cursor-left'?: string;
};

export default function RegionDemo({ regionCursor, regionDragging, updateState }: RegionDemoProps) {
  const realmRef = useRef<HTMLDivElement | null>(null);
  const styles = useStyles2(getStyles);

  // Mirror the latest `regionDragging` prop into a ref so the long-lived
  // `DraggableManager` callbacks (created once per mount via `useMemo`) can
  // always read the current value at call time, matching the class's
  // `this.props.regionDragging` semantics without invalidating the manager.
  const regionDraggingRef = useRef(regionDragging);
  regionDraggingRef.current = regionDragging;

  const getDraggingBounds = useCallback((): DraggableBounds => {
    if (!realmRef.current) {
      throw new Error('invalid state');
    }
    const { left: clientXLeft, width } = realmRef.current.getBoundingClientRect();
    return {
      clientXLeft,
      width,
      maxValue: 1,
      minValue: 0,
    };
  }, []);

  const handleMouseMove = useCallback(
    ({ value }: DraggingUpdate) => {
      updateState({ regionCursor: value });
    },
    [updateState]
  );

  const handleMouseLeave = useCallback(() => {
    updateState({ regionCursor: null });
  }, [updateState]);

  const handleDragUpdate = useCallback(
    ({ value }: DraggingUpdate) => {
      const prevRegionDragging = regionDraggingRef.current;
      let nextRegionDragging: [number, number];
      if (prevRegionDragging) {
        nextRegionDragging = [prevRegionDragging[0], value];
      } else {
        nextRegionDragging = [value, value];
      }
      updateState({ regionDragging: nextRegionDragging });
    },
    [updateState]
  );

  const handleDragEnd = useCallback(
    ({ value }: DraggingUpdate) => {
      updateState({ regionDragging: null, regionCursor: value });
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
        onDragEnd: handleDragEnd,
        onDragMove: handleDragUpdate,
        onDragStart: handleDragUpdate,
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
        resetBoundsOnResize: false,
      }),
    [getDraggingBounds, handleDragEnd, handleDragUpdate, handleMouseMove, handleMouseLeave]
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

  let cursorElm;
  let regionElm;
  if (regionDragging) {
    const [a, b] = regionDragging;
    const [left, right] = a < b ? [a, 1 - b] : [b, 1 - a];
    // Dynamic per-render region edges passed via CSS custom properties.
    const regionStyle: RegionDemoRegionCSSVars = {
      '--region-demo-region-left': `${left * 100}%`,
      '--region-demo-region-right': `${right * 100}%`,
    };
    regionElm = <div className={styles.region} style={regionStyle} />;
  } else if (regionCursor) {
    // Dynamic per-render cursor position passed via CSS custom property.
    const cursorStyle: RegionDemoCursorCSSVars = {
      '--region-demo-region-cursor-left': `${regionCursor * 100}%`,
    };
    cursorElm = <div className={styles.regionCursor} style={cursorStyle} />;
  }

  return (
    <div
      aria-hidden
      className={styles.realm}
      onMouseDown={dragManager.handleMouseDown}
      onMouseMove={dragManager.handleMouseMove}
      onMouseLeave={dragManager.handleMouseMove}
      ref={realmRef}
    >
      {regionElm}
      {cursorElm}
    </div>
  );
}

// Theme-aware styles migrated from `./RegionDemo.css` per AAP Dimension 3 (legacy className → useStyles2).
// The original CSS is preserved value-for-value; per-render region edges and cursor position are consumed
// via CSS custom properties to retain Dimension 3's no-inline-style rule.
const getStyles = (_theme: GrafanaTheme2) => ({
  realm: css({
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  }),
  regionCursor: css({
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '1px',
    background: 'red',
    left: 'var(--region-demo-region-cursor-left)',
  }),
  region: css({
    position: 'absolute',
    top: 0,
    bottom: 0,
    background: 'red',
    left: 'var(--region-demo-region-left)',
    right: 'var(--region-demo-region-right)',
  }),
});
