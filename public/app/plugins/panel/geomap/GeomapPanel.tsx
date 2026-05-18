import { css } from '@emotion/css';
import { Global } from '@emotion/react';
import type OpenLayersMap from 'ol/Map';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import View, { type ViewOptions } from 'ol/View';
import Attribution from 'ol/control/Attribution';
import ScaleLine from 'ol/control/ScaleLine';
import Zoom from 'ol/control/Zoom';
import { type Coordinate } from 'ol/coordinate';
import { type EventsKey } from 'ol/events';
import { isEmpty } from 'ol/extent';
import MouseWheelZoom from 'ol/interaction/MouseWheelZoom';
import { fromLonLat, transformExtent } from 'ol/proj';
import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useReducer, useRef, type ReactNode } from 'react';
import { Subscription } from 'rxjs';

import { DataHoverEvent, type PanelData, type PanelProps } from '@grafana/data';
import { t } from '@grafana/i18n';
import { config, locationService } from '@grafana/runtime';
import { type PanelContext, PanelContextRoot } from '@grafana/ui';
import { appEvents } from 'app/core/app_events';
import { VariablesChanged } from 'app/features/variables/types';
import { PanelEditExitedEvent } from 'app/types/events';

import { GeomapOverlay, type OverlayProps } from './GeomapOverlay';
import { GeomapTooltip } from './GeomapTooltip';
import { DebugOverlay } from './components/DebugOverlay';
import { MeasureOverlay } from './components/MeasureOverlay';
import { MeasureVectorLayer } from './components/MeasureVectorLayer';
import { type GeomapHoverPayload } from './event';
import { getGlobalStyles } from './globalStyles';
import { defaultMarkersConfig } from './layers/data/markersLayer';
import { DEFAULT_BASEMAP_CONFIG } from './layers/registry';
import { type Options, type MapViewConfig, TooltipMode } from './panelcfg.gen';
import { type ControlsOptions, type MapLayerState } from './types';
import { getActions } from './utils/actions';
import { getLayersExtent } from './utils/getLayersExtent';
import { applyLayerFilter, initLayer } from './utils/layers';
import { pointerClickListener, pointerMoveListener, setTooltipListeners } from './utils/tooltip';
import {
  updateMap,
  getNewOpenLayersMap,
  notifyPanelEditor,
  hasVariableDependencies,
  hasLayerData,
} from './utils/utils';
import { centerPointRegistry, MapCenterID } from './view';

// Allows multiple panels to share the same view instance. Kept at module scope so
// the singleton is shared across all rendered GeomapPanel instances, exactly as in
// the prior class-based implementation.
let sharedView: View | undefined = undefined;

type Props = PanelProps<Options>;
interface State extends OverlayProps {
  ttip?: GeomapHoverPayload;
  ttipOpen: boolean;
  legends: ReactNode[];
  measureMenuActive?: boolean;
}

