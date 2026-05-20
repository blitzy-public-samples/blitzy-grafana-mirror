import { css } from '@emotion/css';

import { type GrafanaTheme2 } from '@grafana/data';
import { Stack, useStyles2 } from '@grafana/ui';

interface Props {
  label: string;
}

export const ConditionSegment = ({ label }: Props) => {
  const styles = useStyles2(getStyles);
  return (
    <Stack direction="row" gap={0.5} alignItems="center">
      <span className={styles.queryKeyword}>{label}</span>
    </Stack>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  queryKeyword: css({
    display: 'inline-flex',
    alignItems: 'center',
    padding: theme.spacing(0.5, 1),
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
    color: theme.colors.primary.text,
    fontFamily: theme.typography.fontFamilyMonospace,
  }),
});
