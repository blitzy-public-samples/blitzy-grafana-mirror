import { css, cx } from '@emotion/css';

import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

export function DiffCell({ value, theme }: { value: number | undefined; theme: GrafanaTheme2 }) {
  const styles = useStyles2(getStyles);

  if (value === undefined) {
    return <span>-</span>;
  }

  let displayValue: string;
  let color: string;

  if (value === Infinity) {
    displayValue = 'new';
    color = theme.colors.success.text;
  } else if (value === -100) {
    displayValue = 'removed';
    color = theme.colors.error.text;
  } else {
    displayValue = `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
    color = value > 0 ? theme.colors.error.text : theme.colors.success.text;
  }

  return <span className={cx(styles.bold, css({ color }))}>{displayValue}</span>;
}

const getStyles = (theme: GrafanaTheme2) => ({
  bold: css({
    fontWeight: theme.typography.fontWeightBold,
  }),
});
