import { css } from '@emotion/css';
import { memo, type ReactElement, useEffect, useMemo, useRef, useState } from 'react';

import { type GrafanaTheme2, OrgRole } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import {
  Button,
  type Column,
  ConfirmButton,
  Field,
  Icon,
  InteractiveTable,
  Modal,
  Stack,
  Text,
  TextLink,
  Tooltip,
  useStyles2,
} from '@grafana/ui';
import { UserRolePicker } from 'app/core/components/RolePicker/UserRolePicker';
import { fetchRoleOptions, updateUserRoles } from 'app/core/components/RolePicker/api';
import { OrgPicker, type OrgSelectItem } from 'app/core/components/Select/OrgPicker';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction, type Role } from 'app/types/accessControl';
import { type Organization } from 'app/types/organization';
import { type UserOrg, type UserDTO } from 'app/types/user';

import { OrgRolePicker } from './OrgRolePicker';

interface Props {
  orgs: UserOrg[];
  user?: UserDTO;
  isExternalUser?: boolean;

  onOrgRemove: (orgId: number) => void;
  onOrgRoleChange: (orgId: number, newRole: OrgRole) => void;
  onOrgAdd: (orgId: number, role: OrgRole) => void;
}

interface OrgRowData {
  id: string;
  org: UserOrg;
  user?: UserDTO;
  isExternalUser?: boolean;
  onOrgRoleChange: (orgId: number, newRole: OrgRole) => void;
  onOrgRemove: (orgId: number) => void;
}

export const UserOrgs = memo(({ user, orgs, isExternalUser, onOrgRoleChange, onOrgRemove, onOrgAdd }: Props) => {
  const [showAddOrgModal, setShowAddOrgModal] = useState(false);
  const addToOrgButtonRef = useRef<HTMLButtonElement>(null);

  const showOrgAddModal = () => {
    setShowAddOrgModal(true);
  };

  const dismissOrgAddModal = () => {
    setShowAddOrgModal(false);
    addToOrgButtonRef.current?.focus();
  };

  const canAddToOrg = contextSrv.hasPermission(AccessControlAction.OrgUsersAdd) && !isExternalUser;

  const rows = useMemo<OrgRowData[]>(
    () =>
      orgs.map((org, index) => ({
        id: `${org.orgId}-${index}`,
        org,
        user,
        isExternalUser,
        onOrgRoleChange,
        onOrgRemove,
      })),
    [orgs, user, isExternalUser, onOrgRoleChange, onOrgRemove]
  );

  const columns = useMemo<Array<Column<OrgRowData>>>(
    () => [
      {
        id: 'organization',
        header: t('admin.user-orgs.column-organization', 'Organization'),
        cell: ({ row: { original } }) => {
          const inputId = `${original.org.name}-input`;
          return (
            <Text weight="medium">
              <label htmlFor={inputId}>{original.org.name}</label>
            </Text>
          );
        },
      },
      {
        id: 'role-actions',
        header: t('admin.user-orgs.column-role-actions', 'Role and actions'),
        cell: ({ row: { original } }) => <OrgRoleAndActionsCell row={original} />,
      },
    ],
    []
  );

  return (
    <div>
      <Text element="h3" variant="h3">
        <Trans i18nKey="admin.user-orgs.title">Organizations</Trans>
      </Text>
      <Stack gap={1.5} direction="column">
        <InteractiveTable<OrgRowData> columns={columns} data={rows} getRowId={(row) => row.id} />

        <div>
          {canAddToOrg && (
            <Button variant="secondary" onClick={showOrgAddModal} ref={addToOrgButtonRef}>
              <Trans i18nKey="admin.user-orgs.add-button">Add user to organization</Trans>
            </Button>
          )}
        </div>
        <AddToOrgModal
          user={user}
          userOrgs={orgs}
          isOpen={showAddOrgModal}
          onOrgAdd={onOrgAdd}
          onDismiss={dismissOrgAddModal}
        />
      </Stack>
    </div>
  );
});
UserOrgs.displayName = 'UserOrgs';

