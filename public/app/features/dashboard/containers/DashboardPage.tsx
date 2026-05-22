import { css, cx } from '@emotion/css';
import * as React from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type GrafanaTheme2,
  type NavModel,
  type NavModelItem,
  type TimeRange,
  PageLayoutType,
  locationUtil,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { locationService } from '@grafana/runtime';
import { type Themeable2, useTheme2 } from '@grafana/ui';
import { type ScrollRefElement } from 'app/core/components/NativeScrollbar';
import { Page } from 'app/core/components/Page/Page';
import { useGrafana } from 'app/core/context/GrafanaContext';
import { createErrorNotification } from 'app/core/copy/appNotification';
import { getKioskMode } from 'app/core/navigation/kiosk';
import { type GrafanaRouteComponentProps } from 'app/core/navigation/types';
import { notifyApp } from 'app/core/reducers/appNotification';
import { ID_PREFIX } from 'app/core/reducers/navBarTree';
import { getNavModel } from 'app/core/selectors/navModel';
import { type PanelModel } from 'app/features/dashboard/state/PanelModel';
import { dashboardWatcher } from 'app/features/live/dashboard/dashboardWatcher';
import { KioskMode } from 'app/types/dashboard';
import { PanelEditEnteredEvent, PanelEditExitedEvent } from 'app/types/events';
import { type StoreState, useDispatch, useSelector } from 'app/types/store';

import { cancelVariables, templateVarsChangedInUrl } from '../../variables/state/actions';
import { findTemplateVarChanges } from '../../variables/utils';
import DashNav from '../components/DashNav/DashNav';
import { DashboardLoading } from '../components/DashboardLoading/DashboardLoading';
import { DashboardPrompt } from '../components/DashboardPrompt/DashboardPrompt';
import { DashboardSettings } from '../components/DashboardSettings/DashboardSettings';
import { PanelInspector } from '../components/Inspector/PanelInspector';
import { PanelEditor } from '../components/PanelEditor/PanelEditor';
import { ShareModal } from '../components/ShareModal/ShareModal';
import { SubMenu } from '../components/SubMenu/SubMenu';
import { DashboardGrid } from '../dashgrid/DashboardGrid';
import { liveTimer } from '../dashgrid/liveTimer';
import { getTimeSrv } from '../services/TimeSrv';
import { cleanUpDashboardAndVariables } from '../state/actions';
import { initDashboard } from '../state/initDashboard';

import { DashboardPageError } from './DashboardPageError';
import { type DashboardPageRouteParams, type DashboardPageRouteSearchParams } from './types';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Selector and dispatch action shapes — preserved as exports because the
// colocated test (DashboardPage.test.tsx) and the original `connect()`
// wiring both relied on these names. The redux wiring is now performed by
// the connected wrapper `DashboardPage` below via `useSelector`/`useDispatch`.
export const mapStateToProps = (state: StoreState) => ({
  initPhase: state.dashboard.initPhase,
  initError: state.dashboard.initError,
  dashboard: state.dashboard.getModel(),
  navIndex: state.navIndex,
});

const mapDispatchToProps = {
  initDashboard,
  cleanUpDashboardAndVariables,
  notifyApp,
  cancelVariables,
  templateVarsChangedInUrl,
};

export type DashboardPageParams = { slug: string; uid: string; type: string; accessToken: string };

// Reconstructs the original `Themeable2 & ConnectedProps<typeof connector>` shape
// so the inner pure component `UnthemedDashboardPage` retains the same exported
// Props type that the colocated unit test consumes when rendering it directly
// with synthetic props (bypassing the connected wrapper).
type ConnectedStateProps = ReturnType<typeof mapStateToProps>;
type ConnectedDispatchProps = typeof mapDispatchToProps;
export type Props = Themeable2 &
  ConnectedStateProps &
  ConnectedDispatchProps &
  Omit<GrafanaRouteComponentProps<DashboardPageRouteParams, DashboardPageRouteSearchParams>, 'match'> & {
    // The params returned from useParams are all optional, so we match that type here
    params: Partial<DashboardPageParams>;
  };

