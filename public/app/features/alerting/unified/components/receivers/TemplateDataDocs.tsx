import { css } from '@emotion/css';
import { type JSX, type ReactNode, useMemo } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { type Column, InteractiveTable, Stack, Text, useStyles2 } from '@grafana/ui';

import { PopupCard } from '../HoverCard';

import {
  AlertTemplateData,
  GlobalTemplateData,
  KeyValueCodeSnippet,
  KeyValueTemplateFunctions,
  type TemplateDataItem,
} from './TemplateData';

export function TemplateDataDocs() {
  const styles = useStyles2(getTemplateDataDocsStyles);

  const AlertTemplateDataTable = (
    <TemplateDataTable
      caption={
        <>
          <Text variant="h4" element="h4" color="primary">
            <Trans i18nKey="alerting.template-data-docs.alert-template-data-table.alert-template-data">
              Alert template data
            </Trans>
          </Text>
          <Text variant="bodySmall">
            <Trans i18nKey="alerting.template-data-docs.alert-template-data-table.only-in-alert">
              Available only when in the context of an Alert (e.g. inside .Alerts loop)
            </Trans>
          </Text>
        </>
      }
      dataItems={AlertTemplateData}
    />
  );

  return (
    <Stack gap={2}>
      <TemplateDataTable
        caption={
          <>
            <Text variant="h4" element="h4" color="primary">
              <Trans i18nKey="alerting.template-data-docs.notification-template-data">Notification template data</Trans>
            </Text>
            <Text variant="bodySmall">
              <Trans i18nKey="alerting.template-data-docs.available-context-notification">
                Available in the context of a notification.
              </Trans>
            </Text>
          </>
        }
        dataItems={GlobalTemplateData}
        typeRenderer={(type) => {
          if (type === '[]Alert') {
            return (
              <PopupCard content={AlertTemplateDataTable}>
                <div className={styles.interactiveType}>{type}</div>
              </PopupCard>
            );
          }
          if (type === 'KeyValue') {
            return (
              <PopupCard content={<KeyValueTemplateDataTable />}>
                <div className={styles.interactiveType}>{type}</div>
              </PopupCard>
            );
          }
          return type;
        }}
      />
    </Stack>
  );
}

const getTemplateDataDocsStyles = (theme: GrafanaTheme2) => ({
  interactiveType: css({
    color: theme.colors.text.link,
  }),
});

interface TemplateDataTableProps {
  dataItems: TemplateDataItem[];
  caption?: JSX.Element | string;
  typeRenderer?: (type: TemplateDataItem['type']) => ReactNode;
}

export function TemplateDataTable({ dataItems, caption, typeRenderer }: TemplateDataTableProps) {
  // Memoize column definitions so InteractiveTable receives a stable reference across renders
  // (InteractiveTable JSDoc explicitly requires that `columns` is memoized). The `typeRenderer`
  // prop is included in the dependency array because the `type` column's cell renderer closes
  // over it; this preserves the original raw-table behavior of using the caller's renderer to
  // produce the interactive PopupCard for '[]Alert' and 'KeyValue' types.
  const columns = useMemo<Array<Column<TemplateDataItem>>>(
    () => [
      {
        id: 'name',
        header: t('alerting.template-data-table.name', 'Name'),
        cell: ({ row: { original: item } }) => item.name,
      },
      {
        id: 'type',
        header: t('alerting.template-data-table.type', 'Type'),
        cell: ({ row: { original: item } }) => (typeRenderer ? typeRenderer(item.type) : item.type),
      },
      {
        id: 'notes',
        header: t('alerting.template-data-table.notes', 'Notes'),
        cell: ({ row: { original: item } }) => item.notes,
      },
    ],
    [typeRenderer]
  );

  return (
    <Stack direction="column" gap={1}>
      {caption}
      <InteractiveTable columns={columns} data={dataItems} getRowId={(row) => row.name} />
    </Stack>
  );
}

type KeyValueTemplateFunctionRow = (typeof KeyValueTemplateFunctions)[number];

function KeyValueTemplateDataTable() {
  // Static columns: data and renderers do not depend on any prop, so an empty dependency array
  // produces a single memoized column definition for the lifetime of the component (matching the
  // InteractiveTable `columns` stability requirement).
  const columns = useMemo<Array<Column<KeyValueTemplateFunctionRow>>>(
    () => [
      {
        id: 'name',
        header: t('alerting.key-value-template-data-table.name', 'Name'),
        cell: ({ row: { original: item } }) => item.name,
      },
      {
        id: 'arguments',
        header: t('alerting.key-value-template-data-table.arguments', 'Arguments'),
        cell: ({ row: { original: item } }) => item.args,
      },
      {
        id: 'returns',
        header: t('alerting.key-value-template-data-table.returns', 'Returns'),
        cell: ({ row: { original: item } }) => item.returns,
      },
      {
        id: 'notes',
        header: t('alerting.key-value-template-data-table.notes', 'Notes'),
        cell: ({ row: { original: item } }) => item.notes,
      },
    ],
    []
  );

  return (
    <div>
      <Trans i18nKey="alerting.key-value-template-data-table.description">
        KeyValue is a set of key/value string pairs that represent labels and annotations.
      </Trans>
      <pre>
        <code>{KeyValueCodeSnippet}</code>
      </pre>
      <Stack direction="column" gap={1}>
        <Text variant="h6" element="h6">
          <Trans i18nKey="alerting.key-value-template-data-table.keyvalue-methods">Key-value methods</Trans>
        </Text>
        <InteractiveTable columns={columns} data={KeyValueTemplateFunctions} getRowId={(row) => row.name} />
      </Stack>
    </div>
  );
}