/**
 * Combined role + actions cell. Owns per-row state (currentRole, isChangingRole,
 * roleOptions) so the role picker and change/remove action buttons can coordinate
 * locally without parent re-renders or cross-cell synchronization. Renders the
 * licensed vs unlicensed branches inline (same behavior as the pre-migration
 * OrgRow component): licensed mode shows the UserRolePicker directly (no edit
 * mode) plus optional ExternalUserTooltip; unlicensed mode toggles between a
 * role-text view and the OrgRolePicker edit view driven by ChangeOrgButton. The
 * remove-from-org ConfirmButton is rendered trailing both branches.
 */
const OrgRoleAndActionsCell = memo(({ row }: { row: OrgRowData }) => {
  const { org, user, isExternalUser, onOrgRoleChange: parentOnOrgRoleChange, onOrgRemove } = row;
  const [currentRole, setCurrentRole] = useState(org.role);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [roleOptions, setRoleOptions] = useState<Role[]>([]);
  const styles = useStyles2(getOrgRoleAndActionsStyles);

  useEffect(() => {
    if (contextSrv.licensedAccessControlEnabled()) {
      if (contextSrv.hasPermission(AccessControlAction.ActionRolesList)) {
        fetchRoleOptions(org.orgId)
          .then((roles) => setRoleOptions(roles))
          .catch((e) => console.error(e));
      }
    }
  }, [org.orgId]);

  const handleOrgRemove = async () => {
    onOrgRemove(org.orgId);
  };

  const handleChangeRoleClick = () => {
    setIsChangingRole(true);
    setCurrentRole(org.role);
  };

  const handleOrgRoleChange = (newRole: OrgRole) => {
    setCurrentRole(newRole);
  };

  const handleOrgRoleSave = () => {
    parentOnOrgRoleChange(org.orgId, currentRole);
  };

  const handleCancelClick = () => {
    setIsChangingRole(false);
  };

  const handleBasicRoleChange = (newRole: OrgRole) => {
    parentOnOrgRoleChange(org.orgId, newRole);
  };

  const authSource = user?.authLabels?.length && user?.authLabels[0];
  const lockMessage = authSource ? `Synced via ${authSource}` : '';
  const canChangeRole = contextSrv.hasPermission(AccessControlAction.OrgUsersWrite);
  const canRemoveFromOrg = contextSrv.hasPermission(AccessControlAction.OrgUsersRemove) && !isExternalUser;
  const rolePickerDisabled = isExternalUser || !canChangeRole;
  const inputId = `${org.name}-input`;

  return (
    <Stack alignItems="center" gap={2} wrap="nowrap">
      {contextSrv.licensedAccessControlEnabled() ? (
        <>
          <div className={styles.rolePicker}>
            <UserRolePicker
              userId={user?.id || 0}
              orgId={org.orgId}
              basicRole={org.role}
              roleOptions={roleOptions}
              onBasicRoleChange={handleBasicRoleChange}
              basicRoleDisabled={rolePickerDisabled}
              basicRoleDisabledMessage="This user's role is not editable because it is synchronized from your auth provider.
                Refer to the Grafana authentication docs for details."
            />
          </div>
          {isExternalUser && <ExternalUserTooltip lockMessage={lockMessage} />}
        </>
      ) : (
        <>
          {isChangingRole ? (
            <OrgRolePicker inputId={inputId} value={currentRole} onChange={handleOrgRoleChange} autoFocus />
          ) : (
            <span>{org.role}</span>
          )}
          {canChangeRole && (
            <ChangeOrgButton
              lockMessage={lockMessage}
              isExternalUser={isExternalUser}
              onChangeRoleClick={handleChangeRoleClick}
              onCancelClick={handleCancelClick}
              onOrgRoleSave={handleOrgRoleSave}
            />
          )}
        </>
      )}
      {canRemoveFromOrg && (
        <ConfirmButton
          confirmText={t('admin.un-themed-org-row.confirmText-confirm-removal', 'Confirm removal')}
          confirmVariant="destructive"
          onCancel={handleCancelClick}
          onConfirm={handleOrgRemove}
        >
          {t('admin.user-orgs.remove-button', 'Remove from organization')}
        </ConfirmButton>
      )}
    </Stack>
  );
});
OrgRoleAndActionsCell.displayName = 'OrgRoleAndActionsCell';

