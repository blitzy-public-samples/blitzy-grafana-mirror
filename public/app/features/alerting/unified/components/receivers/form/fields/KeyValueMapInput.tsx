import { css } from '@emotion/css';
import { useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Button, type Column, Input, InteractiveTable, Stack, useStyles2 } from '@grafana/ui';

import { ActionIcon } from '../../../rules/ActionIcon';

interface Props {
  value?: Record<string, string>;
  readOnly?: boolean;
  onChange: (value: Record<string, string>) => void;
}

export const KeyValueMapInput = ({ value, onChange, readOnly = false }: Props) => {
  const styles = useStyles2(getStyles);
  const [pairs, setPairs] = useState(recordToPairs(value));
  const [currentNewPair, setCurrentNewPair] = useState<[string, string] | undefined>(undefined);

  const emitChange = (pairs: Array<[string, string]>) => {
    onChange(pairsToRecord(pairs));
  };

  const deleteItem = (index: number) => {
    const newPairs = pairs.slice();
    const removed = newPairs.splice(index, 1)[0];
    setPairs(newPairs);
    if (removed[0]) {
      emitChange(newPairs);
    }
  };

  type PairRow = { key: string; value: string; index: number };

  const tableData: PairRow[] = pairs.map(([key, value], index) => ({ key, value, index }));

  const columns: Array<Column<PairRow>> = [
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
    columns.push({
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

  return (
    <div>
      {!!pairs.length && (
        <InteractiveTable columns={columns} data={tableData} getRowId={(row) => String(row.index)} />
      )}
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
                emitChange([...pairs, currentNewPair]);
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