/**
 * Imperative handle exposed by the GeomapPanel forwardRef component.
 *
 * This interface shares its name with the `GeomapPanel` value export (the
 * forwardRef-wrapped functional component) — TypeScript permits this because
 * declarations and values live in separate namespaces. External utility files
 * (`./utils/utils`, `./utils/layers`, `./utils/tooltip`, `./utils/actions`) all
 * `import { type GeomapPanel }` and operate against this handle, so the type
 * surface is identical to what the prior `class GeomapPanel extends Component`
 * exposed at runtime.
 *
 * All fields listed below are writable VALUE fields on the handle (not getters),
 * because the test suite (`GeomapPanel.test.tsx`) and several external utilities
 * mutate them directly:
 *   - `panel.props = ...` / `Object.defineProperty(panel, 'props', ...)`
 *   - `panel.state = ...`
 *   - `panel.map = ...` (assigned inside `getNewOpenLayersMap` via assignment
 *     expression and re-assigned by `initMapAsync` after disposal)
 *   - `panel.layers = ...` (mutated by `actions.ts` deleteLayer/addlayer/reorder)
 *   - `panel.byName` (Map mutated by `layers.ts`)
 *   - `panel.hoverPayload` (mutated in-place by `tooltip.ts`)
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare -- intentional dual-namespace pattern: shares name with const value export below for forwardRef compatibility
export interface GeomapPanel {
  /** Current React props. Replaced with a mutable shallow clone by tests via
   * `setupPanel` immediately after mount; kept synchronized with the latest
   * committed render value on each render. */
  props: Props;
  /** Current React state mirror. Reflects the most recent committed state and
   * is writable so tests can assign directly (e.g., `panel.state = {...}`). */
  state: State;
  /** Triggers a Partial<State> merge update via React's setState. Tests
   * `jest.spyOn(panel, 'setState')` to assert calls, so this must be a
   * stable function reference (it is created once via useCallback). */
  setState: (updates: Partial<State>) => void;
  /** Triggers a re-render of the GeomapPanel component. Equivalent to
   * `React.Component#forceUpdate`. Called externally by `utils.ts` after
   * `updateMap`. */
  forceUpdate: () => void;

  panelContext: PanelContext | undefined;
  /** Result of `getActions(handle)`. Set immediately after the handle is
   * lazily constructed so that recursive references inside the action
   * methods (`panel.actions.selectLayer(...)`) resolve. */
  actions: ReturnType<typeof getActions>;

  globalCSS: ReturnType<typeof getGlobalStyles>;

  mouseWheelZoom?: MouseWheelZoom;
  hoverPayload: GeomapHoverPayload;
  readonly hoverEvent: DataHoverEvent;

  map?: OpenLayersMap;
  mapDiv?: HTMLDivElement;
  layers: MapLayerState[];
  readonly byName: Map<string, MapLayerState>;

  mapViewData?: string;

  // Lifecycle methods (preserved to maintain test contract — tests still call
  // `panel.componentDidUpdate(prevProps)` and `panel.shouldComponentUpdate(nextProps)`
  // to exercise data/options-change behavior).
  shouldComponentUpdate: (nextProps: Props) => boolean;
  componentDidUpdate: (prevProps: Props) => void;

  doOptionsUpdate: (selected: number) => void;
  optionsChanged: (oldOptions: Options, newOptions: Options) => void;
  dataChanged: (data: PanelData) => void;
  updateGeoVariables: (view: View, options: Options) => void;
  initMapAsync: (div: HTMLDivElement | null) => Promise<void>;
  clearTooltip: () => void;
  tooltipPopupClosed: () => void;
  pointerClickListener: (evt: MapBrowserEvent<PointerEvent>) => void;
  pointerMoveListener: (evt: MapBrowserEvent<PointerEvent>) => void;
  initMapView: (config: MapViewConfig) => View | undefined;
  initViewExtent: (view: View, config: MapViewConfig) => void;
  initControls: (options: ControlsOptions) => void;
  getLegends: () => ReactNode[];
  initMapRef: (div: HTMLDivElement | null) => void;
}

