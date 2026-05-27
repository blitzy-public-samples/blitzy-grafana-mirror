import { css } from '@emotion/css';
import * as React from 'react';

import {
  type DataSourceJsonData,
  type DataSourcePluginOptionsEditorProps,
  type GrafanaTheme2,
  updateDatasourcePluginJsonDataOption,
} from '@grafana/data';
import { InlineField, InlineFieldRow, InlineSwitch, useStyles2 } from '@grafana/ui';

export interface TraceIdTimeParamsOptions {
  enabled?: boolean;
}

export interface TraceIdTimeParamsData extends DataSourceJsonData {
  traceIdTimeParams?: TraceIdTimeParamsOptions;
}

interface Props extends DataSourcePluginOptionsEditorProps<TraceIdTimeParamsData> {}

export function TraceIdTimeParams({ options, onOptionsChange }: Props) {
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Query Trace by ID with Time Params</h3>
      <InlineFieldRow className={styles.row}>
        <InlineField
          tooltip="pass time parameters when querying trace by ID"
          label="Enable Time Parameters"
          labelWidth={26}
        >
          <InlineSwitch
            id="enableTraceIdTimeParams"
            value={options.jsonData.traceIdTimeParams?.enabled}
            onChange={(event: React.SyntheticEvent<HTMLInputElement>) =>
              updateDatasourcePluginJsonDataOption({ onOptionsChange, options }, 'traceIdTimeParams', {
                ...options.jsonData.traceIdTimeParams,
                enabled: event.currentTarget.checked,
              })
            }
          />
        </InlineField>
      </InlineFieldRow>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css({
    label: 'container',
    width: '100%',
  }),
  row: css({
    label: 'row',
    alignItems: 'baseline',
  }),
  heading: css({
    label: 'heading',
    fontSize: theme.typography.h4.fontSize,
    marginTop: 0,
    marginBottom: theme.spacing(2),
  }),
});
