import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ReplaySubject, Subscription } from 'rxjs';

import { type PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { type PanelContext, PanelContextRoot } from '@grafana/ui';
import { type CanvasFrameOptions } from 'app/features/canvas/frame';
import { type ElementState } from 'app/features/canvas/runtime/element';
import { Scene } from 'app/features/canvas/runtime/scene';
import { PanelEditEnteredEvent, PanelEditExitedEvent } from 'app/types/events';

import { SetBackground } from './components/SetBackground';
import { InlineEdit } from './editor/inline/InlineEdit';
import { type Options } from './panelcfg.gen';
import { type AnchorPoint, type CanvasTooltipPayload, type ConnectionState } from './types';

interface Props extends PanelProps<Options> {}

export interface InstanceState {
  scene: Scene;
  selected: ElementState[];
  selectedConnection?: ConnectionState;
}

/**
 * Stable handle to a CanvasPanel functional-component instance.
 *
 * The CanvasPanel was historically a React class component, and several
 * downstream consumers (Scene, CanvasContextMenu, InlineEditBody, the
 * canvas runtime ElementState, ConnectionSVG, and activePanelSubject
 * subscribers) hold direct references to it in order to read live `props`,
 * the scene reference, the live React context, the once-captured instance
 * context, limited UI state (`openInlineEdit`), and to call imperative
 * actions (`setActivePanel`, `closeInlineEdit`). After the conversion to a
 * functional component these consumers cannot reference a class instance,
 * so we expose a `CanvasPanelHandle` interface backed by an internal ref
 * that maintains stable identity across renders while its getters always
 * return the latest values.
 *
 * The shape preserves the dual `context` / `panelContext` surface that
 * existed on the original class: `context` is React-injected and
 * non-nullable (matches `static contextType = PanelContextRoot`), and
 * `panelContext` mirrors the formerly-assigned-in-componentDidMount
 * instance field whose type was `PanelContext | undefined`.
 */
export interface CanvasPanelHandle {
  /** Live snapshot of the current panel props. */
  props: Props;
  /** The Scene instance owned by this panel. */
  scene: Scene;
  /** The live PanelContext value; mirrors the former React-injected `this.context`. */
  context: PanelContext;
  /** The captured PanelContext; mirrors the former instance field `this.panelContext`. */
  panelContext: PanelContext | undefined;
  /** A minimal view of internal UI state exposed to consumers. */
  state: { openInlineEdit: boolean };
  /** Mark this panel as the active canvas panel and emit on activePanelSubject. */
  setActivePanel: () => void;
  /** Close the inline edit overlay and reset the module-level open flag. */
  closeInlineEdit: () => void;
}

export interface SelectionAction {
  panel: CanvasPanelHandle;
}

// Module-level coordination state, shared across all CanvasPanel instances in
// the same dashboard. Mirrors the pre-conversion behavior verbatim, only the
// element type is updated from the former `CanvasPanel` class reference to
// the new `CanvasPanelHandle` interface.
let canvasInstances: CanvasPanelHandle[] = [];
let activeCanvasPanel: CanvasPanelHandle | undefined = undefined;
let isInlineEditOpen = false;
let isSetBackgroundOpen = false;

export const activePanelSubject = new ReplaySubject<SelectionAction>(1);

export const CanvasPanel = memo((props: Props) => {
  // Functional-component state — one useState per original `State` field.
  // `refresh` and `moveableAction` exist only to trigger re-renders on
  // certain scene events and are not consumed elsewhere in render output.
  const [refresh, setRefresh] = useState(0);
  const [openInlineEdit, setOpenInlineEdit] = useState(false);
  const [openSetBackground, setOpenSetBackground] = useState(false);
  const [contextMenuAnchorPoint, setContextMenuAnchorPoint] = useState<AnchorPoint>({ x: 0, y: 0 });
  const [, setMoveableAction] = useState(false);
  // Counter used to imperatively trigger re-renders. Replaces `this.forceUpdate()`.
  const [, setRenderCount] = useState(0);

  // Replaces `static contextType = PanelContextRoot` and `declare context`.
  const panelContext = useContext(PanelContextRoot);

  // Refs that mirror class instance fields. Updating a ref does not trigger
  // a re-render, matching the class semantics of writing to `this.X`.
  const sceneRef = useRef<Scene | null>(null);
  const queryEditorLoadedRef = useRef(false);
  const needsReloadRef = useRef(false);

  // `isEditing` is captured once at mount, matching the class-field
  // initializer `isEditing = locationService.getSearchObject().editPanel !== undefined`.
  const isEditing = useMemo(() => locationService.getSearchObject().editPanel !== undefined, []);

  // Refs that always observe the latest values for use from inside
  // long-lived subscription/event callbacks captured at mount. They are
  // reassigned on every render so closures see current data.
  const propsRef = useRef(props);
  propsRef.current = props;

  const stateRef = useRef({ openInlineEdit });
  stateRef.current = { openInlineEdit };

  // `panelContextRef` always holds the live React-injected PanelContext.
  // Mirrors `this.context` on the original class, which React kept current.
  const panelContextRef = useRef<PanelContext>(panelContext);
  panelContextRef.current = panelContext;

  // `instancePanelContextRef` mirrors the original instance field
  // `this.panelContext`, which was initialized to `undefined` and assigned
  // `this.context` in componentDidMount. It is intentionally left
  // `undefined` here at render time and populated by the mount effect
  // below to match that initialization-then-assignment lifecycle.
  const instancePanelContextRef = useRef<PanelContext | undefined>(undefined);

  // Stable force-render callback. Replaces `this.forceUpdate()`.
  const triggerRender = useCallback(() => {
    setRenderCount((c) => c + 1);
  }, []);

  // Build the stable handle exposed to consumers (Scene, CanvasContextMenu,
  // InlineEditBody, activePanelSubject subscribers). The handle uses
  // getters so that field reads always observe the latest values, while the
  // handle reference itself remains stable across renders. The handle is
  // initialized exactly once and is the canonical replacement for `this`
  // when constructing the Scene and emitting on activePanelSubject.
  const handleRef = useRef<CanvasPanelHandle | null>(null);
  if (handleRef.current === null) {
    const handle: CanvasPanelHandle = {
      get props() {
        return propsRef.current;
      },
      get scene() {
        // The scene ref is initialized synchronously before the handle is
        // first observed by consumers (Scene constructor stores `handle`
        // but does not read `handle.scene`).
        return sceneRef.current!;
      },
      get context() {
        return panelContextRef.current;
      },
      get panelContext() {
        return instancePanelContextRef.current;
      },
      get state() {
        return stateRef.current;
      },
      setActivePanel: () => {
        activeCanvasPanel = handle;
        activePanelSubject.next({ panel: handle });
      },
      closeInlineEdit: () => {
        setOpenInlineEdit(false);
        isInlineEditOpen = false;
      },
    };
    handleRef.current = handle;
  }
  const handle = handleRef.current;

  // ---------------------------------------------------------------------------
  // Stable callbacks attached to the Scene at construction time. The Scene
  // captures each callback exactly once when it is constructed; identity is
  // preserved across renders via `useCallback` with stable dependencies so
  // these callbacks remain valid for the panel's lifetime.
  // ---------------------------------------------------------------------------

  const onUpdateScene = useCallback(
    (root: CanvasFrameOptions) => {
      const { onOptionsChange, options } = propsRef.current;
      onOptionsChange({ ...options, root });

      setRefresh((r) => r + 1);
      activePanelSubject.next({ panel: handle });
    },
    [handle]
  );

  const openInlineEditCb = useCallback(() => {
    if (isInlineEditOpen) {
      triggerRender();
      handle.setActivePanel();
      return;
    }

    handle.setActivePanel();
    setOpenInlineEdit(true);
    isInlineEditOpen = true;
  }, [handle, triggerRender]);

  const openSetBackgroundCb = useCallback(
    (anchorPoint: AnchorPoint) => {
      if (isSetBackgroundOpen) {
        triggerRender();
        handle.setActivePanel();
        return;
      }

      handle.setActivePanel();
      setOpenSetBackground(true);
      setContextMenuAnchorPoint(anchorPoint);

      isSetBackgroundOpen = true;
    },
    [handle, triggerRender]
  );

  const tooltipCallback = useCallback(
    (tooltip: CanvasTooltipPayload | undefined) => {
      if (sceneRef.current) {
        sceneRef.current.tooltipPayload = tooltip;
      }
      triggerRender();
    },
    [triggerRender]
  );

  const moveableActionCallback = useCallback(
    (updated: boolean) => {
      setMoveableAction(updated);
      triggerRender();
    },
    [triggerRender]
  );

  const actionConfirmationCallback = useCallback(() => {
    triggerRender();
  }, [triggerRender]);

  const closeSetBackground = useCallback(() => {
    setOpenSetBackground(false);
    isSetBackgroundOpen = false;
  }, []);

  // ---------------------------------------------------------------------------
  // Lazy initialization of the Scene + initial side effects.
  //
  // Mirrors the body of the class constructor: construct the Scene with the
  // initial options, the stable onUpdateScene callback, and the panel handle
  // (in place of `this`); then push the initial size and data into the scene
  // and attach the stable scene callbacks. Runs synchronously during the
  // first render so the scene is available when JSX is evaluated.
  // ---------------------------------------------------------------------------
  if (sceneRef.current === null) {
    // Only the initial options are ever used.
    // Later changes are all controlled by the scene.
    const newScene = new Scene(props.options, onUpdateScene, handle);
    sceneRef.current = newScene;
    newScene.updateSize(props.width, props.height);
    newScene.updateData(props.data);
    newScene.inlineEditingCallback = openInlineEditCb;
    newScene.setBackgroundCallback = openSetBackgroundCb;
    newScene.tooltipCallback = tooltipCallback;
    newScene.moveableActionCallback = moveableActionCallback;
    newScene.actionConfirmationCallback = actionConfirmationCallback;
  }
  const scene = sceneRef.current;

  // ---------------------------------------------------------------------------
  // Mount-only effect.
  //
  // Combines the class's:
  //   - constructor event-bus subscriptions (PanelEditEnteredEvent /
  //     PanelEditExitedEvent),
  //   - componentDidMount logic (register active panel, refresh data,
  //     subscribe to scene.selection and scene.connections.selection when
  //     panelContext.onInstanceStateChange is provided, reset
  //     queryEditorLoaded flag, push handle into canvasInstances),
  //   - componentWillUnmount cleanup (unsubscribe scene + local subs,
  //     reset module-level open flags, filter handle out of canvasInstances).
  //
  // The eventBus reference is captured once via propsRef.current — matching
  // the class behavior where the constructor subscribed exactly once and
  // never resubscribed when props changed.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const subs = new Subscription();

    subs.add(
      propsRef.current.eventBus.subscribe(PanelEditEnteredEvent, (_evt: PanelEditEnteredEvent) => {
        // Remove current selection when entering edit mode for any panel in dashboard
        scene.clearCurrentSelection();
        handle.closeInlineEdit();
      })
    );

    subs.add(
      propsRef.current.eventBus.subscribe(PanelEditExitedEvent, (evt: PanelEditExitedEvent) => {
        if (propsRef.current.id === evt.payload) {
          needsReloadRef.current = true;
          scene.clearCurrentSelection();
          // Trigger a render so the reload effect can observe the flag and
          // run the scene.load/updateSize/updateData sequence.
          triggerRender();
        }
      })
    );

    activeCanvasPanel = handle;
    activePanelSubject.next({ panel: handle });

    // Mirror the original `componentDidMount` assignment
    // `this.panelContext = this.context`. From this point on, downstream
    // consumers that read `handle.panelContext` (e.g., the canvas runtime
    // ElementState reading `scene.panel.panelContext?.canExecuteActions`)
    // observe the captured PanelContext, exactly as before.
    instancePanelContextRef.current = panelContextRef.current;

    if (scene.data) {
      scene.updateData(scene.data);
    }

    if (panelContextRef.current?.onInstanceStateChange) {
      panelContextRef.current.onInstanceStateChange({ scene, layer: scene.root });

      subs.add(
        scene.selection.subscribe({
          next: (v) => {
            if (v.length) {
              activeCanvasPanel = handle;
              activePanelSubject.next({ panel: handle });
            }

            canvasInstances.forEach((canvasInstance) => {
              if (canvasInstance !== activeCanvasPanel) {
                canvasInstance.scene.clearCurrentSelection(true);
                canvasInstance.scene.connections.select(undefined);
              }
            });

            panelContextRef.current?.onInstanceStateChange!({ scene, selected: v, layer: scene.root });
          },
        })
      );

      subs.add(
        scene.connections.selection.subscribe({
          next: (v) => {
            if (!panelContextRef.current?.instanceState) {
              return;
            }

            panelContextRef.current.onInstanceStateChange!({
              scene,
              selected: panelContextRef.current.instanceState.selected,
              selectedConnection: v,
              layer: scene.root,
            });

            if (v) {
              activeCanvasPanel = handle;
              activePanelSubject.next({ panel: handle });
            }

            canvasInstances.forEach((canvasInstance) => {
              if (canvasInstance !== activeCanvasPanel) {
                canvasInstance.scene.clearCurrentSelection(true);
                canvasInstance.scene.connections.select(undefined);
              }
            });

            setTimeout(() => {
              triggerRender();
            });
          },
        })
      );
    }

    // Reset the size update flag when entering edit mode
    if (isEditing) {
      queryEditorLoadedRef.current = false;
    }

    canvasInstances.push(handle);

    return () => {
      scene.subscription.unsubscribe();
      subs.unsubscribe();
      isInlineEditOpen = false;
      isSetBackgroundOpen = false;
      canvasInstances = canvasInstances.filter((ci) => ci.props.id !== activeCanvasPanel?.props.id);
    };
    // Mount-only effect — dependencies are intentionally empty to match the
    // class constructor + componentDidMount + componentWillUnmount lifecycle
    // semantics. All captured values (scene, handle, triggerRender, isEditing)
    // are stable across renders by construction (refs, useCallback with
    // stable deps, useMemo with [] deps), and `propsRef.current.eventBus`
    // is read via the live ref rather than as a dependency to mirror the
    // class's once-per-lifetime subscription behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // componentDidUpdate equivalent: when the panel is in edit mode and the
  // dimensions change for the first time post-mount, schedule an animation
  // frame to update the scene size. `queryEditorLoadedRef` ensures the
  // animation frame is requested only once per editing session, matching
  // the original guard `this.isEditing && !this.queryEditorLoaded`.
  useEffect(() => {
    if (isEditing && !queryEditorLoadedRef.current) {
      queryEditorLoadedRef.current = true;
      requestAnimationFrame(() => {
        scene.updateSize(propsRef.current.width, propsRef.current.height);
      });
    }
  }, [props.width, props.height, isEditing, scene]);

  // Width/height changes → scene.updateSize.
  // Replicates the corresponding branch of the class shouldComponentUpdate.
  useEffect(() => {
    scene.updateSize(props.width, props.height);
  }, [props.width, props.height, scene]);

  // Data changes → scene.updateData (only when scene.ignoreDataUpdate is false).
  // Replicates the data-only branch of shouldComponentUpdate.
  useEffect(() => {
    if (!scene.ignoreDataUpdate) {
      scene.updateData(props.data);
    }
  }, [props.data, scene]);

  // Options changes → scene.updateData(data).
  // NOTE: the original shouldComponentUpdate passes `nextProps.data` (NOT
  // `nextProps.options`) to `scene.updateData` when `options` changes — this
  // peculiarity is preserved verbatim to match pre-conversion behavior.
  useEffect(() => {
    if (!scene.ignoreDataUpdate) {
      scene.updateData(propsRef.current.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.options, scene]);

  // Snapshot of the previous option fields that trigger a full scene reload.
  // Initialized with the values from the very first render so that the first
  // run of the reload effect detects no switch (matching the class's
  // shouldComponentUpdate behavior of only reloading when comparing
  // `this.props.options.*` to `nextProps.options.*` produces a difference).
  const prevReloadOptionsRef = useRef({
    inlineEditing: props.options.inlineEditing,
    showAdvancedTypes: props.options.showAdvancedTypes,
    panZoom: props.options.panZoom,
    zoomToContent: props.options.zoomToContent,
    tooltipMode: props.options.tooltip?.mode,
    tooltipDisableForOneClick: props.options.tooltip?.disableForOneClick,
  });

  // Major option-switch reload effect (mirrors the reload block in the
  // class's shouldComponentUpdate). Also driven by the `needsReload` flag
  // that the PanelEditExitedEvent handler sets when this panel is the one
  // that just exited edit mode.
  useEffect(() => {
    const prev = prevReloadOptionsRef.current;
    const cur = {
      inlineEditing: props.options.inlineEditing,
      showAdvancedTypes: props.options.showAdvancedTypes,
      panZoom: props.options.panZoom,
      zoomToContent: props.options.zoomToContent,
      tooltipMode: props.options.tooltip?.mode,
      tooltipDisableForOneClick: props.options.tooltip?.disableForOneClick,
    };

    // After editing, the options are valid, but the scene was in a different panel or inline editing mode has changed
    const inlineEditingSwitched = prev.inlineEditing !== cur.inlineEditing;
    const shouldShowAdvancedTypesSwitched = prev.showAdvancedTypes !== cur.showAdvancedTypes;
    const panZoomSwitched = prev.panZoom !== cur.panZoom;
    const zoomToContentSwitched = prev.zoomToContent !== cur.zoomToContent;
    const tooltipModeSwitched = prev.tooltipMode !== cur.tooltipMode;
    const tooltipDisableForOneClickSwitched = prev.tooltipDisableForOneClick !== cur.tooltipDisableForOneClick;

    if (
      needsReloadRef.current ||
      inlineEditingSwitched ||
      shouldShowAdvancedTypesSwitched ||
      panZoomSwitched ||
      zoomToContentSwitched ||
      tooltipModeSwitched ||
      tooltipDisableForOneClickSwitched
    ) {
      if (inlineEditingSwitched) {
        // Replace scene div to prevent selecto instance leaks
        scene.revId++;
      }

      needsReloadRef.current = false;
      scene.load(props.options, props.options.inlineEditing);
      scene.updateSize(props.width, props.height);
      scene.updateData(props.data);
    }

    prevReloadOptionsRef.current = cur;
  }, [props.options, props.width, props.height, props.data, scene]);

  // The `refresh` state value participates in re-render semantics (its
  // setter is invoked from `onUpdateScene` to force a render after the
  // root options change), but is not consumed elsewhere — referencing it
  // here keeps the dependency-tracking model explicit.
  void refresh;

  return (
    <>
      {scene.renderElement()}
      {openInlineEdit && <InlineEdit onClose={() => handle.closeInlineEdit()} id={props.id} scene={scene} />}
      {openSetBackground && (
        <SetBackground onClose={closeSetBackground} scene={scene} anchorPoint={contextMenuAnchorPoint} />
      )}
    </>
  );
});

CanvasPanel.displayName = 'CanvasPanel';
