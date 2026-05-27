import { useMemo } from 'react';

import { Trans, t } from '@grafana/i18n';
import { Button, Icon, InteractiveTable, Stack, type Column } from '@grafana/ui';
import { type PluginDashboard } from 'app/types/plugins';

export interface Props {
  // List of plugin dashboards to show in the table
  dashboards: PluginDashboard[];
  // Callback used when the user clicks on importing a dashboard
  onImport: (dashboard: PluginDashboard, overwrite: boolean) => void;
  // Callback used when the user clicks on removing a dashboard
  onRemove: (dashboard: PluginDashboard) => void;
}

export function DashboardsTable({ dashboards, onImport, onRemove }: Props) {
  function buttonText(dashboard: PluginDashboard) {
    return dashboard.revision !== dashboard.importedRevision ? 'Update' : 'Re-import';
  }

  const columns = useMemo<Array<Column<PluginDashboard>>>(
    () => [
      {
        id: 'icon',
        disableGrow: true,
        cell: () => <Icon name="apps" />,
      },
      {
        id: 'title',
        cell: ({ row: { original: dashboard } }) =>
          dashboard.imported ? (
            <a href={dashboard.importedUrl}>{dashboard.title}</a>
          ) : (
            <span>{dashboard.title}</span>
          ),
      },
      {
        id: 'actions',
        cell: ({ row: { original: dashboard } }) => (
          <Stack direction="row" gap={1} justifyContent="flex-end">
            {!dashboard.imported ? (
              <Button variant="secondary" size="sm" onClick={() => onImport(dashboard, false)}>
                <Trans i18nKey="datasources.dashboards-table.import">Import</Trans>
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onImport(dashboard, true)}>
                {buttonText(dashboard)}
              </Button>
            )}
            {dashboard.imported && (
              <Button
                aria-label={t('datasources.dashboards-table.aria-label-delete-dashboard', 'Delete dashboard')}
                icon="trash-alt"
                variant="destructive"
                size="sm"
                onClick={() => onRemove(dashboard)}
              />
            )}
          </Stack>
        ),
      },
    ],
    [onImport, onRemove]
  );

  const getRowId = (dashboard: PluginDashboard, index: number) => `${dashboard.dashboardId}-${index}`;

  return <InteractiveTable<PluginDashboard> columns={columns} data={dashboards} getRowId={getRowId} />;
}

export default DashboardsTable;
