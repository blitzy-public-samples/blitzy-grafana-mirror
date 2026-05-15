import { css } from '@emotion/css';
import { useMemo } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import {
  Box,
  Button,
  type CellProps,
  type Column,
  Icon,
  InteractiveTable,
  Select,
  Tooltip,
  useStyles2,
} from '@grafana/ui';

import { type ResourcePermission } from './types';

interface Props {
  title: string;
  compareKey: 'builtInRole' | 'userLogin' | 'team';
  items: ResourcePermission[];
  permissionLevels: string[];
  canSet: boolean;
  onRemove: (item: ResourcePermission) => void;
  onChange: (resourcePermission: ResourcePermission, permission: string) => void;
}

export const PermissionList = ({ title, items, compareKey, permissionLevels, canSet, onRemove, onChange }: Props) => {
  const styles = useStyles2(getStyles);

  const computed = useMemo(() => {
    const keep: { [key: string]: ResourcePermission } = {};
    for (let item of items) {
      const key = item[compareKey]!;
      if (!keep[key]) {
        keep[key] = item;
        continue;
      }

      if (item.actions.length > keep[key].actions.length) {
        keep[key] = item;
        continue;
      }

      // Determine which permission to keep for display
      // If the same permission has been applied more than once (i.e. one copy is ready kept)
      if (item.actions.length === keep[key].actions.length) {
        // replace the kept permission if it is managed and this item is not (i.e. it is inherited or provisioned)
        if (keep[key].isManaged && !item.isManaged) {
          keep[key] = item;
        }
      }
    }
    return Object.keys(keep).map((k) => keep[k]);
  }, [items, compareKey]);

  const columns = useMemo<Array<Column<ResourcePermission>>>(
    () => [
      {
        id: 'avatar',
        header: '',
        disableGrow: true,
        cell: ({ row: { original: item } }: CellProps<ResourcePermission>) => {
          if (item.teamId) {
            return (
              <img className={styles.avatar} src={item.teamAvatarUrl} alt={`Avatar for team ${item.teamId}`} />
            );
          }
          if (item.userId) {
            return (
              <img className={styles.avatar} src={item.userAvatarUrl} alt={`Avatar for user ${item.userId}`} />
            );
          }
          return <Icon size="xl" name="shield" />;
        },
      },
      {
        id: 'name',
        header: title,
        cell: ({ row: { original: item } }: CellProps<ResourcePermission>) => {
          if (item.userId) {
            return <span>{item.userLogin} </span>;
          }
          if (item.teamId) {
            return <span>{item.team} </span>;
          }
          if (item.builtInRole) {
            return <span>{item.builtInRole} </span>;
          }
          return <span />;
        },
      },
      {
        id: 'inherited',
        header: '',
        disableGrow: true,
        cell: ({ row: { original: item } }: CellProps<ResourcePermission>) => {
          if (item.isInherited) {
            return (
              <em className={styles.inherited}>
                <Trans i18nKey="access-control.permission-list-item.inherited">Inherited from folder</Trans>
              </em>
            );
          }
          return null;
        },
      },
      {
        id: 'permission',
        header: t('access-control.permission-list.permission', 'Permission'),
        cell: ({ row: { original: item } }: CellProps<ResourcePermission>) => (
          <Select
            disabled={!canSet || !item.isManaged}
            onChange={(p) => onChange(item, p.value!)}
            value={permissionLevels.find((p) => p === item.permission)}
            options={permissionLevels.map((p) => ({ value: p, label: p }))}
          />
        ),
      },
      {
        id: 'warning',
        header: '',
        disableGrow: true,
        cell: ({ row: { original: item } }: CellProps<ResourcePermission>) => {
          if (item.warning) {
            return (
              <Tooltip
                content={
                  <>
                    <Box marginBottom={1}>{item.warning}</Box>
                    {getPermissionInfo(item)}
                  </>
                }
              >
                <Icon name="exclamation-triangle" className={styles.warning} />
              </Tooltip>
            );
          }
          return (
            <Tooltip content={getPermissionInfo(item)}>
              <Icon name="info-circle" />
            </Tooltip>
          );
        },
      },
      {
        id: 'action',
        header: '',
        disableGrow: true,
        cell: ({ row: { original: item } }: CellProps<ResourcePermission>) => {
          if (item.isManaged) {
            return (
              <Button
                size="sm"
                icon="times"
                variant="destructive"
                disabled={!canSet}
                onClick={() => onRemove(item)}
                aria-label={t(
                  'access-control.permission-list-item.remove-aria-label',
                  'Remove permission for {{identifier}}',
                  { identifier: getName(item) }
                )}
              />
            );
          }
          return (
            <Tooltip
              content={
                item.isInherited
                  ? t('access-control.permission-list-item.tooltip-inherited-permission', 'Inherited permission')
                  : t('access-control.permission-list-item.tooltip-provisioned-permission', 'Provisioned permission')
              }
            >
              <Button
                size="sm"
                icon="lock"
                aria-label={t('access-control.permission-list-item.locked-aria-label', 'Locked permission indicator')}
              />
            </Tooltip>
          );
        },
      },
    ],
    [styles, title, permissionLevels, canSet, onChange, onRemove]
  );

  if (computed.length === 0) {
    return null;
  }

  return (
    <Box marginBottom={5}>
      <InteractiveTable columns={columns} data={computed} getRowId={(item) => String(item.id)} />
    </Box>
  );
};

const getName = (item: ResourcePermission) => {
  if (item.userId) {
    return item.userLogin;
  }
  if (item.teamId) {
    return item.team;
  }
  return item.builtInRole;
};

const getPermissionInfo = (p: ResourcePermission) => `Actions: ${[...new Set(p.actions)].sort().join(' ')}`;

const getStyles = (theme: GrafanaTheme2) => ({
  avatar: css({
    width: '25px',
    height: '25px',
    borderRadius: theme.shape.radius.circle,
  }),
  inherited: css({
    color: theme.colors.text.secondary,
    flexWrap: 'nowrap',
  }),
  warning: css({
    color: theme.colors.warning.main,
  }),
});
