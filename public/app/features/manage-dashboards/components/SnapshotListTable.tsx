import { useState, useCallback, useMemo } from 'react';
import Skeleton from 'react-loading-skeleton';
import useAsync from 'react-use/lib/useAsync';

import { Trans, t } from '@grafana/i18n';
import { config } from '@grafana/runtime';
import { Button, type Column, ConfirmModal, EmptyState, InteractiveTable, LinkButton, TextLink } from '@grafana/ui';
import { contextSrv } from 'app/core/services/context_srv';
import { getDashboardSnapshotSrv, type Snapshot } from 'app/features/dashboard/services/SnapshotSrv';
import { AccessControlAction } from 'app/types/accessControl';

export async function getSnapshots() {
  return getDashboardSnapshotSrv()
    .getSnapshots()
    .then((result: Snapshot[]) => {
      return result.map((snapshot) => ({
        ...snapshot,
        url: `${config.appUrl}dashboard/snapshot/${snapshot.key}`,
      }));
    });
}

// Number of placeholder rows rendered while the snapshot list is fetching so the
// InteractiveTable chrome remains stable and shows skeleton cells across columns.
const SKELETON_ROW_COUNT = 3;

export const SnapshotListTable = () => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [removeSnapshot, setRemoveSnapshot] = useState<Snapshot | undefined>();
  useAsync(async () => {
    setIsFetching(true);
    const response = await getSnapshots();
    setIsFetching(false);
    setSnapshots(response);
  }, [setSnapshots]);

  const doRemoveSnapshot = useCallback(
    async (snapshot: Snapshot) => {
      const filteredSnapshots = snapshots.filter((ss) => ss.key !== snapshot.key);
      setSnapshots(filteredSnapshots);
      await getDashboardSnapshotSrv()
        .deleteSnapshot(snapshot.key)
        .catch(() => {
          setSnapshots(snapshots);
        });
    },
    [snapshots]
  );

  // Placeholder rows used while fetching so the table chrome stays stable and shows skeleton cells.
  // Synthetic keys (`skeleton-N`) cannot collide with real snapshot keys (32-character random strings).
  const skeletonRows = useMemo<Snapshot[]>(
    () =>
      Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({
        key: `skeleton-${i}`,
        name: '',
        url: '',
        external: false,
      })),
    []
  );

  const data = useMemo(() => (isFetching ? skeletonRows : snapshots), [isFetching, skeletonRows, snapshots]);

  const columns = useMemo<Array<Column<Snapshot>>>(
    () => [
      {
        id: 'name',
        header: t('snapshot.name-column-header', 'Name'),
        cell: ({ row: { original: snapshot } }) => {
          if (isFetching) {
            return <Skeleton width={80} />;
          }
          const url = snapshot.externalUrl || snapshot.url;
          return <a href={url}>{snapshot.name}</a>;
        },
      },
      {
        id: 'url',
        header: t('snapshot.url-column-header', 'Snapshot url'),
        cell: ({ row: { original: snapshot } }) => {
          if (isFetching) {
            return <Skeleton width={240} />;
          }
          const url = snapshot.externalUrl || snapshot.url;
          return <a href={url}>{url}</a>;
        },
      },
      {
        id: 'external',
        disableGrow: true,
        cell: ({ row: { original: snapshot } }) => {
          if (isFetching) {
            return null;
          }
          return snapshot.external ? <Trans i18nKey="snapshot.external-badge">External</Trans> : null;
        },
      },
      {
        id: 'view',
        disableGrow: true,
        cell: ({ row: { original: snapshot } }) => {
          if (isFetching) {
            return <Skeleton width={63} height={24} />;
          }
          const url = snapshot.externalUrl || snapshot.url;
          return (
            <LinkButton href={url} variant="secondary" size="sm" icon="eye">
              <Trans i18nKey="snapshot.view-button">View</Trans>
            </LinkButton>
          );
        },
      },
      {
        id: 'delete',
        disableGrow: true,
        cell: ({ row: { original: snapshot } }) => {
          if (isFetching) {
            return <Skeleton width={22} height={24} />;
          }
          const hasDeletePermission = contextSrv.hasPermission(AccessControlAction.SnapshotsDelete);
          const deleteTooltip = hasDeletePermission
            ? ''
            : t('snapshot.share.delete-permission-tooltip', "You don't have permission to delete snapshots");
          return (
            <Button
              variant="destructive"
              size="sm"
              icon="times"
              onClick={() => setRemoveSnapshot(snapshot)}
              disabled={!hasDeletePermission}
              tooltip={deleteTooltip}
            />
          );
        },
      },
    ],
    [isFetching]
  );

  if (!isFetching && snapshots.length === 0) {
    return (
      <EmptyState
        variant="call-to-action"
        message={t('snapshot.empty-state.message', "You haven't created any snapshots yet")}
      >
        <Trans i18nKey="snapshot.empty-state.more-info">
          You can create a snapshot of any dashboard through the <b>Share</b> modal.{' '}
          <TextLink
            external
            href="https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/#share-a-snapshot"
          >
            Learn more
          </TextLink>
        </Trans>
      </EmptyState>
    );
  }

  return (
    <>
      <InteractiveTable columns={columns} data={data} getRowId={(snapshot) => snapshot.key} />

      <ConfirmModal
        isOpen={!!removeSnapshot}
        title={t('manage-dashboards.snapshot-list-table.title-delete', 'Delete')}
        body={t(
          'manage-dashboards.snapshot-list-table.body-delete',
          "Are you sure you want to delete '{{snapshotToRemove}}'?",
          { snapshotToRemove: removeSnapshot?.name }
        )}
        confirmText={t('manage-dashboards.snapshot-list-table.confirmText-delete', 'Delete')}
        onDismiss={() => setRemoveSnapshot(undefined)}
        onConfirm={() => {
          doRemoveSnapshot(removeSnapshot!);
          setRemoveSnapshot(undefined);
        }}
      />
    </>
  );
};
