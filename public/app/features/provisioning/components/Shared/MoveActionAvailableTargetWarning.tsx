import { css } from '@emotion/css';

import { type GrafanaTheme2 } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { Box, Icon, Tooltip, useStyles2 } from '@grafana/ui';

export function MoveActionAvailableTargetWarning() {
  const styles = useStyles2(getStyles);
  return (
    <Box>
      <Trans i18nKey="browse-dashboards.bulk-move-resources-form.move-warning">
        This will move selected folders and their descendants. Available target folders depend on the selected
        resources.
      </Trans>
      <Tooltip
        content={t(
          'browse-dashboards.bulk-move-resources-form.move-warning-tooltip',
          'You can only move provisioned resources within their provisioned folder, and local resources to local folders.'
        )}
      >
        <span className={styles.tooltipTrigger}>
          <Icon name="info-circle" size="sm" />
        </span>
      </Tooltip>
    </Box>
  );
}

// Migrated from inline style={{ marginLeft: '4px' }} per AAP Dimension 3 (inline-style →
// useStyles2). 4px maps to theme.spacing(0.5) (1 spacing unit = 8px).
const getStyles = (theme: GrafanaTheme2) => ({
  tooltipTrigger: css({
    marginLeft: theme.spacing(0.5),
  }),
});
