import { css } from '@emotion/css';
import debounce from 'debounce-promise';
import { isNil } from 'lodash';
import { useMemo, useState } from 'react';

import { type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { t } from '@grafana/i18n';
import { getBackendSrv } from '@grafana/runtime';
import { AsyncSelect, useStyles2 } from '@grafana/ui';
import { type ServiceAccountDTO, type ServiceAccountsState } from 'app/types/serviceaccount';

export interface Props {
  onSelected: (user: SelectableValue<ServiceAccountDTO>) => void;
  className?: string;
  inputId?: string;
}

export const ServiceAccountPicker = ({ className, onSelected, inputId }: Props) => {
  const styles = useStyles2(getStyles);
  const [isLoading, setIsLoading] = useState(false);

  const search = useMemo(
    () =>
      debounce(
        async (query?: string) => {
          setIsLoading(true);

          if (isNil(query)) {
            query = '';
          }

          return getBackendSrv()
            .get<ServiceAccountsState>(`/api/serviceaccounts/search?query=${query}&perpage=100`)
            .then((result) => {
              return result.serviceAccounts.map((sa) => ({
                id: sa.id,
                uid: sa.uid,
                value: sa,
                label: sa.login,
                imgUrl: sa.avatarUrl,
                login: sa.login,
              }));
            })
            .finally(() => {
              setIsLoading(false);
            });
        },
        300,
        { leading: true }
      ),
    []
  );

  return (
    <div className={styles.wrapper} data-testid="serviceAccountPicker">
      <AsyncSelect
        isClearable
        className={className}
        inputId={inputId}
        isLoading={isLoading}
        defaultOptions={true}
        loadOptions={search}
        onChange={onSelected}
        placeholder={t('service-account-picker.select-placeholder', 'Start typing to search for service accounts')}
        noOptionsMessage={t(
          'service-account-picker.noOptionsMessage-no-service-accounts-found',
          'No service accounts found'
        )}
        aria-label={t('service-account-picker.select-aria-label', 'Service account picker')}
      />
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({}),
});
