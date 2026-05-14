import { css, cx } from '@emotion/css';
import { useState } from 'react';

import { type ActionModel, type Field, type ActionVariableInput, type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';

import { useStyles2 } from '../../themes/ThemeContext';
import { Button, type ButtonProps } from '../Button/Button';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';

import { VariablesInputModal } from './VariablesInputModal';

type ActionButtonProps = Omit<ButtonProps, 'children'> & {
  action: ActionModel<Field>;
};

/**
 * @internal
 */
export function ActionButton({ action, ...buttonProps }: ActionButtonProps) {
  const styles = useStyles2(getStyles, action.style.backgroundColor);

  const [showConfirm, setShowConfirm] = useState(false);

  // Action variables
  const [showVarsModal, setShowVarsModal] = useState(false);
  const [actionVars, setActionVars] = useState<ActionVariableInput>({});

  const actionHasVariables = action.variables && action.variables.length > 0;

  const onClick = () => {
    if (actionHasVariables) {
      setShowVarsModal(true);
    } else {
      setShowConfirm(true);
    }
  };

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={onClick}
        {...buttonProps}
        className={cx(buttonProps.className, styles.button)}
      >
        {action.title}
      </Button>

      {actionHasVariables && showVarsModal && (
        <VariablesInputModal
          onDismiss={() => setShowVarsModal(false)}
          action={action}
          onShowConfirm={() => setShowConfirm(true)}
          variables={actionVars}
          setVariables={setActionVars}
        />
      )}

      {showConfirm && (
        <ConfirmModal
          isOpen={true}
          title={t('grafana-ui.action-editor.button.confirm-action', 'Confirm action')}
          body={action.confirmation(actionVars)}
          confirmText={t('grafana-ui.action-editor.button.confirm', 'Confirm')}
          confirmButtonVariant="primary"
          onConfirm={() => {
            setShowConfirm(false);
            action.onClick(new MouseEvent('click'), null, actionVars);
          }}
          onDismiss={() => {
            setShowConfirm(false);
          }}
        />
      )}
    </>
  );
}

const getStyles = (theme: GrafanaTheme2, customBackgroundColor: string | undefined) => {
  const backgroundColor = customBackgroundColor || theme.colors.secondary.main;
  const textColor = theme.colors.getContrastText(backgroundColor);
  return {
    button: css({
      // The `&&` selector doubles the class in the generated CSS, increasing
      // its specificity so that backgroundColor and color override the
      // variant="primary" styles applied by the inner <Button> component.
      '&&': {
        width: 'fit-content',
        backgroundColor,
        color: textColor,
      },
    }),
  };
};
