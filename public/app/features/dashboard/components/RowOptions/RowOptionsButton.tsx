import { css } from '@emotion/css';
import * as React from 'react';

import type { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Icon, ModalsController, useStyles2 } from '@grafana/ui';

import { type OnRowOptionsUpdate } from './RowOptionsForm';
import { RowOptionsModal } from './RowOptionsModal';

export interface RowOptionsButtonProps {
  title: string;
  repeat?: string;
  onUpdate: OnRowOptionsUpdate;
  warning?: React.ReactNode;
}

export const RowOptionsButton = ({ repeat, title, onUpdate, warning }: RowOptionsButtonProps) => {
  const styles = useStyles2(getStyles);
  const onUpdateChange = (hideModal: () => void) => (title: string, repeat?: string | null) => {
    onUpdate(title, repeat);
    hideModal();
  };

  return (
    <ModalsController>
      {({ showModal, hideModal }) => {
        return (
          <button
            type="button"
            className={styles.pointer}
            aria-label={t('dashboard.row-options-button.aria-label-row-options', 'Row options')}
            onClick={() => {
              showModal(RowOptionsModal, {
                title,
                repeat,
                onDismiss: hideModal,
                onUpdate: onUpdateChange(hideModal),
                warning,
              });
            }}
          >
            <Icon name="cog" />
          </button>
        );
      }}
    </ModalsController>
  );
};

RowOptionsButton.displayName = 'RowOptionsButton';

const getStyles = (theme: GrafanaTheme2) => ({
  pointer: css({
    cursor: 'pointer',
  }),
});
