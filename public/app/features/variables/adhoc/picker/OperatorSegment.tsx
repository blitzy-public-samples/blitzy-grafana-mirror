import { css } from '@emotion/css';

import { type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { Segment, useStyles2 } from '@grafana/ui';

interface Props {
  value: string;
  onChange: (item: SelectableValue<string>) => void;
  disabled?: boolean;
}

const options = ['=', '!=', '<', '>', '=~', '!~'].map<SelectableValue<string>>((value) => ({
  label: value,
  value,
}));

export const OperatorSegment = ({ value, disabled, onChange }: Props) => {
  const styles = useStyles2(getStyles);

  return (
    <Segment
      className={styles.querySegmentOperator}
      value={value}
      disabled={disabled}
      options={options}
      onChange={onChange}
    />
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  querySegmentOperator: css({
    fontFamily: theme.typography.fontFamilyMonospace,
    color: theme.colors.text.primary,
    padding: theme.spacing(0, 0.5),
  }),
});
