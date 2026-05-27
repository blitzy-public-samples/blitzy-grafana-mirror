import { useCallback, useMemo, useState } from 'react';
import { useAsync, useDebounce } from 'react-use';

import { Trans, t } from '@grafana/i18n';
import { type Column, Button, Icon, InteractiveTable, Input, Modal, useStyles2 } from '@grafana/ui';

import { getConnectedDashboards } from '../../state/api';
import { getModalStyles } from '../../styles';
import { type PanelModelWithLibraryPanel } from '../../types';
import { usePanelSave } from '../../utils/usePanelSave';

interface Props {
  panel: PanelModelWithLibraryPanel;
  folderUid: string;
  isUnsavedPrompt?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  onDiscard: () => void;
}

interface AffectedDashboardRow {
  id: string;
  name: string;
}

export const SaveLibraryPanelModal = ({
  panel,
  folderUid,
  isUnsavedPrompt,
  onDismiss,
  onConfirm,
  onDiscard,
}: Props) => {
  const [searchString, setSearchString] = useState('');
  const dashState = useAsync(async () => {
    const searchHits = await getConnectedDashboards(panel.libraryPanel.uid);
    if (searchHits && searchHits.length > 0) {
      return searchHits.map((dash) => dash.name);
    }

    return [];
  }, [panel.libraryPanel.uid]);

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

  const { saveLibraryPanel } = usePanelSave();
  const styles = useStyles2(getModalStyles);
  const discardAndClose = useCallback(() => {
    onDiscard();
  }, [onDiscard]);

  // Use the source array index as the stable row identity. Dashboard titles are not
  // guaranteed to be unique across folders, and `InteractiveTable`'s underlying
  // `react-table` requires a unique `id` per row — using the title would collapse
  // duplicate-name rows into a single row, regressing the original raw-<table>
  // behavior which keyed rows by `dashrow-${i}`. The connected-dashboards API
  // does not currently surface dashboard UIDs for this list, so the array index is
  // the most stable available identifier.
  const tableData = useMemo<AffectedDashboardRow[]>(
    () => filteredDashboards.map((name, index) => ({ id: String(index), name })),
    [filteredDashboards]
  );
  const columns = useMemo<Array<Column<AffectedDashboardRow>>>(
    () => [
      {
        id: 'name',
        header: t('library-panels.save-library-panel-modal.dashboard-name', 'Dashboard name'),
      },
    ],
    []
  );

  const title = isUnsavedPrompt ? 'Unsaved library panel changes' : 'Save library panel';

  return (
    <Modal title={title} onDismiss={onDismiss} isOpen={true}>
      <div>
        <p className={styles.textInfo}>
          <Trans
            i18nKey="library-panels.save-library-panel-modal.num-affected"
            count={panel.libraryPanel.meta?.connectedDashboards}
          >
            This update will affect <strong>{'{{count}}'} dashboards.</strong>
          </Trans>
          <Trans i18nKey="library-panels.save-library-panel-modal.affected-dashboards">
            The following dashboards using the panel will be affected:
          </Trans>
        </p>
        <Input
          className={styles.dashboardSearch}
          prefix={<Icon name="search" />}
          placeholder={t(
            'library-panels.save-library-panel-modal.placeholder-search-affected-dashboards',
            'Search affected dashboards'
          )}
          value={searchString}
          onChange={(e) => setSearchString(e.currentTarget.value)}
        />
        {dashState.loading ? (
          <p>
            <Trans i18nKey="library-panels.save-library-panel-modal.loading-connected-dashboards">
              Loading connected dashboards...
            </Trans>
          </p>
        ) : (
          <InteractiveTable columns={columns} data={tableData} getRowId={(row) => row.id} />
        )}
        <Modal.ButtonRow>
          <Button variant="secondary" onClick={onDismiss} fill="outline">
            <Trans i18nKey="library-panels.save-library-panel-modal.cancel">Cancel</Trans>
          </Button>
          {isUnsavedPrompt && (
            <Button variant="destructive" onClick={discardAndClose}>
              <Trans i18nKey="library-panels.save-library-panel-modal.discard">Discard</Trans>
            </Button>
          )}
          <Button
            onClick={() => {
              saveLibraryPanel(panel, folderUid).then(() => {
                onConfirm();
              });
            }}
          >
            <Trans i18nKey="library-panels.save-library-panel-modal.update-all">Update all</Trans>
          </Button>
        </Modal.ButtonRow>
      </div>
    </Modal>
  );
};
