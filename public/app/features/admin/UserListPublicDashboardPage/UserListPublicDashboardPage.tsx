import { useMemo } from 'react';

import { selectors as e2eSelectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { type CellProps, type Column, InteractiveTable, Stack, Tag } from '@grafana/ui';
import { Page } from 'app/core/components/Page/Page';
import { type SessionUser } from 'app/features/dashboard/components/ShareModal/SharePublicDashboard/SharePublicDashboardUtils';

import { useGetActiveUsersQuery } from '../../dashboard/api/publicDashboardApi';

import { DashboardsListModalButton } from './DashboardsListModalButton';
import { DeleteUserModalButton } from './DeleteUserModalButton';

const selectors = e2eSelectors.pages.UserListPage.publicDashboards;

export const UserListPublicDashboardPage = () => {
  const { data: users, isLoading } = useGetActiveUsersQuery();

  const columns = useMemo<Array<Column<SessionUser>>>(
    () => [
      {
        id: 'email',
        header: t('public-dashboard-users-access-list.table-header.email-label', 'Email'),
        cell: ({ row: { original: user } }: CellProps<SessionUser>) => (
          <span title={user.email}>{user.email}</span>
        ),
      },
      {
        id: 'activated',
        header: t('public-dashboard-users-access-list.table-header.activated-label', 'Activated'),
        cell: ({ row: { original: user } }: CellProps<SessionUser>) => <>{user.firstSeenAtAge}</>,
      },
      {
        id: 'lastActive',
        header: t('public-dashboard-users-access-list.table-header.last-active-label', 'Last active'),
        cell: ({ row: { original: user } }: CellProps<SessionUser>) => <>{user.lastSeenAtAge}</>,
      },
      {
        id: 'origin',
        header: t('public-dashboard-users-access-list.table-header.origin-label', 'Origin'),
        cell: ({ row: { original: user } }: CellProps<SessionUser>) => (
          <Stack gap={2}>
            <span>
              <Trans
                i18nKey="public-dashboard-users-access-list.table-body.dashboard-count"
                count={user.totalDashboards}
              >
                {{ count: user.totalDashboards }} dashboards
              </Trans>
            </span>
            <DashboardsListModalButton email={user.email} />
          </Stack>
        ),
      },
      {
        id: 'role',
        header: t('public-dashboard-users-access-list.table-header.role-label', 'Role'),
        cell: () => <Tag name="Viewer" colorIndex={19} />,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row: { original: user } }: CellProps<SessionUser>) => (
          <Stack justifyContent="flex-end">
            <DeleteUserModalButton user={user} />
          </Stack>
        ),
      },
    ],
    []
  );

  return (
    <Page.Contents isLoading={isLoading}>
      <div data-testid={selectors.container}>
        <InteractiveTable
          columns={columns}
          data={users ?? []}
          getRowId={(user) => user.email}
          headerTooltips={{
            activated: {
              content: t(
                'public-dashboard-users-access-list.table-header.activated-tooltip',
                'Earliest time user has been an active user to a dashboard'
              ),
              iconName: 'info-circle',
            },
          }}
        />
      </div>
    </Page.Contents>
  );
};
