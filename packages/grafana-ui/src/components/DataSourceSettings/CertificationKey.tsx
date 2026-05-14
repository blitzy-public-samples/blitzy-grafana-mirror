import { css } from '@emotion/css';
import { type ChangeEvent, type MouseEvent } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans } from '@grafana/i18n';

import { useStyles2 } from '../../themes/ThemeContext';
import { Button } from '../Button/Button';
import { InlineField } from '../Forms/InlineField';
import { InlineFieldRow } from '../Forms/InlineFieldRow';
import { Input } from '../Input/Input';
import { TextArea } from '../TextArea/TextArea';

interface Props {
  label: string;
  hasCert: boolean;
  placeholder: string;
  useGrow?: boolean;

  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export const CertificationKey = ({ hasCert, label, onChange, onClick, placeholder, useGrow }: Props) => {
  const styles = useStyles2(getStyles);

  return (
    <InlineFieldRow>
      <InlineField label={label} labelWidth={14} disabled={hasCert} grow={useGrow}>
        {hasCert ? (
          <Input type="text" value="configured" width={24} />
        ) : (
          <TextArea rows={7} onChange={onChange} placeholder={placeholder} required />
        )}
      </InlineField>
      {hasCert && (
        <Button variant="secondary" onClick={onClick} className={styles.resetButton}>
          <Trans i18nKey="grafana-ui.data-source-settings.cert-key-reset">Reset</Trans>
        </Button>
      )}
    </InlineFieldRow>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  resetButton: css({
    marginLeft: theme.spacing(0.5),
  }),
});
