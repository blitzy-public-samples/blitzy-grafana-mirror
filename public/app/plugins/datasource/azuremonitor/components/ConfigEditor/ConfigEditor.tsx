import { css } from '@emotion/css';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  type DataSourcePluginOptionsEditorProps,
  type GrafanaTheme2,
  type SelectableValue,
  updateDatasourcePluginOption,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { AdvancedHttpSettings, ConfigSection, DataSourceDescription } from '@grafana/plugin-ui';
import { type FetchErrorDataProps, getBackendSrv, isFetchError, config } from '@grafana/runtime';
import { Alert, Divider, SecureSocksProxySettings, useStyles2 } from '@grafana/ui';

import ResponseParser from '../../azure_monitor/response_parser';
import {
  type AzureAPIResponse,
  type AzureMonitorDataSourceJsonData,
  type AzureMonitorDataSourceSecureJsonData,
  type AzureMonitorDataSourceSettings,
  type Subscription,
} from '../../types/types';
import { routeNames } from '../../utils/common';

import { MonitorConfig } from './MonitorConfig';

export type Props = DataSourcePluginOptionsEditorProps<
  AzureMonitorDataSourceJsonData,
  AzureMonitorDataSourceSecureJsonData
>;

interface ErrorMessage {
  title: string;
  description: string;
  details?: string;
}

/**
 * @deprecated Retained as a public type for API stability after the class→functional conversion.
 * Internally the component now manages `unsaved` via useRef and `error` via useState.
 */
export interface State {
  unsaved: boolean;
  error?: ErrorMessage;
}

// Note: removed unused class field `templateSrv: TemplateSrv = getTemplateSrv();` during
// class→functional conversion (was never read in the original class body). Corresponding
// imports (`getTemplateSrv`, `TemplateSrv` from `@grafana/runtime`) also removed because
// `noUnusedLocals: true` would otherwise reject the new functional structure.
export const ConfigEditor = (props: Props) => {
  const { options, onOptionsChange } = props;
  const styles = useStyles2(getStyles);

  // useRef instead of useState because `unsaved` is never rendered (only checked in async saveOptions).
  // This avoids stale-closure issues and prevents wasted re-renders when only the persistence flag toggles.
  const unsavedRef = useRef<boolean>(false);
  const [error, setError] = useState<ErrorMessage | undefined>(undefined);

  const baseURL = useMemo(
    () => `/api/datasources/uid/${options.uid}/resources/${routeNames.azureMonitor}/subscriptions`,
    [options.uid]
  );

  const updateOptions = useCallback(
    (optionsFunc: (options: AzureMonitorDataSourceSettings) => AzureMonitorDataSourceSettings): void => {
      const updated = optionsFunc(options);
      onOptionsChange(updated);
      unsavedRef.current = true;
    },
    [options, onOptionsChange]
  );

  const saveOptions = useCallback(async (): Promise<void> => {
    if (unsavedRef.current) {
      await getBackendSrv()
        .put<{ datasource: AzureMonitorDataSourceSettings }>(`/api/datasources/uid/${options.uid}`, options)
        .then((result) => {
          updateDatasourcePluginOption(props, 'version', result.datasource.version);
        });
      unsavedRef.current = false;
    }
  }, [options, props]);

  const getSubscriptions = useCallback(async (): Promise<Array<SelectableValue<string>>> => {
    await saveOptions();

    const query = `?api-version=2019-03-01`;
    try {
      const result = await getBackendSrv()
        .fetch<AzureAPIResponse<Subscription>>({
          url: baseURL + query,
          method: 'GET',
        })
        .toPromise();

      setError(undefined);
      return ResponseParser.parseSubscriptionsForSelect(result);
    } catch (err) {
      // Narrow the error body to the canonical fetch-error shape so the
      // `details` field receives the upstream Azure failure message verbatim.
      if (isFetchError<FetchErrorDataProps>(err)) {
        setError({
          title: 'Error requesting subscriptions',
          description: 'Could not request subscriptions from Azure. Check your credentials and try again.',
          details: err?.data?.message,
        });
      }
      return Promise.resolve([]);
    }
  }, [baseURL, saveOptions]);

  return (
    <>
      <DataSourceDescription
        dataSourceName="Azure Monitor"
        docsLink="https://grafana.com/docs/grafana/latest/datasources/azure-monitor/"
        hasRequiredFields
      />
      <Divider />
      <MonitorConfig options={options} updateOptions={updateOptions} getSubscriptions={getSubscriptions} />
      {error && (
        <Alert severity="error" title={error.title}>
          <p>{error.description}</p>
          {/* Design system gap: <details>/<summary> has no @grafana/ui equivalent (as of @grafana/ui 13.0.0-pre). Kept as raw HTML for native progressive-enhancement semantics. */}
          {error.details && <details className={styles.errorDetails}>{error.details}</details>}
        </Alert>
      )}
      <>
        <Divider />
        <ConfigSection
          title={t('components.config-editor.title-additional-settings', 'Additional settings')}
          description={t(
            'components.config-editor.description-additional-settings',
            'Additional settings are optional settings that can be configured for more control over your data source. This includes Secure Socks Proxy, request timeout, and forwarded cookies.'
          )}
          isCollapsible={true}
          isInitiallyOpen={
            options.jsonData.enableSecureSocksProxy !== undefined ||
            options.jsonData.timeout !== undefined ||
            options.jsonData.keepCookies !== undefined
          }
        >
          <AdvancedHttpSettings config={options} onChange={onOptionsChange} />
          {config.secureSocksDSProxyEnabled && (
            <SecureSocksProxySettings options={options} onOptionsChange={onOptionsChange} />
          )}
        </ConfigSection>
      </>
    </>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  errorDetails: css({
    whiteSpace: 'pre-wrap',
  }),
});

export default ConfigEditor;
