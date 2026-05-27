import { css, cx } from '@emotion/css';
import { Fragment, useMemo, type JSX } from 'react';

import { type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { AccessoryButton } from '@grafana/plugin-ui';
import { useStyles2, useTheme2 } from '@grafana/ui';

import { toSelectableValue } from '../utils/toSelectableValue';
import { unwrap } from '../utils/unwrap';

import { AddButton } from './AddButton';
import { Seg } from './Seg';

export type PartParams = Array<{
  value: string;
  options: (() => Promise<string[]>) | null;
}>;

type Props = {
  parts: Array<{
    name: string;
    params: PartParams;
  }>;
  getNewPartOptions: () => Promise<SelectableValue[]>;
  onChange: (partIndex: number, paramValues: string[]) => void;
  onRemovePart: (index: number) => void;
  onAddNewPart: (type: string) => void;
};

const noRightMarginPaddingClass = css({
  paddingRight: '0',
  marginRight: '0',
});

type PartProps = {
  name: string;
  params: PartParams;
  onRemove: () => void;
  onChange: (paramValues: string[]) => void;
};

const noHorizMarginPaddingClass = css({
  paddingLeft: '0',
  paddingRight: '0',
  marginLeft: '0',
  marginRight: '0',
});

// Replicates the base `.gf-form-label` rule from
// packages/grafana-ui/src/themes/GlobalStyles/forms.ts (without modifiers).
// Used directly by the inner part-name <span>; composed into getPartClass
// for the wrapping <div>.
const getPartLabelBaseClass = (theme: GrafanaTheme2) =>
  css({
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
    justifyContent: 'space-between',
    border: 'none',
  });

const getPartClass = (theme: GrafanaTheme2) =>
  cx(
    getPartLabelBaseClass(theme),
    css({
      paddingLeft: '0',
      // gf-form-label class makes certain css attributes incorrect
      // for the selectbox-dropdown, so we have to "reset" them back
      lineHeight: theme.typography.body.lineHeight,
      fontSize: theme.typography.body.fontSize,
    })
  );

const Part = ({ name, params, onChange }: PartProps): JSX.Element => {
  const theme = useTheme2();
  const partClass = useMemo(() => getPartClass(theme), [theme]);
  const partLabelBaseClass = useMemo(() => getPartLabelBaseClass(theme), [theme]);

  const onParamChange = (par: string, i: number) => {
    const newParams = params.map((p) => p.value);
    newParams[i] = par;
    onChange(newParams);
  };
  return (
    <div className={partClass}>
      <span className={cx(partLabelBaseClass, noRightMarginPaddingClass)}>{name}</span>(
      {params.map((p, i) => {
        const { value, options } = p;
        const isLast = i === params.length - 1;
        const loadOptions =
          options !== null ? () => options().then((items) => items.map(toSelectableValue)) : undefined;
        return (
          <Fragment key={i}>
            <Seg
              allowCustomValue
              value={value}
              buttonClassName={noHorizMarginPaddingClass}
              loadOptions={loadOptions}
              onChange={(v) => {
                onParamChange(unwrap(v.value), i);
              }}
            />
            {!isLast && ','}
          </Fragment>
        );
      })}
      )
    </div>
  );
};

export const PartListSection = ({
  parts,
  getNewPartOptions,
  onAddNewPart,
  onRemovePart,
  onChange,
}: Props): JSX.Element => {
  const styles = useStyles2(getStyles);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          <Part
            name={part.name}
            params={part.params}
            onRemove={() => {
              onRemovePart(index);
            }}
            onChange={(pars) => {
              onChange(index, pars);
            }}
          />
          <AccessoryButton
            className={styles.removePart}
            aria-label="remove"
            icon="times"
            variant="secondary"
            onClick={() => {
              onRemovePart(index);
            }}
          />
        </Fragment>
      ))}
      <AddButton loadOptions={getNewPartOptions} onAdd={onAddNewPart} />
    </>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  removePart: css({
    marginRight: theme.spacing(0.5),
  }),
});
