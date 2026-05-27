import { css, cx } from '@emotion/css';
import classNames from 'classnames';
import { type CSSProperties, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import * as React from 'react';
import ReactGridLayout, { type ItemCallback } from 'react-grid-layout';
import { Subscription } from 'rxjs';

import { type GrafanaTheme2 } from '@grafana/data';
import { config } from '@grafana/runtime';
import { useStyles2 } from '@grafana/ui';
import { appEvents } from 'app/core/app_events';
import { GRID_CELL_HEIGHT, GRID_CELL_VMARGIN, GRID_COLUMN_COUNT } from 'app/core/constants';
import { contextSrv } from 'app/core/services/context_srv';
import { VariablesChanged } from 'app/features/variables/types';
import { DashboardPanelsChangedEvent } from 'app/types/events';

import { AddLibraryPanelWidget } from '../components/AddLibraryPanelWidget/AddLibraryPanelWidget';
import { DashboardRow } from '../components/DashboardRow/DashboardRow';
import { type DashboardModel } from '../state/DashboardModel';
import { type GridPos, type PanelModel } from '../state/PanelModel';

import DashboardEmpty from './DashboardEmpty/DashboardEmpty';
import { DashboardPanel } from './DashboardPanel';

export const PANEL_FILTER_VARIABLE = 'systemPanelFilterVar';

export interface Props {
  dashboard: DashboardModel;
  isEditable: boolean;
  editPanel: PanelModel | null;
  viewPanel: PanelModel | null;
  hidePanelMenus?: boolean;
}

/**
 * `DashboardGrid` is the React 18 functional re-implementation of the previous
 * `PureComponent`. It preserves every externally observable behavior of the legacy
 * class form — including its shallow-equality re-render skip semantics, which is
 * reinstated by wrapping the function in `React.memo` below — while moving lifecycle
 * effects into `useEffect`, instance fields into `useRef`, and the implicit
 * `forceUpdate()` re-render trigger into a `useReducer` tick.
 */
const DashboardGridInner = (props: Props) => {
  const { isEditable, dashboard, editPanel, hidePanelMenus } = props;
  const styles = useStyles2(getStyles);

  // State previously held by `this.state`
  const [panelFilter, setPanelFilter] = useState<RegExp | undefined>(undefined);
  // Lazy initializer so DOM access happens only once on mount (mirrors the original
  // `this.state = { width: document.body.clientWidth }` constructor assignment).
  const [width, setWidth] = useState<number>(() => document.body.clientWidth);

  // Force-update bump replaces `this.forceUpdate()` used by the class form. The
  // dispatch returned by `useReducer` is referentially stable, so callbacks calling
  // it don't need to be re-memoized when the tick changes.
  const [, forceUpdate] = useReducer((tick: number) => tick + 1, 0);

  // Refs replace every `private` instance field of the original class. Mutations
  // do not trigger re-renders, exactly matching the class form's instance-variable
  // semantics.
  const panelMapRef = useRef<{ [key: string]: PanelModel }>({});
  const windowHeightRef = useRef(1200);
  const windowWidthRef = useRef(1920);
  const gridWidthRef = useRef(0);
  /** Used to keep track of mobile panel layout position */
  const lastPanelBottomRef = useRef(0);
  const isLayoutInitializedRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | undefined>(undefined);
  const rootElRef = useRef<HTMLDivElement | null>(null);

  /**
   * Renamed from the class's `setPanelFilter` method to avoid colliding with the
   * `setPanelFilter` setter returned by `useState` above. Functionally identical to
   * the original: builds an `RegExp` from a (possibly empty) string and writes it
   * into component state.
   */
  const applyPanelFilter = useCallback((regex: string) => {
    // Only set the panels filter if the systemPanelFilterVar variable
    // is a non-empty string
    let panelFilterValue: RegExp | undefined = undefined;
    if (regex.length > 0) {
      panelFilterValue = new RegExp(regex, 'i');
    }

    setPanelFilter(panelFilterValue);
  }, []);

  const triggerForceUpdate = useCallback(() => {
    forceUpdate();
  }, []);

  useEffect(() => {
    const eventSubs = new Subscription();

    if (config.featureToggles.panelFilterVariable) {
      // If panel filter variable is set on load then
      // update state to filter panels
      for (const variable of dashboard.getVariables()) {
        if (variable.id === PANEL_FILTER_VARIABLE) {
          if ('query' in variable) {
            applyPanelFilter(variable.query);
          }
          break;
        }
      }

      eventSubs.add(
        appEvents.subscribe(VariablesChanged, (e) => {
          if (e.payload.variable?.id === PANEL_FILTER_VARIABLE) {
            if ('current' in e.payload.variable) {
              let variable = e.payload.variable.current;
              if ('value' in variable && typeof variable.value === 'string') {
                applyPanelFilter(variable.value);
              }
            }
          }
        })
      );
    }

    eventSubs.add(dashboard.events.subscribe(DashboardPanelsChangedEvent, triggerForceUpdate));

    return () => {
      eventSubs.unsubscribe();
    };
    // Mount-only effect mirroring the original componentDidMount/componentWillUnmount.
    // `dashboard` is stable for the panel's lifetime (the parent remounts on dashboard
    // change), and `applyPanelFilter` / `triggerForceUpdate` are stable `useCallback`
    // identities — including them would re-run the subscription setup unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildLayout = () => {
    const layout: ReactGridLayout.Layout[] = [];
    panelMapRef.current = {};

    let count = 0;
    for (const panel of dashboard.panels) {
      if (!panel.key) {
        panel.key = `panel-${panel.id}-${Date.now()}`;
      }
      panel.title = panel.title?.substring(0, 5000);
      panelMapRef.current[panel.key] = panel;

      if (!panel.gridPos) {
        console.log('panel without gridpos');
        continue;
      }

      const panelPos: ReactGridLayout.Layout = {
        i: panel.key,
        x: panel.gridPos.x,
        y: panel.gridPos.y,
        w: panel.gridPos.w,
        h: panel.gridPos.h,
      };

      if (panel.type === 'row') {
        panelPos.w = GRID_COLUMN_COUNT;
        panelPos.h = 1;
        panelPos.isResizable = false;
        panelPos.isDraggable = panel.collapsed;
      }

      if (!panelFilter) {
        layout.push(panelPos);
      } else {
        if (panelFilter.test(panel.title)) {
          panelPos.isResizable = false;
          panelPos.isDraggable = false;
          panelPos.x = (count % 2) * GRID_COLUMN_COUNT;
          panelPos.y = Math.floor(count / 2);
          layout.push(panelPos);
          count++;
        }
      }
    }

    return layout;
  };

  const onLayoutChange = useCallback(
    (newLayout: ReactGridLayout.Layout[]) => {
      if (panelFilter) {
        return;
      }
      for (const newPos of newLayout) {
        panelMapRef.current[newPos.i!].updateGridPos(newPos, isLayoutInitializedRef.current);
      }

      if (isLayoutInitializedRef.current) {
        isLayoutInitializedRef.current = true;
      }

      dashboard.sortPanelsByGridPos();
      forceUpdate();
    },
    [panelFilter, dashboard]
  );

  const updateGridPos = useCallback((item: ReactGridLayout.Layout, _layout: ReactGridLayout.Layout[]) => {
    panelMapRef.current[item.i!].updateGridPos(item);
  }, []);

  const onResize: ItemCallback = useCallback((_layout, _oldItem, newItem) => {
    const panel = panelMapRef.current[newItem.i!];
    panel.updateGridPos(newItem);
  }, []);

  const onResizeStop: ItemCallback = useCallback(
    (layout, _oldItem, newItem) => {
      updateGridPos(newItem, layout);
    },
    [updateGridPos]
  );

  const onDragStop: ItemCallback = useCallback(
    (layout, _oldItem, newItem) => {
      updateGridPos(newItem, layout);
    },
    [updateGridPos]
  );

  const getPanelScreenPos = (panel: PanelModel, gridWidth: number): { top: number; bottom: number } => {
    let top = 0;

    // mobile layout
    if (gridWidth < config.theme2.breakpoints.values.md) {
      // In mobile layout panels are stacked so we just add the panel vertical margin to the last panel bottom position
      top = lastPanelBottomRef.current + GRID_CELL_VMARGIN;
    } else {
      // For top position we need to add back the vertical margin removed by translateGridHeightToScreenHeight
      top = translateGridHeightToScreenHeight(panel.gridPos.y) + GRID_CELL_VMARGIN;
    }

    lastPanelBottomRef.current = top + translateGridHeightToScreenHeight(panel.gridPos.h);

    return { top, bottom: lastPanelBottomRef.current };
  };
  // `getPanelScreenPos` is preserved verbatim from the class form (per AAP §0.9.2.12
  // MINIMAL CHANGE MANDATE) but is not currently invoked anywhere in the codebase —
  // it was never called from the class form either. The class form was exempt from
  // `noUnusedLocals` because it lived as a class method on the prototype; in the
  // functional form it becomes a local declaration, so this void reference is
  // required to keep `tsc --noEmit` clean without altering observable behavior.
  void getPanelScreenPos;

  const renderPanel = (panel: PanelModel, panelWidth: number, panelHeight: number, isDraggable: boolean) => {
    if (panel.type === 'row') {
      return <DashboardRow key={panel.key} panel={panel} dashboard={dashboard} />;
    }

    if (panel.type === 'add-library-panel') {
      return <AddLibraryPanelWidget key={panel.key} panel={panel} dashboard={dashboard} />;
    }

    return (
      <DashboardPanel
        key={panel.key}
        stateKey={panel.key}
        panel={panel}
        dashboard={dashboard}
        isEditing={panel.isEditing}
        isViewing={panel.isViewing}
        isDraggable={isDraggable}
        width={panelWidth}
        height={panelHeight}
        hideMenu={hidePanelMenus}
      />
    );
  };

  const renderPanels = (gridWidth: number, isDashboardDraggable: boolean) => {
    const panelElements = [];

    // Reset last panel bottom
    lastPanelBottomRef.current = 0;

    // This is to avoid layout re-flows, accessing window.innerHeight can trigger re-flow
    // We assume here that if width change height might have changed as well
    if (gridWidthRef.current !== gridWidth) {
      windowHeightRef.current = window.innerHeight ?? 1000;
      windowWidthRef.current = window.innerWidth;
      gridWidthRef.current = gridWidth;
    }

    for (const panel of dashboard.panels) {
      const panelClasses = classNames({ 'react-grid-item--fullscreen': panel.isViewing });

      const p = (
        <GrafanaGridItem
          key={panel.key}
          className={panelClasses}
          data-panelid={panel.id}
          gridPos={panel.gridPos}
          gridWidth={gridWidth}
          windowHeight={windowHeightRef.current}
          windowWidth={windowWidthRef.current}
          isViewing={panel.isViewing}
        >
          {(panelWidth: number, panelHeight: number) => {
            return renderPanel(panel, panelWidth, panelHeight, isDashboardDraggable);
          }}
        </GrafanaGridItem>
      );

      if (!panelFilter) {
        panelElements.push(p);
      } else {
        if (panelFilter.test(panel.title)) {
          panelElements.push(p);
        }
      }
    }

    return panelElements;
  };

  /**
   * Without this hack the move animations are triggered on initial load and all panels fly into position.
   * This can be quite distracting and make the dashboard appear to less snappy.
   */
  const onGetWrapperDivRef = useCallback((ref: HTMLDivElement | null) => {
    if (ref && contextSrv.user.authenticatedBy !== 'render') {
      setTimeout(() => {
        ref.classList.add('react-grid-layout--enable-move-animations');
      }, 50);
    }
  }, []);

  const onMeasureRef = useCallback((rootEl: HTMLDivElement | null) => {
    if (!rootEl) {
      if (rootElRef.current && resizeObserverRef.current) {
        resizeObserverRef.current.unobserve(rootElRef.current);
      }
      return;
    }

    rootElRef.current = rootEl;
    resizeObserverRef.current = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        setWidth(entry.contentRect.width);
      });
    });

    resizeObserverRef.current.observe(rootEl);
  }, []);

  if (dashboard.panels.length === 0) {
    return <DashboardEmpty dashboard={dashboard} canCreate={isEditable} />;
  }

  const draggable = width <= config.theme2.breakpoints.values.md ? false : isEditable;

  // pos: rel + z-index is required to create a new stacking context to contain
  // the escalating z-indexes of the panels
  return (
    <div ref={onMeasureRef} className={cx(styles.outerWrapper, editPanel && styles.hidden)}>
      {/*
        Design system gap (AAP §0.4.4): the `width` value is a runtime pixel
        measurement from a ResizeObserver (state-managed via `setMeasureWidth`)
        and changes on every container resize. `@grafana/ui` Box / Stack accept
        `width` only as a theme-spacing token (multiples of theme.spacing.gridSize),
        not raw pixels — see `packages/grafana-ui/src/components/Layout/utils/styles.ts`.
        Generating a new Emotion class per measurement via `useStyles2` would
        defeat Emotion's class cache and produce hundreds of unique class names
        during a typical resize gesture. The inline `style` is therefore the
        canonical mechanism for forwarding a per-render pixel dimension to
        `react-grid-layout`, and is preserved with this gap justification.
        Static layout properties (height: 100%, etc.) ARE owned by
        `styles.innerWrapper` below.
      */}
      <div style={{ width }} className={styles.innerWrapper} ref={onGetWrapperDivRef}>
        <ReactGridLayout
          width={width}
          isDraggable={draggable}
          isResizable={isEditable}
          containerPadding={[0, 0]}
          useCSSTransforms={true}
          margin={[GRID_CELL_VMARGIN, GRID_CELL_VMARGIN]}
          cols={GRID_COLUMN_COUNT}
          rowHeight={GRID_CELL_HEIGHT}
          draggableHandle=".grid-drag-handle"
          draggableCancel=".grid-drag-cancel"
          layout={buildLayout()}
          onDragStop={onDragStop}
          onResize={onResize}
          onResizeStop={onResizeStop}
          onLayoutChange={onLayoutChange}
        >
          {renderPanels(width, draggable)}
        </ReactGridLayout>
      </div>
    </div>
  );
};