const getOrgRoleAndActionsStyles = (theme: GrafanaTheme2) => ({
  rolePicker: css({
    flex: 'auto',
    marginRight: theme.spacing(1),
  }),
});

const getAddToOrgModalStyles = () => ({
  modal: css({
    width: '500px',
  }),
  buttonRow: css({
    textAlign: 'center',
  }),
  modalContent: css({
    overflow: 'visible',
  }),
});

interface AddToOrgModalProps {
  isOpen: boolean;
  user?: UserDTO;
  userOrgs: UserOrg[];
  onOrgAdd(orgId: number, role: string): void;

  onDismiss?(): void;
}

export const AddToOrgModal = memo(({ isOpen, user, userOrgs, onOrgAdd, onDismiss }: AddToOrgModalProps) => {
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<OrgRole>(OrgRole.Viewer);
  const [roleOptions, setRoleOptions] = useState<Role[]>([]);
  const [pendingOrgId, setPendingOrgId] = useState<number | null>(null);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Role[]>([]);
  const styles = useStyles2(getAddToOrgModalStyles);

  const onOrgSelect = (org: OrgSelectItem) => {
    const userOrg = userOrgs.find((userOrg) => userOrg.orgId === org.value?.id);
    setSelectedOrg(org.value!);
    setRole(userOrg?.role || OrgRole.Viewer);
    if (contextSrv.licensedAccessControlEnabled()) {
      if (contextSrv.hasPermission(AccessControlAction.ActionRolesList)) {
        fetchRoleOptions(org.value?.id)
          .then((roles) => setRoleOptions(roles))
          .catch((e) => console.error(e));
      }
    }
  };

  const onOrgRoleChange = (newRole: OrgRole) => {
    setRole(newRole);
  };

  const onAddUserToOrg = async () => {
    onOrgAdd(selectedOrg!.id, role);
    // add the stored userRoles also
    if (contextSrv.licensedAccessControlEnabled()) {
      if (contextSrv.hasPermission(AccessControlAction.ActionUserRolesAdd)) {
        if (pendingUserId) {
          await updateUserRoles(pendingRoles, pendingUserId, pendingOrgId!);
          // clear pending state
          setPendingOrgId(null);
          setPendingRoles([]);
          setPendingUserId(null);
        }
      }
    }
  };

  const onCancel = () => {
    // clear selectedOrg when modal is canceled
    setSelectedOrg(null);
    setPendingRoles([]);
    setPendingOrgId(null);
    setPendingUserId(null);
    if (onDismiss) {
      onDismiss();
    }
  };

  const onRoleUpdate = async (roles: Role[], userId: number, orgId: number | undefined) => {
    // keep the new role assignments for user
    setPendingRoles(roles);
    setPendingOrgId(orgId!);
    setPendingUserId(userId);
  };

  return (
    <Modal
      className={styles.modal}
      contentClassName={styles.modalContent}
      title={t('admin.add-to-org-modal.title-add-to-an-organization', 'Add to an organization')}
      isOpen={isOpen}
      onDismiss={onCancel}
    >
      <Field label={t('admin.add-to-org-modal.label-organization', 'Organization')}>
        <OrgPicker inputId="new-org-input" onSelected={onOrgSelect} excludeOrgs={userOrgs} autoFocus />
      </Field>
      <Field label={t('admin.add-to-org-modal.label-role', 'Role')} disabled={selectedOrg === null}>
        <UserRolePicker
          userId={user?.id || 0}
          orgId={selectedOrg?.id}
          basicRole={role}
          onBasicRoleChange={onOrgRoleChange}
          basicRoleDisabled={false}
          roleOptions={roleOptions}
          apply={true}
          onApplyRoles={onRoleUpdate}
          pendingRoles={pendingRoles}
        />
      </Field>
      <Modal.ButtonRow>
        <Stack gap={2} justifyContent="center">
          <Button variant="secondary" fill="outline" onClick={onCancel}>
            <Trans i18nKey="admin.user-orgs-modal.cancel-button">Cancel</Trans>
          </Button>
          <Button variant="primary" disabled={selectedOrg === null} onClick={onAddUserToOrg}>
            <Trans i18nKey="admin.user-orgs-modal.add-button">Add to organization</Trans>
          </Button>
        </Stack>
      </Modal.ButtonRow>
    </Modal>
  );
});
AddToOrgModal.displayName = 'AddToOrgModal';

