import { css, cx } from '@emotion/css';
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { shallowEqual } from 'react-redux';

import {
  type NavIndex,
  type NavModel,
  type NavModelItem,
  type TimeRange,
  PageLayoutType,
  locationUtil,
  type GrafanaTheme2,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { locationService } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { type ScrollRefElement } from 'app/core/components/NativeScrollbar';
import { Page } from 'app/core/components/Page/Page';
import { useGrafana } from 'app/core/context/GrafanaContext';
import { createErrorNotification } from 'app/core/copy/appNotification';
import { getKioskMode } from 'app/core/navigation/kiosk';
import { type GrafanaRouteComponentProps } from 'app/core/navigation/types';
import { notifyApp } from 'app/core/reducers/appNotification';
import { ID_PREFIX } from 'app/core/reducers/navBarTree';
import { getNavModel } from 'app/core/selectors/navModel';
import { type DashboardModel } from 'app/features/dashboard/state/DashboardModel';
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

type OwnProps = Omit<GrafanaRouteComponentProps<DashboardPageRouteParams, DashboardPageRouteSearchParams>, 'match'> & {
  // The params returned from useParams are all optional, so we need to match that type here
  params: Partial<DashboardPageParams>;
};

type StateProps = ReturnType<typeof mapStateToProps>;

// Each action creator is wrapped by `dispatch` in the connected component. Only the
// call signature is preserved; the return type is intentionally `unknown` because it
// varies (void for thunks, action object for plain creators) and the consumer
// never reads the return value.
type DispatchProps = {
  [K in keyof typeof mapDispatchToProps]: (...args: Parameters<(typeof mapDispatchToProps)[K]>) => unknown;
};

export type Props = OwnProps & StateProps & DispatchProps & { theme: GrafanaTheme2 };

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

interface PanelStateReducerState {
  editPanel: PanelModel | null;
  viewPanel: PanelModel | null;
  editView: string | null;
  updateScrollTop?: number;
  rememberScrollTop?: number;
  showLoadingState: boolean;
  panelNotFound: boolean;
  editPanelAccessDenied: boolean;
}

const initialPanelState: PanelStateReducerState = {
  editView: null,
  editPanel: null,
  viewPanel: null,
  showLoadingState: false,
  panelNotFound: false,
  editPanelAccessDenied: false,
};

type PanelStateAction = { type: 'reset' } | { type: 'patch'; patch: Partial<PanelStateReducerState> };

function panelStateReducer(state: PanelStateReducerState, action: PanelStateAction): PanelStateReducerState {
  switch (action.type) {
    case 'reset':
      return initialPanelState;
    case 'patch':
      return { ...state, ...action.patch };
  }
}

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

// Type-safe accessor for react-router-5 history Location.state.routeReloadCounter.
// Replaces the legacy `(location.state as any)?.routeReloadCounter` cast with
// explicit narrowing of an unknown value. Uses only TypeScript narrowing (no
// `as` casts) so it complies with the `@typescript-eslint/consistent-type-assertions`
// rule (assertionStyle: 'never').
function getRouteReloadCounter(state: unknown): number | undefined {
  if (!state || typeof state !== 'object') {
    return undefined;
  }
  if (!('routeReloadCounter' in state)) {
    return undefined;
  }
  const value = state.routeReloadCounter;
  return typeof value === 'number' ? value : undefined;
}

// Mirrors the class's updateLiveTimer instance method; reads the latest dashboard
// from a ref captured by the caller so behavior matches `this.props.dashboard`
// access at setTimeout fire time.
function updateLiveTimerForDashboard(dashboard: DashboardModel | null | undefined) {
  let tr: TimeRange | undefined = undefined;
  if (dashboard?.liveNow) {
    tr = getTimeSrv().timeRange();
  }
  liveTimer.setLiveTimeRange(tr);
}

// Pure derivation of pageNav and sectionNav from props + panel state. Equivalent
// to the legacy `updateStatePageNavFromProps` function but no longer returns a
// state object; instead it returns the two nav values directly for consumption
// by `useMemo` in the component.
function computePageAndSectionNav(
  dashboard: DashboardModel,
  navIndex: NavIndex,
  location: GrafanaRouteComponentProps['location'],
  editPanel: PanelModel | null,
  viewPanel: PanelModel | null
): { pageNav: NavModelItem; sectionNav: NavModel } {
  let pageNav: NavModelItem = {
    text: dashboard.title,
    url: locationUtil.getUrlForPartial(location, {
      editview: null,
      editPanel: null,
      viewPanel: null,
    }),
  };

  const sectionNav = getNavModel(navIndex, ID_PREFIX + dashboard.uid, getNavModel(navIndex, 'dashboards/browse'));

  const { folderUid } = dashboard.meta;
  if (folderUid && sectionNav.main.id !== 'starred') {
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

  if (editPanel || viewPanel) {
    pageNav = {
      ...pageNav,
      text: `${editPanel ? 'Edit' : 'View'} panel`,
      parentItem: pageNav,
      url: undefined,
    };
  }

  return { pageNav, sectionNav };
}

export const UnthemedDashboardPage = memo((props: Props) => {
  // Destructure props. Dispatch creators are aliased with a `Prop` suffix to avoid
  // shadowing the module-level imported action creators of the same name (which are
  // used by the default-export wrapper below). Only the dispatch creators actually
  // consumed inside this component's body are destructured here; `initDashboard` and
  // `cleanUpDashboardAndVariables` are read from `latestPropsRef.current` inside the
  // init effect, and `cancelVariables` is not consumed in the body at all.
  const {
    dashboard,
    initError,
    queryParams,
    theme,
    params,
    location,
    navIndex,
    initPhase,
    notifyApp: notifyAppProp,
    templateVarsChangedInUrl: templateVarsChangedInUrlProp,
  } = props;

  const grafanaContext = useGrafana();

  const styles = useMemo(() => getStyles(theme), [theme]);

  const [panelState, dispatchPanelState] = useReducer(panelStateReducer, initialPanelState);
  const { editPanel, viewPanel, updateScrollTop, panelNotFound, editPanelAccessDenied } = panelState;

  const [scrollElement, setScrollElement] = useState<ScrollRefElement | undefined>(undefined);

  // Latest props snapshot, used by the init effect (which intentionally re-runs only
  // on params.uid or routeReloadCounter changes) so it can read the freshest field
  // values without including them all as dependencies (which would trigger spurious
  // re-inits and diverge from the class's componentDidUpdate gate).
  const latestPropsRef = useRef<Props>(props);
  useEffect(() => {
    latestPropsRef.current = props;
  });

  // Latest dashboard, used by the setTimeout updateLiveTimer callback.
  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  });

  // Latest panel state, used inside the URL-derived-state effect so the effect's
  // dependency array can stay minimal (depending on URL params + dashboard only,
  // matching the class's getDerivedStateFromProps inputs).
  const panelStateRef = useRef(panelState);
  useEffect(() => {
    panelStateRef.current = panelState;
  });

  // Latest scroll element, used inside the URL-derived-state effect when capturing
  // the remember-scroll-top value at edit/view mode entry.
  const scrollElementRef = useRef(scrollElement);
  useEffect(() => {
    scrollElementRef.current = scrollElement;
  });

  // Compute routeReloadCounter from the (untyped) history Location.state via a
  // narrowing helper. Replaces the legacy `(location.state as any)?.routeReloadCounter`
  // cast with type-safe narrowing.
  const routeReloadCounter = getRouteReloadCounter(location.state);

  // Mount: init the dashboard. Re-init when params.uid or routeReloadCounter changes.
  // The cleanup function runs both on unmount and before each re-init (when deps
  // change), mirroring the class's `if (dashboard) this.closeDashboard();`
  // behavior inside `initDashboard()`.
  useEffect(() => {
    const currentProps = latestPropsRef.current;

    currentProps.initDashboard({
      urlSlug: currentProps.params.slug,
      urlUid: currentProps.params.uid,
      urlType: currentProps.params.type,
      urlFolderUid: currentProps.queryParams.folderUid,
      panelType: currentProps.queryParams.panelType,
      routeName: currentProps.route.routeName,
      fixUrl: true,
      accessToken: currentProps.params.accessToken,
      keybindingSrv: grafanaContext.keybindings,
    });

    // small delay to start live updates
    setTimeout(() => updateLiveTimerForDashboard(dashboardRef.current), 250);

    return () => {
      currentProps.cleanUpDashboardAndVariables();
      dispatchPanelState({ type: 'reset' });
    };
  }, [params.uid, routeReloadCounter, grafanaContext]);

  // URL search-change effect (replaces componentDidUpdate's
  // `prevProps.location.search !== this.props.location.search` branch).
  const prevSearchRef = useRef(location.search);
  const prevQueryParamsRef = useRef(queryParams);

  useEffect(() => {
    if (location.search === prevSearchRef.current) {
      // No actual change (initial run or unchanged); just sync refs
      prevSearchRef.current = location.search;
      prevQueryParamsRef.current = queryParams;
      return;
    }

    if (!dashboard) {
      prevSearchRef.current = location.search;
      prevQueryParamsRef.current = queryParams;
      return;
    }

    const prevUrlParams = prevQueryParamsRef.current;
    const urlParams = queryParams;

    if (urlParams?.from !== prevUrlParams?.from || urlParams?.to !== prevUrlParams?.to) {
      getTimeSrv().updateTimeRangeFromUrl();
      updateLiveTimerForDashboard(dashboard);
    }

    if (!prevUrlParams?.refresh && urlParams?.refresh) {
      getTimeSrv().setAutoRefresh(urlParams.refresh);
    }

    const templateVarChanges = findTemplateVarChanges(urlParams, prevUrlParams);
    if (templateVarChanges) {
      templateVarsChangedInUrlProp(dashboard.uid, templateVarChanges);
    }

    prevSearchRef.current = location.search;
    prevQueryParamsRef.current = queryParams;
  }, [location.search, dashboard, queryParams, templateVarsChangedInUrlProp]);

  // URL-derived panel-state effect (replaces static getDerivedStateFromProps).
  // The two side-effect calls (`dashboard.initViewPanel(panel)` and
  // `dashboard.exitViewPanel(state.viewPanel)`) now run after commit instead of
  // during render. Tests already use `waitFor` for the resulting state changes,
  // so the one-render delay is transparent.
  useEffect(() => {
    if (!dashboard) {
      return;
    }

    const state = panelStateRef.current;
    const urlEditPanelId = queryParams.editPanel;
    const urlViewPanelId = queryParams.viewPanel;
    const urlEditView = queryParams.editview;
    const currentScrollTop = scrollElementRef.current?.scrollTop;

    const updates: Partial<PanelStateReducerState> = {};

    // Entering settings view
    if (!state.editView && urlEditView) {
      updates.editView = urlEditView;
      updates.rememberScrollTop = currentScrollTop;
      updates.updateScrollTop = 0;
    }
    // Leaving settings view
    else if (state.editView && !urlEditView) {
      updates.updateScrollTop = state.rememberScrollTop;
      updates.editView = null;
    }

    // Entering edit mode
    if (!state.editPanel && urlEditPanelId) {
      const panel = dashboard.getPanelByUrlId(urlEditPanelId);
      if (panel) {
        if (dashboard.canEditPanel(panel)) {
          updates.editPanel = panel;
          updates.rememberScrollTop = currentScrollTop;
        } else {
          updates.editPanelAccessDenied = true;
        }
      } else {
        updates.panelNotFound = true;
      }
    }
    // Leaving edit mode
    else if (state.editPanel && !urlEditPanelId) {
      updates.editPanel = null;
      updates.updateScrollTop = state.rememberScrollTop;
    }

    // Entering view mode
    if (!state.viewPanel && urlViewPanelId) {
      const panel = dashboard.getPanelByUrlId(urlViewPanelId);
      if (panel) {
        // This mutable state feels wrong to have in derived-state logic
        // Should move this state out of dashboard in the future
        dashboard.initViewPanel(panel);
        updates.viewPanel = panel;
        updates.rememberScrollTop = currentScrollTop;
        updates.updateScrollTop = 0;
      } else {
        updates.panelNotFound = true;
      }
    }
    // Leaving view mode
    else if (state.viewPanel && !urlViewPanelId) {
      // This mutable state feels wrong to have in derived-state logic
      // Should move this state out of dashboard in the future
      dashboard.exitViewPanel(state.viewPanel);
      updates.viewPanel = null;
      updates.updateScrollTop = state.rememberScrollTop;
    }

    // if we removed url edit state, clear any panel not found state
    if (state.panelNotFound || (state.editPanelAccessDenied && !urlEditPanelId)) {
      updates.panelNotFound = false;
      updates.editPanelAccessDenied = false;
    }

    if (Object.keys(updates).length > 0) {
      dispatchPanelState({ type: 'patch', patch: updates });
    }
  }, [dashboard, queryParams.editPanel, queryParams.viewPanel, queryParams.editview]);

  // Edit-panel transition events (replaces componentDidUpdate's edit-mode enter/exit
  // branches). Publishes PanelEditEnteredEvent / PanelEditExitedEvent and updates
  // dashboardWatcher's editing state.
  const prevEditPanelRef = useRef<PanelModel | null>(null);

  useEffect(() => {
    if (!dashboard) {
      prevEditPanelRef.current = editPanel;
      return;
    }

    // Entering edit mode
    if (editPanel && !prevEditPanelRef.current) {
      dashboardWatcher.setEditingState(true);
      // Some panels need to be notified when entering edit mode
      dashboard.events.publish(new PanelEditEnteredEvent(editPanel.id));
    }

    // Leaving edit mode
    if (!editPanel && prevEditPanelRef.current) {
      dashboardWatcher.setEditingState(false);
      // Some panels need kicked when leaving edit mode
      dashboard.events.publish(new PanelEditExitedEvent(prevEditPanelRef.current.id));
    }

    prevEditPanelRef.current = editPanel;
  }, [dashboard, editPanel]);

  // Permission-denied notification (replaces the `if (this.state.editPanelAccessDenied)`
  // branch in componentDidUpdate).
  useEffect(() => {
    if (editPanelAccessDenied) {
      notifyAppProp(createErrorNotification('Permission to edit panel denied'));
      locationService.partial({ editPanel: null });
    }
  }, [editPanelAccessDenied, notifyAppProp]);

  // Panel-not-found notification (replaces the `if (this.state.panelNotFound)` branch
  // in componentDidUpdate).
  useEffect(() => {
    if (panelNotFound) {
      notifyAppProp(createErrorNotification(`Panel not found`));
      locationService.partial({ editPanel: null, viewPanel: null });
    }
  }, [panelNotFound, notifyAppProp]);

  // Window scroll-position updates (replaces the
  // `if (this.state.updateScrollTop !== undefined && ...)` branch in componentDidUpdate).
  const prevUpdateScrollTopRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (updateScrollTop !== undefined && updateScrollTop !== prevUpdateScrollTopRef.current) {
      scrollElement?.scrollTo(0, updateScrollTop);
    }
    prevUpdateScrollTopRef.current = updateScrollTop;
  }, [updateScrollTop, scrollElement]);

  // Derive pageNav/sectionNav from current dashboard + nav index + panel state.
  // Returns undefined nav values when dashboard is null so the loading branch
  // renders DashboardLoading (matching the class's `if (!dashboard || !pageNav
  // || !sectionNav) return <DashboardLoading />` gate).
  const { pageNav, sectionNav } = useMemo<{
    pageNav: NavModelItem | undefined;
    sectionNav: NavModel | undefined;
  }>(() => {
    if (!dashboard) {
      return { pageNav: undefined, sectionNav: undefined };
    }
    return computePageAndSectionNav(dashboard, navIndex, location, editPanel, viewPanel);
  }, [dashboard, navIndex, location, editPanel, viewPanel]);

  // Derive the inspect panel from the queryParams.inspect URL param.
  const inspectPanel = useMemo<PanelModel | null>(() => {
    if (!dashboard) {
      return null;
    }
    const inspectPanelId = queryParams.inspect;
    if (!inspectPanelId) {
      return null;
    }
    // cannot inspect panels plugin is not already loaded
    return dashboard.getPanelById(parseInt(inspectPanelId, 10)) ?? null;
  }, [dashboard, queryParams.inspect]);

  // Stable callback for receiving the scroll-element ref from <Page>.
  const setScrollRef = useCallback((newScrollElement: ScrollRefElement): void => {
    setScrollElement(newScrollElement);
  }, []);

  // Stable callback for closing the share modal.
  const onCloseShareModal = useCallback(() => {
    locationService.partial({ shareView: null });
  }, []);

  const kioskMode = getKioskMode(queryParams);

  if (!dashboard || !pageNav || !sectionNav) {
    return <DashboardLoading initPhase={initPhase} />;
  }

  const showSubMenu = !editPanel && !kioskMode && !queryParams.editview && dashboard.isSubMenuVisible();
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
          tab={queryParams.tab}
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

