import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Trans, t } from '@grafana/i18n';
import { getBackendSrv } from '@grafana/runtime';
import { Field, Input, Button, FieldSet, Container, LinkButton, Stack } from '@grafana/ui';
import { getConfig } from 'app/core/config';
import { useAppNotification } from 'app/core/copy/appNotification';
import { w3cStandardEmailValidator } from 'app/features/admin/utils';

interface EmailDTO {
  email: string;
}

export const VerifyEmail = () => {
  const notifyApp = useAppNotification();
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<EmailDTO>();
  const [emailSent, setEmailSent] = useState(false);

  const onSubmit = (formModel: EmailDTO) => {
    getBackendSrv()
      .post('/api/user/signup', formModel)
      .then(() => {
        setEmailSent(true);
      })
      .catch((err) => {
        const msg = err.data?.message || err;
        notifyApp.warning(msg);
      });
  };

  if (emailSent) {
    return (
      <div>
        <p>
          <Trans i18nKey="sign-up.verify.info">
            An email with a verification link has been sent to the email address. You should receive it shortly.
          </Trans>
        </p>
        <Container margin="md" />
        <LinkButton variant="primary" href={getConfig().appSubUrl + '/signup'}>
          <Trans i18nKey="sign-up.verify.complete-button">Complete signup</Trans>
        </LinkButton>
      </div>
    );
  }

  return (
    // Design system gap: this form uses react-hook-form's useForm() hook directly rather than
    // the deprecated @grafana/ui <Form> wrapper (see @grafana/ui Form.tsx JSDoc "@deprecated
    // use the useForm hook from react-hook-form instead" and AAP §0.4.2). Raw <form> with
    // handleSubmit + FieldSet/Field composition is the documented design system pattern for
    // forms with custom submit logic.
    <form onSubmit={handleSubmit(onSubmit)}>
      <FieldSet label={<Trans i18nKey="sign-up.verify.header">Verify email</Trans>}>
        <Field
          label={t('sign-up.verify.email-label', 'Email')}
          description={t(
            'sign-up.verify.email-description',
            'Enter your email address to get a verification link sent to you'
          )}
          invalid={!!errors.email}
          error={errors.email?.message}
        >
          <Input
            id="email"
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: w3cStandardEmailValidator,
                message: 'Email is invalid',
              },
            })}
          />
        </Field>
      </FieldSet>
      <Stack>
        <Button type="submit">
          <Trans i18nKey="sign-up.verify.send-button">Send verification email</Trans>
        </Button>
        <LinkButton fill="text" href={getConfig().appSubUrl + '/login'}>
          <Trans i18nKey="sign-up.verify.back-button">Back to login</Trans>
        </LinkButton>
      </Stack>
    </form>
  );
};
