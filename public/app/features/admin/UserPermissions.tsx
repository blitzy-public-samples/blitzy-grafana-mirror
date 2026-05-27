import { useMemo, useState } from 'react';

import { Trans, t } from '@grafana/i18n';
import { type Column, ConfirmButton, Icon, InteractiveTable, RadioButtonGroup, Stack, Text } from '@grafana/ui';
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

interface PermissionRow {
  key: string;
  permission: string;
}

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

  const data = useMemo<PermissionRow[]>(
    () => [
      {
        key: 'grafana-admin',
        permission: 'Grafana Admin',
      },
    ],
    []
  );

  const columns = useMemo<Array<Column<PermissionRow>>>(
    () => [
      {
        id: 'permission',
        header: t('admin.user-permissions.column-permission', 'Permission'),
        cell: () => (
          <Trans i18nKey="admin.user-permissions.grafana-admin-key">Grafana Admin</Trans>
        ),
      },
      {
        id: 'value',
        header: t('admin.user-permissions.column-value', 'Value'),
        cell: () =>
          isEditing ? (
            <RadioButtonGroup
              options={adminOptions}
              value={currentAdminOption}
              onChange={setCurrentAdminOption}
              autoFocus
            />
          ) : isGrafanaAdmin ? (
            <Stack alignItems="center" gap={0.5}>
              <Icon name="shield" /> <Trans i18nKey="admin.user-permissions.grafana-admin-yes">Yes</Trans>
            </Stack>
          ) : (
            <Trans i18nKey="admin.user-permissions.grafana-admin-no">No</Trans>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: () => (
          <Stack alignItems="center" gap={1}>
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
            {isExternalUser && <ExternalUserTooltip lockMessage={lockMessage} />}
          </Stack>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- adminOptions is a stable module-level constant; the function refs (onChangeClick, etc.) are recreated each render and rebuilding the column would unnecessarily reset the InteractiveTable state. The captured handlers correctly close over the current setState/setX setters because useState setters are referentially stable.
    [isEditing, currentAdminOption, isGrafanaAdmin, canChangePermissions, isExternalUser, lockMessage]
  );

  return (
    <div>
      <Text element="h3" variant="h3">
        <Trans i18nKey="admin.user-permissions.title">Permissions</Trans>
      </Text>
      <InteractiveTable<PermissionRow> columns={columns} data={data} getRowId={(row) => row.key} />
    </div>
  );
}
