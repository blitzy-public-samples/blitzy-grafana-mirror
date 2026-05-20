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

import { useCallback, useEffect, useMemo, useRef } from 'react';

import type TNil from '../../../types/TNil';
import DraggableManager from '../DraggableManager';
import { type DraggableBounds, type DraggingUpdate } from '../types';

import './RegionDemo.css';

type TUpdate = {
  regionCursor?: number | null;
  regionDragging?: [number, number] | null;
};

type RegionDemoProps = {
  regionCursor: number | TNil;
  regionDragging: [number, number] | TNil;
  updateState: (update: TUpdate) => void;
};

export default function RegionDemo({ regionCursor, regionDragging, updateState }: RegionDemoProps) {
  const realmRef = useRef<HTMLDivElement | null>(null);

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

  const dragManager = useMemo(
    () =>
      new DraggableManager({
        getBounds: getDraggingBounds,
        onDragEnd: handleDragEnd,
        onDragMove: handleDragUpdate,
        onDragStart: handleDragUpdate,
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
      }),
    [getDraggingBounds, handleDragEnd, handleDragUpdate, handleMouseMove, handleMouseLeave]
  );

  useEffect(() => () => dragManager.dispose(), [dragManager]);

  let cursorElm;
  let regionElm;
  if (regionDragging) {
    const [a, b] = regionDragging;
    const [left, right] = a < b ? [a, 1 - b] : [b, 1 - a];
    regionElm = <div className="RegionDemo--region" style={{ left: `${left * 100}%`, right: `${right * 100}%` }} />;
  } else if (regionCursor) {
    cursorElm = <div className="RegionDemo--regionCursor" style={{ left: `${regionCursor * 100}%` }} />;
  }

  return (
    <div
      aria-hidden
      className="RegionDemo--realm"
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
