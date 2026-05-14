import { css } from '@emotion/css';
import type { JSX } from 'react';

import { type DataSourceJsonData, type DataSourcePluginOptionsEditorProps, type GrafanaTheme2 } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';

import { InlineSwitch } from '../../components/Switch/Switch';
import { useStyles2 } from '../../themes/ThemeContext';
import { InlineField } from '../Forms/InlineField';
import { Box } from '../Layout/Box/Box';
import { Stack } from '../Layout/Stack/Stack';

export interface Props<T extends DataSourceJsonData>
  extends Pick<DataSourcePluginOptionsEditorProps<T>, 'options' | 'onOptionsChange'> {}

export interface SecureSocksProxyConfig extends DataSourceJsonData {
  enableSecureSocksProxy?: boolean;
}

export function SecureSocksProxySettings<T extends SecureSocksProxyConfig>({
  options,
  onOptionsChange,
}: Props<T>): JSX.Element {
  const styles = useStyles2(getStyles);
  return (
    <div>
      <h3 className={styles.pageHeading}>
        <Trans i18nKey="grafana-ui.data-source-settings.secure-socks-heading">Secure Socks Proxy</Trans>
      </h3>
      <Box marginBottom={5}>
        <Stack direction="row" alignItems="flex-start" wrap>
          <Box position="relative" marginBottom={0.5}>
            <Stack direction="row" alignItems="flex-start">
              <InlineField
                labelWidth={26}
                label={t('grafana-ui.data-source-settings.secure-socks-label', 'Enabled')}
                tooltip={t(
                  'grafana-ui.data-source-settings.secure-socks-tooltip',
                  'Connect to this datasource via the secure socks proxy.'
                )}
              >
                <InlineSwitch
                  value={options.jsonData.enableSecureSocksProxy ?? false}
                  onChange={(event) =>
                    onOptionsChange({
                      ...options,
                      jsonData: { ...options.jsonData, enableSecureSocksProxy: event!.currentTarget.checked },
                    })
                  }
                />
              </InlineField>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  pageHeading: css({
    fontSize: theme.typography.h4.fontSize,
    marginTop: 0,
    marginBottom: theme.spacing(2),
  }),
});
