import { memo, useCallback, useEffect, useReducer } from 'react';

import { type DataQuery, getDataSourceRef } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { storeLastUsedDataSourceInLocalStorage } from 'app/features/datasources/components/picker/utils';
import { getDatasourceSrv } from 'app/features/plugins/datasource_srv';
import { QueryGroup } from 'app/features/query/components/QueryGroup';
import { type QueryGroupDataSource, type QueryGroupOptions } from 'app/types/query';

import { getDashboardSrv } from '../../services/DashboardSrv';
import { type PanelModel } from '../../state/PanelModel';
import { getLastUsedDatasourceFromStorage } from '../../utils/dashboard';

interface Props {
  /** Current panel */
  panel: PanelModel;
  /** Added here to make component re-render when queries change from outside */
  queries: DataQuery[];
}

// store last used datasource in local storage
const updateLastUsedDatasource = (datasource: QueryGroupDataSource) => {
  storeLastUsedDataSourceInLocalStorage(datasource);
};

function buildQueryOptions(panel: PanelModel): QueryGroupOptions {
  const dataSource: QueryGroupDataSource = panel.datasource ?? {
    default: true,
  };
  const datasourceSettings = getDatasourceSrv().getInstanceSettings(dataSource);

  // store last datasource used in local storage
  updateLastUsedDatasource(dataSource);
  return {
    cacheTimeout: datasourceSettings?.meta.queryOptions?.cacheTimeout ? panel.cacheTimeout : undefined,
    dataSource: {
      default: datasourceSettings?.isDefault,
      ...(datasourceSettings ? getDataSourceRef(datasourceSettings) : { type: undefined, uid: undefined }),
    },
    queryCachingTTL: datasourceSettings?.cachingConfig?.enabled ? panel.queryCachingTTL : undefined,
    queries: panel.targets,
    maxDataPoints: panel.maxDataPoints,
    minInterval: panel.interval,
    timeRange: {
      from: panel.timeFrom,
      shift: panel.timeShift,
      hide: panel.hideTimeOverride,
    },
  };
}

// Wrapped with React.memo to preserve the PureComponent shallow-equality optimization.
// The `queries` prop (declared in `Props`) is intentionally not destructured: its sole purpose
// per the original PureComponent design is to trigger re-renders when the queries array
// reference changes from outside. React.memo's default shallow comparison still inspects all
// props (including `queries`), so the optimization semantics are preserved.
export const PanelEditorQueries = memo(function PanelEditorQueries({ panel }: Props) {
  // `forceUpdate` replaces `this.forceUpdate()` from the original PureComponent. The reducer
  // increments a counter to schedule a re-render whenever the externally mutated `panel`
  // model needs to be reflected in the view (see onOptionsChange and the mount effect below).
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    // If the panel model has no datasource property load the default data source property and update the persisted model
    // Because this part of the panel model is not in redux yet we do a forceUpdate.
    if (!panel.datasource) {
      let ds;
      // check if we have last used datasource from local storage
      // get dashboard uid
      const dashboardUid = getDashboardSrv().getCurrent()?.uid ?? '';
      const lastUsedDatasource = getLastUsedDatasourceFromStorage(dashboardUid!);
      // do we have a last used datasource for this dashboard
      if (lastUsedDatasource?.datasourceUid !== null) {
        // get datasource from uid
        ds = getDatasourceSrv().getInstanceSettings(lastUsedDatasource?.datasourceUid);
      }
      // else load default datasource
      if (!ds) {
        ds = getDatasourceSrv().getInstanceSettings(null);
      }
      panel.datasource = getDataSourceRef(ds!);
      forceUpdate();
    }
    // This effect replaces componentDidMount which runs exactly once after the initial mount.
    // The `panel` model is a mutable instance whose identity does not change across renders,
    // so the original semantics are preserved with an empty dependency array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRunQueries = useCallback(() => {
    panel.refresh();
  }, [panel]);

  const onOpenQueryInspector = useCallback(() => {
    locationService.partial({
      inspect: panel.id,
      inspectTab: 'query',
    });
  }, [panel]);

  const onOptionsChange = useCallback(
    (options: QueryGroupOptions) => {
      panel.updateQueries(options);

      if (options.dataSource.uid !== panel.datasource?.uid) {
        // trigger queries when changing data source
        setTimeout(() => panel.refresh(), 10);
      }

      forceUpdate();
    },
    [panel]
  );

  // If no panel data soruce set, wait with render. Will be set to default in componentDidMount
  if (!panel.datasource) {
    return null;
  }

  const options = buildQueryOptions(panel);

  return (
    <QueryGroup
      options={options}
      queryRunner={panel.getQueryRunner()}
      onRunQueries={onRunQueries}
      onOpenQueryInspector={onOpenQueryInspector}
      onOptionsChange={onOptionsChange}
    />
  );
});
