import { memo, useMemo } from 'react';

import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { Button, type Column, InteractiveTable, LoadingPlaceholder } from '@grafana/ui';
import { type UserDTO, type UserOrg } from 'app/types/user';

export interface Props {
  user: UserDTO | null;
  orgs: UserOrg[];
  isLoading: boolean;
  setUserOrg: (org: UserOrg) => void;
}

export const UserOrganizations = memo<Props>(({ isLoading, orgs, user, setUserOrg }) => {
  // Column definitions for the InteractiveTable. Memoized so the array identity is stable
  // across renders, satisfying react-table's internal memoization expectations and
  // react-hooks/exhaustive-deps. Declared BEFORE any conditional early-return so the hook
  // call order remains consistent on every render (react-hooks/rules-of-hooks).
  const columns = useMemo<Array<Column<UserOrg>>>(
    () => [
      {
        id: 'name',
        header: t('user-orgs.name-column', 'Name'),
        cell: ({ row: { original } }) => original.name,
      },
      {
        id: 'role',
        header: t('user-orgs.role-column', 'Role'),
        cell: ({ row: { original } }) => original.role,
      },
      {
        // Action column: renders either a disabled "Current" button for the user's active
        // organization, or a "Select organisation" button that dispatches setUserOrg.
        // Empty header string matches the original `<th />` empty header; disableGrow keeps
        // the column narrow (mirrors the original `text-right` action column layout).
        id: 'actions',
        header: '',
        disableGrow: true,
        cell: ({ row: { original } }) =>
          original.orgId === user?.orgId ? (
            <Button variant="secondary" size="sm" disabled>
              <Trans i18nKey="user-orgs.current-org-button">Current</Trans>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setUserOrg(original);
              }}
            >
              <Trans i18nKey="user-orgs.select-org-button">Select organisation</Trans>
            </Button>
          ),
      },
    ],
    [user?.orgId, setUserOrg]
  );

  if (isLoading) {
    return (
      <LoadingPlaceholder
        text={t('profile.user-organizations.text-loading-organizations', 'Loading organizations...')}
      />
    );
  }

  if (orgs.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="page-sub-heading">
        <Trans i18nKey="user-orgs.title">Organizations</Trans>
      </h3>
      {/*
        InteractiveTable renders its own <table><thead>/<tbody> elements but does not accept
        a data-testid prop. Wrapping it in this <div data-testid=...> preserves the existing
        test selector `screen.getByTestId(selectors.components.UserProfile.orgsTable)` and
        keeps `within(orgsTable()).getByRole('row', ...)` queries working unchanged.
      */}
      <div data-testid={selectors.components.UserProfile.orgsTable}>
        <InteractiveTable columns={columns} data={orgs} getRowId={(org) => String(org.orgId)} />
      </div>
    </div>
  );
});

UserOrganizations.displayName = 'UserOrganizations';

export default UserOrganizations;
