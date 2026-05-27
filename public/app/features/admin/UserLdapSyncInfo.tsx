import { memo, useMemo, type ReactNode } from 'react';

import { dateTimeFormat } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Button, type CellProps, type Column, InteractiveTable, LinkButton, Stack, Text } from '@grafana/ui';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';
import { type SyncInfo } from 'app/types/ldap';
import { type UserDTO } from 'app/types/user';

import { TagBadge } from '../../core/components/TagFilter/TagBadge';

interface Props {
  ldapSyncInfo: SyncInfo;
  user: UserDTO;
  onUserSync: () => void;
}

/**
 * Row shape consumed by the InteractiveTable that replaces the legacy
 * `<table className="filter-table form-inline">` used to display the LDAP
 * synchronisation status. Each row carries a stable string id (for `getRowId`)
 * plus three ReactNode cells: label, description, and an optional action
 * (e.g. the TagBadge on the "External sync" row).
 */
interface SyncInfoRow {
  id: string;
  label: ReactNode;
  description: ReactNode;
  action: ReactNode;
}

const format = 'dddd YYYY-MM-DD HH:mm zz';
const debugLDAPMappingBaseURL = '/admin/authentication/ldap';

export const UserLdapSyncInfo = memo(({ ldapSyncInfo, user, onUserSync }: Props) => {
  const nextSyncSuccessful = ldapSyncInfo && ldapSyncInfo.nextSync;
  const nextSyncTime = nextSyncSuccessful ? dateTimeFormat(ldapSyncInfo.nextSync, { format }) : '';
  const debugLDAPMappingURL = `${debugLDAPMappingBaseURL}?username=${user && user.login}`;
  const canReadLDAPUser = contextSrv.hasPermission(AccessControlAction.LDAPUsersRead);
  const canSyncLDAPUser = contextSrv.hasPermission(AccessControlAction.LDAPUsersSync);

  // Memoized data rows: equivalent to the original two-row table content.
  // Recomputed only when the conditional cell content can change
  // (ldapSyncInfo.enabled toggles the "Not enabled" / nextSyncTime branch).
  const data = useMemo<SyncInfoRow[]>(
    () => [
      {
        id: 'external-sync',
        label: <Trans i18nKey="admin.ldap-sync.external-sync-label">External sync</Trans>,
        description: (
          <Trans i18nKey="admin.ldap-sync.external-sync-description">
            User synced via LDAP. Some changes must be done in LDAP or mappings.
          </Trans>
        ),
        action: (
          <TagBadge
            label={t('admin.user-ldap-sync-info.label-ldap', 'LDAP')}
            removeIcon={false}
            count={0}
            onClick={undefined}
          />
        ),
      },
      {
        id: 'next-sync',
        label: <Trans i18nKey="admin.ldap-sync.next-sync-label">Next scheduled synchronization</Trans>,
        description: ldapSyncInfo.enabled ? (
          <>{nextSyncTime}</>
        ) : (
          <Trans i18nKey="admin.ldap-sync.not-enabled">Not enabled</Trans>
        ),
        action: null,
      },
    ],
    [ldapSyncInfo.enabled, nextSyncTime]
  );

  // Memoized column definitions. The original markup had no header row, so
  // each column's `header` is left empty — InteractiveTable renders empty
  // <th> cells, which matches the original visual layout. Explicit `cell`
  // renderers are used so the ReactNode payloads on each row (Trans/TagBadge
  // elements) are rendered without react-table attempting to treat them as
  // primitive accessor values.
  const columns = useMemo<Array<Column<SyncInfoRow>>>(
    () => [
      {
        id: 'label',
        header: '',
        cell: ({ row: { original } }: CellProps<SyncInfoRow>) => <>{original.label}</>,
      },
      {
        id: 'description',
        header: '',
        cell: ({ row: { original } }: CellProps<SyncInfoRow>) => <>{original.description}</>,
      },
      {
        id: 'action',
        header: '',
        cell: ({ row: { original } }: CellProps<SyncInfoRow>) => <>{original.action}</>,
      },
    ],
    []
  );

  return (
    <Stack direction="column" gap={2}>
      <Text element="h3" variant="h3">
        <Trans i18nKey="admin.ldap-sync.title">LDAP Synchronisation</Trans>
      </Text>
      <InteractiveTable columns={columns} data={data} getRowId={(row) => row.id} />
      <Stack direction="row" gap={1}>
        {canSyncLDAPUser && (
          <Button variant="secondary" onClick={onUserSync}>
            <Trans i18nKey="admin.ldap-sync.sync-button">Sync user</Trans>
          </Button>
        )}
        {canReadLDAPUser && (
          <LinkButton variant="secondary" href={debugLDAPMappingURL}>
            <Trans i18nKey="admin.ldap-sync.debug-button">Debug LDAP Mapping</Trans>
          </LinkButton>
        )}
      </Stack>
    </Stack>
  );
});
UserLdapSyncInfo.displayName = 'UserLdapSyncInfo';
