import { useMemo } from 'react';

import { AlertLabels } from '@grafana/alerting/unstable';
import { intervalToAbbreviatedDurationString } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { type Column, InteractiveTable } from '@grafana/ui';
import { type AlertmanagerAlert } from 'app/plugins/datasource/alertmanager/types';

import { AmAlertStateTag } from './AmAlertStateTag';

interface Props {
  silencedAlerts: AlertmanagerAlert[];
}

/**
 * Renders silenced alerts in an `InteractiveTable` with one expandable row per
 * alert. The expanded row reveals the alert's full label set via `AlertLabels`,
 * matching the prior per-row collapse behavior. `InteractiveTable` provides
 * its own expand toggle column, so the previous manual `CollapseToggle` column
 * is replaced and the dedicated `SilencedAlertsTableRow.tsx` is no longer
 * imported here.
 *
 * Returning `null` when no silenced alerts exist preserves the original
 * short-circuit behavior used by `SilenceViewContent` and `SilenceDetails`.
 */
const SilencedAlertsTable = ({ silencedAlerts }: Props) => {
  // The `columns` array MUST be memoized (per `InteractiveTable`'s JSDoc:
  // "Table's columns definition. Must be memoized."). The cell renderers close
  // over no parent-component state — they only read `row.original` and stable
  // module-level imports — so the dependency array is empty.
  const columns: Array<Column<AlertmanagerAlert>> = useMemo(
    () => [
      {
        id: 'state',
        header: t('silences-table.header.state', 'State'),
        cell: ({ row }) => <AmAlertStateTag state={row.original.status.state} />,
        disableGrow: true,
      },
      {
        id: 'duration',
        // Header intentionally omitted to preserve the original raw <table>'s
        // empty <th /> semantics for this column. Introducing a new translated
        // header here would create a new i18n key that did not exist in the
        // source file and would alter the rendered output.
        cell: ({ row }) => {
          const duration = intervalToAbbreviatedDurationString({
            start: new Date(row.original.startsAt),
            end: new Date(row.original.endsAt),
          });
          return <Trans i18nKey="alerting.silenced-alerts-table-row.silenced-for">for {{ duration }}</Trans>;
        },
        disableGrow: true,
      },
      {
        id: 'alertName',
        header: t('silences-table.header.alert-name', 'Alert name'),
        cell: ({ row }) => {
          // Resolve the user-facing alert name from the alert's labels. This
          // matches the original logic from `SilencedAlertsTableRow.tsx`: a
          // reduce over `Object.entries(labels)` where the LAST matching key
          // (`alertname` or `__alert_rule_title__`) wins.
          const alertName = Object.entries(row.original.labels).reduce((name, [labelKey, labelValue]) => {
            if (labelKey === 'alertname' || labelKey === '__alert_rule_title__') {
              name = labelValue;
            }
            return name;
          }, '');
          return alertName;
        },
      },
    ],
    []
  );

  if (!silencedAlerts.length) {
    return null;
  }

  return (
    <InteractiveTable
      columns={columns}
      data={silencedAlerts}
      getRowId={(alert) => alert.fingerprint}
      renderExpandedRow={(alert) => <AlertLabels labels={alert.labels} size="sm" />}
    />
  );
};

export default SilencedAlertsTable;
