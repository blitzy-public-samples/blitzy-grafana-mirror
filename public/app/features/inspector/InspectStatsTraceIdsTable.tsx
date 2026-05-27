import { css } from '@emotion/css';
import { useCallback, useMemo } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { InteractiveTable, useStyles2, type Column } from '@grafana/ui';

interface Props {
  name: string;
  traceIds: string[];
}

interface TraceIdRow {
  id: string;
  traceId: string;
}

export const InspectStatsTraceIdsTable = ({ name, traceIds }: Props) => {
  const styles = useStyles2(getStyles);

  // Memoize the row data so InteractiveTable receives a stable array reference across
  // renders (per InteractiveTable's docstring: "The data to display in the table. Must
  // be memoized."). Each row carries a stable `id` derived from the original list
  // position so the row identity remains predictable even when duplicate trace IDs
  // appear in the input array.
  const data = useMemo<TraceIdRow[]>(
    () => traceIds.map((traceId, index) => ({ id: `${traceId}-${index}`, traceId })),
    [traceIds]
  );

  // Single column rendering the trace ID. No `header` is provided so the column has no
  // visible label, matching the original header-less <table> structure (the design-
  // system <thead> row is still rendered with empty content — accepted per AAP §0.5.4
  // "within design system defaults").
  const columns = useMemo<Array<Column<TraceIdRow>>>(() => [{ id: 'traceId' }], []);

  // Stable getRowId callback — InteractiveTable threads this through react-table's
  // useTable hook, which expects a referentially stable identifier function.
  const getRowId = useCallback((row: TraceIdRow) => row.id, []);

  if (traceIds.length === 0) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.heading}>{name}</div>
      <InteractiveTable className={styles.table} columns={columns} data={data} getRowId={getRowId} />
    </div>
  );
};

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
  // Preserve the original `width-30` Sass utility's effect (width: 30%) since the
  // legacy className was removed by the <table> → <InteractiveTable> replacement.
  // InteractiveTable forwards `className` onto its inner <table> element (see
  // packages/grafana-ui/src/components/InteractiveTable/InteractiveTable.tsx line 267).
  table: css({
    width: '30%',
  }),
});
