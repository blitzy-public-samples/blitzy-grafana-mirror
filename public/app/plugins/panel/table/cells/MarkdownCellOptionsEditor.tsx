import { css } from '@emotion/css';
import { type FormEvent } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { t, Trans } from '@grafana/i18n';
import { type TableMarkdownCellOptions } from '@grafana/schema';
import { Badge, Field, Label, Switch, useStyles2 } from '@grafana/ui';

import { type TableCellEditorProps } from '../TableCellOptionEditor';

export const MarkdownCellOptionsEditor = ({
  cellOptions,
  onChange,
}: TableCellEditorProps<TableMarkdownCellOptions>) => {
  const styles = useStyles2(getStyles);

  const onDynamicHeightChange = (e: FormEvent<HTMLInputElement>) => {
    cellOptions.dynamicHeight = e.currentTarget.checked;
    onChange(cellOptions);
  };

  return (
    <Field
      noMargin
      label={
        <Label
          description={t(
            'table.markdown-cell-options-editor.description-dynamic-height',
            'We recommend enabling pagination with this option to avoid performance issues.'
          )}
        >
          <Trans i18nKey="table.markdown-cell-options-editor.label-dynamic-height">Dynamic height</Trans>{' '}
          <Badge
            text={t('table.markdown-cell-options-editor.label.text-alpha', 'Alpha')}
            color="blue"
            className={styles.alphaBadge}
          />
        </Label>
      }
    >
      <Switch onChange={onDynamicHeightChange} value={cellOptions.dynamicHeight} />
    </Field>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  alphaBadge: css({
    fontSize: theme.typography.bodySmall.fontSize,
    marginLeft: theme.spacing(0.5),
    lineHeight: 1.2,
  }),
});
