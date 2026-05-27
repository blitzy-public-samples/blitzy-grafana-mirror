import { css } from '@emotion/css';
import { type FormEvent, useMemo } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import {
  Button,
  type CellProps,
  Checkbox,
  type Column,
  InteractiveTable,
  ModalsController,
  Stack,
  Tag,
  useStyles2,
} from '@grafana/ui';
import { type DecoratedRevisionModel } from 'app/features/dashboard/types/revisionModels';

import { RevertDashboardModal } from './RevertDashboardModal';

type VersionsTableProps = {
  versions: DecoratedRevisionModel[];
  canCompare: boolean;
  onCheck: (ev: FormEvent<HTMLInputElement>, versionId: number) => void;
};

export const VersionHistoryTable = ({ versions, canCompare, onCheck }: VersionsTableProps) => {
  const styles = useStyles2(getStyles);

  const columns: Array<Column<DecoratedRevisionModel>> = useMemo(
    () => [
      {
        id: 'select',
        disableGrow: true,
        cell: ({ row: { original: version } }: CellProps<DecoratedRevisionModel>) => (
          <Checkbox
            aria-label={t(
              'dashboard.version-history-table.aria-label-toggle-selection',
              'Toggle selection of version {{version}}',
              { version: version.version }
            )}
            checked={version.checked}
            onChange={(ev) => onCheck(ev, version.id)}
            disabled={!version.checked && canCompare}
          />
        ),
      },
      {
        id: 'version',
        disableGrow: true,
        header: t('dashboard.version-history-table.version', 'Version'),
        cell: ({ row: { original: version } }: CellProps<DecoratedRevisionModel>) => <>{version.version}</>,
      },
      {
        id: 'createdDateString',
        disableGrow: true,
        header: t('dashboard.version-history-table.date', 'Date'),
        cell: ({ row: { original: version } }: CellProps<DecoratedRevisionModel>) => <>{version.createdDateString}</>,
      },
      {
        id: 'createdBy',
        disableGrow: true,
        header: t('dashboard.version-history-table.updated-by', 'Updated by'),
        cell: ({ row: { original: version } }: CellProps<DecoratedRevisionModel>) => <>{version.createdBy}</>,
      },
      {
        id: 'message',
        header: t('dashboard.version-history-table.notes', 'Notes'),
        cell: ({ row: { original: version } }: CellProps<DecoratedRevisionModel>) => <>{version.message}</>,
      },
      {
        id: 'actions',
        disableGrow: true,
        cell: ({ row: { index, original: version } }: CellProps<DecoratedRevisionModel>) => (
          <Stack direction="row" justifyContent="flex-end">
            {index === 0 ? (
              <Tag name={t('dashboard.version-history-table.name-latest', 'Latest')} colorIndex={17} />
            ) : (
              <ModalsController>
                {({ showModal, hideModal }) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="history"
                    onClick={() => {
                      showModal(RevertDashboardModal, {
                        id: version.id,
                        version: version.version,
                        hideModal,
                      });
                    }}
                  >
                    <Trans i18nKey="dashboard.version-history-table.restore">Restore</Trans>
                  </Button>
                )}
              </ModalsController>
            )}
          </Stack>
        ),
      },
    ],
    [canCompare, onCheck]
  );

  return (
    <div className={styles.margin}>
      <InteractiveTable columns={columns} data={versions} getRowId={(row) => String(row.id)} />
    </div>
  );
};

function getStyles(theme: GrafanaTheme2) {
  return {
    margin: css({
      marginBottom: theme.spacing(4),
    }),
  };
}
