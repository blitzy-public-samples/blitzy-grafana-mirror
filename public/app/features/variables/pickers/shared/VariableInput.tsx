import { css } from '@emotion/css';
import { memo, type KeyboardEvent, type HTMLProps } from 'react';

import type { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { useStyles2 } from '@grafana/ui';

import { NavigationKey } from '../types';

export interface Props extends Omit<HTMLProps<HTMLInputElement>, 'onChange' | 'value'> {
  onChange: (value: string) => void;
  onNavigate: (key: NavigationKey, clearOthers: boolean) => void;
  value: string | null;
}

export const VariableInput = memo(({ value, id, onNavigate, onChange, ...restProps }: Props) => {
  const styles = useStyles2(getStyles);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (NavigationKey[event.keyCode] && event.keyCode !== NavigationKey.select) {
      const clearOthers = event.ctrlKey || event.metaKey || event.shiftKey;
      onNavigate(event.keyCode, clearOthers);
      event.preventDefault();
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <input
      {...restProps}
      ref={(instance) => {
        if (instance) {
          instance.focus();
          instance.setAttribute('style', `width:${Math.max(instance.width, 150)}px`);
        }
      }}
      id={id}
      type="text"
      className={styles.formInput}
      value={value ?? ''}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      placeholder={t('variable.dropdown.placeholder', 'Enter variable value')}
    />
  );
});
VariableInput.displayName = 'VariableInput';

const getStyles = (theme: GrafanaTheme2) => ({
  formInput: css({
    display: 'block',
    width: '100%',
    height: '32px',
    padding: theme.spacing(0, 1),
    fontSize: theme.typography.size.md,
    lineHeight: '18px',
    color: theme.components.input.text,
    backgroundColor: theme.components.input.background,
    backgroundImage: 'none',
    backgroundClip: 'padding-box',
    border: `1px solid ${theme.components.input.borderColor}`,
    borderRadius: theme.shape.radius.default,
    marginRight: theme.spacing(0.5),
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
});