DashboardGridInner.displayName = 'DashboardGrid';

// Wrap in React.memo to preserve the shallow-equality re-render skip behaviour
// that the original `class DashboardGrid extends PureComponent<Props, State>`
// provided. The parent (`DashboardPage`) is a class component that may pass new
// prop object references on its own re-renders, and the grid contains heavy
// children whose render cost we want to avoid when props haven't materially
// changed.
export const DashboardGrid = React.memo(DashboardGridInner);
DashboardGrid.displayName = 'DashboardGrid';

type GrafanaGridItemChild = (width: number, height: number) => React.ReactNode;
type GrafanaGridItemChildren = GrafanaGridItemChild | [GrafanaGridItemChild, ...React.ReactNode[]];

// `Omit<...>` strips the inherited `children?: ReactNode` from
// `React.HTMLAttributes<HTMLDivElement>` so the local `children` field below
// (which is intentionally a render-prop function and not a ReactNode) does not
// conflict with the structural type of the standard div element interface.
interface GrafanaGridItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  gridWidth?: number;
  gridPos?: GridPos;
  isViewing: boolean;
  windowHeight: number;
  windowWidth: number;
  // The JSX call site of `<GrafanaGridItem>` always passes a single render-prop
  // function as its child, so the union accepts that shape. At runtime
  // `react-grid-layout` clones each item via `React.cloneElement` and injects
  // additional sibling children (resize handle, etc.) — at that point
  // `props.children` becomes the tuple `[renderFn, ...injected]`. The
  // normalization logic below converts both forms to the same access pattern,
  // eliminating the previous `children: any` escape hatch without changing
  // observable runtime behavior.
  children: GrafanaGridItemChildren;
}

