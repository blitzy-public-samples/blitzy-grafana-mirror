import { css } from '@emotion/css';
import { useState } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { ConfirmButton, Icon, RadioButtonGroup, Text, useStyles2 } from '@grafana/ui';
import { contextSrv } from 'app/core/services/context_srv';
import { ExternalUserTooltip } from 'app/features/admin/UserOrgs';
import { AccessControlAction } from 'app/types/accessControl';

interface Props {
  isGrafanaAdmin: boolean;
  isExternalUser?: boolean;
  lockMessage?: string;

  onGrafanaAdminChange: (isGrafanaAdmin: boolean) => void;
}

const adminOptions = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
];

export function UserPermissions({ isGrafanaAdmin, isExternalUser, lockMessage, onGrafanaAdminChange }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentAdminOption, setCurrentAdminOption] = useState(isGrafanaAdmin);

  const onChangeClick = () => setIsEditing(true);

  const onCancelClick = () => {
    setIsEditing(false);
    setCurrentAdminOption(isGrafanaAdmin);
  };

  const handleGrafanaAdminChange = () => onGrafanaAdminChange(currentAdminOption);

  const canChangePermissions = contextSrv.hasPermission(AccessControlAction.UsersPermissionsUpdate) && !isExternalUser;

  const styles = useStyles2(getTooltipStyles);

  return (
    <div>
      <Text element="h3" variant="h3">
        <Trans i18nKey="admin.user-permissions.title">Permissions</Trans>
      </Text>
      <div className={styles.permissionsRow}>
        <div className={styles.permissionsLabel}>
          <Trans i18nKey="admin.user-permissions.grafana-admin-key">Grafana Admin</Trans>
        </div>
        <div className={styles.permissionsValue}>
          {isEditing ? (
            <RadioButtonGroup
              options={adminOptions}
              value={currentAdminOption}
              onChange={setCurrentAdminOption}
              autoFocus
            />
          ) : isGrafanaAdmin ? (
            <>
              <Icon name="shield" /> <Trans i18nKey="admin.user-permissions.grafana-admin-yes">Yes</Trans>
            </>
          ) : (
            <Trans i18nKey="admin.user-permissions.grafana-admin-no">No</Trans>
          )}
        </div>
        <div className={styles.permissionsAction}>
          {canChangePermissions && (
            <ConfirmButton
              onClick={onChangeClick}
              onConfirm={handleGrafanaAdminChange}
              onCancel={onCancelClick}
              confirmText={t('admin.user-permissions.confirmText-change', 'Change')}
            >
              {t('admin.user-permissions.change-button', 'Change')}
            </ConfirmButton>
          )}
          {isExternalUser && (
            <div className={styles.lockMessageClass}>
              <ExternalUserTooltip lockMessage={lockMessage} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const getTooltipStyles = (theme: GrafanaTheme2) => ({
  lockMessageClass: css({
    display: 'flex',
    justifyContent: 'flex-end',
    fontStyle: 'italic',
    marginRight: theme.spacing(0.6),
  }),
  permissionsRow: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    padding: theme.spacing(1),
    borderBottom: `1px solid ${theme.colors.border.weak}`,
  }),
  permissionsLabel: css({
    fontWeight: 500,
    minWidth: theme.spacing(16),
  }),
  permissionsValue: css({
    flex: 1,
  }),
  permissionsAction: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  }),
});
