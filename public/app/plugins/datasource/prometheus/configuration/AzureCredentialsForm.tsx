import { css } from '@emotion/css';
import { type ChangeEvent, useMemo } from 'react';

import { type AzureAuthType, type AzureCredentials } from '@grafana/azure-sdk';
import { type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { Button, InlineFormLabel, Input, Select, Stack, useStyles2 } from '@grafana/ui';

export interface Props {
  managedIdentityEnabled: boolean;
  workloadIdentityEnabled: boolean;
  credentials: AzureCredentials;
  azureCloudOptions?: Array<SelectableValue<string>>;
  onCredentialsChange: (updatedCredentials: AzureCredentials) => void;
  getSubscriptions?: () => Promise<Array<SelectableValue<string>>>;
  disabled?: boolean;
}

export const AzureCredentialsForm = (props: Props) => {
  const {
    credentials,
    azureCloudOptions,
    onCredentialsChange,
    disabled,
    managedIdentityEnabled,
    workloadIdentityEnabled,
  } = props;
  const styles = useStyles2(getStyles);

  const authTypeOptions = useMemo(() => {
    let opts: Array<SelectableValue<AzureAuthType>> = [
      {
        value: 'clientsecret',
        label: 'App Registration',
      },
    ];

    if (managedIdentityEnabled) {
      opts.push({
        value: 'msi',
        label: 'Managed Identity',
      });
    }

    if (workloadIdentityEnabled) {
      opts.push({
        value: 'workloadidentity',
        label: 'Workload Identity',
      });
    }
    return opts;
  }, [managedIdentityEnabled, workloadIdentityEnabled]);

  const onAuthTypeChange = (selected: SelectableValue<AzureAuthType>) => {
    const defaultAuthType = managedIdentityEnabled
      ? 'msi'
      : workloadIdentityEnabled
        ? 'workloadidentity'
        : 'clientsecret';
    const updated: AzureCredentials = {
      ...credentials,
      authType: selected.value || defaultAuthType,
    };
    onCredentialsChange(updated);
  };

  const onAzureCloudChange = (selected: SelectableValue<string>) => {
    if (credentials.authType === 'clientsecret') {
      const updated: AzureCredentials = {
        ...credentials,
        azureCloud: selected.value,
      };
      onCredentialsChange(updated);
    }
  };

  const onTenantIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (credentials.authType === 'clientsecret') {
      const updated: AzureCredentials = {
        ...credentials,
        tenantId: event.target.value,
      };
      onCredentialsChange(updated);
    }
  };

  const onClientIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (credentials.authType === 'clientsecret') {
      const updated: AzureCredentials = {
        ...credentials,
        clientId: event.target.value,
      };
      onCredentialsChange(updated);
    }
  };

  const onClientSecretChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (credentials.authType === 'clientsecret') {
      const updated: AzureCredentials = {
        ...credentials,
        clientSecret: event.target.value,
      };
      onCredentialsChange(updated);
    }
  };

  const onClientSecretReset = () => {
    if (credentials.authType === 'clientsecret') {
      const updated: AzureCredentials = {
        ...credentials,
        clientSecret: '',
      };
      onCredentialsChange(updated);
    }
  };

  return (
    <div className={styles.formGroup}>
      {authTypeOptions.length > 1 && (
        <Stack direction="row" gap={0.5} alignItems="center">
          <InlineFormLabel width={12} tooltip="Choose the type of authentication to Azure services">
            Authentication
          </InlineFormLabel>
          <Select
            width={30}
            value={authTypeOptions.find((opt) => opt.value === credentials.authType)}
            options={authTypeOptions}
            onChange={onAuthTypeChange}
            isDisabled={disabled}
          />
        </Stack>
      )}
      {credentials.authType === 'clientsecret' && (
        <>
          {azureCloudOptions && (
            <Stack direction="row" gap={0.5} alignItems="center">
              <InlineFormLabel width={12} tooltip="Choose an Azure Cloud">
                Azure Cloud
              </InlineFormLabel>
              <Select
                width={30}
                value={azureCloudOptions.find((opt) => opt.value === credentials.azureCloud)}
                options={azureCloudOptions}
                onChange={onAzureCloudChange}
                isDisabled={disabled}
              />
            </Stack>
          )}
          <Stack direction="row" gap={0.5} alignItems="center">
            <InlineFormLabel width={12}>Directory (tenant) ID</InlineFormLabel>
            <Input
              width={40}
              placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              value={credentials.tenantId || ''}
              onChange={onTenantIdChange}
              disabled={disabled}
            />
          </Stack>
          <Stack direction="row" gap={0.5} alignItems="center">
            <InlineFormLabel width={12}>Application (client) ID</InlineFormLabel>
            <Input
              width={40}
              placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              value={credentials.clientId || ''}
              onChange={onClientIdChange}
              disabled={disabled}
            />
          </Stack>
          {typeof credentials.clientSecret === 'symbol' ? (
            <Stack direction="row" gap={0.5} alignItems="center">
              <InlineFormLabel htmlFor="azure-client-secret" width={12}>
                Client Secret
              </InlineFormLabel>
              <Input id="azure-client-secret" width={40} placeholder="configured" disabled />
              {!disabled && (
                <div className={styles.resetButtonGroup}>
                  <Button variant="secondary" type="button" onClick={onClientSecretReset}>
                    reset
                  </Button>
                </div>
              )}
            </Stack>
          ) : (
            <Stack direction="row" gap={0.5} alignItems="center">
              <InlineFormLabel width={12}>Client Secret</InlineFormLabel>
              <Input
                width={40}
                placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                value={credentials.clientSecret || ''}
                onChange={onClientSecretChange}
                disabled={disabled}
              />
            </Stack>
          )}
        </>
      )}
    </div>
  );
};

export default AzureCredentialsForm;

const getStyles = (theme: GrafanaTheme2) => ({
  formGroup: css({
    marginBottom: theme.spacing(2.5),
  }),
  resetButtonGroup: css({
    display: 'flex',
    maxWidth: theme.spacing(40),
    flexGrow: 1,
  }),
});
