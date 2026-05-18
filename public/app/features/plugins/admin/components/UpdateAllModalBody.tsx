import { css } from '@emotion/css';
import { useMemo } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { config } from '@grafana/runtime';
import { Checkbox, type Column, EmptyState, Icon, InteractiveTable, Spinner, Tooltip, useStyles2 } from '@grafana/ui';

import { type CatalogPlugin } from '../types';

type UpdateError = {
  id: string;
  message: string;
};

const getStyles = (theme: GrafanaTheme2) => ({
  icon: css({
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  }),
  footer: css({
    fontSize: theme.typography.bodySmall.fontSize,
    marginTop: theme.spacing(3),
  }),
  noPluginsMessage: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  }),
  tableContainer: css({
    overflowY: 'auto',
    overflowX: 'hidden',
    maxHeight: theme.spacing(41),
    marginBottom: theme.spacing(2),
  }),
  errorIcon: css({
    color: theme.colors.error.main,
  }),
  successIcon: css({
    color: theme.colors.success.main,
  }),
  pluginsInstalled: css({
    svg: {
      marginRight: theme.spacing(1),
    },
  }),
});

const StatusIcon = ({
  id,
  inProgress,
  isSelected,
  isInstalled,
  errorMap,
}: {
  id: string;
  inProgress: boolean;
  isSelected: boolean;
  isInstalled: boolean;
  errorMap: Map<string, UpdateError>;
}) => {
  const styles = useStyles2(getStyles);

  if (errorMap && errorMap.has(id)) {
    return (
      <Tooltip
        content={t('plugins.catalog.update-all.error', 'Error updating plugin: {{errorMessage}}', {
          errorMessage: errorMap.get(id)?.message,
        })}
      >
        <Icon className={styles.errorIcon} size="xl" name="exclamation-triangle" />
      </Tooltip>
    );
  }
  if (isInstalled) {
    return <Icon className={styles.successIcon} size="xl" name="check" />;
  }
  if (inProgress && isSelected) {
    return <Spinner />;
  }
  return '';
};

type Props = {
  plugins: CatalogPlugin[];
  pluginsNotInstalled: Set<string>;
  inProgress: boolean;
  selectedPlugins?: Set<string>;
  onCheckboxChange: (id: string) => void;
  errorMap: Map<string, UpdateError>;
};

export const UpdateModalBody = ({
  plugins,
  pluginsNotInstalled,
  inProgress,
  selectedPlugins,
  onCheckboxChange,
  errorMap,
}: Props) => {
  const styles = useStyles2(getStyles);

  const columns = useMemo<Array<Column<CatalogPlugin>>>(
    () => [
      {
        id: 'update',
        header: () => <Trans i18nKey="plugins.catalog.update-all.update-header">Update</Trans>,
        cell: ({ row }) => (
          <Checkbox
            onChange={() => onCheckboxChange(row.original.id)}
            value={selectedPlugins?.has(row.original.id)}
            disabled={!pluginsNotInstalled.has(row.original.id)}
          />
        ),
      },
      {
        id: 'name',
        header: () => <Trans i18nKey="plugins.catalog.update-all.name-header">Name</Trans>,
        cell: ({ row }) => row.original.name,
      },
      {
        id: 'installedVersion',
        header: () => <Trans i18nKey="plugins.catalog.update-all.installed-header">Installed</Trans>,
        cell: ({ row }) => row.original.installedVersion,
      },
      {
        id: 'latestVersion',
        header: () => <Trans i18nKey="plugins.catalog.update-all.available-header">Available</Trans>,
        cell: ({ row }) => row.original.latestVersion,
      },
      {
        id: 'status',
        cell: ({ row }) => (
          <div className={styles.icon}>
            <StatusIcon
              id={row.original.id}
              inProgress={inProgress}
              isSelected={selectedPlugins?.has(row.original.id) ?? false}
              isInstalled={!pluginsNotInstalled.has(row.original.id)}
              errorMap={errorMap}
            />
          </div>
        ),
      },
    ],
    [onCheckboxChange, selectedPlugins, pluginsNotInstalled, inProgress, errorMap, styles.icon]
  );

  const numberInstalled = plugins.length - pluginsNotInstalled.size;
  const installationFinished = plugins.length !== pluginsNotInstalled.size && !inProgress;

  return (
    <div>
      {plugins.length === 0 ? (
        <EmptyState
          variant="completed"
          message={t('plugins.catalog.update-all.all-plugins-updated', 'All plugins updated!')}
        />
      ) : (
        <>
          <div>
            <Trans i18nKey="plugins.catalog.update-all.header">The following plugins have update available</Trans>
          </div>
          <div className={styles.tableContainer}>
            <InteractiveTable<CatalogPlugin> columns={columns} data={plugins} getRowId={(p) => p.id} />
          </div>
          {numberInstalled > 0 && installationFinished && (
            <div className={styles.pluginsInstalled}>
              <Icon className={styles.successIcon} size="lg" name="check" />
              {`${numberInstalled} ${t('plugins.catalog.update-all.update-status-text', 'plugins updated')}`}
            </div>
          )}
          {errorMap.size > 0 && installationFinished && (
            <div className={styles.pluginsInstalled}>
              <Icon className={styles.errorIcon} size="lg" name="exclamation-triangle" />
              {`${errorMap.size} ${t('plugins.catalog.update-all.error-status-text', 'failed - see error messages')}`}
            </div>
          )}
          {config.pluginAdminExternalManageEnabled && (
            <footer className={styles.footer}>
              <Trans i18nKey="plugins.catalog.update-all.cloud-update-message">
                * It may take a few minutes for the plugins to be available for usage.
              </Trans>
            </footer>
          )}
        </>
      )}
    </div>
  );
};
