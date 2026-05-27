import { groupBy } from 'lodash';
import { useCallback, useMemo } from 'react';

import { type MetadataInspectorProps } from '@grafana/data';
import { InteractiveTable, type Column } from '@grafana/ui';

import { type CloudWatchDatasource } from '../../datasource';
import { type CloudWatchQuery, type CloudWatchJsonData } from '../../types';

type RowData = {
  refId: string;
  queryId: string | undefined;
  expression: string | undefined;
  period: string | undefined;
};

export type Props = MetadataInspectorProps<CloudWatchDatasource, CloudWatchQuery, CloudWatchJsonData>;

// To view: Query Editor in Dashboard -> Query Inspector -> Meta Data
export function MetaInspector({ data = [] }: Props) {
  const rows = useMemo(() => groupBy(data, 'refId'), [data]);

  const tableData = useMemo<RowData[]>(() => {
    const result: RowData[] = [];
    for (const [refId, frames] of Object.entries(rows)) {
      if (!frames.length) {
        continue;
      }
      const frame = frames[0];
      const custom = frame.meta?.custom;
      if (!custom) {
        continue;
      }
      result.push({
        refId,
        queryId: custom.id,
        expression: frame.meta?.executedQueryString,
        period: custom.period,
      });
    }
    return result;
  }, [rows]);

  const columns = useMemo<Array<Column<RowData>>>(
    () => [
      { id: 'refId', header: 'RefId' },
      { id: 'queryId', header: 'Metric Data Query ID' },
      { id: 'expression', header: 'Metric Data Query Expression' },
      { id: 'period', header: 'Period' },
    ],
    []
  );

  const getRowId = useCallback((row: RowData) => row.refId, []);

  return (
    <>
      <InteractiveTable columns={columns} data={tableData} getRowId={getRowId} />
    </>
  );
}
