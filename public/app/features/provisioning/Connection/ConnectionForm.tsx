import { css } from '@emotion/css';
import { useEffect, useState } from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom-v5-compat';

import { type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { isFetchError, reportInteraction } from '@grafana/runtime';
import { Alert, Button, Combobox, Field, Stack, useStyles2 } from '@grafana/ui';
import { type Connection, type ErrorDetails, type Status } from 'app/api/clients/provisioning/v0alpha1';
import { extractErrorMessage } from 'app/api/utils';
import { FormPrompt } from 'app/core/components/FormPrompt/FormPrompt';

import { GitHubConnectionFields } from '../components/Shared/GitHubConnectionFields';
import { CONNECTIONS_TAB_URL } from '../constants';
import { useCreateOrUpdateConnection } from '../hooks/useCreateOrUpdateConnection';
import { type ConnectionFormData } from '../types';
import { extractFormErrors, getConnectionFormErrors } from '../utils/getFormErrors';

import { DeleteConnectionButton } from './DeleteConnectionButton';

interface ConnectionFormProps {
  data?: Connection;
}

const providerOptions = [{ value: 'github', label: 'GitHub' }];

export function ConnectionForm({ data }: ConnectionFormProps) {
  const styles = useStyles2(getStyles);
  const connectionName = data?.metadata?.name;
  const isEdit = Boolean(connectionName);
  const privateKey = data?.secure?.privateKey;
  const [submitData, request] = useCreateOrUpdateConnection(connectionName);
  const navigate = useNavigate();

  const formMethods = useForm<ConnectionFormData>({
    defaultValues: {
      type: data?.spec?.type || 'github',
      title: data?.spec?.title || '',
      description: data?.spec?.description || '',
      appID: data?.spec?.github?.appID || '',
      installationID: data?.spec?.github?.installationID || '',
      privateKey: '',
    },
  });

  const {
    handleSubmit,
    reset,
    control,
    formState: { isDirty },
    getValues,
    setError,
  } = formMethods;

  useEffect(() => {
    if (request.isSuccess) {
      const formData = getValues();

      reportInteraction('grafana_provisioning_connection_saved', {
        connectionName: connectionName ?? 'unknown',
        connectionType: formData.type,
      });

      reset(formData);
      // use timeout to ensure the form resets before navigating
      setTimeout(() => navigate(CONNECTIONS_TAB_URL), 300);
    }
  }, [request.isSuccess, reset, getValues, connectionName, navigate]);

  useEffect(() => {
    if (isEdit && data?.status?.fieldErrors?.length) {
      const errors = getConnectionFormErrors(data.status.fieldErrors);
      for (const [field, errorMessage] of errors) {
        setError(field, errorMessage);
      }
    }
  }, [isEdit, data?.status?.fieldErrors, setError]);

  const [submitError, setSubmitError] = useState<string>();

  const onSubmit = async (form: ConnectionFormData) => {
    setSubmitError(undefined);
    try {
      const spec = {
        title: form.title,
        type: form.type,
        ...(form.description && { description: form.description }),
        github: {
          appID: form.appID,
          installationID: form.installationID,
        },
      };

      await submitData(spec, form.privateKey);
    } catch (err) {
      // Narrow the caught error to a fetch error whose body matches the
      // shape expected by `getConnectionFormErrors`/`extractFormErrors`
      // (`ErrorDetails[] | Status`). After the runtime-package `any -> unknown`
      // refactor, `err.data` is `unknown` by default and must be narrowed before
      // it can flow into helpers with a stricter parameter type.
      if (isFetchError<ErrorDetails[] | Status>(err)) {
        const errors = getConnectionFormErrors(err.data);

        if (errors.length > 0) {
          for (const [field, errorMessage] of errors) {
            setError(field, errorMessage);
          }
          return;
        }

        // Show unmapped error details as a top-level form error
        const allErrors = extractFormErrors(err.data);
        const detail = allErrors.find((e) => e.detail)?.detail;
        if (detail) {
          setSubmitError(detail);
          return;
        }
      }

      setSubmitError(
        extractErrorMessage(err) || t('provisioning.connection-form.error-submit', 'Failed to save connection')
      );
    }
  };

  return (
    <FormProvider {...formMethods}>
      {/*
       * Raw <form> retained inside a <FormProvider> per AAP §0.6.1. The form must remain
       * raw because:
       *   1. <GitHubConnectionFields> nested below relies on `useFormContext()` to read
       *      `control` from the surrounding FormProvider — wrapping in @grafana/ui's
       *      <Form> render-prop component would not expose that context to children.
       *   2. `reset()` is invoked from outside the form body (the FormPrompt discard
       *      handler and the post-submit redirect effect), which the deprecated <Form>
       *      wrapper does not facilitate.
       *   3. `formState.isDirty` is consumed by <FormPrompt> sibling to gate
       *      confirm-on-redirect behavior across the surrounding page.
       * Per @grafana/ui's own JSDoc on <Form>: "use the `useForm` hook from
       * react-hook-form instead" — the pattern below is the recommended replacement.
       * Inline style={{ maxWidth: 700 }} migrated to useStyles2 per AAP Dimension 3.
       */}
      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <FormPrompt onDiscard={reset} confirmRedirect={isDirty} />
        <Stack direction="column" gap={2}>
          {submitError && <Alert severity="error" title={submitError} />}
          <Field
            noMargin
            htmlFor="type"
            label={t('provisioning.connection-form.label-provider', 'Provider')}
            description={t('provisioning.connection-form.description-provider', 'Select the provider type')}
          >
            <Controller
              name="type"
              control={control}
              render={({ field: { ref, onChange, ...field } }) => (
                <Combobox
                  id="type"
                  disabled // TODO enable when other providers are supported
                  options={providerOptions}
                  onChange={(option) => onChange(option?.value)}
                  {...field}
                />
              )}
            />
          </Field>

          <GitHubConnectionFields required={!isEdit} privateKeyConfigured={Boolean(privateKey)} />

          <Stack gap={2}>
            <Button type="submit" disabled={request.isLoading}>
              {request.isLoading
                ? t('provisioning.connection-form.button-saving', 'Saving...')
                : t('provisioning.connection-form.button-save', 'Save')}
            </Button>
            {connectionName && data && <DeleteConnectionButton name={connectionName} connection={data} />}
          </Stack>
        </Stack>
      </form>
    </FormProvider>
  );
}

const getStyles = (_theme: GrafanaTheme2) => ({
  form: css({
    maxWidth: 700,
  }),
});
