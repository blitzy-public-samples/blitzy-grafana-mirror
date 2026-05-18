import { type FC, useEffect, useMemo, useReducer } from 'react';

import { LoadingState } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Button, type Column, InteractiveTable, Modal, useStyles2 } from '@grafana/ui';

import { getModalStyles } from '../../styles';
import { type LibraryElementDTO } from '../../types';
import { asyncDispatcher } from '../LibraryPanelsView/actions';

import { getConnectedDashboards } from './actions';
import { deleteLibraryPanelModalReducer, initialDeleteLibraryPanelModalState } from './reducer';

interface Props {
  libraryPanel: LibraryElementDTO;
  onConfirm: () => void;
  onDismiss: () => void;
}

export const DeleteLibraryPanelModal: FC<Props> = ({ libraryPanel, onDismiss, onConfirm }) => {
  const styles = useStyles2(getModalStyles);
  const [{ dashboardTitles, loadingState }, dispatch] = useReducer(
    deleteLibraryPanelModalReducer,
    initialDeleteLibraryPanelModalState
  );
  const asyncDispatch = useMemo(() => asyncDispatcher(dispatch), [dispatch]);
  useEffect(() => {
    asyncDispatch(getConnectedDashboards(libraryPanel));
  }, [asyncDispatch, libraryPanel]);

  const connected = Boolean(dashboardTitles.length);
  const done = loadingState === LoadingState.Done;

  return (
    <Modal
      className={styles.modal}
      title={t('library-panels.delete-library-panel-modal.title-delete-library-panel', 'Delete library panel')}
      onDismiss={onDismiss}
      isOpen={true}
    >
      {!done ? <LoadingIndicator /> : null}
      {done ? (
        <div>
          {connected ? <HasConnectedDashboards dashboardTitles={dashboardTitles} /> : null}
          {!connected ? <Confirm /> : null}

          <Modal.ButtonRow>
            <Button variant="secondary" onClick={onDismiss} fill="outline">
              <Trans i18nKey="library-panels.delete-library-panel-modal.cancel">Cancel</Trans>
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={connected}>
              <Trans i18nKey="library-panels.delete-library-panel-modal.delete">Delete</Trans>
            </Button>
          </Modal.ButtonRow>
        </div>
      ) : null}
    </Modal>
  );
};

const LoadingIndicator = () => (
  <span>
    <Trans i18nKey="library-panels.loading-indicator.loading-library-panel">Loading library panel...</Trans>
  </span>
);

const Confirm = () => {
  const styles = useStyles2(getModalStyles);

  return (
    <div className={styles.modalText}>
      <Trans i18nKey="library-panels.confirm.delete-panel">Do you want to delete this panel?</Trans>
    </div>
  );
};

interface ConnectedDashboardRow {
  id: string;
  name: string;
}

const HasConnectedDashboards: FC<{ dashboardTitles: string[] }> = ({ dashboardTitles }) => {
  const styles = useStyles2(getModalStyles);
  const suffix = dashboardTitles.length === 1 ? 'dashboard.' : 'dashboards.';
  const message = `${dashboardTitles.length} ${suffix}`;
  // Use the source array index as the stable row identity. Dashboard titles are not
  // guaranteed to be unique across folders, and `InteractiveTable`'s underlying
  // `react-table` requires a unique `id` per row — using the title would collapse
  // duplicate-name rows into a single row, regressing the original raw-<table>
  // behavior which keyed rows by `dash-title-${i}`. The connected-dashboards API
  // does not currently surface dashboard UIDs for this list, so the array index is
  // the most stable available identifier.
  const tableData = useMemo<ConnectedDashboardRow[]>(
    () => dashboardTitles.map((name, index) => ({ id: String(index), name })),
    [dashboardTitles]
  );
  const columns = useMemo<Array<Column<ConnectedDashboardRow>>>(
    () => [
      {
        id: 'name',
        header: t('library-panels.has-connected-dashboards.dashboard-name', 'Dashboard name'),
      },
    ],
    []
  );
  if (dashboardTitles.length === 0) {
    return null;
  }

  return (
    <div>
      <p className={styles.textInfo}>
        {'This library panel can not be deleted because it is connected to '}
        <strong>{message}</strong>
        {' Remove the library panel from the dashboards listed below and retry.'}
      </p>
      <InteractiveTable columns={columns} data={tableData} getRowId={(row) => row.id} />
    </div>
  );
};
