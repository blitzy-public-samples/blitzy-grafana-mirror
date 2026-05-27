import { useCallback } from 'react';

import {
  type DataQuery,
  type DataSourceApi,
  type DataSourceJsonData,
  type QueryEditorProps,
  type StandardVariableQuery,
} from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import { pluginImporter } from '../../plugins/importer/pluginImporter';
import {
  hasCustomVariableSupport,
  hasDatasourceVariableSupport,
  hasLegacyVariableSupport,
  hasStandardVariableSupport,
} from '../guard';
import { type VariableQueryEditorType } from '../types';

import { LegacyVariableQueryEditor } from './LegacyVariableQueryEditor';

export async function getVariableQueryEditor<
  TQuery extends DataQuery = DataQuery,
  TOptions extends DataSourceJsonData = DataSourceJsonData,
  VariableQuery extends DataQuery = TQuery,
>(
  datasource: DataSourceApi<TQuery, TOptions>,
  importDataSourcePluginFunc = pluginImporter.importDataSource
): Promise<VariableQueryEditorType> {
  if (hasCustomVariableSupport(datasource)) {
    return datasource.variables.editor;
  }

  if (hasDatasourceVariableSupport(datasource)) {
    const dsPlugin = await importDataSourcePluginFunc(datasource.meta!);

    if (!dsPlugin.components.QueryEditor) {
      throw new Error('Missing QueryEditor in plugin definition.');
    }

    return dsPlugin.components.QueryEditor ?? null;
  }

  if (hasStandardVariableSupport(datasource)) {
    return StandardVariableQueryEditor;
  }

  if (hasLegacyVariableSupport(datasource)) {
    const dsPlugin = await importDataSourcePluginFunc(datasource.meta!);
    return dsPlugin.components.VariableQueryEditor ?? LegacyVariableQueryEditor;
  }

  return null;
}

export function StandardVariableQueryEditor<
  TQuery extends DataQuery = DataQuery,
  TOptions extends DataSourceJsonData = DataSourceJsonData,
>({
  datasource: propsDatasource,
  query: propsQuery,
  onChange: propsOnChange,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeScript's invariance in DataSourceApi's generic parameters means a parameterized DataSourceApi<TQuery, TOptions> cannot be assigned to LegacyVariableQueryEditor's default DataSourceApi parameter through React's PropTypes validation chain; preserving `any` here matches the variance-driven pattern documented in the parent `types.ts` (see VariableQueryEditorType).
}: QueryEditorProps<any, TQuery, TOptions, StandardVariableQuery>) {
  const onChange = useCallback(
    (query: string) => {
      propsOnChange({ refId: 'StandardVariableQuery', query });
    },
    [propsOnChange]
  );

  return (
    <LegacyVariableQueryEditor
      query={propsQuery.query}
      onChange={onChange}
      datasource={propsDatasource}
      templateSrv={getTemplateSrv()}
    />
  );
}
