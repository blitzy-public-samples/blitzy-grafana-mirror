import { css } from '@emotion/css';
import { useMemo, useState } from 'react';
import Skeleton from 'react-loading-skeleton';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Button, type CellProps, type Column, ConfirmModal, InteractiveTable, Stack, useStyles2 } from '@grafana/ui';
import { type SkeletonComponent, attachSkeleton } from '@grafana/ui/unstable';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';
import { type Organization } from 'app/types/organization';

interface Props {
  orgs: Organization[];
  onDelete: (orgId: number) => void;
}

function AdminOrgsTableComponent({ orgs, onDelete }: Props) {
  const canDeleteOrgs = contextSrv.hasPermission(AccessControlAction.OrgsDelete);

  const [deleteOrg, setDeleteOrg] = useState<Organization>();

  // Memoize the column definitions so the configuration is only recomputed when
  // `canDeleteOrgs` changes; this prevents the InteractiveTable from re-rendering
  // unnecessarily and matches the AAP-mandated useMemo pattern (rule T2).
  const columns = useMemo<Array<Column<Organization>>>(
    () => [
      {
        id: 'id',
        header: t('admin.orgs.id-header', 'ID'),
        cell: ({ row: { original } }: CellProps<Organization>) => (
          <a href={`admin/orgs/edit/${original.id}`}>{original.id}</a>
        ),
      },
      {
        id: 'name',
        header: t('admin.orgs.name-header', 'Name'),
        cell: ({ row: { original } }: CellProps<Organization>) => (
          <a href={`admin/orgs/edit/${original.id}`}>{original.name}</a>
        ),
      },
      {
        id: 'delete',
        header: '',
        cell: ({ row: { original } }: CellProps<Organization>) => (
          <Stack justifyContent="flex-end">
            <Button
              variant="destructive"
              size="sm"
              icon="times"
              onClick={() => setDeleteOrg(original)}
              aria-label={t('admin.admin-orgs-table.aria-label-delete-org', 'Delete org')}
              disabled={!canDeleteOrgs}
            />
          </Stack>
        ),
      },
    ],
    [canDeleteOrgs]
  );

  const deleteOrgName = deleteOrg?.name;
  return (
    <>
      <InteractiveTable columns={columns} data={orgs} getRowId={(org) => `${org.id}-${org.name}`} />
      {deleteOrg && (
        <ConfirmModal
          isOpen
          title={t('admin.admin-orgs-table.title-delete', 'Delete')}
          body={
            <div>
              <Trans i18nKey="admin.orgs.delete-body">
                Are you sure you want to delete &apos;{{ deleteOrgName }}&apos;?
                <br /> <small>All dashboards for this organization will be removed!</small>
              </Trans>
            </div>
          }
          confirmText={t('admin.admin-orgs-table.confirmText-delete', 'Delete')}
          onDismiss={() => setDeleteOrg(undefined)}
          onConfirm={() => {
            onDelete(deleteOrg.id);
            setDeleteOrg(undefined);
          }}
        />
      )}
    </>
  );
}

const AdminOrgsTableSkeleton: SkeletonComponent = ({ rootProps }) => {
  const styles = useStyles2(getSkeletonStyles);
  // The skeleton previously rendered a raw `<table>` purely for layout. We now
  // emit a flex-column container with three skeleton rows whose visual proportions
  // mirror the InteractiveTable above (ID, Name, delete-action). `rootProps`
  // carries the entrance-animation style from `attachSkeleton` and must be forwarded.
  return (
    <div {...rootProps} className={styles.skeletonContainer}>
      {new Array(3).fill(null).map((_, index) => (
        <div key={index} className={styles.skeletonRow}>
          <Skeleton width={16} />
          <Skeleton width={240} />
          <Skeleton containerClassName={styles.deleteButton} width={22} height={24} />
        </div>
      ))}
    </div>
  );
};

export const AdminOrgsTable = attachSkeleton(AdminOrgsTableComponent, AdminOrgsTableSkeleton);

const getSkeletonStyles = (theme: GrafanaTheme2) => ({
  skeletonContainer: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    width: '100%',
  }),
  skeletonRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    padding: theme.spacing(1),
    borderBottom: `1px solid ${theme.colors.border.weak}`,
  }),
  deleteButton: css({
    alignItems: 'center',
    display: 'flex',
    height: 30,
    lineHeight: 1,
  }),
});
