import { css } from '@emotion/css';
import { type MoveableManagerInterface, type Renderer } from 'moveable';

import { VerticalConstraint, HorizontalConstraint } from 'app/plugins/panel/canvas/panelcfg.gen';

import { type Scene } from './scene';
import { findElementByTarget } from './sceneElementManagement';

/*
 * Moveable library "able" render descriptors. These functions are invoked by the
 * Moveable library on every drag / resize / rotate / transform frame and they
 * receive the library's internal React renderer reference (the `React: Renderer`
 * parameter) — NOT the standard `react` import. As a result:
 *
 *   - `useStyles2` and other Grafana hooks cannot be used here (this is not a
 *     React function component, it's a static factory invoked by Moveable);
 *   - all visual styling that does NOT depend on per-frame runtime measurements
 *     is extracted to module-level Emotion classes below and applied via
 *     `className`, which Moveable's renderer forwards verbatim;
 *   - only the per-frame runtime measurements (positions derived from
 *     `moveable.getRect()`'s `width` / `height`) remain in the inline `style`
 *     prop, because materializing those into Emotion classes would generate a
 *     new class on every interaction frame (AAP §0.8.9 — animation/runtime-value
 *     exception).
 *
 * Per the four-dimension styling migration mandate (AAP §0.5.3), all colors,
 * borders, typography, and static layout properties have been migrated to
 * theme-agnostic module-level `css()` classes. Theme tokens are not available
 * here (no React component context), so the original literal values — chosen by
 * the Moveable integration to read correctly against Grafana's chrome — are
 * preserved verbatim inside the classes.
 */

const settingsButtonClass = css({
  position: 'absolute',
  top: '0px',
  color: 'white',
  fontSize: '18px',
  cursor: 'pointer',
  userSelect: 'none',
  willChange: 'transform',
  transform: 'translate(-50%, 0px)',
  zIndex: 100,
});

/*
 * Moveable-library visual indicator runs outside a React component (invoked by
 * Moveable's internal renderer), so `useStyles2` / theme tokens are unavailable.
 * The 2px radius is the Moveable-integration-defined dimension-label appearance
 * preserved verbatim from the pre-migration code per AAP §0.9.2.3 (visual output
 * pixel-equivalent). The single-line eslint-disable below justifies the literal.
 */
const dimensionLabelClass = css({
  position: 'absolute',
  background: '#4af',
  // eslint-disable-next-line @grafana/no-border-radius-literal -- see block comment above
  borderRadius: '2px',
  padding: '2px 4px',
  color: 'white',
  fontSize: '13px',
  whiteSpace: 'nowrap',
  fontWeight: 'bold',
  willChange: 'transform',
  transform: 'translate(-50%, 0px)',
  zIndex: 100,
});

const constraintVerticalLineClass = css({
  position: 'absolute',
  borderLeft: '1px dashed #4af',
});

const constraintHorizontalLineClass = css({
  position: 'absolute',
  borderTop: '1px dashed #4af',
});

export const settingsViewable = (scene: Scene) => ({
  name: 'settingsViewable',
  props: [],
  events: [],
  render(moveable: MoveableManagerInterface<unknown, unknown>, React: Renderer) {
    // If selection is more than 1 element don't display settings button
    if (scene.selecto?.getSelectedTargets() && scene.selecto?.getSelectedTargets().length > 1) {
      return;
    }

    const openSettings = (x: number, y: number) => {
      const container = moveable.getContainer();
      const evt = new PointerEvent('contextmenu', { clientX: x, clientY: y });
      container.dispatchEvent(evt);
    };

    const onClick = (event: React.MouseEvent) => {
      openSettings(event.clientX, event.clientY);
    };

    const onKeyPress = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        const rect = event.currentTarget.getBoundingClientRect();
        openSettings(rect.x, rect.y);
      }
    };

    const rect = moveable.getRect();
    return (
      // Static visual styling (color, font, cursor, transform origin, z-index) is
      // applied via `settingsButtonClass`; only the per-frame `left` position is
      // inline because it derives from `rect.width`, which changes during resize.
      <div
        key={'settings-viewable'}
        className={`moveable-settings ${settingsButtonClass}`}
        style={{ left: `${rect.width + 18}px` }}
        onClick={onClick}
        onKeyDown={onKeyPress}
        role="button"
        tabIndex={0}
      >
        {``}
        ⚙️
        {``}
      </div>
    );
  },
});

export const dimensionViewable = {
  name: 'dimensionViewable',
  props: [],
  events: [],
  render(moveable: MoveableManagerInterface<unknown, unknown>, React: Renderer) {
    const rect = moveable.getRect();
    return (
      // Static visual styling (background, padding, typography, border-radius,
      // transform origin, z-index) lives in `dimensionLabelClass`; only the
      // per-frame `left` / `top` positions depend on `rect.width` / `rect.height`
      // and remain inline.
      // eslint-disable-next-line @grafana/i18n/no-untranslated-strings
      <div
        key={'dimension-viewable'}
        className={`moveable-dimension ${dimensionLabelClass}`}
        style={{
          left: `${rect.width / 2}px`,
          top: `${rect.height + 20}px`,
        }}
      >
        {Math.round(rect.offsetWidth)} x {Math.round(rect.offsetHeight)}
      </div>
    );
  },
};

