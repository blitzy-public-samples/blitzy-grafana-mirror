// Libraries
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

// Components
import {
  type DataSourceInstanceSettings,
  type DataSourceRef,
  getDataSourceUID,
  isUnsignedPluginSignature,
  type SelectableValue,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { type ActionMeta, PluginSignatureBadge, Select, Stack } from '@grafana/ui';

import { getDataSourceSrv } from '../services/dataSourceSrv';

import { ExpressionDatasourceRef } from './../utils/DataSourceWithBackend';

/**
 * Component props description for the {@link DataSourcePicker}
 *
 * @internal
 */
export interface DataSourcePickerProps {
  onChange: (ds: DataSourceInstanceSettings) => void;
  current: DataSourceRef | string | null; // uid
  hideTextValue?: boolean;
  onBlur?: () => void;
  autoFocus?: boolean;
  openMenuOnFocus?: boolean;
  placeholder?: string;
  tracing?: boolean;
  mixed?: boolean;
  dashboard?: boolean;
  metrics?: boolean;
  type?: string | string[];
  annotations?: boolean;
  variables?: boolean;
  alerting?: boolean;
  pluginId?: string;
  /** If true,we show only DSs with logs; and if true, pluginId shouldnt be passed in */
  logs?: boolean;
  // If set to true and there is no value select will be empty, otherwise it will preselect default data source
  noDefault?: boolean;
  width?: number;
  inputId?: string;
  filter?: (dataSource: DataSourceInstanceSettings) => boolean;
  onClear?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
}

/**
 * Component state description for the {@link DataSourcePicker}
 *
 * @internal
 */
export interface DataSourcePickerState {
  error?: string;
}

/**
 * Component to be able to select a datasource from the list of installed and enabled
 * datasources in the current Grafana instance.
 *
 * @internal
 */
const DataSourcePickerComponent = ({
  onChange: onChangeProp,
  current = null,
  hideTextValue,
  onBlur,
  autoFocus = false,
  openMenuOnFocus = false,
  placeholder = 'Select data source',
  tracing,
  mixed,
  dashboard,
  metrics,
  type,
  annotations,
  variables,
  alerting,
  pluginId,
  logs,
  noDefault,
  width,
  inputId,
  filter,
  onClear,
  invalid,
  disabled = false,
  isLoading = false,
}: Partial<DataSourcePickerProps>) => {
  const [error, setError] = useState<string | undefined>(undefined);

  const dataSourceSrv = useMemo(() => getDataSourceSrv(), []);

  useEffect(() => {
    const dsSettings = dataSourceSrv.getInstanceSettings(current);
    if (!dsSettings) {
      setError('Could not find data source ' + current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserves componentDidMount-only semantics; current is read on mount only
  }, []);

  const onChange = useCallback(
    (item: SelectableValue<string>, actionMeta: ActionMeta) => {
      if (actionMeta.action === 'clear' && onClear) {
        onClear();
        return;
      }

      const dsSettings = dataSourceSrv.getInstanceSettings(item.value);

      if (dsSettings) {
        onChangeProp?.(dsSettings);
        setError(undefined);
      }
    },
    [dataSourceSrv, onChangeProp, onClear]
  );

  const value = useMemo<SelectableValue<string> | undefined>(() => {
    if (!current && noDefault) {
      return;
    }

    const ds = dataSourceSrv.getInstanceSettings(current);

    if (ds) {
      return {
        label: ds.name,
        value: ds.uid,
        imgUrl: ds.meta.info.logos.small,
        hideText: hideTextValue,
        meta: ds.meta,
      };
    }

    const uid = getDataSourceUID(current);

    if (uid === ExpressionDatasourceRef.uid || uid === ExpressionDatasourceRef.name) {
      return { label: uid, value: uid, hideText: hideTextValue };
    }

    return {
      label: (uid ?? 'no name') + ' - not found',
      value: uid ?? undefined,
      imgUrl: '',
      hideText: hideTextValue,
    };
  }, [current, hideTextValue, noDefault, dataSourceSrv]);

  const options = useMemo(() => {
    return dataSourceSrv
      .getList({
        alerting,
        tracing,
        metrics,
        logs,
        dashboard,
        mixed,
        variables,
        annotations,
        pluginId,
        filter,
        type,
      })
      .map((ds) => ({
        value: ds.name,
        label: `${ds.name}${ds.isDefault ? ' (default)' : ''}`,
        imgUrl: ds.meta.info.logos.small,
        meta: ds.meta,
      }));
  }, [
    alerting,
    tracing,
    metrics,
    logs,
    dashboard,
    mixed,
    variables,
    annotations,
    pluginId,
    filter,
    type,
    dataSourceSrv,
  ]);

  const isClearable = typeof onClear === 'function';

  return (
    <div
      aria-label="Data source picker select container"
      data-testid={selectors.components.DataSourcePicker.container}
    >
      <Select
        isLoading={isLoading}
        disabled={disabled}
        aria-label={'Select a data source'}
        data-testid={selectors.components.DataSourcePicker.inputV2}
        inputId={inputId || 'data-source-picker'}
        className="ds-picker select-container"
        isMulti={false}
        isClearable={isClearable}
        backspaceRemovesValue={false}
        onChange={onChange}
        options={options}
        autoFocus={autoFocus}
        onBlur={onBlur}
        width={width}
        openMenuOnFocus={openMenuOnFocus}
        maxMenuHeight={500}
        placeholder={placeholder}
        noOptionsMessage="No datasources found"
        value={value ?? null}
        invalid={Boolean(error) || Boolean(invalid)}
        getOptionLabel={(o) => {
          if (o.meta && isUnsignedPluginSignature(o.meta.signature) && o !== value) {
            return (
              <Stack alignItems="center" justifyContent="space-between">
                <span>{o.label}</span> <PluginSignatureBadge status={o.meta.signature} />
              </Stack>
            );
          }
          return o.label || '';
        }}
      />
    </div>
  );
};

export const DataSourcePicker = memo(DataSourcePickerComponent);

DataSourcePicker.displayName = 'DataSourcePicker';
