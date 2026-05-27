import { cloneDeep } from 'lodash';
import { useEffect, useMemo, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';

import {
  applyFieldOverrides,
  applyRawFieldOverrides,
  type CoreApp,
  type DataFrame,
  DataTransformerID,
  type FieldConfigSource,
  type SelectableValue,
  type TimeZone,
  transformDataFrame,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { config, getTemplateSrv, reportInteraction } from '@grafana/runtime';
import { Button, Spinner, Table } from '@grafana/ui';
import { type GetDataOptions } from 'app/features/query/state/PanelQueryRunner';

import { dataFrameToLogsModel } from '../logs/logsModel';

import { InspectDataOptions } from './InspectDataOptions';
import { getPanelInspectorStyles } from './styles';
import { downloadAsJson, downloadDataFrameAsCsv, downloadLogsModelAsTxt, downloadTraceAsJson } from './utils/download';

interface Props {
  isLoading: boolean;
  options: GetDataOptions;
  timeZone: TimeZone;
  app?: CoreApp;
  data?: DataFrame[];
  /** The title of the panel or other context name */
  dataName: string;
  panelPluginId?: string;
  fieldConfig?: FieldConfigSource;
  hasTransformations?: boolean;
  formattedDataDescription?: string;
  onOptionsChange?: (options: GetDataOptions) => void;
}

export const InspectDataTab = ({
  isLoading,
  options,
  timeZone,
  app,
  data,
  dataName,
  panelPluginId,
  fieldConfig,
  hasTransformations,
  formattedDataDescription,
  onOptionsChange,
}: Props) => {
  // `transformationOptions` was constructor-evaluated in the original class. The `t()` calls inside
  // `buildTransformationOptions` are locale-sensitive, so wrapping in `useMemo([])` ensures they
  // evaluate at mount time, matching the original constructor-evaluation timing, while providing
  // stable identity across renders (per AAP §0.5.3).
  const transformationOptions = useMemo(() => buildTransformationOptions(), []);

  // Class state translated to discrete `useState` calls (per AAP §0.1.2 / Rule T1). Each field
  // gets a concrete type annotation matching the original `State` interface.
  /** The string is joinByField transformation. Otherwise it is a dataframe index */
  const [selectedDataFrame, setSelectedDataFrame] = useState<number | DataTransformerID>(0);
  const [dataFrameIndex, setDataFrameIndex] = useState<number>(0);
  const [transformId, setTransformId] = useState<DataTransformerID>(DataTransformerID.noop);
  const [transformedData, setTransformedData] = useState<DataFrame[]>(data ?? []);
  const [excelCompatibilityMode, setExcelCompatibilityMode] = useState<boolean>(false);

  // `componentDidUpdate` → `useEffect` (per AAP §0.1.2 / Rule T1). On initial mount,
  // `transformId === DataTransformerID.noop` so the third branch falls through to
  // `setTransformedData(data)` which equals the initial state value (no observable render delta).
  // Subscription cleanup uses the canonical `useEffect` return — superior to the original
  // setState-callback unsubscribe because it handles unmount-while-pending correctly.
  useEffect(() => {
    if (!data) {
      setTransformedData([]);
      return;
    }

    if (options.withTransforms) {
      setTransformedData(data);
      return;
    }

    const currentTransform = transformationOptions.find((item) => item.value === transformId);

    if (currentTransform && currentTransform.transformer.id !== DataTransformerID.noop) {
      const subscription = transformDataFrame([currentTransform.transformer], data).subscribe((transformed) => {
        setTransformedData(transformed);
      });
      return () => subscription.unsubscribe();
    }

    setTransformedData(data);
    return;
  }, [data, options.withTransforms, transformId, transformationOptions]);

  const exportCsv = (dataFrames: DataFrame[], hasLogs: boolean) => {
    const dataFrame = dataFrames[dataFrameIndex];

    if (hasLogs) {
      reportInteraction('grafana_logs_download_clicked', { app, format: 'csv' });
    }

    downloadDataFrameAsCsv(dataFrame, dataName, {}, transformId, excelCompatibilityMode);
  };

  const onExportLogsAsTxt = () => {
    reportInteraction('grafana_logs_download_logs_clicked', {
      app,
      format: 'logs',
      area: 'inspector',
    });

    const logsModel = dataFrameToLogsModel(data || []);
    downloadLogsModelAsTxt(logsModel, dataName);
  };

  const onExportTracesAsJson = () => {
    if (!data) {
      return;
    }

    for (const df of data) {
      // Only export traces
      if (df.meta?.preferredVisualisationType !== 'trace') {
        continue;
      }

      const traceFormat = downloadTraceAsJson(df, dataName + '-traces');

      reportInteraction('grafana_traces_download_traces_clicked', {
        app,
        grafana_version: config.buildInfo.version,
        trace_format: traceFormat,
        location: 'inspector',
      });
    }
  };

  const onExportServiceGraph = () => {
    reportInteraction('grafana_traces_download_service_graph_clicked', {
      app,
      grafana_version: config.buildInfo.version,
      location: 'inspector',
    });

    if (!data) {
      return;
    }

    downloadAsJson(data, dataName);
  };

  const onDataFrameChange = (item: SelectableValue<DataTransformerID | number>) => {
    setTransformId(
      item.value === DataTransformerID.joinByField ? DataTransformerID.joinByField : DataTransformerID.noop
    );
    setDataFrameIndex(typeof item.value === 'number' ? item.value : 0);
    setSelectedDataFrame(item.value!);
  };

  const onToggleExcelCompatibilityMode = () => {
    setExcelCompatibilityMode((prev) => !prev);
  };

  const getProcessedData = (): DataFrame[] => {
    if (!options.withFieldConfig) {
      return applyRawFieldOverrides(transformedData);
    }

    let fieldConfigCleaned = fieldConfig ?? { defaults: {}, overrides: [] };
    // Because we visualize this data in a table we have to remove any custom table display settings
    if (panelPluginId === 'table' && fieldConfig) {
      fieldConfigCleaned = cleanTableConfigFromFieldConfig(fieldConfig);
    }

    // We need to apply field config as it's not done by PanelQueryRunner (even when withFieldConfig is true).
    // It's because transformers create new fields and data frames, and we need to clean field config of any table settings.
    return applyFieldOverrides({
      data: transformedData,
      theme: config.theme2,
      fieldConfig: fieldConfigCleaned,
      timeZone,
      replaceVariables: (value, scopedVars, format) => getTemplateSrv().replace(value, scopedVars, format),
    });
  };

  const renderActions = (dataFrames: DataFrame[], hasLogs: boolean, hasTraces: boolean, hasServiceGraph: boolean) => {
    return (
      <>
        <Button variant="primary" onClick={() => exportCsv(dataFrames, hasLogs)} size="sm">
          <Trans i18nKey="dashboard.inspect-data.download-csv">Download CSV</Trans>
        </Button>
        {hasLogs && !config.exploreHideLogsDownload && (
          <Button variant="primary" onClick={onExportLogsAsTxt} size="sm">
            <Trans i18nKey="dashboard.inspect-data.download-logs">Download logs</Trans>
          </Button>
        )}
        {hasTraces && (
          <Button variant="primary" onClick={onExportTracesAsJson} size="sm">
            <Trans i18nKey="dashboard.inspect-data.download-traces">Download traces</Trans>
          </Button>
        )}
        {hasServiceGraph && (
          <Button variant="primary" onClick={onExportServiceGraph} size="sm">
            <Trans i18nKey="dashboard.inspect-data.download-service">Download service graph</Trans>
          </Button>
        )}
      </>
    );
  };

  const styles = getPanelInspectorStyles();

  if (isLoading) {
    return (
      <div>
        <Spinner inline={true} /> <Trans i18nKey="inspector.inspect-data-tab.loading">Loading</Trans>
      </div>
    );
  }

  const dataFrames = getProcessedData();

  if (!dataFrames || !dataFrames.length) {
    return (
      <div>
        <Trans i18nKey="inspector.inspect-data-tab.no-data">No data</Trans>
      </div>
    );
  }

  // let's make sure we don't try to render a frame that doesn't exists
  const index = !dataFrames[dataFrameIndex] ? 0 : dataFrameIndex;
  const dataFrame = dataFrames[index];
  const hasLogs = dataFrames.some((df) => df?.meta?.preferredVisualisationType === 'logs');
  const hasTraces = dataFrames.some((df) => df?.meta?.preferredVisualisationType === 'trace');
  const hasServiceGraph = dataFrames.some((df) => df?.meta?.preferredVisualisationType === 'nodeGraph');

  return (
    <div className={styles.wrap} aria-label={selectors.components.PanelInspector.Data.content}>
      <div className={styles.toolbar}>
        <InspectDataOptions
          data={data}
          hasTransformations={hasTransformations}
          options={options}
          dataFrames={dataFrames}
          transformationOptions={transformationOptions}
          selectedDataFrame={selectedDataFrame}
          formattedDataDescription={formattedDataDescription}
          onOptionsChange={onOptionsChange}
          onDataFrameChange={onDataFrameChange}
          excelCompatibilityMode={excelCompatibilityMode}
          toggleExcelCompatibilityMode={onToggleExcelCompatibilityMode}
          actions={renderActions(dataFrames, hasLogs, hasTraces, hasServiceGraph)}
        />
      </div>
      <div className={styles.content}>
        <AutoSizer>
          {({ width, height }) => {
            if (width === 0) {
              return null;
            }

            return <Table width={width} height={height} data={dataFrame} showTypeIcons={true} />;
          }}
        </AutoSizer>
      </div>
    </div>
  );
};

function buildTransformationOptions() {
  const transformations: Array<SelectableValue<DataTransformerID>> = [
    {
      value: DataTransformerID.joinByField,
      label: t('dashboard.inspect-data.transformation', 'Series joined by time'),
      transformer: {
        id: DataTransformerID.joinByField,
        options: { byField: undefined }, // defaults to time field
      },
    },
  ];

  return transformations;
}

// Because we visualize this data in a table we have to remove any custom table display settings.
// Moved from class method to module scope during functional conversion: pure helper, no `this`
// dependency, so avoiding the per-render closure allocation is preferable.
function cleanTableConfigFromFieldConfig(fieldConfig: FieldConfigSource): FieldConfigSource {
  fieldConfig = cloneDeep(fieldConfig);
  // clear all table specific options
  fieldConfig.defaults.custom = {};

  // clear all table override properties
  for (const override of fieldConfig.overrides) {
    for (const prop of override.properties) {
      if (prop.id.startsWith('custom.')) {
        const index = override.properties.indexOf(prop);
        // TODO(modernization): override.properties.slice(index, 1) is a no-op (slice does not mutate);
        // pre-existing bug, not fixed per minimal-change mandate (AAP §0.9.2.12).
        override.properties.slice(index, 1);
      }
    }
  }

  return fieldConfig;
}
