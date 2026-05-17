import { css } from '@emotion/css';
import { memo, useMemo } from 'react';

import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { Button, type Column, Icon, InteractiveTable, LoadingPlaceholder, useStyles2 } from '@grafana/ui';
import { TagBadge } from 'app/core/components/TagFilter/TagBadge';
import { formatDate } from 'app/core/internationalization/dates';
import { type UserSession } from 'app/types/user';

interface Props {
  sessions: UserSession[];
  isLoading: boolean;
  revokeUserSession: (tokenId: number) => void;
}

const UserSessions = memo<Props>(({ isLoading, sessions, revokeUserSession }) => {
  const styles = useStyles2(getStyles);

  const columns = useMemo<Array<Column<UserSession>>>(
    () => [
      {
        id: 'seenAt',
        header: t('user-session.seen-at-column', 'Last seen'),
        cell: ({ row: { original } }) =>
          original.isActive ? <Trans i18nKey="profile.user-sessions.now">Now</Trans> : original.seenAt,
      },
      {
        id: 'createdAt',
        header: t('user-session.created-at-column', 'Logged on'),
        cell: ({ row: { original } }) => formatDate(original.createdAt, { dateStyle: 'long' }),
      },
      {
        id: 'clientIp',
        header: t('user-session.ip-column', 'IP address'),
        cell: ({ row: { original } }) => original.clientIp,
      },
      {
        id: 'browser',
        header: t('user-session.browser-column', 'Browser & OS'),
        cell: ({ row: { original } }) => (
          <Trans
            i18nKey="profile.user-sessions.browser-details"
            values={{ browser: original.browser, os: original.os, osVersion: original.osVersion }}
          >
            {'{{browser}}'} on {'{{os}}'} {'{{osVersion}}'}
          </Trans>
        ),
      },
      {
        id: 'authModule',
        header: t('user-session.identity-provider-column', 'Identity Provider'),
        cell: ({ row: { original } }) =>
          original.authModule ? <TagBadge label={original.authModule} removeIcon={false} count={0} /> : null,
      },
      {
        id: 'actions',
        header: '',
        disableGrow: true,
        cell: ({ row: { original } }) => (
          <Button
            size="sm"
            variant="destructive"
            tooltip={t('user-session.revoke', 'Revoke user session')}
            onClick={() => revokeUserSession(original.id)}
            aria-label={t('user-session.revoke', 'Revoke user session')}
          >
            <Icon name="power" />
          </Button>
        ),
      },
    ],
    [revokeUserSession]
  );

  if (isLoading) {
    return <LoadingPlaceholder text={<Trans i18nKey="user-sessions.loading">Loading sessions...</Trans>} />;
  }

  return (
    <div className={styles.wrapper}>
      {sessions.length > 0 && (
        <>
          <h3 className="page-sub-heading">
            <Trans i18nKey="profile.user-sessions.sessions">Sessions</Trans>
          </h3>
          <div data-testid={selectors.components.UserProfile.sessionsTable}>
            <InteractiveTable columns={columns} data={sessions} getRowId={(session) => String(session.id)} />
          </div>
        </>
      )}
    </div>
  );
});

UserSessions.displayName = 'UserSessions';

const getStyles = () => ({
  wrapper: css({
    maxWidth: '100%',
  }),
});

export default UserSessions;