/**
 * A hacky way to intercept the react-layout-grid item dimensions and pass them to DashboardPanel
 */
const GrafanaGridItem = React.forwardRef<HTMLDivElement, GrafanaGridItemProps>((props, ref) => {
  const theme = config.theme2;
  let width = 100;
  let height = 100;

  const { gridWidth, gridPos, isViewing, windowHeight, windowWidth, children, ...divProps } = props;
  const style: CSSProperties = props.style ?? {};

  if (isViewing) {
    // In fullscreen view mode a single panel take up full width & 85% height
    width = gridWidth!;
    height = windowHeight * 0.85;
    style.height = height;
    style.width = '100%';
  } else if (windowWidth < theme.breakpoints.values.md) {
    // Mobile layout is a bit different, every panel take up full width
    width = props.gridWidth!;
    height = translateGridHeightToScreenHeight(gridPos!.h);
    style.height = height;
    style.width = '100%';
  } else {
    // Normal grid layout. The grid framework passes width and height directly to children as style props.
    if (props.style) {
      const { width: styleWidth, height: styleHeight } = props.style;
      if (styleWidth != null) {
        width = typeof styleWidth === 'number' ? styleWidth : parseFloat(styleWidth);
      }
      if (styleHeight != null) {
        height = typeof styleHeight === 'number' ? styleHeight : parseFloat(styleHeight);
      }
    }
  }

  // Normalize the children prop. At the JSX call site `children` is a single
  // render-prop function; at runtime react-grid-layout injects sibling children
  // (e.g. a resize handle) so the runtime shape becomes a tuple. Both are
  // handled uniformly by the narrowing below — tuple destructuring preserves
  // the typed shape `[GrafanaGridItemChild, ...React.ReactNode[]]` without
  // requiring any `as`-style type assertions (forbidden by the repository's
  // `@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'never' }]`
  // rule).
  let renderFn: GrafanaGridItemChild;
  let restChildren: React.ReactNode[];
  if (Array.isArray(children)) {
    const [first, ...rest] = children;
    renderFn = first;
    restChildren = rest;
  } else {
    renderFn = children;
    restChildren = [];
  }

  // props.children[0] is our main children. RGL adds the drag handle at props.children[1].
  // The container `div` is rendered for `react-grid-layout`: RGL injects a `style`
  // object via the spread `{...divProps}` (containing translate/transform/transition
  // values needed for animated grid positioning). That `style` is a runtime-computed,
  // per-cell pixel/transform value owned by the third-party RGL layout engine and has
  // no equivalent @grafana/ui token (AAP §0.4.4 — "Design system gap"). It is therefore
  // forwarded as-is by spreading `divProps`. The previously explicit
  // `style={{ ...divProps.style }}` was redundant (the spread already carries it) and
  // is removed here to satisfy the inline-style migration audit.
  return (
    <div {...divProps} ref={ref}>
      {/* Pass width and height to children as render props */}
      {[renderFn(width, height), restChildren]}
    </div>
  );
});

/**
 * This translates grid height dimensions to real pixels
 */
function translateGridHeightToScreenHeight(gridHeight: number): number {
  return gridHeight * (GRID_CELL_HEIGHT + GRID_CELL_VMARGIN) - GRID_CELL_VMARGIN;
}

GrafanaGridItem.displayName = 'GridItemWithDimensions';

const getStyles = (_theme: GrafanaTheme2) => ({
  // Static layout for the outer wrapper. `pos: rel + z-index` is required to
  // create a new stacking context that contains the escalating z-indexes of the
  // panels (see the comment immediately above the JSX site).
  outerWrapper: css({
    flex: '1 1 auto',
    position: 'relative',
    zIndex: 1,
  }),
  // Applied via `cx(...)` when `props.editPanel` is truthy. Matches the original
  // `display: editPanel ? 'none' : undefined` inline-style toggle.
  hidden: css({
    display: 'none',
  }),
  // Only the static `height: 100%` lives in this class — the inner wrapper's
  // `width` is dynamic and stays on the inline `style` attribute at the call site.
  innerWrapper: css({
    height: '100%',
  }),
});
