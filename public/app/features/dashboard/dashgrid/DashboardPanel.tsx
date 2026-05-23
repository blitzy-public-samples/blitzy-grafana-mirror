import { memo, useCallback, useEffect } from 'react';

import { type StoreState, useDispatch, useSelector } from 'app/types/store';

import { initPanelState } from '../../panel/state/actions';
import { setPanelInstanceState } from '../../panel/state/reducers';
import { type DashboardModel } from '../state/DashboardModel';
import { type PanelModel } from '../state/PanelModel';

import { LazyLoader } from './LazyLoader';
import { PanelStateWrapper } from './PanelStateWrapper';

export interface OwnProps {
  panel: PanelModel;
  stateKey: string;
  dashboard: DashboardModel;
  isEditing: boolean;
  isViewing: boolean;
  isDraggable?: boolean;
  width: number;
  height: number;
  lazy?: boolean;
  timezone?: string;
  hideMenu?: boolean;
}

// Preserved selector definition. Although the converted functional component
// performs its own per-field useSelector calls (see DashboardPanelInternal
// below), keeping the selector at module scope lets `Props` continue to be
// derived from its return type, matching the original
// `Props = OwnProps & ConnectedProps<typeof connector>` contract.
const mapStateToProps = (state: StoreState, props: OwnProps) => {
  const panelState = state.panels[props.stateKey];
  if (!panelState) {
    return { plugin: undefined };
  }

  return {
    plugin: panelState.plugin,
    instanceState: panelState.instanceState,
  };
};

type StateProps = ReturnType<typeof mapStateToProps>;

// Preserved dispatch contract — the original `mapDispatchToProps` was an
// object-form binding `{ initPanelState, setPanelInstanceState }`, which the
// `connect` HOC merged into the connected component's props as
// already-dispatch-wrapped action creators. The functional version dispatches
// each action inline, but the `Props` type still surfaces the same shape so
// downstream consumers (e.g. SoloPanelPage.test.tsx's jest mock typed via
// `import { type Props as DashboardPanelProps }`) continue to compile
// unchanged.
interface DispatchProps {
  initPanelState: typeof initPanelState;
  setPanelInstanceState: typeof setPanelInstanceState;
}

// Public API: `Props` retains the same OwnProps + state-slice + dispatch
// shape that the historical `connect(...)`-wrapped class component carried.
// Externally, the memoized `DashboardPanel` only requires `OwnProps` at the
// call site (state and dispatch fields are supplied internally via hooks),
// but the exported type alias remains shape-equivalent for any consumer
// importing it.
export type Props = OwnProps & StateProps & DispatchProps;

// The functional component itself only requires `OwnProps`: state-slice
// values (`plugin`, `instanceState`) and dispatch-bound action creators
// (`initPanelState`, `setPanelInstanceState`) are sourced via hooks below
// rather than being injected as props by `connect`. Consumers therefore
// continue to pass exactly the same OwnProps-shape they did before this
// refactor (see `DashboardGrid.renderPanel`, `SoloPanelPage`, `PanelEditor`).
const DashboardPanelInternal = (props: OwnProps) => {
  const {
    panel,
    stateKey,
    dashboard,
    isEditing,
    isViewing,
    isDraggable = true,
    width,
    height,
    lazy = true,
    timezone,
    hideMenu,
  } = props;

  // Replaces connect(mapStateToProps, ...) — pulls per-panel slice state from
  // the store. The slice may be absent on the very first render (no
  // initPanelState dispatched yet), so we fall back to undefined plugin to
  // preserve the class-component's `if (!panelState) { return { plugin:
  // undefined }; }` behavior.
  const plugin = useSelector((state) => state.panels[stateKey]?.plugin);
  const dispatch = useDispatch();

  // mapDispatchToProps replaced — dispatch wraps the action creators inline.
  // useCallback keeps onInstanceStateChange referentially stable so
  // <PanelStateWrapper /> does not re-render purely from a fresh closure.
  const onInstanceStateChange = useCallback(
    (value: unknown) => {
      dispatch(setPanelInstanceState({ key: stateKey, value }));
    },
    [dispatch, stateKey]
  );

  const onPanelLoad = useCallback(() => {
    if (!plugin) {
      dispatch(initPanelState(panel));
    }
  }, [plugin, panel, dispatch]);

  const onVisibilityChange = useCallback(
    (v: boolean) => {
      panel.isInView = v;
    },
    [panel]
  );

  // componentDidMount equivalent — runs exactly once for the panel's
  // lifetime. The class set panel.isInView = !lazy and conditionally called
  // onPanelLoad() when lazy=false. Empty dep array mirrors mount-only intent.
  useEffect(() => {
    panel.isInView = !lazy;
    if (!lazy) {
      onPanelLoad();
    }
    // mount-only: matches original componentDidMount semantics; subsequent
    // changes to `lazy`/`panel` are not handled by the class either.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderPanel = ({ isInView }: { isInView: boolean }) => {
    if (!plugin) {
      return null;
    }

    return (
      <PanelStateWrapper
        plugin={plugin}
        panel={panel}
        dashboard={dashboard}
        isViewing={isViewing}
        isEditing={isEditing}
        isInView={isInView}
        isDraggable={isDraggable}
        width={width}
        height={height}
        onInstanceStateChange={onInstanceStateChange}
        timezone={timezone}
        hideMenu={hideMenu}
      />
    );
  };

  return lazy ? (
    <LazyLoader width={width} height={height} onChange={onVisibilityChange} onLoad={onPanelLoad}>
      {renderPanel}
    </LazyLoader>
  ) : (
    renderPanel({ isInView: true })
  );
};

// Preserve the original PureComponent shallow-skip optimization: wrap with
// React.memo (default shallowEqual on props). The original
// DashboardPanelUnconnected extended PureComponent specifically because the
// dashboard grid re-renders all panels frequently with identical props for
// off-screen panels — skipping equal-props renders is a measurable savings
// on large dashboards.
export const DashboardPanel = memo(DashboardPanelInternal);

// Preserve the displayName so React DevTools and any test snapshots that
// reference DashboardPanel by name keep working.
DashboardPanel.displayName = 'DashboardPanel';
