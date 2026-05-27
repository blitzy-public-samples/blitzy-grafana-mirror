import { css } from '@emotion/css';
import { useId, useMemo } from 'react';

import { type DataFrame } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Box, type Column, Icon, InteractiveTable, Stack, TagList, Text, Tooltip, useStyles2 } from '@grafana/ui';

import { labelsToTags } from '../../utils/labels';
import { AlertStateTag } from '../rules/AlertStateTag';

import { mapDataFrameToAlertPreview } from './preview';

// `AlertPreviewInstance` is the row shape produced by `mapDataFrameToAlertPreview`.
// `./preview` declares the interface locally without exporting it, so we derive
// the row type from the mapper's return type. This keeps the table typing
// authoritative without restructuring `preview.ts` (out of scope).
type AlertPreviewInstance = ReturnType<typeof mapDataFrameToAlertPreview>['instances'][number];

interface CloudAlertPreviewProps {
  preview: DataFrame;
}

export function CloudAlertPreview({ preview }: CloudAlertPreviewProps) {
  const styles = useStyles2(getStyles);
  const alertPreview = mapDataFrameToAlertPreview(preview);
  // Stable unique id that associates the preview heading + supporting copy
  // (the original raw `<table><caption>` content) with the `InteractiveTable`
  // section wrapper via `aria-labelledby`. `InteractiveTable` does not expose
  // a `caption` prop or forward arbitrary HTML attributes, so the accessible
  // labeling has to live on the wrapper element rather than the table itself.
  const captionId = useId();

  // Column definitions are memoized per the InteractiveTable contract
  // ("Table's columns definition. Must be memoized.").
  // `t` is a module-stable function and intentionally omitted from the deps.
  const columns = useMemo<Array<Column<AlertPreviewInstance>>>(
    () => [
      {
        id: 'state',
        header: t('alerting.cloud-alert-preview.state', 'State'),
        disableGrow: true,
        cell: ({ row: { original } }) => <AlertStateTag state={original.state} />,
      },
      {
        id: 'labels',
        header: t('alerting.cloud-alert-preview.labels', 'Labels'),
        cell: ({ row: { original } }) => (
          <TagList tags={labelsToTags(original.labels)} className={styles.tagList} />
        ),
      },
      {
        id: 'info',
        header: t('alerting.cloud-alert-preview.info', 'Info'),
        disableGrow: true,
        cell: ({ row: { original } }) =>
          original.info ? (
            <Tooltip content={original.info}>
              <Icon name="info-circle" />
            </Tooltip>
          ) : null,
      },
    ],
    [styles.tagList]
  );

  return (
    <Box element="section" aria-labelledby={captionId}>
      <Stack direction="column" gap={1}>
        <Stack direction="column" gap={0}>
          <Text id={captionId}>
            <Trans i18nKey="alerting.cloud-alert-preview.alerts-preview">Alerts preview</Trans>
          </Text>
          <Text variant="bodySmall" color="secondary">
            <Trans i18nKey="alerting.cloud-alert-preview.running-query-preview">
              Preview based on the result of running the query for this moment.
            </Trans>
          </Text>
        </Stack>
        <InteractiveTable
          columns={columns}
          data={alertPreview.instances}
          getRowId={(_row, index) => String(index)}
        />
      </Stack>
    </Box>
  );
}

const getStyles = () => ({
  tagList: css({
    justifyContent: 'flex-start',
  }),
});