export const constraintViewable = (scene: Scene) => ({
  name: 'constraintViewable',
  props: [],
  events: [],
  render(moveable: MoveableManagerInterface<unknown, unknown>, React: Renderer) {
    // Each constraint visualization line gets its static dashed-border styling
    // from `constraintVerticalLineClass` / `constraintHorizontalLineClass`. The
    // dynamic per-frame positions (left, top, height, width, transform) derived
    // from `moveable.getRect()` remain inline because they update every frame.
    const rect = moveable.getRect();
    const targetElement = findElementByTarget(moveable.state.target!, scene.root.elements);

    // If selection is more than 1 element don't display constraint visualizations
    if (scene.selecto?.getSelectedTargets() && scene.selecto?.getSelectedTargets().length > 1) {
      return;
    }

    let verticalConstraintVisualization = null;
    let horizontalConstraintVisualization = null;

    const constraint = targetElement?.tempConstraint ?? targetElement?.options.constraint ?? {};

    const centerIndicatorLineOne = React.createElement('div', {
      className: constraintVerticalLineClass,
      style: {
        left: `${rect.width / 2}px`,
        top: `${rect.height / 2 - rect.height / 16}px`,
        height: `${rect.height / 8}px`,
        transform: 'rotate(45deg)',
      },
    });

    const centerIndicatorLineTwo = React.createElement('div', {
      className: constraintVerticalLineClass,
      style: {
        left: `${rect.width / 2}px`,
        top: `${rect.height / 2 - rect.height / 16}px`,
        height: `${rect.height / 8}px`,
        transform: 'rotate(-45deg)',
      },
    });

    const centerIndicator = React.createElement('div', {}, [centerIndicatorLineOne, centerIndicatorLineTwo]);

    const verticalConstraintTop = React.createElement('div', {
      className: constraintVerticalLineClass,
      style: {
        left: `${rect.width / 2}px`,
        bottom: '0px',
        height: '100vh',
      },
    });

    const verticalConstraintBottom = React.createElement('div', {
      className: constraintVerticalLineClass,
      style: {
        left: `${rect.width / 2}px`,
        top: `${rect.height}px`,
        height: '100vh',
      },
    });

    const verticalConstraintTopBottom = React.createElement('div', {}, [
      verticalConstraintTop,
      verticalConstraintBottom,
    ]);

    const verticalConstraintCenterLine = React.createElement('div', {
      className: constraintVerticalLineClass,
      style: {
        left: `${rect.width / 2}px`,
        top: `${rect.height / 4}px`,
        height: `${rect.height / 2}px`,
      },
    });

    const verticalConstraintCenter = React.createElement('div', {}, [verticalConstraintCenterLine, centerIndicator]);

    switch (constraint.vertical) {
      case VerticalConstraint.Top:
        verticalConstraintVisualization = verticalConstraintTop;
        break;
      case VerticalConstraint.Bottom:
        verticalConstraintVisualization = verticalConstraintBottom;
        break;
      case VerticalConstraint.TopBottom:
        verticalConstraintVisualization = verticalConstraintTopBottom;
        break;
      case VerticalConstraint.Center:
        verticalConstraintVisualization = verticalConstraintCenter;
        break;
    }

    const horizontalConstraintLeft = React.createElement('div', {
      className: constraintHorizontalLineClass,
      style: {
        right: '0px',
        top: `${rect.height / 2}px`,
        width: '100vw',
      },
    });

    const horizontalConstraintRight = React.createElement('div', {
      className: constraintHorizontalLineClass,
      style: {
        left: `${rect.width}px`,
        top: `${rect.height / 2}px`,
        width: '100vw',
      },
    });

    const horizontalConstraintLeftRight = React.createElement('div', {}, [
      horizontalConstraintLeft,
      horizontalConstraintRight,
    ]);

    const horizontalConstraintCenterLine = React.createElement('div', {
      className: constraintHorizontalLineClass,
      style: {
        left: `${rect.width / 4}px`,
        top: `${rect.height / 2}px`,
        width: `${rect.width / 2}px`,
      },
    });

    const horizontalConstraintCenter = React.createElement('div', {}, [
      horizontalConstraintCenterLine,
      centerIndicator,
    ]);

    switch (constraint.horizontal) {
      case HorizontalConstraint.Left:
        horizontalConstraintVisualization = horizontalConstraintLeft;
        break;
      case HorizontalConstraint.Right:
        horizontalConstraintVisualization = horizontalConstraintRight;
        break;
      case HorizontalConstraint.LeftRight:
        horizontalConstraintVisualization = horizontalConstraintLeftRight;
        break;
      case HorizontalConstraint.Center:
        horizontalConstraintVisualization = horizontalConstraintCenter;
        break;
    }

    const constraintVisualization = React.createElement('div', {}, [
      verticalConstraintVisualization,
      horizontalConstraintVisualization,
    ]);

    return constraintVisualization;
  },
});
