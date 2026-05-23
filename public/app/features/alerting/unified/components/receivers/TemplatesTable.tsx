import { useMemo, useState } from 'react';

import { Trans, t } from '@grafana/i18n';
import { logError } from '@grafana/runtime';
import { Badge, type Column, ConfirmModal, InteractiveTable, Stack, Tooltip } from '@grafana/ui';
import { useAppNotification } from 'app/core/copy/appNotification';
import { CodeText } from 'app/features/alerting/unified/components/common/TextVariants';
import { GRAFANA_RULES_SOURCE_NAME } from 'app/features/alerting/unified/utils/datasource';

import { Authorize } from '../../components/Authorize';
import { AlertmanagerAction } from '../../hooks/useAbilities';
import { isProvisionedResource } from '../../utils/k8s/utils';
import { makeAMLink, stringifyErrorLike } from '../../utils/misc';
import { ProvisioningBadge } from '../Provisioning';
import {
  type NotificationTemplate,
  useDeleteNotificationTemplate,
  useNotificationTemplateMetadata,
} from '../contact-points/useNotificationTemplates';
import { isLegacyTemplate } from '../contact-points/utils';
import { ActionIcon } from '../rules/ActionIcon';

import { TemplateEditor } from './TemplateEditor';

interface Props {
  alertManagerName: string;
  templates: NotificationTemplate[];
}

export const TemplatesTable = ({ alertManagerName, templates }: Props) => {
  const appNotification = useAppNotification();
  const [deleteTemplate] = useDeleteNotificationTemplate({ alertmanager: alertManagerName });

  const [templateToDelete, setTemplateToDelete] = useState<NotificationTemplate | undefined>();

  const onDeleteTemplate = async () => {
    if (templateToDelete) {
      try {
        await deleteTemplate.execute({ uid: templateToDelete.uid });
        appNotification.success('Template deleted', `Template ${templateToDelete.title} has been deleted`);
      } catch (error) {
        appNotification.error('Error deleting template', `Error deleting template ${templateToDelete.title}`);

        const loggableError = error instanceof Error ? error : new Error(stringifyErrorLike(error));
        logError(loggableError);
      }
    }
    setTemplateToDelete(undefined);
  };

  // Memoize column definitions so InteractiveTable receives a stable reference across renders
  // (InteractiveTable JSDoc explicitly requires that `columns` is memoized). The cell renderers
  // for the actions column close over `alertManagerName` and `setTemplateToDelete`; the name
  // column's cell closes over `alertManagerName`. Both are stable across the component's
  // lifetime (`alertManagerName` is a prop, `setTemplateToDelete` is a stable setter), so the
  // dependency array reflects exactly those references.
  const columns = useMemo<Array<Column<NotificationTemplate>>>(
    () => [
      {
        id: 'name',
        header: t('alerting.templates-table.template-group', 'Template group'),
        cell: ({ row: { original: notificationTemplate } }) => (
          <TemplateNameCell notificationTemplate={notificationTemplate} alertManagerName={alertManagerName} />
        ),
      },
      {
        id: 'actions',
        // The actions column header reproduces the original raw <table>'s <th>Actions</th>
        // label using the same `alerting.templates-table.actions` i18n key, but renders the
        // text inside an `sr-only` <span> so the visual layout (an empty header cell above the
        // right-aligned action icons) remains identical to the previous design-system state
        // while the column is properly labeled for assistive technology. The cell-level
        // permission gating via <Authorize> in `TemplateActionsCell` is unchanged: this only
        // restores the accessible header label, not the per-cell permission behavior.
        header: () => (
          <span className="sr-only">
            <Trans i18nKey="alerting.templates-table.actions">Actions</Trans>
          </span>
        ),
        disableGrow: true,
        cell: ({ row: { original: notificationTemplate } }) => (
          <TemplateActionsCell
            notificationTemplate={notificationTemplate}
            alertManagerName={alertManagerName}
            onDeleteClick={setTemplateToDelete}
          />
        ),
      },
    ],
    [alertManagerName]
  );

  return (
    <>
      {templates.length === 0 ? (
        <div data-testid="templates-table">
          <Trans i18nKey="alerting.templates-table.no-templates-defined">No templates defined.</Trans>
        </div>
      ) : (
        // InteractiveTable does not forward arbitrary HTML attributes (it only accepts `className`),
        // so we wrap with a <div data-testid="templates-table"> to preserve the existing selector
        // used by tests and any external automation that targets this list.
        <div data-testid="templates-table">
          <InteractiveTable<NotificationTemplate>
            columns={columns}
            data={templates}
            getRowId={(notificationTemplate) => notificationTemplate.uid}
            renderExpandedRow={(notificationTemplate) => (
              <TemplateEditor
                width={'auto'}
                height={'auto'}
                autoHeight={true}
                value={notificationTemplate.content}
                showLineNumbers={false}
                monacoOptions={{
                  readOnly: true,
                  scrollBeyondLastLine: false,
                }}
              />
            )}
          />
        </div>
      )}

      {!!templateToDelete && (
        <ConfirmModal
          isOpen={true}
          title={t('alerting.templates-table.title-delete-template-group', 'Delete template group')}
          body={t(
            'alerting.templates-table.body-delete-template-group',
            'Are you sure you want to delete template group "{{template}}"?',
            { template: templateToDelete.title }
          )}
          confirmText={t('alerting.templates-table.confirmText-yes-delete', 'Yes, delete')}
          onConfirm={onDeleteTemplate}
          onDismiss={() => setTemplateToDelete(undefined)}
        />
      )}
    </>
  );
};

