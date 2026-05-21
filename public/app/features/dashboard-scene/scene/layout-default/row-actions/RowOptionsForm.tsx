import { useCallback, useState } from 'react';

import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { type SceneObject } from '@grafana/scenes';
import { Alert, Button, Field, Form, Input, Modal, TextLink } from '@grafana/ui';
import { RepeatRowSelect2 } from 'app/features/dashboard/components/RepeatRowSelect/RepeatRowSelect';
import { SHARED_DASHBOARD_QUERY } from 'app/plugins/datasource/dashboard/constants';

export type OnRowOptionsUpdate = (title: string, repeat?: string | null) => void;

export interface Props {
  title: string;
  repeat?: string;
  sceneContext: SceneObject;
  onUpdate: OnRowOptionsUpdate;
  onCancel: () => void;
  isUsingDashboardDS: boolean;
}

interface RowOptionsFormValues {
  title: string;
}

export const RowOptionsForm = ({ repeat, title, sceneContext, isUsingDashboardDS, onUpdate, onCancel }: Props) => {
  // The `repeat` field is intentionally tracked outside react-hook-form because
  // RepeatRowSelect2 is a controlled component driven by external state; the form
  // tracks only the `title` field via Form's render-prop `register`.
  const [newRepeat, setNewRepeat] = useState<string | undefined>(repeat);
  const onChangeRepeat = useCallback((name?: string) => setNewRepeat(name), [setNewRepeat]);

  const submit = (formData: RowOptionsFormValues) => {
    onUpdate(formData.title, newRepeat);
  };

  return (
    <Form<RowOptionsFormValues> onSubmit={submit} defaultValues={{ title }} maxWidth="none">
      {({ register }) => (
        <>
          <Field label={t('dashboard.default-layout.row-options.form.title', 'Title')}>
            <Input {...register('title')} type="text" />
          </Field>
          <Field label={t('dashboard.default-layout.row-options.form.repeat-for.label', 'Repeat for')}>
            <RepeatRowSelect2 sceneContext={sceneContext} repeat={newRepeat} onChange={onChangeRepeat} />
          </Field>
          {isUsingDashboardDS && (
            <Alert
              data-testid={selectors.pages.Dashboard.Rows.Repeated.ConfigSection.warningMessage}
              severity="warning"
              title=""
              topSpacing={3}
              bottomSpacing={0}
            >
              <div>
                <p>
                  <Trans i18nKey="dashboard.default-layout.row-options.form.repeat-for.warning.text">
                    Panels in this row use the {{ SHARED_DASHBOARD_QUERY }} data source. These panels will reference the
                    panel in the original row, not the ones in the repeated rows.
                  </Trans>
                </p>
                <TextLink
                  external
                  href={
                    'https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/create-dashboard/#configure-repeating-rows'
                  }
                >
                  <Trans i18nKey="dashboard.default-layout.row-options.form.repeat-for.learn-more">Learn more</Trans>
                </TextLink>
              </div>
            </Alert>
          )}
          <Modal.ButtonRow>
            <Button type="button" variant="secondary" onClick={onCancel} fill="outline">
              <Trans i18nKey="dashboard.default-layout.row-options.form.cancel">Cancel</Trans>
            </Button>
            <Button type="submit">
              <Trans i18nKey="dashboard.default-layout.row-options.form.update">Update</Trans>
            </Button>
          </Modal.ButtonRow>
        </>
      )}
    </Form>
  );
};
