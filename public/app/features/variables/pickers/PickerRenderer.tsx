import { css } from '@emotion/css';
import { type PropsWithChildren, type ReactElement, useMemo } from 'react';

import { type GrafanaTheme2, type TypedVariableModel, VariableHide } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans } from '@grafana/i18n';
import { Stack, Tooltip, useStyles2 } from '@grafana/ui';

import { variableAdapters } from '../adapters';
import { VARIABLE_PREFIX } from '../constants';

interface Props {
  variable: TypedVariableModel;
  readOnly?: boolean;
}

export const PickerRenderer = (props: Props) => {
  const PickerToRender = useMemo(() => variableAdapters.get(props.variable.type).picker, [props.variable]);

  if (!props.variable) {
    return (
      <div>
        <Trans i18nKey="variables.picker-renderer.couldnt-load-variable">Couldn't load variable</Trans>
      </div>
    );
  }

  return (
    <Stack gap={0}>
      <PickerLabel variable={props.variable} />
      {props.variable.hide !== VariableHide.hideVariable && PickerToRender && (
        <PickerToRender variable={props.variable} readOnly={props.readOnly ?? false} />
      )}
    </Stack>
  );
};

function PickerLabel({ variable }: PropsWithChildren<Props>): ReactElement | null {
  const labelOrName = useMemo(() => variable.label || variable.name, [variable]);
  const styles = useStyles2(getStyles);

  if (variable.hide !== VariableHide.dontHide) {
    return null;
  }

  const elementId = VARIABLE_PREFIX + variable.id;
  if (variable.description) {
    return (
      <Tooltip content={variable.description} placement={'bottom'}>
        <label
          className={styles.formLabelVariable}
          data-testid={selectors.pages.Dashboard.SubMenu.submenuItemLabels(labelOrName)}
          htmlFor={elementId}
        >
          {labelOrName}
        </label>
      </Tooltip>
    );
  }

  return (
    <label
      className={styles.formLabelVariable}
      data-testid={selectors.pages.Dashboard.SubMenu.submenuItemLabels(labelOrName)}
      htmlFor={elementId}
    >
      {labelOrName}
    </label>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  formLabelVariable: css({
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0, 1),
    flexShrink: 0,
    fontWeight: theme.typography.fontWeightMedium,
    fontSize: theme.typography.size.sm,
    height: '32px',
    lineHeight: '32px',
    marginRight: theme.spacing(0.5),
    borderRadius: theme.shape.radius.default,
    justifyContent: 'space-between',
    color: theme.colors.primary.text,
    background: theme.components.panel.background,
    border: `1px solid ${theme.components.panel.borderColor}`,
  }),
});
