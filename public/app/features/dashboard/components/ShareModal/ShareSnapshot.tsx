import { useCallback, useEffect, useMemo, useState, memo, type ChangeEvent } from 'react';

import { isEmptyObject, type SelectableValue, VariableRefresh } from '@grafana/data';
import { selectors as e2eSelectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { getBackendSrv } from '@grafana/runtime';
import { type Dashboard } from '@grafana/schema';
import { Box, Button, ClipboardButton, Field, Input, LinkButton, Modal, Select, Spinner, Stack } from '@grafana/ui';
import { getTimeSrv } from 'app/features/dashboard/services/TimeSrv';
import { type DashboardModel } from 'app/features/dashboard/state/DashboardModel';
import { type PanelModel } from 'app/features/dashboard/state/PanelModel';
import { DashboardInteractions } from 'app/features/dashboard-scene/utils/interactions';

import { getDashboardSnapshotSrv } from '../../services/SnapshotSrv';

import { type ShareModalTabProps } from './types';
import { getTrackingSource } from './utils';

interface Props extends ShareModalTabProps {}

const selectors = e2eSelectors.pages.ShareDashboardModal.SnapshotScene;

export const ShareSnapshot = memo(({ dashboard, panel, onDismiss }: Props) => {
  // expireOptions is computed once at mount via useMemo with empty deps so that the
  // localized `t(...)` labels are captured at component-mount time (matching the
  // PureComponent constructor-once behavior of the original class).
  const expireOptions = useMemo<Array<SelectableValue<number>>>(
    () => [
      {
        label: t('share-modal.snapshot.expire-hour', `1 Hour`),
        value: 60 * 60,
      },
      {
        label: t('share-modal.snapshot.expire-day', `1 Day`),
        value: 60 * 60 * 24,
      },
      {
        label: t('share-modal.snapshot.expire-week', `1 Week`),
        value: 60 * 60 * 24 * 7,
      },
      {
        label: t('share-modal.snapshot.expire-never', `Never`),
        value: 0,
      },
    ],
    []
  );

  // Ten individual useState calls — one per field of the original State interface.
  // The fields are mutated independently, so individual useState calls are cleaner
  // than a single useReducer for this case.
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [snapshotName, setSnapshotName] = useState(dashboard.title);
  const [selectedExpireOption, setSelectedExpireOption] = useState<SelectableValue<number>>(expireOptions[2]);
  const [snapshotExpires, setSnapshotExpires] = useState<number | undefined>(expireOptions[2].value);
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [deleteUrl, setDeleteUrl] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState(4);
  const [externalEnabled, setExternalEnabled] = useState(false);
  const [sharingButtonText, setSharingButtonText] = useState('');

  // Mount-only effect replacing the class's componentDidMount → getSnaphotShareOptions.
  // Behavior matches the class verbatim: fire the request once, then setState when it resolves.
  // The original class did not include cancellation logic on unmount; preserve that minimal-change semantic.
  useEffect(() => {
    getDashboardSnapshotSrv()
      .getSharingOptions()
      .then((shareOptions) => {
        setSharingButtonText(shareOptions.externalSnapshotName);
        setExternalEnabled(shareOptions.externalEnabled);
      });
  }, []);

  const scrubDashboard = (dash: DashboardModel) => {
    // change title
    dash.title = snapshotName;

    // make relative times absolute
    dash.time = getTimeSrv().timeRange();

    // Remove links
    dash.links = [];

    // remove panel queries & links
    // Inner parameter renamed to `p` to avoid shadowing the outer destructured `panel` prop.
    dash.panels.forEach((p) => {
      p.targets = [];
      p.links = [];
      p.datasource = null;
    });

    // remove annotation queries
    const annotations = dash.annotations.list.filter((annotation) => annotation.enable);

    dash.annotations.list = annotations.map((annotation) => {
      return {
        name: annotation.name,
        enable: annotation.enable,
        iconColor: annotation.iconColor,
        snapshotData: annotation.snapshotData,
        type: annotation.type,
        builtIn: annotation.builtIn,
        hide: annotation.hide,
      };
    });

    // remove template queries
    dash.getVariables().forEach((variable) => {
      if ('query' in variable) {
        variable.query = '';
      }
      if ('options' in variable) {
        variable.options = variable.current && !isEmptyObject(variable.current) ? [variable.current] : [];
      }
      if ('refresh' in variable) {
        variable.refresh = VariableRefresh.never;
      }
    });

    // snapshot single panel
    if (panel) {
      const singlePanel = panel.getSaveModel();
      singlePanel.gridPos.w = 24;
      singlePanel.gridPos.x = 0;
      singlePanel.gridPos.y = 0;
      singlePanel.gridPos.h = 20;
      dash.panels = [singlePanel];
    }

    // cleanup snapshotData
    delete dashboard.snapshot;
    // Inner parameter renamed to `p` to avoid shadowing the outer destructured `panel` prop.
    dashboard.forEachPanel((p: PanelModel) => {
      delete p.snapshotData;
    });
    dashboard.annotations.list.forEach((annotation) => {
      delete annotation.snapshotData;
    });
  };

  // Note: The original class's saveSnapshot accepted a `dashboard: DashboardModel` parameter that
  // shadowed `this.dashboard` but was never actually read (the body always used `this.dashboard`).
  // In the functional version that unused parameter is omitted; behavior is preserved verbatim.
  const saveSnapshot = async (external?: boolean) => {
    const dash = dashboard.getSaveModelCloneOld();

    scrubDashboard(dash);

    const cmdData = {
      dashboard: dash,
      name: dash.title,
      expires: snapshotExpires,
      external: external,
    };

    try {
      const results = await getDashboardSnapshotSrv().create(cmdData);
      setDeleteUrl(results.deleteUrl);
      setSnapshotUrl(results.url);
      setStep(2);
    } finally {
      if (external) {
        DashboardInteractions.publishSnapshotClicked({
          expires: snapshotExpires,
          timeout: timeoutSeconds,
          shareResource: getTrackingSource(panel),
        });
      } else {
        DashboardInteractions.publishSnapshotLocalClicked({
          expires: snapshotExpires,
          timeout: timeoutSeconds,
          shareResource: getTrackingSource(panel),
        });
      }
      setIsLoading(false);
    }
  };

  const createSnapshot = (external?: boolean) => () => {
    // The strict `Dashboard['snapshot']` shape declares many required fields
    // (created/expires/external/etc.), but the legacy in-memory snapshot marker only needs a
    // truthy object — `dashboard.isSnapshot()` returns Boolean(snapshot). The runtime value
    // here is intentionally minimal; cast so the legacy assignment continues to compile.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- legacy in-memory snapshot marker; only truthiness is consumed
    dashboard.snapshot = { timestamp: new Date() } as unknown as Dashboard['snapshot'];

    setIsLoading(true);
    dashboard.startRefresh();

    setTimeout(() => {
      saveSnapshot(external);
    }, timeoutSeconds * 1000);
  };

  const deleteSnapshot = async () => {
    await getBackendSrv().get(deleteUrl);
    setStep(3);
  };

  // useCallback used to provide a stable reference for ClipboardButton's `getText` prop.
  const getSnapshotUrl = useCallback(() => snapshotUrl, [snapshotUrl]);

  const onSnapshotNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSnapshotName(event.target.value);
  };

  const onTimeoutChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTimeoutSeconds(Number(event.target.value));
  };

  const onExpireChange = (option: SelectableValue<number>) => {
    setSelectedExpireOption(option);
    setSnapshotExpires(option.value);
  };

  const renderStep1 = () => {
    const snapshotNameTranslation = t('share-modal.snapshot.name', `Snapshot name`);
    const expireTranslation = t('share-modal.snapshot.expire', `Expire`);
    const timeoutTranslation = t('share-modal.snapshot.timeout', `Timeout (seconds)`);
    const timeoutDescriptionTranslation = t(
      'share-modal.snapshot.timeout-description',
      `You might need to configure the timeout value if it takes a long time to collect your dashboard metrics.`
    );

    return (
      <>
        <div>
          <p>
            <Trans i18nKey="share-modal.snapshot.info-text-1">
              A snapshot is an instant way to share an interactive dashboard publicly. When created, we strip sensitive
              data like queries (metric, template, and annotation) and panel links, leaving only the visible metric data
              and series names embedded in your dashboard.
            </Trans>
          </p>
          <p>
            <Trans i18nKey="share-modal.snapshot.info-text-2">
              Keep in mind, your snapshot <em>can be viewed by anyone</em> that has the link and can access the URL.
              Share wisely.
            </Trans>
          </p>
        </div>
        <Field label={snapshotNameTranslation}>
          <Input id="snapshot-name-input" width={30} value={snapshotName} onChange={onSnapshotNameChange} />
        </Field>
        <Field label={expireTranslation}>
          <Select
            inputId="expire-select-input"
            width={30}
            options={expireOptions}
            value={selectedExpireOption}
            onChange={onExpireChange}
          />
        </Field>
        <Field label={timeoutTranslation} description={timeoutDescriptionTranslation}>
          <Input id="timeout-input" type="number" width={21} value={timeoutSeconds} onChange={onTimeoutChange} />
        </Field>

        <Modal.ButtonRow>
          <Button variant="secondary" onClick={onDismiss} fill="outline">
            <Trans i18nKey="share-modal.snapshot.cancel-button">Cancel</Trans>
          </Button>
          {externalEnabled && (
            <Button variant="secondary" disabled={isLoading} onClick={createSnapshot(true)}>
              {sharingButtonText}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={isLoading}
            onClick={createSnapshot()}
            data-testid={selectors.PublishSnapshot}
          >
            <Trans i18nKey="share-modal.snapshot.local-button">Publish Snapshot</Trans>
          </Button>
        </Modal.ButtonRow>
      </>
    );
  };

  const renderStep2 = () => (
    <Stack direction="column" gap={0}>
      <Field label={t('share-modal.snapshot.url-label', 'Snapshot URL')}>
        <Input
          id="snapshot-url-input"
          value={snapshotUrl}
          data-testid={selectors.CopyUrlInput}
          readOnly
          addonAfter={
            <ClipboardButton
              icon="copy"
              variant="primary"
              getText={getSnapshotUrl}
              data-testid={selectors.CopyUrlButton}
            >
              <Trans i18nKey="share-modal.snapshot.copy-link-button">Copy</Trans>
            </ClipboardButton>
          }
        />
      </Field>

      {/* Replaces inline style {{ alignSelf: 'flex-end', padding: '5px' }} with design-system primitives.
          The parent <Stack direction="column"> has default align-items: stretch, so the inner
          <Stack justifyContent="flex-end"> spans full width and pushes its children to the right
          (equivalent to alignSelf:flex-end). Box padding={0.5} = theme.spacing(0.5) = 4px ≈ 5px,
          within AAP §0.5.4 design-system-defaults tolerance. */}
      <Stack justifyContent="flex-end">
        <Box padding={0.5}>
          <Trans i18nKey="share-modal.snapshot.mistake-message">Did you make a mistake? </Trans>&nbsp;
          <LinkButton fill="text" target="_blank" onClick={deleteSnapshot}>
            <Trans i18nKey="share-modal.snapshot.delete-button">Delete snapshot.</Trans>
          </LinkButton>
        </Box>
      </Stack>
    </Stack>
  );

  const renderStep3 = () => (
    <p>
      <Trans i18nKey="share-modal.snapshot.deleted-message">
        The snapshot has been deleted. If you have already accessed it once, then it might take up to an hour before
        before it is removed from browser caches or CDN caches.
      </Trans>
    </p>
  );

  return (
    <>
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {isLoading && <Spinner inline={true} />}
    </>
  );
});

ShareSnapshot.displayName = 'ShareSnapshot';
