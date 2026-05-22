import { memo, useCallback, useEffect } from 'react';

import { useDispatch, useSelector } from 'app/types/store';

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

// Props remains exported under its original name for downstream consumers and
// existing tests (PanelStateWrapper compositions referenced this type alias).
export type Props = OwnProps;

const DashboardPanelInternal = (props: Props) => {
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
