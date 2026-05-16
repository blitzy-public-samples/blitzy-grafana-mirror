import { css } from '@emotion/css';
import * as React from 'react';

import { type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { EditorField, EditorRow } from '@grafana/plugin-ui';
import { TextArea, Input, useStyles2 } from '@grafana/ui';

import { type PromQLQuery } from '../dataquery.gen';
import type CloudMonitoringDatasource from '../datasource';
import { selectors } from '../e2e/selectors';

import { Project } from './Project';

export interface Props {
  refId: string;
  variableOptionGroup: SelectableValue<string>;
  onChange: (query: PromQLQuery) => void;
  onRunQuery: () => void;
  query: PromQLQuery;
  datasource: CloudMonitoringDatasource;
}

export const defaultQuery: (dataSource: CloudMonitoringDatasource) => PromQLQuery = (dataSource) => ({
  projectName: dataSource.getDefaultProject(),
  expr: '',
  step: '10s',
});

export function PromQLQueryEditor({
  refId,
  query,
  datasource,
  onChange,
  variableOptionGroup,
  onRunQuery,
}: React.PropsWithChildren<Props>) {
  function onReturnKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && e.shiftKey) {
      onRunQuery();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  const styles = useStyles2(getStyles);

  return (
    <span data-testid={selectors.components.queryEditor.promQlQueryEditor.container.input}>
      <EditorRow>
        <Project
          refId={refId}
          templateVariableOptions={variableOptionGroup.options}
          projectName={query.projectName}
          datasource={datasource}
          onChange={(projectName) => onChange({ ...query, projectName })}
        />
        <TextArea
          name="Query"
          className={styles.queryField}
          value={query.expr}
          rows={10}
          placeholder="Enter a Cloud Monitoring Prometheus query (Run with Shift+Enter)"
          onBlur={onRunQuery}
          onKeyDown={onReturnKeyDown}
          onChange={(e) => onChange({ ...query, expr: e.currentTarget.value })}
        />
        <EditorField
          label="Min step"
          tooltip={
            'Time units and built-in variables can be used here, for example: $__interval, $__rate_interval, 5s, 1m, 3h, 1d, 1y (Default if no unit is specified: 10s)'
          }
        >
          <Input
            type={'string'}
            placeholder={'auto'}
            onChange={(e) => onChange({ ...query, step: e.currentTarget.value })}
            onKeyDown={onReturnKeyDown}
            value={query.step ?? ''}
          />
        </EditorField>
      </EditorRow>
    </span>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  queryField: css({
    fontSize: theme.typography.fontSize,
    fontFamily: theme.typography.fontFamilyMonospace,
    height: 'auto',
    wordBreak: 'break-word',
    overflow: 'auto',
  }),
});