// Route state shape consumed by the dashboard page for cross-route reloads
// (see DashboardScenePage and useDashboardRestore for the producers).
interface DashboardRouteState {
  routeReloadCounter?: number;
}

const isDashboardRouteState = (s: unknown): s is DashboardRouteState =>
  typeof s === 'object' && s !== null;

export interface State {
  editPanel: PanelModel | null;
  viewPanel: PanelModel | null;
  editView: string | null;
  updateScrollTop?: number;
  rememberScrollTop?: number;
  showLoadingState: boolean;
  panelNotFound: boolean;
  editPanelAccessDenied: boolean;
  scrollElement?: ScrollRefElement;
  pageNav?: NavModelItem;
  sectionNav?: NavModel;
}

const initialState = (): State => ({
  editView: null,
  editPanel: null,
  viewPanel: null,
  showLoadingState: false,
  panelNotFound: false,
  editPanelAccessDenied: false,
});

const getStyles = (theme: GrafanaTheme2) => ({
  fullScreenPanel: css({
    '.react-grid-layout': {
      height: 'auto !important',
      // eslint-disable-next-line @grafana/no-unreduced-motion
      transitionProperty: 'none',
    },
    '.react-grid-item': {
      display: 'none !important',
      // eslint-disable-next-line @grafana/no-unreduced-motion
      transitionProperty: 'none !important',

      '&--fullscreen': {
        display: 'block !important',
        // can't avoid type assertion here due to !important
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        position: 'unset !important' as 'unset',
        transform: 'translate(0px, 0px) !important',
      },
    },

    // Disable grid interaction indicators in fullscreen panels
    '.panel-header:hover': {
      backgroundColor: 'inherit',
    },

    '.panel-title-container': {
      cursor: 'pointer',
    },

    '.react-resizable-handle': {
      display: 'none',
    },
  }),
});

/**
 * Inner pure functional component — mirrors the previous `UnthemedDashboardPage`
 * class. Accepts all redux state, dispatch and theme as props so the colocated
 * unit test can render it directly with synthetic props (bypassing the connected
 * wrapper). The connected wrapper `DashboardPage` (default export below) supplies
 * the redux state, dispatch-bound action creators and theme via `useSelector` /
 * `useDispatch` / `useTheme2`.
 *
 * Lifecycle equivalents:
 *   - constructor + property initializers  → useState, useRef, useContext
 *   - componentDidMount                    → mount-only useEffect (deps=[])
 *   - componentWillUnmount                 → cleanup of mount-only useEffect
 *   - getDerivedStateFromProps             → useEffect on URL/dashboard/navIndex
 *   - componentDidUpdate (uid/route)       → useEffect on params.uid + location.state
 *   - componentDidUpdate (location.search) → useEffect on location.search
 *   - componentDidUpdate (state diffs)     → useEffect on relevant state fields
 *
 * `React.memo` preserves the previous `PureComponent` shallow-skip behavior so
 * that referentially-stable props (which is exactly what the connected wrapper
 * provides via memoized selectors and `useMemo`-bound action creators) do not
 * cause unnecessary re-renders.
 */
