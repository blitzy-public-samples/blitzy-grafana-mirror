import { useCallback, useState } from 'react';

import {
  type DataSourcePluginOptionsEditorProps,
  type DataSourceSettings,
  type SelectableValue,
  updateDatasourcePluginJsonDataOption,
} from '@grafana/data';
import { config } from '@grafana/runtime';
import { Alert, DataSourceHttpSettings, Field, FieldSet, InlineField, Input, Select, Text } from '@grafana/ui';

import { BROWSER_MODE_DISABLED_MESSAGE } from '../../../constants';
import { type InfluxOptions, type InfluxOptionsV1, InfluxVersion } from '../../../types';

import { InfluxFluxConfig } from './InfluxFluxConfig';
import { InfluxInfluxQLConfig } from './InfluxInfluxQLConfig';
import { InfluxSqlConfig } from './InfluxSQLConfig';
import { trackInfluxDBConfigV1QueryLanguageSelection } from './trackingv1';

const versionMap: Record<InfluxVersion, SelectableValue<InfluxVersion>> = {
  [InfluxVersion.InfluxQL]: {
    label: 'InfluxQL',
    value: InfluxVersion.InfluxQL,
    description: 'The InfluxDB SQL-like query language.',
  },
  [InfluxVersion.SQL]: {
    label: 'SQL',
    value: InfluxVersion.SQL,
    description: 'Native SQL language. Supported in InfluxDB 3.0',
  },
  [InfluxVersion.Flux]: {
    label: 'Flux',
    value: InfluxVersion.Flux,
    description: 'Supported in InfluxDB 2.x and 1.8+',
  },
};

const versions: Array<SelectableValue<InfluxVersion>> = [
  versionMap[InfluxVersion.InfluxQL],
  versionMap[InfluxVersion.SQL],
  versionMap[InfluxVersion.Flux],
];

export type Props = DataSourcePluginOptionsEditorProps<InfluxOptions>;

export const ConfigEditor = (props: Props) => {
  // We duplicate this state so that we allow to write freely inside the input. We don't have
  // any influence over saving so this seems to be only way to do this. The initial value is
  // computed only on first render — this preserves the original class behavior where
  // `this.state.maxSeries` was only initialized in the constructor (no componentDidUpdate sync).
  const [maxSeries, setMaxSeries] = useState<string>(props.options.jsonData.maxSeries?.toString() || '');

  const onVersionChanged = useCallback(
    (selected: SelectableValue<InfluxVersion>) => {
      const { options, onOptionsChange } = props;

      if (selected.value) {
        trackInfluxDBConfigV1QueryLanguageSelection({ version: selected.value });
      }

      const copy: DataSourceSettings<InfluxOptionsV1, {}> = {
        ...options,
        jsonData: {
          ...options.jsonData,
          version: selected.value,
        },
      };
      if (selected.value === InfluxVersion.Flux) {
        copy.access = 'proxy';
        copy.basicAuth = true;
        copy.jsonData.httpMode = 'POST';

        // Remove old 1x configs
        const { user, database, ...rest } = copy;

        onOptionsChange(rest as DataSourceSettings<InfluxOptions, {}>);
      } else {
        onOptionsChange(copy);
      }
    },
    [props]
  );

  const renderJsonDataOptions = () => {
    switch (props.options.jsonData.version) {
      case InfluxVersion.InfluxQL:
        return <InfluxInfluxQLConfig {...props} />;
      case InfluxVersion.Flux:
        return <InfluxFluxConfig {...props} />;
      case InfluxVersion.SQL:
        return <InfluxSqlConfig {...props} />;
      default:
        return <InfluxInfluxQLConfig {...props} />;
    }
  };

  const { options, onOptionsChange } = props;
  const isDirectAccess = options.access === 'direct';

  return (
    <>
      <FieldSet>
        <Text element="h3" variant="h4">
          Query language
        </Text>
        <Field>
          <Select
            aria-label="Query language"
            width={60}
            value={versionMap[options.jsonData.version ?? InfluxVersion.InfluxQL]}
            options={versions}
            defaultValue={versionMap[InfluxVersion.InfluxQL]}
            onChange={onVersionChanged}
          />
        </Field>
      </FieldSet>

      {isDirectAccess && (
        <Alert title="Error" severity="error">
          {BROWSER_MODE_DISABLED_MESSAGE}
        </Alert>
      )}

      <DataSourceHttpSettings
        showAccessOptions={isDirectAccess}
        dataSourceConfig={options}
        defaultUrl="http://localhost:8086"
        onChange={onOptionsChange}
        secureSocksDSProxyEnabled={config.secureSocksDSProxyEnabled}
      />
      <FieldSet>
        <Text element="h3" variant="h4">
          InfluxDB Details
        </Text>
        {renderJsonDataOptions()}
        <InlineField
          labelWidth={20}
          label="Max series"
          tooltip="Limit the number of series/tables that Grafana will process. Lower this number to prevent abuse, and increase it if you have lots of small time series and not all are shown. Defaults to 1000."
        >
          <Input
            placeholder="1000"
            type="number"
            width={40}
            value={maxSeries}
            onChange={(event: { currentTarget: { value: string } }) => {
              setMaxSeries(event.currentTarget.value);
              const val = parseInt(event.currentTarget.value, 10);
              updateDatasourcePluginJsonDataOption(props, 'maxSeries', Number.isFinite(val) ? val : undefined);
            }}
          />
        </InlineField>
      </FieldSet>
    </>
  );
};

export default ConfigEditor;
