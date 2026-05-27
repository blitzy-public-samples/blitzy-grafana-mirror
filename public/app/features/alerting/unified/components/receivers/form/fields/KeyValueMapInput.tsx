import { css } from '@emotion/css';
import { useCallback, useMemo, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Button, type Column, Input, InteractiveTable, Stack, useStyles2 } from '@grafana/ui';

import { ActionIcon } from '../../../rules/ActionIcon';

interface Props {
  value?: Record<string, string>;
  readOnly?: boolean;
  onChange: (value: Record<string, string>) => void;
}

// Row shape consumed by `InteractiveTable`. Each row carries its source-array
// `index` so the actions column's delete handler can mutate the right entry
// even after sorting or pagination by `InteractiveTable` rearranges the
// visible row order.
type PairRow = { key: string; value: string; index: number };

export const KeyValueMapInput = ({ value, onChange, readOnly = false }: Props) => {
  const styles = useStyles2(getStyles);
  const [pairs, setPairs] = useState(recordToPairs(value));
  const [currentNewPair, setCurrentNewPair] = useState<[string, string] | undefined>(undefined);

  // Stable delete handler. Uses functional `setPairs` so it can read the latest
  // pairs without participating in this hook's dependency list, and only depends
  // on `onChange` (the only external value referenced). Stability matters because
  // `InteractiveTable`'s memoized `columns` close over this callback in the
  // actions cell renderer.
  const deleteItem = useCallback(
    (index: number) => {
      setPairs((prev) => {
        const newPairs = prev.slice();
        const removed = newPairs.splice(index, 1)[0];
        if (removed[0]) {
          onChange(pairsToRecord(newPairs));
        }
        return newPairs;
      });
    },
    [onChange]
  );

  // Memoize the row dataset so `InteractiveTable` receives a stable reference
  // whenever `pairs` is unchanged. Recomputed only when the underlying entry
  // list changes; the projection itself is cheap but the stable identity helps
  // `InteractiveTable`'s internal `useMemo`/`useTable` machinery avoid extra
  // reconciliation work.
  const tableData = useMemo<PairRow[]>(
    () => pairs.map(([key, value], index) => ({ key, value, index })),
    [pairs]
  );

  // Memoize the column definitions per the `InteractiveTable` contract
  // ("Table's columns definition. Must be memoized."). The `t` helper from
  // `@grafana/i18n` is module-stable and intentionally omitted from deps.
  // The actions column is conditionally appended based on `readOnly`, so the
  // `readOnly` and `deleteItem` references are the only varying inputs.
  const columns = useMemo<Array<Column<PairRow>>>(() => {
    const cols: Array<Column<PairRow>> = [
      {
        id: 'key',
        header: t('alerting.key-value-map-input.name', 'Name'),
        cell: ({ row }) => <Input readOnly={readOnly} value={row.original.key} disabled />,
      },
      {
        id: 'value',
        header: t('alerting.key-value-map-input.value', 'Value'),
        cell: ({ row }) => <Input readOnly={readOnly} value={row.original.value} disabled />,
      },
    ];

    if (!readOnly) {
      cols.push({
        id: 'actions',
        disableGrow: true,
        cell: ({ row }) => (
          <ActionIcon
            icon="trash-alt"
            tooltip={t('alerting.common.delete', 'Delete')}
            onClick={() => deleteItem(row.original.index)}
          />
        ),
      });
    }

    return cols;
  }, [readOnly, deleteItem]);

  // Stable row-id resolver: each `PairRow` carries a numeric `index` that
  // uniquely identifies its position in the source pairs array, so deriving
  // the row id from that value is referentially stable across renders for
  // identical data.
  const getRowId = useCallback((row: PairRow) => String(row.index), []);

  return (
    <div>
      {!!pairs.length && <InteractiveTable columns={columns} data={tableData} getRowId={getRowId} />}
      {currentNewPair && (
        <Stack direction="row" gap={1}>
          <Input
            value={currentNewPair[0]}
            onChange={(e) => setCurrentNewPair([e.currentTarget.value, currentNewPair[1]])}
          />
          <Input
            value={currentNewPair[1]}
            onChange={(e) => setCurrentNewPair([currentNewPair[0], e.currentTarget.value])}
          />
          <Stack gap={1}>
            <ActionIcon
              icon="check"
              tooltip={t('alerting.contact-points.key-value-map.confirm-add', 'Confirm to add')}
              onClick={() => {
                setPairs([...pairs, currentNewPair]);
                setCurrentNewPair(undefined);
                onChange(pairsToRecord([...pairs, currentNewPair]));
              }}
            />
            <ActionIcon
              icon="times"
              tooltip={t('alerting.common.cancel', 'Cancel')}
              onClick={() => setCurrentNewPair(undefined)}
            />
          </Stack>
        </Stack>
      )}
      {!readOnly && (
        <Button
          className={styles.addButton}
          type="button"
          variant="secondary"
          icon="plus"
          size="sm"
          disabled={!!currentNewPair}
          onClick={() => setCurrentNewPair(['', ''])}
        >
          <Trans i18nKey="alerting.contact-points.key-value-map.add">Add</Trans>
        </Button>
      )}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  addButton: css({
    marginTop: theme.spacing(1),
  }),
});

const pairsToRecord = (pairs: Array<[string, string]>): Record<string, string> => {
  const record: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (key) {
      record[key] = value;
    }
  }
  return record;
};

const recordToPairs = (obj?: Record<string, string>): Array<[string, string]> => Object.entries(obj ?? {});
