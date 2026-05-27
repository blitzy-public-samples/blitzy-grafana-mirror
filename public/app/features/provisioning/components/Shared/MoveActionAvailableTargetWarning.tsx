import { css } from '@emotion/css';

import type { GrafanaTheme2 } from '@grafana/data';
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
        <span className={styles.iconWrap}>
          <Icon name="info-circle" size="sm" />
        </span>
      </Tooltip>
    </Box>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  iconWrap: css({
    marginLeft: theme.spacing(0.5),
  }),
});
