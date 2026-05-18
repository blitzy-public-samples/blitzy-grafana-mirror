import { css } from '@emotion/css';

import { type GrafanaTheme2, dateTimeFormat, textUtil } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { Box, Legend, TextLink, useStyles2 } from '@grafana/ui';

type Props = {
  gnetId: string | number | undefined;
  orgName: string;
  updatedAt: string;
};

function buildGcomDashboardUrl(gnetId: string | number | undefined): string {
  const url = new URL('https://grafana.com/dashboards');
  if (gnetId !== undefined) {
    url.pathname = `/dashboards/${String(gnetId)}`;
  }
  return textUtil.sanitizeUrl(url.toString());
}

export function GcomDashboardInfo({ gnetId, orgName, updatedAt }: Props) {
  const styles = useStyles2(getStyles);
  return (
    <Box marginBottom={3}>
      <div>
        <Legend>
          <Trans i18nKey="manage-dashboards.import-dashboard-overview-un-connected.importing-from">
            Importing dashboard from <TextLink href={buildGcomDashboardUrl(gnetId)}>Grafana.com</TextLink>
          </Trans>
        </Legend>
      </div>
      <dl className={styles.metadata}>
        <dt>
          <Trans i18nKey="manage-dashboards.import-dashboard-overview-un-connected.published-by">
            Published by
          </Trans>
        </dt>
        <dd>{orgName}</dd>
        <dt>
          <Trans i18nKey="manage-dashboards.import-dashboard-overview-un-connected.updated-on">Updated on</Trans>
        </dt>
        <dd>{dateTimeFormat(updatedAt)}</dd>
      </dl>
    </Box>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  metadata: css({
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: theme.spacing(2),
    rowGap: theme.spacing(0.25),
    margin: 0,
    padding: 0,
    'dt, dd': {
      margin: 0,
      padding: 0,
    },
  }),
});