interface TemplateNameCellProps {
  notificationTemplate: NotificationTemplate;
  alertManagerName: string;
}

// Renders the template's display name plus any applicable status badges (Provisioned,
// Legacy, Misconfigured) inline. Preserves the exact whitespace and ordering of the
// previous raw-table row so the badge presence/order observed by `TemplatesTable.test.tsx`
// (`within(row).getByText('Imported' | 'Provisioned' | 'Legacy')`) is unchanged.
function TemplateNameCell({ notificationTemplate, alertManagerName }: TemplateNameCellProps) {
  const isGrafanaAlertmanager = alertManagerName === GRAFANA_RULES_SOURCE_NAME;
  const { provenance } = useNotificationTemplateMetadata(notificationTemplate);
  const isProvisioned = isProvisionedResource(provenance);

  const { title: name, missing } = notificationTemplate;
  const misconfiguredBadgeText = t('alerting.templates.misconfigured-badge-text', 'Misconfigured');

  return (
    <>
      {name} {isProvisioned && <ProvisioningBadge tooltip provenance={provenance} />}{' '}
      {isLegacyTemplate(notificationTemplate) && (
        <Badge
          text={t('alerting.templates.legacy-badge-text', 'Legacy')}
          color="orange"
          tooltip={t(
            'alerting.templates.legacy-badge-tooltip',
            'This template was imported from a Mimir Alertmanager and uses a legacy format.'
          )}
        />
      )}{' '}
      {missing && !isGrafanaAlertmanager && (
        <Tooltip
          content={
            <>
              <Trans i18nKey="alerting.templates.misconfigured-warning">This template is misconfigured.</Trans>
              <br />
              <Trans i18nKey="alerting.templates.misconfigured-warning-details">
                Templates must be defined in both the{' '}
                <CodeText content={t('alerting.template-row.content-templatefiles', 'template_files')} /> and{' '}
                <CodeText content={t('alerting.template-row.content-templates', 'templates')} /> sections of your
                alertmanager configuration.
              </Trans>
            </>
          }
        >
          <span>
            <Badge text={misconfiguredBadgeText} color="orange" />
          </span>
        </Tooltip>
      )}
    </>
  );
}

interface TemplateActionsCellProps {
  notificationTemplate: NotificationTemplate;
  alertManagerName: string;
  onDeleteClick: (template: NotificationTemplate) => void;
}

// Renders the per-row action icons (view/edit, copy, delete) with the exact same
// permission gating as the original raw-table implementation. Wrapping the icons in
// a horizontal <Stack> with `justifyContent="flex-end"` and `gap={0.5}` reproduces
// the previous right-aligned compact layout that was provided by the now-removed
// `getAlertTableStyles().actionsCell` className (`text-align: right`, `width: 1%`,
// and `& > * + * { margin-left: theme.spacing(0.5) }`). The `disableGrow` flag on
// the column itself collapses the column to its content width, replacing the
// `width: 1%` portion of the prior styling.
function TemplateActionsCell({ notificationTemplate, alertManagerName, onDeleteClick }: TemplateActionsCellProps) {
  const { provenance } = useNotificationTemplateMetadata(notificationTemplate);
  const isProvisioned = isProvisionedResource(provenance);
  const { uid } = notificationTemplate;

  return (
    <Stack direction="row" gap={0.5} justifyContent="flex-end" alignItems="center" wrap="nowrap">
      {isProvisioned && (
        <ActionIcon
          to={makeAMLink(`/alerting/notifications/templates/${encodeURIComponent(uid)}/edit`, alertManagerName)}
          tooltip={t('alerting.template-row.tooltip-view-template', 'view template')}
          icon="file-alt"
        />
      )}
      {!isProvisioned && (
        <Authorize actions={[AlertmanagerAction.UpdateNotificationTemplate]}>
          <ActionIcon
            to={makeAMLink(`/alerting/notifications/templates/${encodeURIComponent(uid)}/edit`, alertManagerName)}
            tooltip={t('alerting.template-row.tooltip-edit-template-group', 'Edit template group')}
            icon="pen"
          />
        </Authorize>
      )}
      <Authorize actions={[AlertmanagerAction.CreateNotificationTemplate]}>
        <ActionIcon
          to={makeAMLink(`/alerting/notifications/templates/${encodeURIComponent(uid)}/duplicate`, alertManagerName)}
          tooltip={t('alerting.template-row.tooltip-copy-template-group', 'Copy template group')}
          icon="copy"
        />
      </Authorize>
      {!isProvisioned && (
        <Authorize actions={[AlertmanagerAction.DeleteNotificationTemplate]}>
          <ActionIcon
            onClick={() => onDeleteClick(notificationTemplate)}
            tooltip={t('alerting.template-row.tooltip-delete-template-group', 'Delete template group')}
            icon="trash-alt"
          />
        </Authorize>
      )}
    </Stack>
  );
}
