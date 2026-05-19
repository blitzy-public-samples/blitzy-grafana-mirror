import { css } from '@emotion/css';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import {
  Button,
  type CellProps,
  type Column,
  ConfirmButton,
  ConfirmModal,
  InteractiveTable,
  Stack,
  Text,
  useStyles2,
} from '@grafana/ui';
import { TagBadge } from 'app/core/components/TagFilter/TagBadge';
import { formatDate } from 'app/core/internationalization/dates';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';
import { type UserSession } from 'app/types/user';

interface Props {
  sessions: UserSession[];

  onSessionRevoke: (id: number) => void;
  onAllSessionsRevoke: () => void;
}

export const UserSessions = memo(({ sessions, onSessionRevoke, onAllSessionsRevoke }: Props) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const forceAllLogoutButton = useRef<HTMLButtonElement>(null);
  // Theme-aware Emotion styles consumed via useStyles2 — replaces the legacy
  // `className="page-heading"` (defined in public/sass) with a token-driven
  // equivalent. The wrapper div around the <Text> heading consumes
  // `styles.heading` so the original block-level margin under the title is
  // preserved; the inner <Text> component supplies the h3 typography tokens.
  const styles = useStyles2(getStyles);

  const showLogoutConfirmationModal = () => {
    setShowLogoutModal(true);
  };

  const dismissLogoutConfirmationModal = () => {
    setShowLogoutModal(false);
    forceAllLogoutButton.current?.focus();
  };

  // `handleSessionRevoke` is referenced inside the memoized `columns` definition
  // below, so it is wrapped in `useCallback` to preserve a stable reference
  // across renders. Without this stability the `useMemo` for `columns` would
  // re-run on every render (since arrow functions defined inside the component
  // body change identity) and `react-hooks/exhaustive-deps` would flag the
  // missing dependency.
  const handleSessionRevoke = useCallback(
    (id: number) => {
      return () => {
        onSessionRevoke(id);
      };
    },
    [onSessionRevoke]
  );

  const handleAllSessionsRevoke = () => {
    setShowLogoutModal(false);
    onAllSessionsRevoke();
  };

  const canLogout = contextSrv.hasPermission(AccessControlAction.UsersLogout);

  // Memoized column definitions for the InteractiveTable. The original raw
  // <table> used a `<th colSpan={2}>` over the trailing two columns (Identity
  // Provider + per-row Force-logout action) — InteractiveTable has no
  // colSpan-on-header concept, so the layout is preserved by splitting into
  // two columns: an `authModule` column with the "Identity Provider" header
  // and a sibling `actions` column with an empty header. The dependency array
  // tracks `canLogout` (controls whether the per-row ConfirmButton renders)
  // and the stabilized `handleSessionRevoke` factory consumed inside the
  // actions cell.
  const columns = useMemo<Array<Column<UserSession>>>(
    () => [
      {
        id: 'seenAt',
        header: t('admin.user-sessions.last-seen-column', 'Last seen'),
        cell: ({ row: { original: session } }: CellProps<UserSession>) => (
          <>{session.isActive ? t('admin.user-sessions.now', 'Now') : session.seenAt}</>
        ),
      },
      {
        id: 'createdAt',
        header: t('admin.user-sessions.logged-on-column', 'Logged on'),
        cell: ({ row: { original: session } }: CellProps<UserSession>) => (
          <>{formatDate(session.createdAt, { dateStyle: 'long' })}</>
        ),
      },
      {
        id: 'clientIp',
        header: t('admin.user-sessions.ip-column', 'IP address'),
        cell: ({ row: { original: session } }: CellProps<UserSession>) => <>{session.clientIp}</>,
      },
      {
        id: 'browser',
        header: t('admin.user-sessions.browser-column', 'Browser and OS'),
        cell: ({ row: { original: session } }: CellProps<UserSession>) => (
          <>{`${session.browser} on ${session.os} ${session.osVersion}`}</>
        ),
      },
      {
        id: 'authModule',
        header: t('user-session.auth-module-column', 'Identity Provider'),
        cell: ({ row: { original: session } }: CellProps<UserSession>) => (
          <>{session.authModule && <TagBadge label={session.authModule} removeIcon={false} count={0} />}</>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row: { original: session } }: CellProps<UserSession>) =>
          canLogout ? (
            <ConfirmButton
              confirmText={t('admin.base-user-sessions.confirmText-confirm-logout', 'Confirm logout')}
              confirmVariant="destructive"
              onConfirm={handleSessionRevoke(session.id)}
            >
              {t('admin.user-sessions.force-logout-button', 'Force logout')}
            </ConfirmButton>
          ) : null,
      },
    ],
    [canLogout, handleSessionRevoke]
  );

  return (
    <div>
      <div className={styles.heading}>
        <Text element="h3" variant="h3">
          <Trans i18nKey="admin.user-sessions.title">Sessions</Trans>
        </Text>
      </div>
      <Stack direction="column" gap={1.5}>
        <div>
          <InteractiveTable columns={columns} data={sessions ?? []} getRowId={(session) => `${session.id}`} />
        </div>

        <div>
          {canLogout && sessions.length > 0 && (
            <Button variant="secondary" onClick={showLogoutConfirmationModal} ref={forceAllLogoutButton}>
              <Trans i18nKey="admin.user-sessions.force-logout-all-button">Force logout from all devices</Trans>
            </Button>
          )}
          <ConfirmModal
            isOpen={showLogoutModal}
            title={t('admin.base-user-sessions.title-force-logout-from-all-devices', 'Force logout from all devices')}
            body={t(
              'admin.base-user-sessions.body-force-logout-from-all-devices',
              'Are you sure you want to force logout from all devices?'
            )}
            confirmText={t('admin.base-user-sessions.confirmText-force-logout', 'Force logout')}
            onConfirm={handleAllSessionsRevoke}
            onDismiss={dismissLogoutConfirmationModal}
          />
        </div>
      </Stack>
    </div>
  );
});
UserSessions.displayName = 'UserSessions';

// Co-located, theme-aware Emotion styles consumed via useStyles2. The
// `heading` class replaces the legacy `page-heading` className (defined in
// public/sass) and is applied to a wrapper div around the <Text element="h3">
// title. The inner <Text> component supplies the h3 typography tokens; the
// wrapper carries the block-level margin so the spacing under the title
// matches the original page-heading rule.
const getStyles = (theme: GrafanaTheme2) => ({
  heading: css({
    color: theme.colors.text.primary,
    fontSize: theme.typography.h3.fontSize,
    fontWeight: theme.typography.h3.fontWeight,
    lineHeight: theme.typography.h3.lineHeight,
    margin: theme.spacing(0, 0, 2, 0),
  }),
});
