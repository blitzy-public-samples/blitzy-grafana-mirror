import { memo, useMemo } from 'react';

import { t, Trans } from '@grafana/i18n';
import { Button, type CellProps, ClipboardButton, type Column, InteractiveTable } from '@grafana/ui';
import { useDispatch } from 'app/types/store';
import { type Invitee } from 'app/types/user';

import { revokeInvite } from './state/actions';

export interface Props {
  invitees: Invitee[];
}

const InviteesTable = memo(({ invitees }: Props) => {
  const dispatch = useDispatch();

  const columns = useMemo<Array<Column<Invitee>>>(
    () => [
      {
        id: 'email',
        header: () => <Trans i18nKey="invites.invitees-table.email">Email</Trans>,
        cell: ({ row: { original } }: CellProps<Invitee>) => original.email,
      },
      {
        id: 'name',
        header: () => <Trans i18nKey="invites.invitees-table.name">Name</Trans>,
        cell: ({ row: { original } }: CellProps<Invitee>) => original.name,
      },
      {
        id: 'actions-copy',
        disableGrow: true,
        cell: ({ row: { original } }: CellProps<Invitee>) => (
          // eslint-disable-next-line @grafana/i18n/no-untranslated-strings -- preserves the untranslated literal verbatim from the prior InviteeRow.tsx implementation per the minimal-change mandate
          <ClipboardButton icon="copy" variant="secondary" size="sm" getText={() => original.url}>
            Copy Invite
          </ClipboardButton>
        ),
      },
      {
        id: 'actions-revoke',
        disableGrow: true,
        cell: ({ row: { original } }: CellProps<Invitee>) => (
          <Button
            variant="destructive"
            size="sm"
            icon="times"
            onClick={() => dispatch(revokeInvite(original.code))}
            aria-label={t('invites.invitee-row.aria-label-revoke-invite', 'Revoke invite')}
          />
        ),
      },
    ],
    [dispatch]
  );

  return (
    <div data-testid="InviteesTable-body">
      <InteractiveTable columns={columns} data={invitees} getRowId={(invitee) => invitee.code} />
    </div>
  );
});

InviteesTable.displayName = 'InviteesTable';

export default InviteesTable;
