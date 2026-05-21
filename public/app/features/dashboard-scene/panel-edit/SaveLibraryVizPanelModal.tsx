import { useCallback, useMemo, useState } from 'react';
import { useAsync, useDebounce } from 'react-use';

import { Trans, t } from '@grafana/i18n';
import { Button, type Column, Icon, Input, InteractiveTable, Modal, useStyles2 } from '@grafana/ui';
import { getConnectedDashboards } from 'app/features/library-panels/state/api';
import { getModalStyles } from 'app/features/library-panels/styles';

import { type LibraryPanelBehavior } from '../scene/LibraryPanelBehavior';

interface DashboardRow {
  // Stable, unique row identifier derived from the original index. The previous raw
  // <table> used an index-based key (`dashrow-${i}`); we preserve that contract because
  // dashboards in different folders can share display names, so `name` alone is not
  // guaranteed unique. See review finding for SaveLibraryVizPanelModal.tsx L98.
  id: string;
  name: string;
}

interface Props {
  libraryPanel: LibraryPanelBehavior;
  isUnsavedPrompt?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  onDiscard: () => void;
}

export const SaveLibraryVizPanelModal = ({ libraryPanel, isUnsavedPrompt, onDismiss, onConfirm, onDiscard }: Props) => {
  const [searchString, setSearchString] = useState('');
  const dashState = useAsync(async () => {
    const searchHits = await getConnectedDashboards(libraryPanel.state.uid);
    if (searchHits && searchHits.length > 0) {
      return searchHits.map((dash) => dash.name);
    }

    return [];
  }, [libraryPanel.state.uid]);

  const [filteredDashboards, setFilteredDashboards] = useState<string[]>([]);
  useDebounce(
    () => {
      if (!dashState.value) {
        return setFilteredDashboards([]);
      }

      return setFilteredDashboards(
        dashState.value.filter((dashName) => dashName.toLowerCase().includes(searchString.toLowerCase()))
      );
    },
    300,
    [dashState.value, searchString]
  );

  const styles = useStyles2(getModalStyles);

  const tableData = useMemo<DashboardRow[]>(
    () => filteredDashboards.map((name, i) => ({ id: `dashrow-${i}`, name })),
    [filteredDashboards]
  );

  const columns = useMemo<Array<Column<DashboardRow>>>(
    () => [
      {
        id: 'name',
        header: t('dashboard-scene.save-library-viz-panel-modal.dashboard-name', 'Dashboard name'),
      },
    ],
    []
  );

  const discardAndClose = useCallback(() => {
    onDiscard();
  }, [onDiscard]);

  const title = isUnsavedPrompt ? 'Unsaved library panel changes' : 'Save library panel';

  return (
    <Modal title={title} onDismiss={onDismiss} isOpen={true}>
      <div>
        <p className={styles.textInfo}>
          <Trans
            i18nKey="dashboard-scene.save-library-viz-panel-modal.affected-dashboards"
            count={libraryPanel.state._loadedPanel?.meta?.connectedDashboards}
          >
            This update will affect <strong>{'{{count}}'} dashboards.</strong> The following dashboards using the panel
            will be affected:
          </Trans>
        </p>
        <Input
          className={styles.dashboardSearch}
          prefix={<Icon name="search" />}
          placeholder={t(
            'dashboard-scene.save-library-viz-panel-modal.placeholder-search-affected-dashboards',
            'Search affected dashboards'
          )}
          value={searchString}
          onChange={(e) => setSearchString(e.currentTarget.value)}
        />
        {dashState.loading ? (
          <p>
            <Trans i18nKey="dashboard-scene.save-library-viz-panel-modal.loading-connected-dashboards">
              Loading connected dashboards...
            </Trans>
          </p>
        ) : (
          /* Omit `pageSize` (defaults to 0 -> pagination disabled) to preserve the
           * original raw-<table> behavior of rendering every affected dashboard in the
           * list. Use the synthesized stable `id` (see DashboardRow) as the row key
           * because dashboard names alone are not guaranteed unique across folders. */
          <InteractiveTable columns={columns} data={tableData} getRowId={(row) => row.id} />
        )}
        <Modal.ButtonRow>
          <Button variant="secondary" onClick={onDismiss} fill="outline">
            <Trans i18nKey="dashboard-scene.save-library-viz-panel-modal.cancel">Cancel</Trans>
          </Button>
          {isUnsavedPrompt && (
            <Button variant="destructive" onClick={discardAndClose}>
              <Trans i18nKey="dashboard-scene.save-library-viz-panel-modal.discard">Discard</Trans>
            </Button>
          )}
          <Button
            onClick={() => {
              onConfirm();
            }}
          >
            <Trans i18nKey="dashboard-scene.save-library-viz-panel-modal.update-all">Update all</Trans>
          </Button>
        </Modal.ButtonRow>
      </div>
    </Modal>
  );
};