const DashboardPage = (ownProps: OwnProps) => {
  const theme = useTheme2();
  // shallowEqual is the equality strategy `connect(mapStateToProps)` used by default.
  // Without it, `useSelector(mapStateToProps)` would warn (and trigger spurious
  // re-renders) because `mapStateToProps` returns a fresh object literal on every
  // call. shallowEqual is intentionally NOT on the restricted-import list — only
  // `useDispatch` and `useSelector` are routed through `app/types/store`.
  const stateProps = useSelector(mapStateToProps, shallowEqual);
  const dispatch = useDispatch();

  const dispatchProps = useMemo<DispatchProps>(
    () => ({
      initDashboard: (args) => dispatch(initDashboard(args)),
      cleanUpDashboardAndVariables: () => dispatch(cleanUpDashboardAndVariables()),
      notifyApp: (notification) => dispatch(notifyApp(notification)),
      cancelVariables: (key, dependencies) => dispatch(cancelVariables(key, dependencies)),
      templateVarsChangedInUrl: (key, vars, events) => dispatch(templateVarsChangedInUrl(key, vars, events)),
    }),
    [dispatch]
  );

  return <UnthemedDashboardPage {...ownProps} {...stateProps} {...dispatchProps} theme={theme} />;
};

DashboardPage.displayName = 'DashboardPage';

export default DashboardPage;
