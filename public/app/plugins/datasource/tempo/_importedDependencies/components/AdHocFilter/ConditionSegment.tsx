import { css } from '@emotion/css';

import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

interface Props {
  label: string;
}

export const ConditionSegment = ({ label }: Props) => {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.gfForm}>
      <span className={styles.gfFormLabelQueryKeyword}>{label}</span>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  gfForm: css({
    display: 'flex',
    flexFlow: 'row nowrap',
    marginBottom: theme.spacing(0.5),
    paddingTop: theme.spacing(0.25),
    paddingBottom: theme.spacing(0.25),
  }),
  gfFormLabelQueryKeyword: css({
    display: 'inline-flex',
    alignItems: 'center',
    padding: theme.spacing(0.5, 1),
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
    fontSize: theme.typography.bodySmall.fontSize,
    lineHeight: theme.typography.bodySmall.lineHeight,
    color: theme.colors.primary.text,
    fontWeight: theme.typography.fontWeightMedium,
  }),
});
