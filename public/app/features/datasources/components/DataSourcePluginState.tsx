import { css } from '@emotion/css';

import { type GrafanaTheme2, type PluginState } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { useStyles2 } from '@grafana/ui';
import { PluginStateInfo } from 'app/features/plugins/components/PluginStateInfo';

export type Props = {
  state?: PluginState;
};

export function DataSourcePluginState({ state }: Props) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.formRow}>
      <div className={styles.label}>
        <Trans i18nKey="datasources.data-source-plugin-state.plugin-state">Plugin state</Trans>
      </div>
      <div className={styles.transparentLabel}>
        <PluginStateInfo state={state} />
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  formRow: css({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    textAlign: 'left',
    position: 'relative',
    marginBottom: theme.spacing(0.5),
  }),
  label: css({
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0, 1),
    flexShrink: 0,
    fontWeight: theme.typography.fontWeightMedium,
    fontSize: theme.typography.size.sm,
    backgroundColor: theme.colors.background.secondary,
    height: '32px',
    lineHeight: '32px',
    marginRight: theme.spacing(0.5),
    borderRadius: theme.shape.radius.default,
    width: theme.spacing(20),
  }),
  transparentLabel: css({
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0, 1),
    paddingLeft: 0,
    flexShrink: 0,
    fontWeight: theme.typography.fontWeightMedium,
    fontSize: theme.typography.size.sm,
    backgroundColor: 'transparent',
    border: 0,
    height: '32px',
    lineHeight: '32px',
    marginRight: theme.spacing(0.5),
    borderRadius: theme.shape.radius.default,
    textAlign: 'right',
  }),
});
