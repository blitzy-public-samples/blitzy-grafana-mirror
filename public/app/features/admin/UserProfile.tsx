import { memo, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import * as React from 'react';

import { Trans, t } from '@grafana/i18n';
import {
  Button,
  type Column,
  ConfirmButton,
  ConfirmModal,
  Input,
  InteractiveTable,
  LegacyInputStatus,
  Stack,
  Text,
} from '@grafana/ui';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';
import { type UserDTO } from 'app/types/user';

interface Props {
  user: UserDTO;

  onUserUpdate: (user: UserDTO) => void;
  onUserDelete: (userUid: string) => void;
  onUserDisable: (userUid: string) => void;
  onUserEnable: (userUid: string) => void;
  onPasswordChange(password: string): void;
}

interface ProfileRow {
  key: string;
  label: string;
  value: string;
  locked: boolean;
  lockMessage?: string;
  inputType?: string;
  onChange?: (value: string) => void;
}

export function UserProfile({
  user,
  onUserUpdate,
  onUserDelete,
  onUserDisable,
  onUserEnable,
  onPasswordChange,
}: Props) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);

  const deleteUserRef = useRef<HTMLButtonElement | null>(null);
  const showDeleteUserModal = (show: boolean) => () => {
    setShowDeleteModal(show);
    if (!show && deleteUserRef.current) {
      deleteUserRef.current.focus();
    }
  };

  const disableUserRef = useRef<HTMLButtonElement | null>(null);
  const showDisableUserModal = (show: boolean) => () => {
    setShowDisableModal(show);
    if (!show && disableUserRef.current) {
      disableUserRef.current.focus();
    }
  };

  const handleUserDelete = () => onUserDelete(user.uid);

  const handleUserDisable = () => onUserDisable(user.uid);

  const handleUserEnable = () => onUserEnable(user.uid);

  const onUserNameChange = (newValue: string) => {
    onUserUpdate({
      ...user,
      name: newValue,
    });
  };

  const onUserEmailChange = (newValue: string) => {
    onUserUpdate({
      ...user,
      email: newValue,
    });
  };

  const onUserLoginChange = (newValue: string) => {
    onUserUpdate({
      ...user,
      login: newValue,
    });
  };

  let authSource = user.authLabels?.length && user.authLabels[0];
  if (user.isProvisioned) {
    authSource = 'SCIM';
  }
  const lockMessage = authSource ? `Synced via ${authSource}` : '';

  const editLocked =
    user.isExternal || user.isProvisioned || !contextSrv.hasPermissionInMetadata(AccessControlAction.UsersWrite, user);
  const passwordChangeLocked =
    user.isExternal ||
    user.isProvisioned ||
    !contextSrv.hasPermissionInMetadata(AccessControlAction.UsersPasswordUpdate, user);
  const canDelete = contextSrv.hasPermissionInMetadata(AccessControlAction.UsersDelete, user);
  const canDisable = contextSrv.hasPermissionInMetadata(AccessControlAction.UsersDisable, user);
  const canEnable = contextSrv.hasPermissionInMetadata(AccessControlAction.UsersEnable, user);

  const rows = useMemo<ProfileRow[]>(
    () => [
      {
        key: 'id',
        label: t('admin.user-profile.label-numerical-identifier', 'Numerical identifier'),
        value: user.id.toString(),
        locked: true,
      },
      {
        key: 'name',
        label: t('admin.user-profile.label-name', 'Name'),
        value: user.name,
        locked: editLocked,
        lockMessage,
        onChange: onUserNameChange,
      },
      {
        key: 'email',
        label: t('admin.user-profile.label-email', 'Email'),
        value: user.email,
        locked: editLocked,
        lockMessage,
        onChange: onUserEmailChange,
      },
      {
        key: 'username',
        label: t('admin.user-profile.label-username', 'Username'),
        value: user.login,
        locked: editLocked,
        lockMessage,
        onChange: onUserLoginChange,
      },
      {
        key: 'password',
        label: t('admin.user-profile.label-password', 'Password'),
        value: '********',
        inputType: 'password',
        locked: passwordChangeLocked,
        lockMessage,
        onChange: onPasswordChange,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrow deps to user-data fields actually consumed by row values; including the entire `user` object or the handlers (recreated each render) would unnecessarily rebuild the row array on every render and cause InteractiveTable to lose row identity (and the edit-cell sub-state).
    [
      user.id,
      user.name,
      user.email,
      user.login,
      editLocked,
      passwordChangeLocked,
      lockMessage,
    ]
  );

  const columns = useMemo<Array<Column<ProfileRow>>>(
    () => [
      {
        id: 'label',
        header: t('admin.user-profile.column-field', 'Field'),
        cell: ({ row: { original } }) => (
          <Text weight="medium">
            <label htmlFor={`${original.key}-input`}>{original.label}</label>
          </Text>
        ),
      },
      {
        id: 'detail',
        header: t('admin.user-profile.column-value', 'Value'),
        cell: ({ row: { original } }) => <ProfileDetailCell row={original} />,
      },
    ],
    []
  );

  return (
    <div>
      <Text element="h3" variant="h3">
        <Trans i18nKey="admin.user-profile.title">User information</Trans>
      </Text>
      <Stack direction="column" gap={1.5}>
        <InteractiveTable<ProfileRow> columns={columns} data={rows} getRowId={(row) => row.key} />
        <Stack gap={2}>
          {canDelete && (
            <>
              <Button variant="destructive" onClick={showDeleteUserModal(true)} ref={deleteUserRef}>
                <Trans i18nKey="admin.user-profile.delete-button">Delete user</Trans>
              </Button>
              <ConfirmModal
                isOpen={showDeleteModal}
                title={t('admin.user-profile.title-delete-user', 'Delete user')}
                body={t('admin.user-profile.body-delete', 'Are you sure you want to delete this user?')}
                confirmText={t('admin.user-profile.confirmText-delete-user', 'Delete user')}
                onConfirm={handleUserDelete}
                onDismiss={showDeleteUserModal(false)}
              />
            </>
          )}
          {user.isDisabled && canEnable && (
            <Button variant="secondary" onClick={handleUserEnable}>
              <Trans i18nKey="admin.user-profile.enable-button">Enable user</Trans>
            </Button>
          )}
          {!user.isDisabled && canDisable && (
            <>
              <Button variant="secondary" onClick={showDisableUserModal(true)} ref={disableUserRef}>
                <Trans i18nKey="admin.user-profile.disable-button">Disable user</Trans>
              </Button>
              <ConfirmModal
                isOpen={showDisableModal}
                title={t('admin.user-profile.title-disable-user', 'Disable user')}
                body={t('admin.user-profile.body-disable', 'Are you sure you want to disable this user?')}
                confirmText={t('admin.user-profile.confirmText-disable-user', 'Disable user')}
                onConfirm={handleUserDisable}
                onDismiss={showDisableUserModal(false)}
              />
            </>
          )}
        </Stack>
      </Stack>
    </div>
  );
}

/**
 * Detail cell — combines the value display, edit input, and edit/save/cancel action
 * button into a single InteractiveTable cell. This keeps per-row edit state
 * (`editing`, `value`, input ref for focus) local to the cell so the parent
 * UserProfile component does not need to re-render on every keystroke and so the
 * input retains focus across re-renders. Layout matches the original
 * label-value-action visual via an inline Stack with horizontal flex.
 */
const ProfileDetailCell = memo(({ row }: { row: ProfileRow }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.value);
  const inputElemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(row.value);
  }, [row.value]);

  const focusInput = useCallback(() => {
    if (inputElemRef.current) {
      inputElemRef.current.focus();
    }
  }, []);

  const onEditClick = useCallback(() => {
    if (row.inputType === 'password') {
      // Reset value for password field (matches original UserProfileRow behavior)
      setValue('');
      setEditing(true);
      setTimeout(focusInput, 0);
    } else {
      setEditing(true);
      setTimeout(focusInput, 0);
    }
  }, [row.inputType, focusInput]);

  const onCancelClick = useCallback(() => {
    setEditing(false);
    setValue(row.value);
  }, [row.value]);

  const onInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>, status?: LegacyInputStatus) => {
    if (status === LegacyInputStatus.Invalid) {
      return;
    }
    setValue(event.target.value);
  }, []);

  const onInputBlur = useCallback((event: React.FocusEvent<HTMLInputElement>, status?: LegacyInputStatus) => {
    if (status === LegacyInputStatus.Invalid) {
      return;
    }
    setValue(event.target.value);
  }, []);

  const onSave = useCallback(() => {
    if (row.onChange) {
      row.onChange(value);
    }
    setEditing(false);
  }, [row, value]);

  if (row.locked) {
    return (
      <Stack alignItems="center" gap={2}>
        <span>{row.value}</span>
        <Text italic color="secondary">
          {row.lockMessage ?? ''}
        </Text>
      </Stack>
    );
  }

  const inputId = `${row.key}-input`;
  return (
    <Stack alignItems="center" gap={2}>
      {editing ? (
        <Input
          id={inputId}
          type={row.inputType ?? 'text'}
          defaultValue={value}
          onBlur={onInputBlur}
          onChange={onInputChange}
          ref={inputElemRef}
          width={30}
        />
      ) : (
        <span>{row.value}</span>
      )}
      <ConfirmButton
        confirmText={t('admin.user-profile-row.confirmText-save', 'Save')}
        onClick={onEditClick}
        onConfirm={onSave}
        onCancel={onCancelClick}
      >
        {t('admin.user-profile.edit-button', 'Edit')}
      </ConfirmButton>
    </Stack>
  );
});

