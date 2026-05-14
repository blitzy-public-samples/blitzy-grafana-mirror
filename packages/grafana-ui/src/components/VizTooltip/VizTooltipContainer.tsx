import { css, cx } from '@emotion/css';
import { useState, type HTMLAttributes, useMemo, useRef, useLayoutEffect } from 'react';
import * as React from 'react';
import { useWindowSize } from 'react-use';

import { type Dimensions2D, type GrafanaTheme2 } from '@grafana/data';

import { useStyles2 } from '../../themes/ThemeContext';
import { getTooltipContainerStyles } from '../../themes/mixins';

import { calculateTooltipPosition } from './utils';

/**
 * @public
 */
export interface VizTooltipContainerProps extends HTMLAttributes<HTMLDivElement> {
  position: { x: number; y: number };
  offset: { x: number; y: number };
  children?: React.ReactNode;
  allowPointerEvents?: boolean;
}

/**
 * @public
 */
export const VizTooltipContainer = ({
  position: { x: positionX, y: positionY },
  offset: { x: offsetX, y: offsetY },
  children,
  allowPointerEvents = false,
  className,
  ...otherProps
}: VizTooltipContainerProps) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipMeasurement, setTooltipMeasurement] = useState<Dimensions2D>({ width: 0, height: 0 });
  const { width, height } = useWindowSize();
  const [placement, setPlacement] = useState({
    x: positionX + offsetX,
    y: positionY + offsetY,
  });

  const resizeObserver = useMemo(
    () =>
      // TS has hard time playing games with @types/resize-observer-browser, hence the ignore
      // @ts-ignore
      new ResizeObserver((entries) => {
        for (let entry of entries) {
          const tW = Math.floor(entry.contentRect.width + 2 * 8); //  adding padding until Safari supports borderBoxSize
          const tH = Math.floor(entry.contentRect.height + 2 * 8);
          if (tooltipMeasurement.width !== tW || tooltipMeasurement.height !== tH) {
            setTooltipMeasurement({
              width: Math.min(tW, width),
              height: Math.min(tH, height),
            });
          }
        }
      }),
    [tooltipMeasurement, width, height]
  );

  useLayoutEffect(() => {
    if (tooltipRef.current) {
      resizeObserver.observe(tooltipRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [resizeObserver]);

  // Make sure tooltip does not overflow window
  useLayoutEffect(() => {
    if (tooltipRef && tooltipRef.current) {
      const { x, y } = calculateTooltipPosition(
        positionX,
        positionY,
        tooltipMeasurement.width,
        tooltipMeasurement.height,
        offsetX,
        offsetY,
        width,
        height
      );

      setPlacement({ x, y });
    }
  }, [width, height, positionX, offsetX, positionY, offsetY, tooltipMeasurement]);

  const styles = useStyles2(getStyles);

  return (
    <div
      ref={tooltipRef}
      // Dynamic transform required: tooltip placement is computed per-render from runtime
      // coordinates by calculateTooltipPosition and cannot be expressed via useStyles2
      // (Emotion generates static class names). Static positioning, transition, and the
      // pointer-events toggle are handled by the styles.wrapper / styles.pointerEvents*
      // classes composed in className below.
      style={{
        transform: `translate(${placement.x}px, ${placement.y}px)`,
      }}
      aria-live="polite"
      aria-atomic="true"
      {...otherProps}
      className={cx(
        styles.wrapper,
        // disabling pointer-events is to prevent the tooltip from flickering when moving left to right
        // see e.g. https://github.com/grafana/grafana/pull/33609
        allowPointerEvents ? styles.pointerEventsAuto : styles.pointerEventsNone,
        className
      )}
    >
      {children}
    </div>
  );
};

VizTooltipContainer.displayName = 'VizTooltipContainer';

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    ...getTooltipContainerStyles(theme),
    position: 'fixed',
    top: 0,
    left: 0,
    // The `transition` property must live inside `theme.transitions.handleMotion`
    // to satisfy `@grafana/no-unreduced-motion`. Using ('no-preference', 'reduce')
    // preserves the original behavior: the transition applies in both motion
    // preferences (matching the pre-migration inline style that ran unconditionally).
    [theme.transitions.handleMotion('no-preference', 'reduce')]: {
      transition: 'transform ease-out 0.1s',
    },
  }),
  pointerEventsAuto: css({
    pointerEvents: 'auto',
  }),
  pointerEventsNone: css({
    pointerEvents: 'none',
  }),
});