export const UnthemedDashboardPage = memo(function UnthemedDashboardPage(props: Props) {
  const grafanaContext = useGrafana();

  const [state, setState] = useState<State>(initialState);

  // Equivalent of the class instance property `private forceRouteReloadCounter = 0;`.
  // Used to detect cross-route navigations that explicitly request a dashboard reload
  // via `location.state.routeReloadCounter` (see useDashboardRestore producer).
  const forceRouteReloadCounterRef = useRef<number>(0);

  // Latest props ref — lets the mount-only effect's cleanup (`componentWillUnmount`
  // equivalent) call `cleanUpDashboardAndVariables` without depending on the unstable
  // closure of the action creator.
  const propsRef = useRef(props);
  propsRef.current = props;

  // Refs tracking previous props/state so the `componentDidUpdate` equivalent
  // effects can detect transitions exactly like the class lifecycle did.
  const prevPropsRef = useRef<Props | null>(null);
  const prevStateRef = useRef<State>(state);

  // `updateLiveTimer` (class arrow method) — stable across renders via `useCallback`
  // and reads the latest dashboard through `propsRef` to avoid stale closures.
  const updateLiveTimer = useCallback(() => {
    let tr: TimeRange | undefined = undefined;
    if (propsRef.current.dashboard?.liveNow) {
      tr = getTimeSrv().timeRange();
    }
    liveTimer.setLiveTimeRange(tr);
  }, []);

  // `closeDashboard` (class method) — reset state to clean defaults and dispatch
  // the redux cleanup. Stable identity because the dispatch reference from the
  // connected wrapper is memoized.
  const closeDashboard = useCallback(() => {
    propsRef.current.cleanUpDashboardAndVariables();
    setState(initialState());
  }, []);

  // `initDashboard` (class method) — closes any current dashboard, then dispatches
  // the redux `initDashboard` thunk with the URL/route parameters and the GrafanaContext
  // keybinding service. Reads from `propsRef` so its identity stays stable across renders.
  const initDashboardCall = useCallback(() => {
    const currentProps = propsRef.current;
    const { dashboard, params, queryParams, route } = currentProps;

    if (dashboard) {
      closeDashboard();
    }

    currentProps.initDashboard({
      urlSlug: params.slug,
      urlUid: params.uid,
      urlType: params.type,
      urlFolderUid: queryParams.folderUid,
      panelType: queryParams.panelType,
      routeName: route.routeName,
      fixUrl: true,
      accessToken: params.accessToken,
      keybindingSrv: grafanaContext.keybindings,
    });

    // small delay to start live updates
    setTimeout(updateLiveTimer, 250);
  }, [closeDashboard, grafanaContext.keybindings, updateLiveTimer]);

  // componentDidMount + componentWillUnmount
  // The class invoked `initDashboard()` and seeded `forceRouteReloadCounter` from
  // `location.state.routeReloadCounter` on mount; `componentWillUnmount` invoked
  // `closeDashboard()`. We replicate both with a mount-only effect whose cleanup
  // closes over `propsRef.current` to call the latest `cleanUpDashboardAndVariables`.
  useEffect(() => {
    initDashboardCall();
    forceRouteReloadCounterRef.current = isDashboardRouteState(propsRef.current.location.state)
      ? propsRef.current.location.state.routeReloadCounter || 0
      : 0;

    return () => {
      // componentWillUnmount equivalent — must use propsRef so unmount during
      // a stale closure still dispatches the current dispatch-bound cleanup.
      propsRef.current.cleanUpDashboardAndVariables();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only effect; initDashboardCall captured via propsRef intentionally
  }, []);

  // componentDidUpdate (uid / routeReloadCounter branch)
  // Detect dashboard uid changes or an explicit cross-route reload signal and
  // restart the initialization flow. Mirrors the early-return branch in the
  // class's `componentDidUpdate`.
  useEffect(() => {
    const prevProps = prevPropsRef.current;
    if (prevProps === null) {
      // First effect run (post-mount). Skip diffing — initDashboard was already
      // invoked by the mount-only effect above.
      return;
    }

    const { dashboard, params } = props;
    if (!dashboard) {
      return;
    }

    const routeReloadCounter = isDashboardRouteState(props.location.state)
      ? props.location.state.routeReloadCounter
      : undefined;

    if (
      prevProps.params.uid !== params.uid ||
      (routeReloadCounter !== undefined && forceRouteReloadCounterRef.current !== routeReloadCounter)
    ) {
      initDashboardCall();
      forceRouteReloadCounterRef.current = routeReloadCounter ?? 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prevPropsRef + propsRef pattern; effect intentionally fires whenever uid or route state changes
  }, [props.params.uid, props.location.state, props.dashboard]);

  // componentDidUpdate (location.search branch)
  // When the URL search string changes, propagate time-range / refresh / template
  // variable updates to the supporting services, exactly like the class did.
  useEffect(() => {
    const prevProps = prevPropsRef.current;
    if (prevProps === null) {
      return;
    }

    const { dashboard, templateVarsChangedInUrl } = props;
    if (!dashboard) {
      return;
    }

    if (prevProps.location.search === props.location.search) {
      return;
    }

    const prevUrlParams = prevProps.queryParams;
    const urlParams = props.queryParams;

    if (urlParams?.from !== prevUrlParams?.from || urlParams?.to !== prevUrlParams?.to) {
      getTimeSrv().updateTimeRangeFromUrl();
      updateLiveTimer();
    }

    if (!prevUrlParams?.refresh && urlParams?.refresh) {
      getTimeSrv().setAutoRefresh(urlParams.refresh);
    }

    const templateVarChanges = findTemplateVarChanges(props.queryParams, prevProps.queryParams);

    if (templateVarChanges) {
      templateVarsChangedInUrl(dashboard.uid, templateVarChanges);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrow deps to location.search to match the class's `prevProps.location.search !== this.props.location.search` guard
  }, [props.location.search, props.dashboard]);

  // getDerivedStateFromProps equivalent
  // Derive editPanel / viewPanel / editView from the URL and dashboard, mirroring
  // the class's `static getDerivedStateFromProps`. Side effects that the class ran
  // inside gDSFP (`dashboard.initViewPanel` / `dashboard.exitViewPanel`) are
  // preserved here — moving them out of gDSFP into a post-commit effect is the
  // React-recommended migration path and the colocated unit test uses `waitFor`,
  // so the eventual state matches.
  useEffect(() => {
    const { dashboard, queryParams } = props;

    if (!dashboard) {
      return;
    }

    setState((prevS) => {
      const urlEditPanelId = queryParams.editPanel;
      const urlViewPanelId = queryParams.viewPanel;
      const urlEditView = queryParams.editview;

      const updatedState: State = { ...prevS };
      let mutated = false;

      // Entering settings view
      if (!prevS.editView && urlEditView) {
        updatedState.editView = urlEditView;
        updatedState.rememberScrollTop = prevS.scrollElement?.scrollTop;
        updatedState.updateScrollTop = 0;
        mutated = true;
      } else if (prevS.editView && !urlEditView) {
        // Leaving settings view
        updatedState.updateScrollTop = prevS.rememberScrollTop;
        updatedState.editView = null;
        mutated = true;
      }

      // Entering edit mode
      if (!prevS.editPanel && urlEditPanelId) {
        const panel = dashboard.getPanelByUrlId(urlEditPanelId);
        if (panel) {
          if (dashboard.canEditPanel(panel)) {
            updatedState.editPanel = panel;
            updatedState.rememberScrollTop = prevS.scrollElement?.scrollTop;
          } else {
            updatedState.editPanelAccessDenied = true;
          }
        } else {
          updatedState.panelNotFound = true;
        }
        mutated = true;
      } else if (prevS.editPanel && !urlEditPanelId) {
        // Leaving edit mode
        updatedState.editPanel = null;
        updatedState.updateScrollTop = prevS.rememberScrollTop;
        mutated = true;
      }

      // Entering view mode
      if (!prevS.viewPanel && urlViewPanelId) {
        const panel = dashboard.getPanelByUrlId(urlViewPanelId);
        if (panel) {
          // Side effect retained from the class's static gDSFP — sets
          // `dashboard.panelInView` and `panel.isViewing = true`.
          dashboard.initViewPanel(panel);
          updatedState.viewPanel = panel;
          updatedState.rememberScrollTop = prevS.scrollElement?.scrollTop;
          updatedState.updateScrollTop = 0;
        } else {
          updatedState.panelNotFound = true;
        }
        mutated = true;
      } else if (prevS.viewPanel && !urlViewPanelId) {
        // Leaving view mode — side effect retained from class gDSFP.
        dashboard.exitViewPanel(prevS.viewPanel);
        updatedState.viewPanel = null;
        updatedState.updateScrollTop = prevS.rememberScrollTop;
        mutated = true;
      }

      // if we removed url edit state, clear any panel not found state
      if (prevS.panelNotFound || (prevS.editPanelAccessDenied && !urlEditPanelId)) {
        updatedState.panelNotFound = false;
        updatedState.editPanelAccessDenied = false;
        mutated = true;
      }

      const baseState = mutated ? updatedState : prevS;
      const nextState = updateStatePageNavFromProps(props, baseState);

      // Avoid an extra render if neither the URL-derived state nor pageNav changed.
      // `updateStatePageNavFromProps` already short-circuits to its input when
      // pageNav/sectionNav are unchanged, so reference-equality with `prevS` is
      // sufficient here.
      return nextState === prevS ? prevS : nextState;
    });
    // We intentionally narrow deps to the inputs gDSFP read in the class.
    // navIndex and dashboard.title/folderUrl drive pageNav recomputation, and
    // queryParams.editPanel/viewPanel/editview drive the panel state transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps match gDSFP's read set; props.dashboard is included for title/folder-url propagation
  }, [
    props.dashboard,
    props.queryParams.editPanel,
    props.queryParams.viewPanel,
    props.queryParams.editview,
    props.navIndex,
    props.location,
  ]);

  // componentDidUpdate (editPanel transition + notifications + scroll)
  // Replaces the bottom half of the class's `componentDidUpdate`: publish edit
  // enter/exit events, surface error notifications, and apply scroll position
  // updates. We watch only the state fields that drive these effects so this
  // doesn't fire spuriously on unrelated prop changes.
  useEffect(() => {
    const prevState = prevStateRef.current;
    const { dashboard, notifyApp } = props;

    // entering edit mode
    if (state.editPanel && !prevState.editPanel) {
      dashboardWatcher.setEditingState(true);
      dashboard?.events.publish(new PanelEditEnteredEvent(state.editPanel.id));
    }

    // leaving edit mode
    if (!state.editPanel && prevState.editPanel) {
      dashboardWatcher.setEditingState(false);
      dashboard?.events.publish(new PanelEditExitedEvent(prevState.editPanel.id));
    }

    if (state.editPanelAccessDenied) {
      notifyApp(createErrorNotification('Permission to edit panel denied'));
      locationService.partial({ editPanel: null });
    }

    if (state.panelNotFound) {
      notifyApp(createErrorNotification(`Panel not found`));
      locationService.partial({ editPanel: null, viewPanel: null });
    }

    // Update window scroll position
    if (state.updateScrollTop !== undefined && state.updateScrollTop !== prevState.updateScrollTop) {
      state.scrollElement?.scrollTo(0, state.updateScrollTop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrow; matches the class's cDU branches that fire on state transitions
  }, [
    state.editPanel,
    state.editPanelAccessDenied,
    state.panelNotFound,
    state.updateScrollTop,
    state.scrollElement,
  ]);

  // Refresh `prevPropsRef` / `prevStateRef` *after* every effect above has had a
  // chance to read them. By using a final useEffect with no deps array we are
  // guaranteed to run after the rest of the effects for this commit.
  useEffect(() => {
    prevPropsRef.current = props;
    prevStateRef.current = state;
  });

  const setScrollRef = useCallback((scrollElement: ScrollRefElement) => {
    setState((prev) => (prev.scrollElement === scrollElement ? prev : { ...prev, scrollElement }));
  }, []);

  const onCloseShareModal = useCallback(() => {
    locationService.partial({ shareView: null });
  }, []);

  // Render
  const { dashboard, initError, queryParams, theme, params } = props;

  const { editPanel, viewPanel, pageNav, sectionNav } = state;
  const kioskMode = getKioskMode(props.queryParams);
  const styles = getStyles(theme);

  if (!dashboard || !pageNav || !sectionNav) {
    return <DashboardLoading initPhase={props.initPhase} />;
  }

  const inspectPanel = (() => {
    const inspectPanelId = queryParams.inspect;
    if (!inspectPanelId) {
      return null;
    }
    const panel = dashboard.getPanelById(parseInt(inspectPanelId, 10));
    // cannot inspect panels if plugin is not already loaded
    return panel ?? null;
  })();

  const showSubMenu = !editPanel && !kioskMode && !props.queryParams.editview && dashboard.isSubMenuVisible();
  const showToolbar = kioskMode !== KioskMode.Full && !queryParams.editview && !initError;

  const pageClassName = cx({
    [styles.fullScreenPanel]: Boolean(viewPanel),
    'page-hidden': Boolean(queryParams.editview || editPanel),
  });

  return (
    <>
      <Page
        navModel={sectionNav}
        pageNav={pageNav}
        layout={PageLayoutType.Canvas}
        className={pageClassName}
        onSetScrollRef={setScrollRef}
      >
        {showToolbar && (
          <header data-testid={selectors.pages.Dashboard.DashNav.navV2}>
            <DashNav
              dashboard={dashboard}
              title={dashboard.title}
              folderTitle={dashboard.meta.folderTitle}
              isFullscreen={!!viewPanel}
              kioskMode={kioskMode}
              hideTimePicker={dashboard.timepicker.hidden}
            />
          </header>
        )}
        <DashboardPrompt dashboard={dashboard} />
        {initError && <DashboardPageError error={initError.error} type={params.type} />}
        {showSubMenu && (
          <section aria-label={selectors.pages.Dashboard.SubMenu.submenu}>
            <SubMenu dashboard={dashboard} annotations={dashboard.annotations.list} links={dashboard.links} />
          </section>
        )}
        {!initError && (
          <DashboardGrid
            dashboard={dashboard}
            isEditable={!!dashboard.meta.canEdit}
            viewPanel={viewPanel}
            editPanel={editPanel}
          />
        )}

        {inspectPanel && <PanelInspector dashboard={dashboard} panel={inspectPanel} />}
        {queryParams.shareView && (
          <ShareModal dashboard={dashboard} onDismiss={onCloseShareModal} activeTab={queryParams.shareView} />
        )}
      </Page>
      {editPanel && (
        <PanelEditor
          dashboard={dashboard}
          sourcePanel={editPanel}
          tab={props.queryParams.tab}
          sectionNav={sectionNav}
          pageNav={pageNav}
        />
      )}
      {queryParams.editview && (
        <DashboardSettings
          dashboard={dashboard}
          editview={queryParams.editview}
          pageNav={pageNav}
          sectionNav={sectionNav}
        />
      )}
    </>
  );
});

UnthemedDashboardPage.displayName = 'UnthemedDashboardPage';

function updateStatePageNavFromProps(props: Props, state: State): State {
  const { dashboard, navIndex } = props;

  if (!dashboard) {
    return state;
  }

  let pageNav = state.pageNav;
  let sectionNav = state.sectionNav;

  if (!pageNav || dashboard.title !== pageNav.text || dashboard.meta.folderUrl !== pageNav.parentItem?.url) {
    pageNav = {
      text: dashboard.title,
      url: locationUtil.getUrlForPartial(props.location, {
        editview: null,
        editPanel: null,
        viewPanel: null,
      }),
    };
  }

  sectionNav = getNavModel(props.navIndex, ID_PREFIX + dashboard.uid, getNavModel(props.navIndex, 'dashboards/browse'));

  const { folderUid } = dashboard.meta;
  if (folderUid && pageNav && sectionNav.main.id !== 'starred') {
    const folderNavModel = getNavModel(navIndex, `folder-dashboards-${folderUid}`).main;
    // If the folder hasn't loaded (maybe user doesn't have permission on it?) then
    // don't show the "page not found" breadcrumb
    if (folderNavModel.id !== 'not-found') {
      pageNav = {
        ...pageNav,
        parentItem: folderNavModel,
      };
    }
  }

  if (state.editPanel || state.viewPanel) {
    pageNav = {
      ...pageNav,
      text: `${state.editPanel ? 'Edit' : 'View'} panel`,
      parentItem: pageNav,
      url: undefined,
    };
  }

  if (state.pageNav === pageNav && state.sectionNav === sectionNav) {
    return state;
  }

  return {
    ...state,
    pageNav,
    sectionNav,
  };
}

/**
 * Connected wrapper — supplies redux state, dispatch-bound action creators and
 * the theme to the inner pure component. Replaces the previous
 * `withTheme2(UnthemedDashboardPage)` + `connect(mapStateToProps, mapDispatchToProps)`
 * HOC chain with hooks per AAP §0.9.2.5. The named export and the default export
 * surface remain backward-compatible for `DashboardPageProxy` and the existing
 * route registrations.
 */
type OwnProps = Omit<
  GrafanaRouteComponentProps<DashboardPageRouteParams, DashboardPageRouteSearchParams>,
  'match'
> & { params: Partial<DashboardPageParams> };

const ConnectedDashboardPage: React.FC<OwnProps> = (ownProps) => {
  const theme = useTheme2();
  const initPhase = useSelector((state: StoreState) => state.dashboard.initPhase);
  const initError = useSelector((state: StoreState) => state.dashboard.initError);
  const dashboard = useSelector((state: StoreState) => state.dashboard.getModel());
  const navIndex = useSelector((state: StoreState) => state.navIndex);
  const dispatch = useDispatch();

  // Memoized dispatch-bound action creators — equivalent to the bound action
  // creators that `connect()` previously produced from the object-form
  // `mapDispatchToProps`. Stable identity across renders keeps `UnthemedDashboardPage`
  // (a `React.memo` component) from re-rendering unnecessarily.
  const boundDispatch = useMemo(
    () => ({
      initDashboard: (args: Parameters<typeof initDashboard>[0]) => dispatch(initDashboard(args)),
      cleanUpDashboardAndVariables: () => dispatch(cleanUpDashboardAndVariables()),
      notifyApp: (notif: Parameters<typeof notifyApp>[0]) => dispatch(notifyApp(notif)),
      cancelVariables: (key: Parameters<typeof cancelVariables>[0], opts?: Parameters<typeof cancelVariables>[1]) =>
        dispatch(cancelVariables(key, opts)),
      templateVarsChangedInUrl: (
        uid: Parameters<typeof templateVarsChangedInUrl>[0],
        vars: Parameters<typeof templateVarsChangedInUrl>[1]
      ) => dispatch(templateVarsChangedInUrl(uid, vars)),
    }),
    [dispatch]
  );

  // The bound actions exposed through `Props` keep the same call shape as the
  // original action-creator imports (the unbound versions referenced in `mapDispatchToProps`),
  // matching the structural `typeof initDashboard` etc. types in `ConnectedDispatchProps`.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- bound dispatch wrappers preserve call-site shape; widening to match `typeof <actionCreator>` is structurally safe
  const dispatchProps = boundDispatch as unknown as ConnectedDispatchProps;

  return (
    <UnthemedDashboardPage
      {...ownProps}
      theme={theme}
      initPhase={initPhase}
      initError={initError}
      dashboard={dashboard}
      navIndex={navIndex}
      {...dispatchProps}
    />
  );
};

export const DashboardPage = ConnectedDashboardPage;
DashboardPage.displayName = 'DashboardPage';

export default DashboardPage;
