import { css } from '@emotion/css';
import type { JSX } from 'react';
import { connect, type ConnectedProps } from 'react-redux';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { reportInteraction } from '@grafana/runtime';
import { Box, RadioButtonGroup, LinkButton, FilterInput, InlineField, useStyles2 } from '@grafana/ui';
import { type StoreState } from 'app/types/store';

import { selectTotal } from '../invites/state/selectors';

import { UsersExternalButton } from './UsersExternalButton';
import { changeSearchQuery } from './state/actions';
import { getUsersSearchQuery } from './state/selectors';
import { getCanInviteUsersToOrg } from './utils';

export interface OwnProps {
  showInvites: boolean;
  onShowInvites: () => void;
}

function mapStateToProps(state: StoreState) {
  return {
    searchQuery: getUsersSearchQuery(state.users),
    pendingInvitesCount: selectTotal(state.invites),
  };
}

const mapDispatchToProps = {
  changeSearchQuery,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

export type Props = ConnectedProps<typeof connector> & OwnProps;

export const UsersActionBarUnconnected = ({
  searchQuery,
  pendingInvitesCount,
  changeSearchQuery,
  onShowInvites,
  showInvites,
}: Props): JSX.Element => {
  const styles = useStyles2(getStyles);

  const options = [
    { label: t('users.users-action-bar-unconnected.options.label.users', 'Users'), value: 'users' },
    { label: `Pending Invites (${pendingInvitesCount})`, value: 'invites' },
  ];

  const onExternalUserMngClick = () => {
    reportInteraction('users_admin_actions_clicked', {
      category: 'org_users',
      item: 'manage_users_external',
    });
  };

  return (
    <div className={styles.pageActionBar} data-testid="users-action-bar">
      <InlineField grow>
        <FilterInput
          value={searchQuery}
          onChange={changeSearchQuery}
          placeholder={t(
            'users.users-action-bar-unconnected.placeholder-search-login-email',
            'Search user by login, email or name'
          )}
        />
      </InlineField>
      {pendingInvitesCount > 0 && (
        <Box marginLeft={2}>
          <RadioButtonGroup value={showInvites ? 'invites' : 'users'} options={options} onChange={onShowInvites} />
        </Box>
      )}
      {getCanInviteUsersToOrg() && (
        <LinkButton href="org/users/invite">
          <Trans i18nKey="users.users-action-bar-unconnected.invite">Invite</Trans>
        </LinkButton>
      )}
      <UsersExternalButton onExternalUserMngClick={onExternalUserMngClick} />
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  pageActionBar: css({
    marginBottom: theme.spacing(2),
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(2),
  }),
});

export const UsersActionBar = connector(UsersActionBarUnconnected);
