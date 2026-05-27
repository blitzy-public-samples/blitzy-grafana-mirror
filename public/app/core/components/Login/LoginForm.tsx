import { css } from '@emotion/css';
import { type ReactElement, useId } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
import { Button, Field, Form, Input, useStyles2 } from '@grafana/ui';

import { PasswordField } from '../PasswordField/PasswordField';

import { type FormModel } from './LoginCtrl';

interface Props {
  children: ReactElement;
  onSubmit: (data: FormModel) => void;
  isLoggingIn: boolean;
  passwordHint: string;
  loginHint: string;
}

export const LoginForm = ({ children, onSubmit, isLoggingIn, passwordHint, loginHint }: Props) => {
  const styles = useStyles2(getStyles);
  const usernameId = useId();
  const passwordId = useId();

  return (
    <div className={styles.wrapper}>
      <Form<FormModel> onSubmit={onSubmit} validateOn="onChange" maxWidth="none">
        {({ register, formState: { errors } }) => (
          <>
            <Field
              label={t('login.form.username-label', 'Email or username')}
              invalid={!!errors.user}
              error={errors.user?.message}
            >
              <Input
                {...register('user', { required: t('login.form.username-required', 'Email or username is required') })}
                id={usernameId}
                autoFocus
                autoCapitalize="none"
                placeholder={loginHint || t('login.form.username-placeholder', 'email or username')}
                data-testid={selectors.pages.Login.username}
              />
            </Field>
            <Field
              label={t('login.form.password-label', 'Password')}
              invalid={!!errors.password}
              error={errors.password?.message}
            >
              <PasswordField
                {...register('password', { required: t('login.form.password-required', 'Password is required') })}
                id={passwordId}
                autoComplete="current-password"
                placeholder={passwordHint || t('login.form.password-placeholder', 'password')}
              />
            </Field>
            <Button
              type="submit"
              data-testid={selectors.pages.Login.submit}
              className={styles.submitButton}
              disabled={isLoggingIn}
            >
              {isLoggingIn
                ? t('login.form.submit-loading-label', 'Logging in...')
                : t('login.form.submit-label', 'Log in')}
            </Button>
            {children}
          </>
        )}
      </Form>
    </div>
  );
};

export const getStyles = (theme: GrafanaTheme2) => {
  return {
    wrapper: css({
      width: '100%',
      paddingBottom: theme.spacing(2),
    }),

    submitButton: css({
      justifyContent: 'center',
      width: '100%',
    }),

    skipButton: css({
      alignSelf: 'flex-start',
    }),
  };
};
