import { css } from '@emotion/css';
import type { JSX } from 'react';

import { type GrafanaTheme2, type DataSourceJsonData, type DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';

import { InlineSwitch } from '../../components/Switch/Switch';
import { useStyles2 } from '../../themes/ThemeContext';
import { InlineField } from '../Forms/InlineField';
import { Box } from '../Layout/Box/Box';
import { Stack } from '../Layout/Stack/Stack';

export interface Props<T extends DataSourceJsonData>
  extends Pick<DataSourcePluginOptionsEditorProps<T>, 'options' | 'onOptionsChange'> {}

export interface AlertingConfig extends DataSourceJsonData {
  manageAlerts?: boolean;
}

export function AlertingSettings<T extends AlertingConfig>({ options, onOptionsChange }: Props<T>): JSX.Element {
  const styles = useStyles2(getStyles);
  return (
    <>
      <h3 className={styles.pageHeading}>
        <Trans i18nKey="grafana-ui.data-source-settings.alerting-settings-heading">Alerting</Trans>
      </h3>
      <Box marginBottom={5}>
        <Stack direction="row" alignItems="flex-start" wrap>
          <Box marginBottom={0.5} position="relative">
            <Stack direction="row" alignItems="flex-start">
              <InlineField
                labelWidth={29}
                label={t(
                  'grafana-ui.data-source-settings.alerting-settings-label',
                  'Manage alert rules in Alerting UI'
                )}
                disabled={options.readOnly}
                tooltip={t(
                  'grafana-ui.data-source-settings.alerting-settings-tooltip',
                  'Manage alert rules for this data source. To manage other alerting resources, add an Alertmanager data source.'
                )}
              >
                <InlineSwitch
                  value={options.jsonData.manageAlerts !== false}
                  onChange={(event) =>
                    onOptionsChange({
                      ...options,
                      jsonData: { ...options.jsonData, manageAlerts: event!.currentTarget.checked },
                    })
                  }
                />
              </InlineField>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  pageHeading: css({
    fontSize: theme.typography.h4.fontSize,
    marginTop: 0,
    marginBottom: theme.spacing(2),
  }),
});
