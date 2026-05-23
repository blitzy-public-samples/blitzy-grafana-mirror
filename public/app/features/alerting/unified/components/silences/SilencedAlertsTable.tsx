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
 * Compute the user-facing alert name for an Alertmanager alert. The original
 * raw-table implementation preferred `__alert_rule_title__` over `alertname`
 * (the last matching reduce wins), so this helper preserves that order.
 */
function getAlertName(alert: AlertmanagerAlert): string {
  return Object.entries(alert.labels).reduce((name, [labelKey, labelValue]) => {
    if (labelKey === 'alertname' || labelKey === '__alert_rule_title__') {
      return labelValue;
    }
    return name;
  }, '');
}

/**
 * Renders silenced alerts in an `InteractiveTable` with one expandable row per
 * alert. The expanded row reveals the alert's full label set via `AlertLabels`,
 * matching the prior per-row collapse behavior. `InteractiveTable` provides
 * its own expand toggle column, so the previous manual `CollapseToggle` column
 * is replaced and the dedicated `SilencedAlertsTableRow.tsx` is no longer
 * required.
 *
 * Returning `null` when no silenced alerts exist preserves the original
 * short-circuit behavior used by `SilenceViewContent` and `SilenceDetails`.
 */
const SilencedAlertsTable = ({ silencedAlerts }: Props) => {
  // Memoize columns - `InteractiveTable` JSDoc explicitly requires a stable
  // reference (otherwise it re-creates internal react-table instances on every
  // render). The cell renderers are all stateless and close over no parent
  // state, so the dependency array is empty.
  const columns = useMemo<Array<Column<AlertmanagerAlert>>>(
    () => [
      {
        id: 'state',
        header: t('silences-table.header.state', 'State'),
        cell: ({ row: { original: alert } }) => <AmAlertStateTag state={alert.status.state} />,
      },
      {
        id: 'duration',
        header: t('alerting.silenced-alerts-table.header.duration', 'Duration'),
        cell: ({ row: { original: alert } }) => {
          const duration = intervalToAbbreviatedDurationString({
            start: new Date(alert.startsAt),
            end: new Date(alert.endsAt),
          });
          return (
            <Trans i18nKey="alerting.silenced-alerts-table-row.silenced-for">for {{ duration }}</Trans>
          );
        },
      },
      {
        id: 'name',
        header: t('silences-table.header.alert-name', 'Alert name'),
        cell: ({ row: { original: alert } }) => <>{getAlertName(alert)}</>,
      },
    ],
    []
  );

  if (!silencedAlerts.length) {
    return null;
  }

  return (
    <InteractiveTable<AlertmanagerAlert>
      columns={columns}
      data={silencedAlerts}
      getRowId={(alert) => alert.fingerprint}
      renderExpandedRow={(alert) => <AlertLabels labels={alert.labels} size="sm" />}
    />
  );
};

export default SilencedAlertsTable;