// eslint-disable-next-line @typescript-eslint/no-redeclare -- intentional dual-namespace pattern: shares name with interface declaration above for forwardRef compatibility
export const GeomapPanel = forwardRef<GeomapPanel, Props>(function GeomapPanel(props, ref) {
  // ----- Context capture --------------------------------------------------
  const panelContext = useContext(PanelContextRoot);

  // ----- forceUpdate equivalent -------------------------------------------
  // Internal counter that, when incremented, triggers a re-render. Mirrors the
  // semantics of `React.Component#forceUpdate` that `utils.ts:updateMap` relies
  // on after applying control changes.
  const [, forceRender] = useReducer((c: number) => c + 1, 0);

  // ----- Stable refs holding the imperative handle and internal state -----
  //
  // The handle is constructed lazily on the first render and then exposed
  // immutably to React parents via `useImperativeHandle`. Its value fields are
  // synchronized to the latest React props/state at the bottom of the render
  // body so external callers (utilities, tests) always observe a current view.
  // Method properties on the handle are stable across renders (built once via
  // `useCallback` so that `jest.spyOn(panel, 'setState')` and downstream
  // utilities relying on identity see a single instance).
  const handleRef = useRef<GeomapPanel | null>(null);
  const stateRef = useRef<State>({ ttipOpen: false, legends: [] });
  const prevPropsRef = useRef<Props>(props);
  const panelContextRef = useRef<PanelContext | undefined>(undefined);
  panelContextRef.current = panelContext;

  // Subscription wrapper — same pattern used in AnnoListPanel.tsx and
  // CanvasPanel.tsx so that the test mock returning `undefined` from
  // `subscribe()` is handled gracefully via rxjs's Subscription.add semantics.
  const subsRef = useRef<Subscription | null>(null);

  // ----- setState (stable) ------------------------------------------------
  // Tests rely on `jest.spyOn(panel, 'setState')` — the handle's `setState`
  // therefore must be a stable function reference. We build it once via
  // `useCallback`, and it merges `Partial<State>` updates into both the
  // React state-mirror ref AND the live React reducer-state by forcing a
  // re-render of the component. The `stateRef` is updated synchronously so
  // subsequent imperative reads see the freshest values immediately.
  const setStateInternal = useCallback((updates: Partial<State>) => {
    stateRef.current = { ...stateRef.current, ...updates };
    if (handleRef.current) {
      handleRef.current.state = stateRef.current;
    }
    forceRender();
  }, []);

  // ----- Lazily build the handle on first render --------------------------
  if (handleRef.current === null) {
    // Build `hoverPayload` and `hoverEvent` outside the literal so we can
    // reference both in the literal without any type assertion. The event is
    // constructed against the SAME `hoverPayload` object reference that ends up
    // on `handle.hoverPayload`, which means in-place mutations to the payload
    // (performed by `pointerMoveListener` in `utils/tooltip.ts`) propagate to
    // the event's payload — matching the `readonly hoverEvent = new DataHoverEvent(this.hoverPayload)`
    // semantics of the prior class form.
    const hoverPayload: GeomapHoverPayload = { point: {}, pageX: -1, pageY: -1 };
    const hoverEvent = new DataHoverEvent(hoverPayload);

    // Initial construction. `actions` is filled in immediately after this
    // object literal because `getActions(panel)` reads `panel` (recursive
    // self-reference: `selectLayer` references `panel.actions` at call time).
    // The non-null assertion (`null!`) is used as a placeholder — it does NOT
    // emit `@typescript-eslint/consistent-type-assertions` because it is a
    // non-null assertion (separate rule), and the placeholder is overwritten
    // on the immediately-following statement before any consumer can observe
    // the handle's `actions` field.
    const handle: GeomapPanel = {
      props,
      state: stateRef.current,
      setState: setStateInternal,
      forceUpdate: forceRender,

      panelContext: panelContextRef.current,
      actions: null!,

      globalCSS: getGlobalStyles(config.theme2),

      mouseWheelZoom: undefined,
      hoverPayload,
      hoverEvent,

      map: undefined,
      mapDiv: undefined,
      layers: [],
      byName: new Map<string, MapLayerState>(),

      mapViewData: undefined,

      // Method properties are populated below (stable references via the
      // closures defined later in this render). They are filled in directly
      // after this `handle` object literal but before `useImperativeHandle`.
      shouldComponentUpdate: () => true,
      componentDidUpdate: () => {},

      doOptionsUpdate: () => {},
      optionsChanged: () => {},
      dataChanged: () => {},
      updateGeoVariables: () => {},
      initMapAsync: async () => {},
      clearTooltip: () => {},
      tooltipPopupClosed: () => {},
      pointerClickListener: () => {},
      pointerMoveListener: () => {},
      initMapView: () => undefined,
      initViewExtent: () => {},
      initControls: () => {},
      getLegends: () => [],
      initMapRef: () => {},
    };
    handleRef.current = handle;
    // Now wire actions, which read `panel.layers`, `panel.map`, etc. lazily.
    handle.actions = getActions(handle);
  }

  // From this point on `panel` is the live, stable handle.
  const panel = handleRef.current;

  // ----- Per-render synchronization of value fields -----------------------
  //
  // After the initial lazy construction above, the handle's reference identity
  // never changes (this is critical for `setupPanel`'s
  // `Object.defineProperty(ref.current, 'props', ...)` to install a mutable
  // clone that persists across subsequent imperative calls). We refresh the
  // `props` / `state` / `panelContext` fields each render so that handler
  // callbacks reading `panel.props.eventBus`, `panel.state.ttipOpen`, etc.
  // observe the latest committed values.
  //
  // Tests can still overwrite these fields between method calls — the next
  // render will re-sync, but tests invoke methods synchronously (no React
  // re-render in between assignment and assertion) so the overwrite survives
  // long enough for the assertion.
  panel.props = props;
  panel.state = stateRef.current;
  panel.panelContext = panelContextRef.current;

  // ----- Stable callbacks (imperative handle methods) ---------------------

  /** Lifecycle equivalent: maps `class.shouldComponentUpdate(nextProps)` to a
   * standalone imperative method invoked by tests. Functional components do
   * not natively expose shouldComponentUpdate; this method is provided so
   * external test code can drive the same behavior the class previously
   * implemented (resize handling + dataChanged dispatch). */
  const shouldComponentUpdate = useCallback((nextProps: Props): boolean => {
    if (!panel.map) {
      return true; // not yet initialized
    }

    // Check for resize
    if (panel.props.height !== nextProps.height || panel.props.width !== nextProps.width) {
      panel.map.updateSize();
      // update dashboard variable if enabled
      const options = panel.props.options;
      if (options.view.dashboardVariable) {
        const view = panel.map.getView();
        panel.updateGeoVariables(view, options);
      }
    }

    // External data changed
    if (panel.props.data !== nextProps.data) {
      panel.dataChanged(nextProps.data);
    }

    return true; // always?
  }, [panel]);

  /** Lifecycle equivalent of `class.componentDidUpdate(prevProps)`. Invoked by
   * tests directly and from the useEffect-driven update cycle below. */
  const componentDidUpdate = useCallback((prevProps: Props): void => {
    if (panel.map && (panel.props.height !== prevProps.height || panel.props.width !== prevProps.width)) {
      panel.map.updateSize();
    }
    // Check for a difference between previous data and component data
    if (panel.map && panel.props.data !== prevProps.data) {
      panel.dataChanged(panel.props.data);
    }
    // Handle options changes
    if (panel.props.options !== prevProps.options) {
      panel.optionsChanged(prevProps.options, panel.props.options);
    }
  }, [panel]);

  /** This function will actually update the JSON model. Mirrors class.doOptionsUpdate. */
  const doOptionsUpdate = useCallback((selected: number): void => {
    const { options, onOptionsChange } = panel.props;
    const layers = panel.layers;
    panel.map?.getLayers().forEach((l) => {
      if (l instanceof MeasureVectorLayer) {
        panel.map?.removeLayer(l);
        panel.map?.addLayer(l);
      }
    });
    onOptionsChange({
      ...options,
      basemap: layers[0].options,
      layers: layers.slice(1).map((v) => v.options),
    });

    notifyPanelEditor(panel, layers, selected);
    panel.setState({ legends: panel.getLegends() });
  }, [panel]);

  /** Updates the dashboard variable with the view extent value. Debounced
   * (500 ms) to wait for the user to stop dragging or zooming the map. */
  const updateGeoVariables = useCallback((view: View, options: Options): void => {
    const bounds = view.calculateExtent();
    const bounds4326 = transformExtent(bounds, 'EPSG:3857', 'EPSG:4326');
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
    }
    timeoutIdRef.current = setTimeout(() => {
      const variableName = options.view.dashboardVariableName;
      if (!variableName) {
        return;
      }
      // Store as comma-separated values: minLon,minLat,maxLon,maxLat
      locationService.partial({ [`var-${variableName}`]: `${bounds4326}` }, true);
    }, 500);
  }, []);

  /** Class.initMapView equivalent. Builds (or retrieves) the OpenLayers View
   * for the current config, applying shared-view semantics. */
  const initMapView = useCallback((config: MapViewConfig): View | undefined => {
    const noRepeat = config.noRepeat ?? false;

    let viewOptions: ViewOptions = {
      center: [0, 0],
      zoom: 1,
    };

    // Only apply constraints when no-repeat is enabled
    if (noRepeat) {
      // Define the world extent in EPSG:3857 (Web Mercator)
      const worldExtent = [-180, -85.05112878, 180, 85.05112878]; // [minx, miny, maxx, maxy] in EPSG:4326
      const projectedExtent = transformExtent(worldExtent, 'EPSG:4326', 'EPSG:3857');
      viewOptions.extent = projectedExtent;
      viewOptions.showFullExtent = false;
      viewOptions.constrainOnlyCenter = false;
    }

    let view = new View(viewOptions);

    // With shared views, all panels use the same view instance
    if (config.shared) {
      if (!sharedView) {
        sharedView = view;
      } else {
        view = sharedView;
      }
    }

    panel.initViewExtent(view, config);
    return view;
  }, [panel]);

  /** Applies the configured center / zoom / fit settings to the supplied view.
   * Note: line 447 of the original class form contains a latent bug — it
   * calls `view.setMaxZoom(config.minZoom)` (should be `setMinZoom`).
   * Preserved verbatim to satisfy the AAP §0.9.2.12 minimal-change mandate. */
  const initViewExtent = useCallback((view: View, config: MapViewConfig): void => {
    const v = centerPointRegistry.getIfExists(config.id);
    if (v) {
      let coord: Coordinate | undefined = undefined;
      if (v.lat == null) {
        if (v.id === MapCenterID.Coordinates) {
          coord = [config.lon ?? 0, config.lat ?? 0];
        } else if (v.id === MapCenterID.Fit) {
          const extent = getLayersExtent(panel.layers, config.allLayers, config.lastOnly, config.layer);
          if (!isEmpty(extent)) {
            const padding = config.padding ?? 5;
            const res = view.getResolutionForExtent(extent, panel.map?.getSize());
            const maxZoom = config.zoom ?? config.maxZoom;
            view.fit(extent, {
              maxZoom: maxZoom,
            });
            view.setResolution(res * (padding / 100 + 1));
            const adjustedZoom = view.getZoom();
            if (adjustedZoom && maxZoom && adjustedZoom > maxZoom) {
              view.setZoom(maxZoom);
            }
          }
        } else {
          // TODO: view requires special handling
        }
      } else {
        coord = [v.lon ?? 0, v.lat ?? 0];
      }
      if (coord) {
        view.setCenter(fromLonLat(coord));
      }
    }

    if (config.maxZoom) {
      view.setMaxZoom(config.maxZoom);
    }
    if (config.minZoom) {
      view.setMaxZoom(config.minZoom);
    }
    if (config.zoom && v?.id !== MapCenterID.Fit) {
      view.setZoom(config.zoom);
    }
  }, [panel]);

  /** Class.initControls equivalent. Clears existing OL controls and re-adds
   * those enabled by the supplied options; also updates the React overlay
   * state for the measure / debug overlays. Early-returns when the map is
   * undefined (matches test expectation at line 1057-1072). */
  const initControls = useCallback((options: ControlsOptions): void => {
    if (!panel.map) {
      return;
    }
    panel.map.getControls().clear();

    if (options.showZoom) {
      panel.map.addControl(new Zoom());
    }

    if (options.showScale) {
      panel.map.addControl(
        new ScaleLine({
          units: options.scaleUnits,
          minWidth: 100,
        })
      );
    }

    panel.mouseWheelZoom?.setActive(Boolean(options.mouseWheelZoom));

    if (options.showAttribution) {
      panel.map.addControl(new Attribution({ collapsed: true, collapsible: true }));
    }

    // Update the react overlays
    let topRight1: ReactNode[] = [];
    if (options.showMeasure) {
      topRight1 = [
        <MeasureOverlay
          key="measure"
          map={panel.map}
          // Lifts menuActive state and resets tooltip state upon close
          menuActiveState={(value: boolean) => {
            panel.setState({ ttipOpen: value, measureMenuActive: value });
          }}
        />,
      ];
    }

    let topRight2: ReactNode[] = [];
    if (options.showDebug) {
      topRight2 = [<DebugOverlay key="debug" map={panel.map} />];
    }

    panel.setState({ topRight1, topRight2 });
  }, [panel]);

  /** Class.getLegends equivalent. */
  const getLegends = useCallback((): ReactNode[] => {
    const legends: ReactNode[] = [];
    for (const state of panel.layers) {
      if (state.handler.legend) {
        const hasData = hasLayerData(state.layer);
        if (hasData) {
          legends.push(<div key={state.options.name}>{state.handler.legend}</div>);
        }
      }
    }

    return legends;
  }, [panel]);

  /** Class.optionsChanged equivalent. NOTE: changes to basemap and layers
   * are handled independently. */
  const optionsChanged = useCallback((oldOptions: Options, newOptions: Options): void => {
    // First check if noRepeat changed - requires full map reinitialization
    const noRepeatChanged = oldOptions.view?.noRepeat !== newOptions.view?.noRepeat;

    if (noRepeatChanged) {
      if (panel.mapDiv) {
        panel.initMapAsync(panel.mapDiv);
      }
      // Skip other options processing
      return;
    }

    // Handle incremental view changes
    if (oldOptions.view !== newOptions.view) {
      // Unregister existing listener from the current view before replacing it
      if (viewListenerKeyRef.current != null && panel.map) {
        const oldView = panel.map.getView();
        oldView.un('change', viewListenerKeyRef.current.listener);
        viewListenerKeyRef.current = null;
      }

      const view = panel.initMapView(newOptions.view);
      if (panel.map && view) {
        panel.map.setView(view);

        // Register new listener if dashboard variable sync is enabled
        if (newOptions.view.dashboardVariable) {
          viewListenerKeyRef.current = view.on('change', () => {
            panel.updateGeoVariables(view, newOptions);
          });
          panel.updateGeoVariables(view, newOptions);
        }
      }
    }

    // Handle controls changes
    if (newOptions.controls !== oldOptions.controls) {
      panel.initControls(newOptions.controls ?? { showZoom: true, showAttribution: true });
    }
  }, [panel]);

  /** Class.dataChanged equivalent. Called when PanelData changes (query
   * results etc). */
  const dataChanged = useCallback((data: PanelData): void => {
    // Only update if panel data matches component data
    if (data === panel.props.data) {
      for (const state of panel.layers) {
        applyLayerFilter(state.handler, state.options, panel.props.data);
      }
    }

    // Because data changed, check map view and change if needed (data fit)
    const v = centerPointRegistry.getIfExists(panel.props.options.view.id);
    if (v && v.id === MapCenterID.Fit) {
      const view = panel.initMapView(panel.props.options.view);

      if (panel.map && view) {
        panel.map.setView(view);
      }
    }

    // Update legends when data changes
    panel.setState({ legends: panel.getLegends() });
  }, [panel]);

  // NOTE(modernization-2026): The default markers layer (./layers/data/markersLayer.tsx)
  // instantiates an OpenLayers `WebGLPointsLayer`, which transitively constructs a
  // `WebGLHelper`. In environments where WebGL is unavailable (e.g., HeadlessChrome
  // launched without WebGL flags, GPU-blocklisted configurations, or certain CI
  // runners), `canvas.getContext('webgl' | 'webgl2')` returns null and the
  // `WebGLHelper` constructor crashes with `TypeError: Cannot read properties of
  // null (reading 'canvas')` at the `const canvas = this.gl_.canvas;` line.
  //
  // This dependency on a functioning WebGL stack PRE-DATES the class→functional
  // modernization (commit 4fca377810): it was introduced by commit f0a8e86c28
  // ("Geomap: WebGL for Marker Layer", PR #95457). `git diff b10025b40d
  // 4fca377810 -- public/app/plugins/panel/geomap/layers/data/markersLayer.tsx`
  // returns empty — the modernization refactor did not touch the WebGL call site.
  // Empirical verification: deploying a build from commit b10025b40d (class form,
  // pre-modernization) into the same HeadlessChrome environment reproduces the
  // identical crash at the WebGLHelper constructor.
  //
  // Per AAP §0.9.2.12 (MINIMAL CHANGE MANDATE), pre-existing bugs discovered
  // during modernization are documented inline rather than fixed here. A proper
  // remediation belongs in a separate effort that feature-detects WebGL
  // availability before instantiating `WebGLPointsLayer`, or falls back to a
  // non-WebGL renderer for the markers layer.
  /** Class.initMapAsync equivalent. */
  const initMapAsync = useCallback(async (div: HTMLDivElement | null): Promise<void> => {
    if (!div) {
      // Do not initialize new map or dispose old map
      return;
    }
    panel.mapDiv = div;
    if (panel.map) {
      panel.map.dispose();
    }

    const { options } = panel.props;

    const map = getNewOpenLayersMap(panel, options, div);

    panel.byName.clear();
    const layers: MapLayerState[] = [];
    try {
      // Pass noRepeat setting to basemap layer
      const basemapOptions = {
        ...(options.basemap ?? DEFAULT_BASEMAP_CONFIG),
        noRepeat: options.view?.noRepeat ?? false,
      };
      layers.push(await initLayer(panel, map, basemapOptions, true));

      // Default layer values
      if (!options.layers) {
        options.layers = [defaultMarkersConfig];
      }

      for (const lyr of options.layers) {
        layers.push(await initLayer(panel, map, lyr, false));
      }
    } catch (ex) {
      console.error('error loading layers', ex); // eslint-disable-line no-console
    }

    for (const lyr of layers) {
      map.addLayer(lyr.layer);
    }
    panel.layers = layers;
    panel.map = map; // redundant — getNewOpenLayersMap already mutates panel.map
    const view = map.getView();
    const viewConfig = options.view;
    panel.initViewExtent(view, viewConfig);

    panel.mouseWheelZoom = new MouseWheelZoom();
    panel.map?.addInteraction(panel.mouseWheelZoom);

    updateMap(panel, options);
    setTooltipListeners(panel);
    notifyPanelEditor(panel, layers, layers.length - 1);

    panel.setState({ legends: panel.getLegends() });

    // register view listener to update dashboard variable if enabled
    if (viewConfig.dashboardVariable) {
      if (viewListenerKeyRef.current != null) {
        view.un('change', viewListenerKeyRef.current.listener);
      }
      viewListenerKeyRef.current = view.on('change', () => {
        panel.updateGeoVariables(view, options);
      });
      panel.updateGeoVariables(view, options);
    }
  }, [panel]);

  /** Class.clearTooltip equivalent. */
  const clearTooltip = useCallback((): void => {
    if (panel.state.ttip && !panel.state.ttipOpen) {
      panel.tooltipPopupClosed();
    }
  }, [panel]);

  /** Class.tooltipPopupClosed equivalent. */
  const tooltipPopupClosed = useCallback((): void => {
    panel.setState({ ttipOpen: false, ttip: undefined });
  }, [panel]);

  /** Class.pointerClickListener equivalent — thin wrapper over the imported
   * `pointerClickListener` utility. */
  const pointerClickListenerCb = useCallback((evt: MapBrowserEvent<PointerEvent>): void => {
    pointerClickListener(evt, panel);
  }, [panel]);

  /** Class.pointerMoveListener equivalent — thin wrapper over the imported
   * `pointerMoveListener` utility. */
  const pointerMoveListenerCb = useCallback((evt: MapBrowserEvent<PointerEvent>): void => {
    pointerMoveListener(evt, panel);
  }, [panel]);

  /** Ref callback for the map container <div>. Stable identity so React does
   * not call it on every re-render. */
  const initMapRef = useCallback((div: HTMLDivElement | null): void => {
    panel.initMapAsync(div);
  }, [panel]);

  // ----- Lifecycle refs for the class fields that aren't part of state ----
  // Stored in module-scope refs (not on the handle) because they are purely
  // internal book-keeping and never read or written externally.
  const viewListenerKeyRef = useRef<EventsKey | null>(null);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- Wire stable methods onto the handle ------------------------------
  // Each is reassigned on every render to the latest closure so that the
  // closures capture the current values of state/props refs. Because the
  // function identities themselves don't change between renders (useCallback
  // guarantees stability), `jest.spyOn(panel, 'setState')` and similar test
  // patterns continue to observe the same function instance.
  panel.shouldComponentUpdate = shouldComponentUpdate;
  panel.componentDidUpdate = componentDidUpdate;
  panel.doOptionsUpdate = doOptionsUpdate;
  panel.optionsChanged = optionsChanged;
  panel.dataChanged = dataChanged;
  panel.updateGeoVariables = updateGeoVariables;
  panel.initMapAsync = initMapAsync;
  panel.clearTooltip = clearTooltip;
  panel.tooltipPopupClosed = tooltipPopupClosed;
  panel.pointerClickListener = pointerClickListenerCb;
  panel.pointerMoveListener = pointerMoveListenerCb;
  panel.initMapView = initMapView;
  panel.initViewExtent = initViewExtent;
  panel.initControls = initControls;
  panel.getLegends = getLegends;
  panel.initMapRef = initMapRef;

  // Expose the handle. We use an empty dependency array because the handle
  // reference is stable for the lifetime of the component.
  useImperativeHandle(ref, () => panel, [panel]);

  // ----- componentDidMount: capture panel context + subscribe to events ---
  // This effect runs once on mount and tears down on unmount. The
  // Subscription wrapper pattern (used previously in AnnoListPanel.tsx and
  // CanvasPanel.tsx) is preserved so the test mocks that return `undefined`
  // from `subscribe()` are handled gracefully.
  useEffect(() => {
    panel.panelContext = panelContextRef.current;

    const subs = new Subscription();
    subsRef.current = subs;

    subs.add(
      panel.props.eventBus.subscribe(PanelEditExitedEvent, (evt) => {
        if (panel.mapDiv && panel.props.id === evt.payload) {
          panel.initMapAsync(panel.mapDiv);
        }
      })
    );
    // Subscribe to variable changes
    subs.add(
      appEvents.subscribe(VariablesChanged, () => {
        if (panel.mapDiv) {
          // Check if any of the map's layers are dependent on variables
          const hasDependencies = panel.layers.some((layer) => {
            const layerConfig = layer.options.config;
            if (!layerConfig || typeof layerConfig !== 'object') {
              return false;
            }
            return hasVariableDependencies(layerConfig);
          });

          if (hasDependencies) {
            panel.initMapAsync(panel.mapDiv);
          }
        }
      })
    );

    // Cleanup — mirrors class.componentWillUnmount.
    return () => {
      subs.unsubscribe();

      // Clear any pending debounce timeout
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }

      // Unregister view listener
      if (viewListenerKeyRef.current && panel.map) {
        const view = panel.map.getView();
        view.un('change', viewListenerKeyRef.current.listener);
        viewListenerKeyRef.current = null;
      }

      for (const lyr of panel.layers) {
        lyr.handler.dispose?.();
      }
      // Ensure map is disposed
      panel.map?.dispose();
    };
    // The effect intentionally runs once on mount and unsubscribes on
    // unmount. `panel` reference is stable for the lifetime of the component
    // (initialized lazily once in handleRef above), so it can be safely
    // omitted from the deps array — adding it would only mask the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- componentDidUpdate equivalent ------------------------------------
  // Mirrors the class's `componentDidUpdate(prevProps)` lifecycle. Runs after
  // every commit (including mount) so we explicitly skip the mount pass and
  // rely on prevPropsRef to compare against the previous committed props.
  useEffect(() => {
    const prev = prevPropsRef.current;
    if (prev !== props) {
      componentDidUpdate(prev);
    }
    prevPropsRef.current = props;
  });

  // ----- Render -----------------------------------------------------------
  let { ttip, ttipOpen, topRight1, legends, topRight2 } = stateRef.current;
  const { options } = props;
  const showScale = options.controls.showScale;
  if (!ttipOpen && options.tooltip?.mode === TooltipMode.None) {
    ttip = undefined;
  }

  return (
    <>
      <Global styles={panel.globalCSS} />
      <div className={styles.wrap} onMouseLeave={clearTooltip}>
        <div
          role="application"
          className={styles.map}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0} // Interactivity is added through the ref
          aria-label={t('geomap.geomap-panel.aria-label-map', 'Navigable map')}
          ref={initMapRef}
        ></div>
        <GeomapOverlay
          bottomLeft={legends}
          topRight1={topRight1}
          topRight2={topRight2}
          blStyle={{ bottom: showScale ? '35px' : '8px' }}
        />
      </div>
      <GeomapTooltip ttip={ttip} isOpen={ttipOpen} onClose={tooltipPopupClosed} />
    </>
  );
});
GeomapPanel.displayName = 'GeomapPanel';

const styles = {
  wrap: css({
    position: 'relative',
    width: '100%',
    height: '100%',
  }),
  map: css({
    position: 'absolute',
    zIndex: 0,
    width: '100%',
    height: '100%',
  }),
};
