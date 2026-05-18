import { useMemo, useRef, useState } from 'react';
import { type UseFormReturn } from 'react-hook-form';

import { AppEvents } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import {
  type FetchErrorDataProps,
  getAppEvents,
  getBackendSrv,
  isFetchError,
  locationService,
  reportInteraction,
} from '@grafana/runtime';
import {
  Box,
  Button,
  CollapsableSection,
  ConfirmModal,
  Dropdown,
  Field,
  Form,
  IconButton,
  LinkButton,
  Menu,
  Stack,
  Switch,
} from '@grafana/ui';

import { FormPrompt } from '../../core/components/FormPrompt/FormPrompt';
import { Page } from '../../core/components/Page/Page';

import { FieldRenderer } from './FieldRenderer';
import { getSectionFields } from './fields';
import { type SSOProvider, type SSOProviderDTO } from './types';
import { dataToDTO, dtoToData } from './utils/data';

const appEvents = getAppEvents();

interface ProviderConfigProps {
  config?: SSOProvider;
  isLoading?: boolean;
  provider: string;
}

export const ProviderConfigForm = ({ config, provider, isLoading }: ProviderConfigProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const sections = useMemo(() => getSectionFields()[provider], [provider]);
  const [resetConfig, setResetConfig] = useState(false);
  // Captures the FormAPI handle returned by @grafana/ui's <Form> render-prop callback so the
  // parent-scope onSubmit handler (defined below) can invoke reset(data) after a successful
  // submission. The ref is updated each render with the latest formApi; react-hook-form's
  // returned methods (including reset) have stable references across renders, so callers reading
  // formApiRef.current?.reset(...) at submit time always pick up the active form instance.
  //
  // Form<T>'s render-prop callback parameter is typed FormAPI<T> in @grafana/ui, defined as
  // `Omit<UseFormReturn<T>, 'handleSubmit'> & { errors }`. We mirror that structural shape here
  // using `Omit<UseFormReturn<T>, 'handleSubmit'>` so that assigning the formApi argument to
  // this ref is type-correct without needing to add a `FormAPI` import (handleSubmit is the only
  // property FormAPI excludes from UseFormReturn, and we only invoke reset on the ref).
  const formApiRef = useRef<Omit<UseFormReturn<SSOProviderDTO>, 'handleSubmit'> | null>(null);
  const isEnabled = config?.settings.enabled;

  const additionalActionsMenu = (
    <Menu>
      <Menu.Item
        label={t(
          'auth-config.provider-config-form.additional-actions-menu.label-reset-to-default-values',
          'Reset to default values'
        )}
        icon="history-alt"
        onClick={() => {
          setResetConfig(true);
        }}
      />
    </Menu>
  );

  const onSubmit = async (data: SSOProviderDTO) => {
    setIsSaving(true);
    setSubmitError(false);
    const requestData = dtoToData(data, provider);
    try {
      await getBackendSrv().put(
        `/api/v1/sso-settings/${provider}`,
        {
          id: config?.id,
          provider: config?.provider,
          settings: { ...requestData },
        },
        {
          showErrorAlert: false,
        }
      );

      reportInteraction('grafana_authentication_ssosettings_saved', {
        provider,
        enabled: requestData.enabled,
      });

      appEvents.publish({
        type: AppEvents.alertSuccess.name,
        payload: ['Settings saved'],
      });
      formApiRef.current?.reset(data);
      // Delay redirect so the form state can update
      setTimeout(() => {
        locationService.push(`/admin/authentication`);
      }, 300);
    } catch (error) {
      let message = '';
      if (isFetchError<FetchErrorDataProps>(error)) {
        message = error.data.message ?? '';
      } else if (error instanceof Error) {
        message = error.message;
      }
      appEvents.publish({
        type: AppEvents.alertError.name,
        payload: [message],
      });
      setSubmitError(true);
      setIsSaving(false);
    }
  };

  const onResetConfig = async () => {
    try {
      await getBackendSrv().delete(`/api/v1/sso-settings/${provider}`, undefined, { showSuccessAlert: false });
      reportInteraction('grafana_authentication_ssosettings_removed', {
        provider,
      });

      appEvents.publish({
        type: AppEvents.alertSuccess.name,
        payload: ['Settings reset to defaults'],
      });
      setTimeout(() => {
        locationService.push(`/admin/authentication`);
      });
    } catch (error) {
      let message = '';
      if (isFetchError<FetchErrorDataProps>(error)) {
        message = error.data.message ?? '';
      } else if (error instanceof Error) {
        message = error.message;
      }
      appEvents.publish({
        type: AppEvents.alertError.name,
        payload: [message],
      });
    }
  };

  return (
    <Page.Contents isLoading={isLoading}>
      <Form<SSOProviderDTO>
        defaultValues={dataToDTO(config)}
        validateOn="onSubmit"
        maxWidth={600}
        onSubmit={onSubmit}
      >
        {(formApi) => {
          // Side-effectfully capture the FormAPI for use by the parent-scope onSubmit. This is
          // an established React pattern for bridging render-prop APIs to outer scope; the ref
          // assignment is idempotent and benign during render.
          formApiRef.current = formApi;
          const {
            register,
            control,
            reset,
            watch,
            setValue,
            getValues,
            unregister,
            formState: { errors, dirtyFields, isSubmitted },
          } = formApi;
          const dataSubmitted = isSubmitted && !submitError;

          const onSaveAttempt = (toggleEnabled: boolean) => {
            reportInteraction('grafana_authentication_ssosettings_save_attempt', {
              provider,
              enabled: toggleEnabled ? !isEnabled : isEnabled,
            });

            if (toggleEnabled) {
              setValue('enabled', !isEnabled);
            }
          };

          return (
            <>
              <FormPrompt
                confirmRedirect={!!Object.keys(dirtyFields).length && !dataSubmitted}
                onDiscard={() => {
                  reportInteraction('grafana_authentication_ssosettings_abandoned', {
                    provider,
                  });
                  reset();
                }}
              />
              <Field label={t('auth-config.provider-config-form.label-enabled', 'Enabled')} hidden={true}>
                <Switch
                  {...register('enabled')}
                  id="enabled"
                  label={t('auth-config.provider-config-form.enabled-label-enabled', 'Enabled')}
                />
              </Field>
              <Stack gap={2} direction={'column'}>
                {sections
                  .filter((section) => !section.hidden)
                  .map((section, index) => {
                    return (
                      <CollapsableSection label={section.name} isOpen={index === 0} key={section.name}>
                        {section.fields
                          .filter((field) => (typeof field !== 'string' ? !field.hidden : true))
                          .map((field) => {
                            return (
                              <FieldRenderer
                                key={typeof field === 'string' ? field : field.name}
                                field={field}
                                control={control}
                                errors={errors}
                                setValue={setValue}
                                getValues={getValues}
                                register={register}
                                watch={watch}
                                unregister={unregister}
                                provider={provider}
                                secretConfigured={!!config?.settings.clientSecret}
                              />
                            );
                          })}
                      </CollapsableSection>
                    );
                  })}
              </Stack>
              <Box display={'flex'} gap={2} marginTop={5}>
                <Stack alignItems={'center'} gap={2}>
                  <Button
                    type={'submit'}
                    disabled={isSaving}
                    onClick={() => onSaveAttempt(true)}
                    variant={isEnabled ? 'secondary' : undefined}
                  >
                    {isSaving
                      ? isEnabled
                        ? t('auth-config.provider-config-form.disabling', 'Disabling...')
                        : t('auth-config.provider-config-form.saving', 'Saving...')
                      : isEnabled
                        ? t('auth-config.provider-config-form.disable', 'Disable')
                        : t('auth-config.provider-config-form.save-and-enable', 'Save and enable')}
                  </Button>

                  <Button
                    type={'submit'}
                    disabled={isSaving}
                    variant={'secondary'}
                    onClick={() => onSaveAttempt(false)}
                  >
                    {isSaving
                      ? t('auth-config.provider-config-form.saving', 'Saving...')
                      : t('auth-config.provider-config-form.save', 'Save')}
                  </Button>
                  <LinkButton href={'/admin/authentication'} variant={'secondary'}>
                    <Trans i18nKey="auth-config.provider-config-form.discard">Discard</Trans>
                  </LinkButton>

                  <Dropdown overlay={additionalActionsMenu} placement="bottom-start">
                    <IconButton
                      tooltip={t('auth-config.provider-config-form.tooltip-more-actions', 'More actions')}
                      title={t('auth-config.provider-config-form.title-more-actions', 'More actions')}
                      tooltipPlacement="top"
                      size="md"
                      variant="secondary"
                      name="ellipsis-v"
                      hidden={config?.source === 'system'}
                    />
                  </Dropdown>
                </Stack>
              </Box>
            </>
          );
        }}
      </Form>
      {resetConfig && (
        <ConfirmModal
          isOpen
          title={t('auth-config.provider-config-form.title-reset', 'Reset')}
          body={
            <Stack direction={'column'} gap={3}>
              <span>
                <Trans i18nKey="auth-config.provider-config-form.reset-configuration">
                  Are you sure you want to reset this configuration?
                </Trans>
              </span>
              <small>
                <Trans i18nKey="auth-config.provider-config-form.reset-configuration-description">
                  After resetting these settings Grafana will use the provider configuration from the system (config
                  file/environment variables) if any.
                </Trans>
              </small>
            </Stack>
          }
          confirmText={t('auth-config.provider-config-form.confirmText-reset', 'Reset')}
          onDismiss={() => setResetConfig(false)}
          onConfirm={async () => {
            await onResetConfig();
            setResetConfig(false);
          }}
        />
      )}
    </Page.Contents>
  );
};
