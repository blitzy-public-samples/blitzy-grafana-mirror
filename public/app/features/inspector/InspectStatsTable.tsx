import { css } from '@emotion/css';
import { useCallback, useMemo } from 'react';

import {
  FieldType,
  formattedValueToString,
  getDisplayProcessor,
  type GrafanaTheme2,
  type QueryResultMetaStat,
  type TimeZone,
} from '@grafana/data';
import { InteractiveTable, useStyles2, useTheme2, type Column } from '@grafana/ui';

interface InspectStatsTableProps {
  timeZone: TimeZone;
  name: string;
  stats: QueryResultMetaStat[];
}

export const InspectStatsTable = ({ timeZone, name, stats }: InspectStatsTableProps) => {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);

  // Memoize the data and columns passed to InteractiveTable as required by its API contract
  // (the columns/data props "must be memoized" per InteractiveTable's BaseProps docs).
  const data = useMemo(() => stats, [stats]);

  const columns = useMemo<Array<Column<QueryResultMetaStat>>>(
    () => [
      { id: 'displayName' },
      {
        id: 'value',
        cell: ({ row: { original } }) => <div className={styles.cell}>{formatStat(original, timeZone, theme)}</div>,
      },
    ],
    [timeZone, theme, styles]
  );

  // Preserves the original `${stat.displayName}-${index}` row key pattern.
  const getRowId = useCallback((stat: QueryResultMetaStat, index: number) => `${stat.displayName}-${index}`, []);

  // Note: hooks above MUST be called before this early return per react-hooks/rules-of-hooks.
  if (!stats || !stats.length) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.heading}>{name}</div>
      <InteractiveTable className={styles.table} columns={columns} data={data} getRowId={getRowId} />
    </div>
  );
};

function formatStat(stat: QueryResultMetaStat, timeZone: TimeZone, theme: GrafanaTheme2): string {
  const display = getDisplayProcessor({
    field: {
      type: FieldType.number,
      config: stat,
    },
    theme,
    timeZone,
  });
  return formattedValueToString(display(stat.value));
}

const getStyles = (theme: GrafanaTheme2) => ({
  heading: css({
    fontSize: theme.typography.body.fontSize,
    marginBottom: theme.spacing(1),
  }),
  wrapper: css({
    paddingBottom: theme.spacing(2),
  }),
  cell: css({
    textAlign: 'right',
  }),
  // Preserves the original `width-30` Sass utility (30% table width).
  table: css({
    width: '30%',
  }),
});
