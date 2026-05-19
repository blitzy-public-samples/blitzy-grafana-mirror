import { css } from '@emotion/css';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type Unsubscribable } from 'rxjs';

import {
  CoreApp,
  type DataSourceApi,
  type DataSourceInstanceSettings,
  type ScopedVars,
  getDataSourceRef,
  getDefaultTimeRange,
  LoadingState,
  type PanelData,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { getDataSourceSrv, locationService } from '@grafana/runtime';
import { type DataQuery } from '@grafana/schema';
import { Button, InlineFormLabel, Modal, ScrollContainer, Stack, stylesFactory } from '@grafana/ui';
import { PluginHelp } from 'app/core/components/PluginHelp/PluginHelp';
import config from 'app/core/config';
import { addQuery, queryIsEmpty } from 'app/core/utils/query';
import { DataSourceModal } from 'app/features/datasources/components/picker/DataSourceModal';
import { DataSourcePicker } from 'app/features/datasources/components/picker/DataSourcePicker';
import { dataSource as expressionDatasource } from 'app/features/expressions/ExpressionDatasource';
import { isSharedDashboardQuery } from 'app/plugins/datasource/dashboard/runSharedRequest';
import { type GrafanaQuery } from 'app/plugins/datasource/grafana/types';
import { type QueryGroupOptions } from 'app/types/query';

import { type PanelQueryRunner } from '../state/PanelQueryRunner';
import { updateQueries } from '../state/updateQueries';

import { GroupActionComponents } from './QueryActionComponent';
import { QueryEditorRows } from './QueryEditorRows';
import { QueryGroupOptionsEditor } from './QueryGroupOptions';

export interface Props {
  queryRunner: PanelQueryRunner;
  options: QueryGroupOptions;
  onOpenQueryInspector?: () => void;
  onRunQueries: () => void;
  onOptionsChange: (options: QueryGroupOptions) => void;
}

export const QueryGroup = memo((props: Props) => {
  // Memoize the dataSourceSrv() lookup once-per-component-instance, matching the original
  // class's `dataSourceSrv = getDataSourceSrv()` instance field semantics (stable identity
  // across renders).
  const dataSourceSrv = useMemo(() => getDataSourceSrv(), []);

  // Local state mirroring the original `State` interface fields that actually transition.
  // The original `helpContent`, `isLoadingHelp`, `isPickerOpen`, and `isDataSourceModalOpen`
  // state fields are unused dead code (never read in the render path and never written
  // anywhere reachable from the class body) and are therefore not migrated here. Likewise,
  // the unused `onOpenHelp` and `onCloseDataSourceModal` arrow methods are not migrated,
  // and the unused `backendSrv = backendSrv` instance binding is also dropped (along with
  // its now-orphaned import).
  const [dataSource, setDataSource] = useState<DataSourceApi | undefined>(undefined);
  const [dsSettings, setDsSettings] = useState<DataSourceInstanceSettings | undefined>(undefined);
  const [queries, setQueries] = useState<DataQuery[]>([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [defaultDataSource, setDefaultDataSource] = useState<DataSourceApi | undefined>(undefined);
  const [data, setData] = useState<PanelData>({
    state: LoadingState.NotStarted,
    series: [],
    timeRange: getDefaultTimeRange(),
  });
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | undefined>(undefined);

  // Replacement for the original async setNewQueriesAndDatasource class method
  // (lines 106–128 of the pre-refactor source). Stable via useCallback so it can be
  // referenced by the mount-once effect and the on-update effect below.
  const setNewQueriesAndDatasource = useCallback(
    async (options: QueryGroupOptions) => {
      try {
        const ds = await dataSourceSrv.get(options.dataSource);
        const dsSettingsLocal = dataSourceSrv.getInstanceSettings(options.dataSource);

        const defaultDS = await dataSourceSrv.get();
        const dsRef = ds.getRef();
        const newQueries = options.queries.map((q) => ({
          ...(queryIsEmpty(q) && ds?.getDefaultQuery?.(CoreApp.PanelEditor)),
          datasource: dsRef,
          ...q,
        }));

        setQueries(newQueries);
        setDataSource(ds);
        setDsSettings(dsSettingsLocal);
        setDefaultDataSource(defaultDS);
      } catch (error) {
        console.error('failed to load data source', error);
      }
    },
    [dataSourceSrv]
  );

  // Mount effect: subscribe to the panel data stream and trigger the initial datasource
  // load. Combines componentDidMount (subscribe + initial load) with componentWillUnmount
  // (subscription cleanup) — see AAP §0.8.4 Subscription pattern. The empty dep array
  // preserves the original componentDidMount-once semantics.
  useEffect(() => {
    const sub: Unsubscribable = props.queryRunner
      .getData({ withTransforms: false, withFieldConfig: false })
      .subscribe({
        next: (newData: PanelData) => setData(newData),
      });

    setNewQueriesAndDatasource(props.options);

    return () => {
      sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update effect: detect datasource change between renders, mirroring the original
  // async componentDidUpdate (lines 97–104). Uses a `cancelled` flag in the cleanup to
  // avoid setting state on an unmounted component if the async get() resolves after
  // unmount (AAP §0.8.4 async-effect guarding) — a robustness improvement that does
  // not alter user-observable behavior.
  useEffect(() => {
    let cancelled = false;
    const checkAndReload = async () => {
      const currentDS = await getDataSourceSrv().get(props.options.dataSource);
      if (cancelled) {
        return;
      }
      if (dataSource && currentDS.uid !== dataSource?.uid) {
        setNewQueriesAndDatasource(props.options);
      }
    };
    checkAndReload();
    return () => {
      cancelled = true;
    };
  }, [props.options, dataSource, setNewQueriesAndDatasource]);

  // Replacement for the original `onChange` class method (lines 189–194). Stable so
  // dependents (onQueriesChange, onChangeDataSource) don't change identity on every
  // render unless props change.
  const onChange = useCallback(
    (changedProps: Partial<QueryGroupOptions>) => {
      props.onOptionsChange({
        ...props.options,
        ...changedProps,
      });
    },
    [props]
  );

  // Replacement for the original `onQueriesChange` class arrow method (lines 254–257).
  const onQueriesChange = useCallback(
    (nextQueries: DataQuery[] | GrafanaQuery[]) => {
      onChange({ queries: nextQueries });
      setQueries(nextQueries);
    },
    [onChange]
  );

  // Replacement for the original `onScrollBottom` class arrow method (lines 201–207).
  const onScrollBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollElement) {
        scrollElement.scrollTo({ top: 10000 });
      }
    }, 20);
  }, [scrollElement]);

  // Replacement for the original `onChangeDataSource` class arrow method (lines 134–165).
  const onChangeDataSource = useCallback(
    async (newSettings: DataSourceInstanceSettings, defaultQueries?: DataQuery[] | GrafanaQuery[]) => {
      const currentDS = dsSettings ? await getDataSourceSrv().get(dsSettings.uid) : undefined;
      const nextDS = await getDataSourceSrv().get(newSettings.uid);

      // We need to pass in newSettings.uid as well here as that can be a variable expression and we want to store that in the query model not the current ds variable value
      const newQueries = defaultQueries || (await updateQueries(nextDS, newSettings.uid, queries, currentDS));

      const newDataSource = await dataSourceSrv.get(newSettings.name);

      onChange({
        queries: newQueries,
        dataSource: {
          name: newSettings.name,
          uid: newSettings.uid,
          ...getDataSourceRef(newSettings),
        },
      });

      setQueries(newQueries);
      setDataSource(newDataSource);
      setDsSettings(newSettings);

      if (defaultQueries) {
        props.onRunQueries();
      }
    },
    [dsSettings, queries, dataSourceSrv, onChange, props]
  );

  // Replacement for the original `newQuery` instance method (lines 173–187).
  const newQuery = useCallback((): Partial<DataQuery> => {
    const ds =
      dsSettings && !dsSettings.meta.mixed
        ? getDataSourceRef(dsSettings)
        : defaultDataSource
          ? defaultDataSource.getRef()
          : { type: undefined, uid: undefined };

    return {
      ...dataSource?.getDefaultQuery?.(CoreApp.PanelEditor),
      datasource: ds,
    };
  }, [dsSettings, defaultDataSource, dataSource]);

  // Replacement for the original `onAddQuery` class arrow method (lines 246–252).
  const onAddQuery = useCallback(
    (query: Partial<DataQuery>) => {
      onQueriesChange(
        addQuery(queries, query, dsSettings ? getDataSourceRef(dsSettings) : { type: undefined, uid: undefined })
      );
      onScrollBottom();
    },
    [queries, dsSettings, onQueriesChange, onScrollBottom]
  );

  // Replacement for the original `onAddQueryClick` class arrow method (lines 167–171).
  const onAddQueryClick = useCallback(() => {
    onQueriesChange(addQuery(queries, newQuery()));
    onScrollBottom();
  }, [queries, newQuery, onQueriesChange, onScrollBottom]);

  // Replacement for the original `onAddExpressionClick` class arrow method (lines 196–199).
  const onAddExpressionClick = useCallback(() => {
    onQueriesChange(addQuery(queries, expressionDatasource.newQuery()));
    onScrollBottom();
  }, [queries, onQueriesChange, onScrollBottom]);

  // Replacement for the original `onUpdateAndRun` class arrow method (lines 209–212).
  const onUpdateAndRun = useCallback(
    (options: QueryGroupOptions) => {
      props.onOptionsChange(options);
      props.onRunQueries();
    },
    [props]
  );

  // Replacement for the original `onCloseHelp` class arrow method (lines 238–240).
  const onCloseHelp = useCallback(() => setIsHelpOpen(false), []);

  // Replacement for the original `setScrollRef` class arrow method (lines 326–328).
  const setScrollRef = useCallback((element: HTMLDivElement): void => {
    setScrollElement(element);
  }, []);

  // Pure helper preserved from the original `isExpressionsSupported` method (lines 277–279).
  const isExpressionsSupported = (settings: DataSourceInstanceSettings): boolean => {
    return (settings.meta.backend || settings.meta.alerting || settings.meta.mixed) === true;
  };

  // Render helper preserved from the original `renderTopSection` method (lines 214–232).
  const renderTopSection = () => {
    if (!dsSettings || !dataSource) {
      return null;
    }
    return (
      <QueryGroupTopSection
        data={data}
        dataSource={dataSource}
        options={props.options}
        dsSettings={dsSettings}
        onOptionsChange={onUpdateAndRun}
        onDataSourceChange={onChangeDataSource}
        onOpenQueryInspector={props.onOpenQueryInspector}
      />
    );
  };

  // Render helper preserved from the original `renderQueries` method (lines 259–275).
  const renderQueries = (settings: DataSourceInstanceSettings) => {
    return (
      <div aria-label={selectors.components.QueryTab.content}>
        <QueryEditorRows
          queries={queries}
          dsSettings={settings}
          onQueriesChange={onQueriesChange}
          onAddQuery={onAddQuery}
          onRunQueries={props.onRunQueries}
          data={data}
        />
      </div>
    );
  };

  // Render helper preserved from the original `renderExtraActions` method (lines 281–291).
  const renderExtraActions = () => {
    return GroupActionComponents.getAllExtraRenderAction()
      .map((action, index) =>
        action({
          onAddQuery,
          onChangeDataSource,
          key: index,
        })
      )
      .filter(Boolean);
  };

  // Render helper preserved from the original `renderAddQueryRow` method (lines 293–324).
  const renderAddQueryRow = (settings: DataSourceInstanceSettings, styles: QueriesTabStyles) => {
    const showAddButton = !isSharedDashboardQuery(settings.name);

    return (
      <Stack gap={2} alignItems="flex-start">
        {showAddButton && (
          <Button
            icon="plus"
            onClick={onAddQueryClick}
            variant="secondary"
            data-testid={selectors.components.QueryTab.addQuery}
          >
            <Trans i18nKey="query.query-group.add-query">Add query</Trans>
          </Button>
        )}
        {config.expressionsEnabled && isExpressionsSupported(settings) && (
          <Button
            icon="plus"
            onClick={onAddExpressionClick}
            variant="secondary"
            className={styles.expressionButton}
            data-testid="query-tab-add-expression"
          >
            <span>
              <Trans i18nKey="query.query-group.expression">Expression</Trans>
            </span>
          </Button>
        )}
        {renderExtraActions()}
      </Stack>
    );
  };

  const styles = getStyles();

  return (
    <ScrollContainer minHeight="100%" ref={setScrollRef}>
      <div className={styles.innerWrapper}>
        {renderTopSection()}
        {dsSettings && (
          <>
            <div className={styles.queriesWrapper}>{renderQueries(dsSettings)}</div>
            {renderAddQueryRow(dsSettings, styles)}
            {isHelpOpen && (
              <Modal
                title={t('query.query-group.title-data-source-help', 'Data source help')}
                isOpen={true}
                onDismiss={onCloseHelp}
              >
                <PluginHelp pluginId={dsSettings.meta.id} />
              </Modal>
            )}
          </>
        )}
      </div>
    </ScrollContainer>
  );
});

QueryGroup.displayName = 'QueryGroup';

const getStyles = stylesFactory(() => {
  const { theme } = config;

  return {
    innerWrapper: css({
      display: 'flex',
      flexDirection: 'column',
      padding: theme.spacing.md,
    }),
    dataSourceRow: css({
      display: 'flex',
      marginBottom: theme.spacing.md,
    }),
    dataSourceRowItem: css({
      marginRight: theme.spacing.inlineFormMargin,
    }),
    dataSourceRowItemOptions: css({
      flexGrow: 1,
      marginRight: theme.spacing.inlineFormMargin,
    }),
    queriesWrapper: css({
      paddingBottom: '16px',
    }),
    expressionWrapper: css({}),
    expressionButton: css({
      marginRight: theme.spacing.sm,
    }),
  };
});

type QueriesTabStyles = ReturnType<typeof getStyles>;

interface QueryGroupTopSectionProps {
  data: PanelData;
  dataSource: DataSourceApi;
  dsSettings: DataSourceInstanceSettings;
  options: QueryGroupOptions;
  scopedVars?: ScopedVars;
  onOpenQueryInspector?: () => void;
  onOptionsChange?: (options: QueryGroupOptions) => void;
  onDataSourceChange?: (ds: DataSourceInstanceSettings, defaultQueries?: DataQuery[] | GrafanaQuery[]) => Promise<void>;
}

export function QueryGroupTopSection({
  dataSource,
  options,
  data,
  dsSettings,
  scopedVars,
  onDataSourceChange,
  onOptionsChange,
  onOpenQueryInspector,
}: QueryGroupTopSectionProps) {
  const styles = getStyles();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <>
      <div data-testid={selectors.components.QueryTab.queryGroupTopSection}>
        <div className={styles.dataSourceRow}>
          <InlineFormLabel htmlFor="data-source-picker" width={'auto'}>
            <Trans i18nKey="query.query-group-top-section.data-source">Data source</Trans>
          </InlineFormLabel>
          <div className={styles.dataSourceRowItem}>
            <DataSourcePickerWithPrompt
              options={options}
              scopedVars={scopedVars}
              onChange={async (ds, defaultQueries) => {
                return await onDataSourceChange?.(ds, defaultQueries);
              }}
              isDataSourceModalOpen={Boolean(locationService.getSearchObject().firstPanel)}
            />
          </div>
          {dataSource && (
            <>
              <div className={styles.dataSourceRowItem}>
                <Button
                  variant="secondary"
                  icon="question-circle"
                  tooltip={t(
                    'query.query-group-top-section.query-tab-help-button-title-open-data-source-help',
                    'Open data source help'
                  )}
                  onClick={() => setIsHelpOpen(true)}
                  data-testid="query-tab-help-button"
                />
              </div>
              <div className={styles.dataSourceRowItemOptions}>
                <QueryGroupOptionsEditor
                  options={options}
                  dataSource={dataSource}
                  data={data}
                  onChange={(opts) => {
                    onOptionsChange?.(opts);
                  }}
                />
              </div>
              {onOpenQueryInspector && (
                <div className={styles.dataSourceRowItem}>
                  <Button
                    variant="secondary"
                    onClick={onOpenQueryInspector}
                    aria-label={selectors.components.QueryTab.queryInspectorButton}
                  >
                    <Trans i18nKey="query.query-group-top-section.query-inspector">Query inspector</Trans>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {isHelpOpen && (
        <Modal
          title={t('query.query-group-top-section.title-data-source-help', 'Data source help')}
          isOpen={true}
          onDismiss={() => setIsHelpOpen(false)}
        >
          <PluginHelp pluginId={dsSettings.meta.id} />
        </Modal>
      )}
    </>
  );
}

interface DataSourcePickerWithPromptProps {
  isDataSourceModalOpen?: boolean;
  options: QueryGroupOptions;
  scopedVars?: ScopedVars;
  onChange: (ds: DataSourceInstanceSettings, defaultQueries?: DataQuery[] | GrafanaQuery[]) => Promise<void>;
}

function DataSourcePickerWithPrompt({ options, scopedVars, onChange, ...otherProps }: DataSourcePickerWithPromptProps) {
  const [isDataSourceModalOpen, setIsDataSourceModalOpen] = useState(Boolean(otherProps.isDataSourceModalOpen));

  useEffect(() => {
    // Clean up the first panel flag since the modal is now open
    if (!!locationService.getSearchObject().firstPanel) {
      locationService.partial({ firstPanel: null }, true);
    }
  }, []);

  const commonProps = {
    metrics: true,
    mixed: true,
    dashboard: true,
    variables: true,
    current: options.dataSource,
    scopedVars,
    onChange: async (ds: DataSourceInstanceSettings, defaultQueries?: DataQuery[] | GrafanaQuery[]) => {
      await onChange(ds, defaultQueries);
      setIsDataSourceModalOpen(false);
    },
  };

  return (
    <>
      {isDataSourceModalOpen && (
        <DataSourceModal {...commonProps} onDismiss={() => setIsDataSourceModalOpen(false)}></DataSourceModal>
      )}

      <DataSourcePicker {...commonProps} />
    </>
  );
}