ProfileDetailCell.displayName = 'ProfileDetailCell';

interface UserProfileRowProps {
  label: string;
  value?: string;
  locked?: boolean;
  lockMessage?: string;
  inputType?: string;
  onChange?: (value: string) => void;
}

/**
 * Legacy row renderer kept for backwards compatibility with any external consumers
 * importing `UserProfileRow` (the component is exported). Internally the page now
 * renders profile rows through InteractiveTable; this component is a thin shim that
 * wraps the same Field/Value/Action triple in a single-row Stack.
 */
export const UserProfileRow = memo(
  ({
    label,
    value: valueProp = '',
    locked = false,
    lockMessage = '',
    inputType = 'text',
    onChange,
  }: UserProfileRowProps) => {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(valueProp);
    const inputElemRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      setValue(valueProp);
    }, [valueProp]);

    const focusInput = useCallback(() => {
      if (inputElemRef.current) {
        inputElemRef.current.focus();
      }
    }, []);

    const onEditClick = useCallback(() => {
      if (inputType === 'password') {
        // Reset value for password field
        setValue('');
        setEditing(true);
        setTimeout(focusInput, 0);
      } else {
        setEditing(true);
        setTimeout(focusInput, 0);
      }
    }, [inputType, focusInput]);

    const onCancelClick = useCallback(() => {
      setEditing(false);
      setValue(valueProp);
    }, [valueProp]);

    const onInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>, status?: LegacyInputStatus) => {
      if (status === LegacyInputStatus.Invalid) {
        return;
      }

      setValue(event.target.value);
    }, []);

    const onInputBlur = useCallback((event: React.FocusEvent<HTMLInputElement>, status?: LegacyInputStatus) => {
      if (status === LegacyInputStatus.Invalid) {
        return;
      }

      setValue(event.target.value);
    }, []);

    const onSave = useCallback(() => {
      if (onChange) {
        onChange(value);
      }
    }, [onChange, value]);

    if (locked) {
      return <LockedRow label={label} value={value} lockMessage={lockMessage} />;
    }

    const inputId = `${label}-input`;
    return (
      <Stack alignItems="center" gap={2}>
        <Text weight="medium">
          <label htmlFor={inputId}>{label}</label>
        </Text>
        {editing ? (
          <Input
            id={inputId}
            type={inputType}
            defaultValue={value}
            onBlur={onInputBlur}
            onChange={onInputChange}
            ref={inputElemRef}
            width={30}
          />
        ) : (
          <span>{valueProp}</span>
        )}
        <ConfirmButton
          confirmText={t('admin.user-profile-row.confirmText-save', 'Save')}
          onClick={onEditClick}
          onConfirm={onSave}
          onCancel={onCancelClick}
        >
          {t('admin.user-profile.edit-button', 'Edit')}
        </ConfirmButton>
      </Stack>
    );
  }
);

UserProfileRow.displayName = 'UserProfileRow';

interface LockedRowProps {
  label: string;
  value?: string;
  lockMessage?: string;
}

export const LockedRow = ({ label, value, lockMessage }: LockedRowProps) => {
  return (
    <Stack alignItems="center" gap={2}>
      <Text weight="medium">{label}</Text>
      <span>{value}</span>
      <Text italic color="secondary">
        {lockMessage ?? ''}
      </Text>
    </Stack>
  );
};