interface ChangeOrgButtonProps {
  lockMessage?: string;
  isExternalUser?: boolean;
  onChangeRoleClick: () => void;
  onCancelClick: () => void;
  onOrgRoleSave: () => void;
}

const getChangeOrgButtonTheme = (theme: GrafanaTheme2) => ({
  disabledTooltip: css({
    display: 'flex',
  }),
  tooltipItemLink: css({
    color: theme.v1.palette.blue95,
  }),
  lockMessageClass: css({
    fontStyle: 'italic',
    marginLeft: '1.8rem',
    marginRight: '0.6rem',
  }),
  icon: css({
    lineHeight: 2,
  }),
});

export function ChangeOrgButton({
  lockMessage,
  onChangeRoleClick,
  isExternalUser,
  onOrgRoleSave,
  onCancelClick,
}: ChangeOrgButtonProps): ReactElement {
  const styles = useStyles2(getChangeOrgButtonTheme);
  return (
    <div className={styles.disabledTooltip}>
      {isExternalUser ? (
        <>
          <span className={styles.lockMessageClass}>{lockMessage}</span>
          <Tooltip
            placement="right-end"
            interactive={true}
            content={
              <div>
                <Trans i18nKey="admin.user-orgs.role-not-editable">
                  This user&apos;s role is not editable because it is synchronized from your auth provider. Refer to
                  the&nbsp;
                  <TextLink href={'https://grafana.com/docs/grafana/latest/auth'} external>
                    Grafana authentication docs
                  </TextLink>
                  &nbsp;for details.
                </Trans>
              </div>
            }
          >
            <div className={styles.icon}>
              <Icon name="question-circle" />
            </div>
          </Tooltip>
        </>
      ) : (
        <ConfirmButton
          confirmText={t('admin.change-org-button.confirmText-save', 'Save')}
          onClick={onChangeRoleClick}
          onCancel={onCancelClick}
          onConfirm={onOrgRoleSave}
          disabled={isExternalUser}
        >
          {t('admin.user-orgs.change-role-button', 'Change role')}
        </ConfirmButton>
      )}
    </div>
  );
}
interface ExternalUserTooltipProps {
  lockMessage?: string;
}

export const ExternalUserTooltip = ({ lockMessage }: ExternalUserTooltipProps) => {
  const styles = useStyles2(getTooltipStyles);

  return (
    <div className={styles.disabledTooltip}>
      <span className={styles.lockMessageClass}>{lockMessage}</span>
      <Tooltip
        placement="right-end"
        interactive={true}
        content={
          <div>
            <Trans i18nKey="admin.user-orgs.external-user-tooltip">
              This user&apos;s built-in role is not editable because it is synchronized from your auth provider. Refer
              to the&nbsp;
              <TextLink href={'https://grafana.com/docs/grafana/latest/auth'} external>
                Grafana authentication docs
              </TextLink>
              &nbsp;for details.
            </Trans>
          </div>
        }
      >
        <Icon name="question-circle" />
      </Tooltip>
    </div>
  );
};

const getTooltipStyles = (theme: GrafanaTheme2) => ({
  disabledTooltip: css({
    display: 'flex',
  }),
  lockMessageClass: css({
    fontStyle: 'italic',
    marginLeft: '1.8rem',
    marginRight: '0.6rem',
  }),
});
