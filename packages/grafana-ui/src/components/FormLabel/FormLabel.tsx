import { css } from '@emotion/css';
import classNames from 'classnames';
import { type ReactNode } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';

import { useStyles2 } from '../../themes/ThemeContext';
import { Icon } from '../Icon/Icon';
import { Tooltip } from '../Tooltip/Tooltip';
import { type PopoverContent } from '../Tooltip/types';

interface Props {
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  isFocused?: boolean;
  isInvalid?: boolean;
  tooltip?: PopoverContent;
  width?: number | 'auto';
  /** Make tooltip interactive */
  interactive?: boolean;
}

export const FormLabel = ({
  children,
  isFocused,
  isInvalid,
  className,
  htmlFor,
  tooltip,
  width,
  interactive,
  ...rest
}: Props) => {
  const styles = useStyles2(getStyles);
  const classes = classNames(className, `gf-form-label width-${width ? width : '10'}`, {
    'gf-form-label--is-focused': isFocused,
    'gf-form-label--is-invalid': isInvalid,
  });

  return (
    <label className={classes} {...rest} htmlFor={htmlFor}>
      {children}
      {tooltip && (
        <Tooltip placement="top" content={tooltip} theme={'info'} interactive={interactive}>
          <Icon name="info-circle" size="sm" className={styles.tooltipIcon} />
        </Tooltip>
      )}
    </label>
  );
};

export const InlineFormLabel = FormLabel;

const getStyles = (theme: GrafanaTheme2) => ({
  tooltipIcon: css({
    marginLeft: theme.spacing(1.25),
  }),
});
