import { screen, waitFor } from '@testing-library/react';
import { useParams } from 'react-router-dom-v5-compat';
import { type Props } from 'react-virtualized-auto-sizer';
import { render } from 'test/test-utils';

import { config, locationService } from '@grafana/runtime';
import { DashboardRoutes } from 'app/types/dashboard';

import DashboardPageProxy, { type DashboardPageProxyProps } from './DashboardPageProxy';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: jest.fn().mockReturnValue({
    getInstanceSettings: () => {
      return { name: 'Grafana' };
    },
    get: jest.fn().mockResolvedValue({}),
  }),
  useChromeHeaderHeight: jest.fn(),
  getBackendSrv: () => {
    return {
      get: jest.fn().mockResolvedValue({ dashboard: {}, meta: { url: '' } }),
    };
  },
}));

jest.mock('react-virtualized-auto-sizer', () => {
  return ({ children }: Props) =>
    children({
      height: 1,
      scaledHeight: 1,
      scaledWidth: 1,
      width: 1,
    });
});

jest.mock('react-router-dom-v5-compat', () => ({
  ...jest.requireActual('react-router-dom-v5-compat'),
  useParams: jest.fn().mockReturnValue({}),
}));

// DashboardPageProxy is a thin routing component: it chooses between rendering
// the legacy DashboardPage and the scenes-based DashboardScenePage based on the
// `dashboardScene` feature toggle and `scenes` query parameter. The tests
// below assert only which page component is rendered (via the
// `dashboard-scene-page` test id) — they do not exercise the page bodies.
//
// Rendering the real DashboardPage / DashboardScenePage triggers their data
// fetch effects (initDashboard / DashboardScenePageStateManager), which
// download a dashboard DTO via getBackendSrv().get(). The default mock for
// `@grafana/runtime#getBackendSrv` above returns a placeholder shape that does
// not satisfy the consumers (e.g. K8sDashboardAPI expects `dash.metadata.name`)
// and any further fetch via the whatwg-fetch polyfill would hit a real XHR,
// producing ECONNREFUSED in jsdom.
//
// To keep these routing-only tests deterministic and free of network access,
// mock both page components at module level so their effects never run. The
// scene page still emits the same `dashboard-scene-page` test id that the
// assertions rely on; the legacy page emits a distinct test id used only as a
// readability aid.
jest.mock('./DashboardPage', () => ({
  __esModule: true,
  default: () => <div data-testid="dashboard-page-legacy" />,
}));

jest.mock('app/features/dashboard-scene/pages/DashboardScenePage', () => ({
  __esModule: true,
  default: () => <div data-testid="dashboard-scene-page" />,
}));

function setup(props: Partial<DashboardPageProxyProps> & { uid?: string }) {
  (useParams as jest.Mock).mockReturnValue({ uid: props.uid });
  return render(
    <DashboardPageProxy
      location={locationService.getLocation()}
      queryParams={{}}
      route={{ routeName: DashboardRoutes.Home, component: () => null, path: '/' }}
      {...props}
    />
  );
}

describe('DashboardPageProxy', () => {
  describe('when dashboardScene feature toggle is enabled (default)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      config.featureToggles.kubernetesDashboards = false;
      config.featureToggles.dashboardScene = true;
    });

    it('should render DashboardScenePage for home route', async () => {
      setup({
        route: { routeName: DashboardRoutes.Home, component: () => null, path: '/' },
      });

      await waitFor(() => {
        expect(screen.queryAllByTestId('dashboard-scene-page')).toHaveLength(1);
      });
    });

    it('should render DashboardScenePage for normal route with uid', async () => {
      setup({
        route: { routeName: DashboardRoutes.Normal, component: () => null, path: '/' },
        uid: 'abc-def',
      });

      await waitFor(() => {
        expect(screen.queryAllByTestId('dashboard-scene-page')).toHaveLength(1);
      });
    });

    it('should render legacy DashboardPage when forceOld query param is set', async () => {
      setup({
        route: { routeName: DashboardRoutes.Normal, component: () => null, path: '/' },
        uid: 'abc-def',
        queryParams: { scenes: false },
      });

      await waitFor(() => {
        expect(screen.queryAllByTestId('dashboard-scene-page')).toHaveLength(0);
      });
    });
  });

  describe('when dashboardScene feature toggle is disabled', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      config.featureToggles.dashboardScene = false;
    });

    it('should render legacy DashboardPage for home route', async () => {
      setup({
        route: { routeName: DashboardRoutes.Home, component: () => null, path: '/' },
      });

      await waitFor(() => {
        expect(screen.queryAllByTestId('dashboard-scene-page')).toHaveLength(0);
      });
    });

    it('should render legacy DashboardPage for normal route with uid', async () => {
      setup({
        route: { routeName: DashboardRoutes.Normal, component: () => null, path: '/' },
        uid: 'abc-def',
      });

      await waitFor(() => {
        expect(screen.queryAllByTestId('dashboard-scene-page')).toHaveLength(0);
      });
    });

    it('should render DashboardScenePage when forceScenes query param is set', async () => {
      setup({
        route: { routeName: DashboardRoutes.Normal, component: () => null, path: '/' },
        uid: 'abc-def',
        queryParams: { scenes: true },
      });

      await waitFor(() => {
        expect(screen.queryAllByTestId('dashboard-scene-page')).toHaveLength(1);
      });
    });
  });
});
