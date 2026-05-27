import { css } from '@emotion/css';
import * as React from 'react';
import Skeleton from 'react-loading-skeleton';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Checkbox, Button, type Column, InteractiveTable, Stack, Tag, ModalsController, useStyles2 } from '@grafana/ui';
import { type DecoratedRevisionModel } from 'app/features/dashboard/types/revisionModels';
import { DashboardInteractions } from 'app/features/dashboard-scene/utils/interactions';

import { RevertDashboardModal } from './RevertDashboardModal';

type VersionsTableProps = {
  versions: DecoratedRevisionModel[];
  canCompare: boolean;
  onCheck: (ev: React.FormEvent<HTMLInputElement>, versionId: number) => void;
  onRestore: (version: DecoratedRevisionModel) => Promise<boolean>;
  isLoadingUserDisplayNames?: boolean;
};

export const VersionHistoryTable = ({
  versions,
  canCompare,
  onCheck,
  onRestore,
  isLoadingUserDisplayNames,
}: VersionsTableProps) => {
  const styles = useStyles2(getStyles);

  const columns: Array<Column<DecoratedRevisionModel>> = [
    {
      id: 'select',
      disableGrow: true,
      cell: ({ row }) => (
        <Checkbox
          aria-label={t(
            'dashboard-scene.version-history-table.aria-label-toggle-selection',
            'Toggle selection of version {{version}}',
            { version: row.original.version }
          )}
          className={styles.inlineCheckbox}
          checked={row.original.checked}
          onChange={(ev) => onCheck(ev, row.original.id)}
          disabled={!row.original.checked && canCompare}
        />
      ),
    },
    {
      id: 'version',
      header: t('dashboard-scene.version-history-table.version', 'Version'),
      disableGrow: true,
      cell: ({ row }) => row.original.version,
    },
    {
      id: 'createdDateString',
      header: t('dashboard-scene.version-history-table.date', 'Date'),
      disableGrow: true,
      cell: ({ row }) => row.original.createdDateString,
    },
    {
      id: 'createdBy',
      header: t('dashboard-scene.version-history-table.updated-by', 'Updated by'),
      disableGrow: true,
      cell: ({ row }) =>
        isLoadingUserDisplayNames ? <Skeleton width={100} /> : row.original.createdBy,
    },
    {
      id: 'message',
      header: t('dashboard-scene.version-history-table.notes', 'Notes'),
      cell: ({ row }) => row.original.message,
    },
    {
      id: 'action',
      disableGrow: true,
      cell: ({ row }) => (
        <Stack justifyContent="flex-end">
          {row.index === 0 ? (
            <Tag name={t('dashboard-scene.version-history-table.name-latest', 'Latest')} colorIndex={17} />
          ) : (
            <ModalsController>
              {({ showModal, hideModal }) => (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="history"
                  onClick={() => {
                    showModal(RevertDashboardModal, {
                      version: row.original,
                      hideModal,
                      onRestore,
                    });
                    DashboardInteractions.versionRestoreClicked({
                      version: row.original.version,
                      index: row.index,
                      confirm: false,
                      version_date: new Date(row.original.created),
                    });
                  }}
                >
                  <Trans i18nKey="dashboard-scene.version-history-table.restore">Restore</Trans>
                </Button>
              )}
            </ModalsController>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <div className={styles.margin}>
      <InteractiveTable
        className={styles.table}
        columns={columns}
        data={versions}
        getRowId={(row) => String(row.id)}
      />
    </div>
  );
};

function getStyles(theme: GrafanaTheme2) {
  return {
    margin: css({
      marginBottom: theme.spacing(4),
    }),
    table: css({
      td: {
        whiteSpace: 'normal !important',
      },
    }),
    inlineCheckbox: css({
      display: 'inline',
    }),
  };
}
