import { css } from '@emotion/css';
import * as React from 'react';

interface MarkerProps {
  /** x position relative to plotting area bounding box*/
  x: number;
  /** y position relative to plotting area bounding box*/
  y: number;
}

const markerStyle = css({
  position: 'absolute',
});

// An abstraction over a component rendered within a chart canvas.
// Marker is rendered with DOM coords of the chart bounding box.
export const Marker = ({ x, y, children }: React.PropsWithChildren<MarkerProps>) => {
  return (
    <div
      className={markerStyle}
      // Design system gap: inline style required by uPlot overlay positioning at runtime-computed coordinates
      style={{
        top: `${y}px`,
        left: `${x}px`,
      }}
    >
      {children}
    </div>
  );
};
