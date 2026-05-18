import { css } from '@emotion/css';
import { useMemo, type JSX } from 'react';

import { dateTimeFormat, type GrafanaTheme2, type TimeZone, dateTimeFormatTimeAgo } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { type CellProps, type Column, DeleteButton, Icon, InteractiveTable, Tooltip, useStyles2 } from '@grafana/ui';
import { type ApiKey } from 'app/types/apiKeys';

interface Props {
  tokens: ApiKey[];
  timeZone: TimeZone;
  tokenActionsDisabled?: boolean;
  onDelete: (token: ApiKey) => void;
}

export const ServiceAccountTokensTable = ({ tokens, timeZone, tokenActionsDisabled, onDelete }: Props): JSX.Element => {
  const styles = useStyles2(getStyles);

  const columns: Array<Column<ApiKey>> = useMemo(
    () => [
      {
        id: 'name',
        header: t('serviceaccounts.service-account-tokens-table.name', 'Name'),
        cell: ({ row: { original } }: CellProps<ApiKey>) => (
          <span className={styles.tableRow(original.hasExpired || original.isRevoked)}>{original.name}</span>
        ),
      },
      {
        id: 'expiration',
        header: t('serviceaccounts.service-account-tokens-table.expires', 'Expires'),
        cell: ({ row: { original } }: CellProps<ApiKey>) => (
          <span className={styles.tableRow(original.hasExpired || original.isRevoked)}>
            <TokenExpiration timeZone={timeZone} token={original} />
          </span>
        ),
      },
      {
        id: 'created',
        header: t('serviceaccounts.service-account-tokens-table.created', 'Created'),
        cell: ({ row: { original } }: CellProps<ApiKey>) => (
          <span className={styles.tableRow(original.hasExpired || original.isRevoked)}>
            {formatDate(timeZone, original.created)}
          </span>
        ),
      },
      {
        id: 'lastUsedAt',
        header: t('serviceaccounts.service-account-tokens-table.last-used-at', 'Last used at'),
        cell: ({ row: { original } }: CellProps<ApiKey>) => (
          <span className={styles.tableRow(original.hasExpired || original.isRevoked)}>
            {formatLastUsedAtDate(timeZone, original.lastUsedAt)}
          </span>
        ),
      },
      {
        id: 'state',
        header: '',
        disableGrow: true,
        cell: ({ row: { original } }: CellProps<ApiKey>) => (
          <div className={styles.stateCell}>{original.isRevoked && <TokenRevoked />}</div>
        ),
      },
      {
        id: 'actions',
        header: '',
        disableGrow: true,
        cell: ({ row: { original } }: CellProps<ApiKey>) => (
          <DeleteButton
            aria-label={t(
              'serviceaccounts.service-account-tokens-table.aria-label-delete-button',
              'Delete service account token {{key}}',
              { key: original.name }
            )}
            size="sm"
            onConfirm={() => onDelete(original)}
            disabled={tokenActionsDisabled}
          />
        ),
      },
    ],
    [styles, timeZone, tokenActionsDisabled, onDelete]
  );

  return (
    <div className={styles.section}>
      <InteractiveTable columns={columns} data={tokens} getRowId={(token) => String(token.id)} />
    </div>
  );
};

function formatLastUsedAtDate(timeZone: TimeZone, lastUsedAt?: string): string {
  if (!lastUsedAt) {
    return 'Never';
  }
  return dateTimeFormat(lastUsedAt, { timeZone });
}

function formatDate(timeZone: TimeZone, expiration?: string): string {
  if (!expiration) {
    return 'No expiration date';
  }
  return dateTimeFormat(expiration, { timeZone });
}

function formatSecondsLeftUntilExpiration(secondsUntilExpiration: number): string {
  const expirationTime = Date.now() + secondsUntilExpiration * 1000;
  const daysFormat = dateTimeFormatTimeAgo(expirationTime, { timeZone: 'browser' });
  return `Expires ${daysFormat}`;
}

const TokenRevoked = () => {
  const styles = useStyles2(getStyles);

  return (
    <span className={styles.hasExpired}>
      <Trans i18nKey="serviceaccounts.token-revoked.revoked-label">Revoked</Trans>
      <span className={styles.tooltipContainer}>
        <Tooltip
          content={t(
            'serviceaccounts.token-revoked.content-token-publicly-exposed-please-rotate',
            'This token has been publicly exposed. Please rotate this token'
          )}
        >
          <Icon name="exclamation-triangle" className={styles.toolTipIcon} />
        </Tooltip>
      </span>
    </span>
  );
};

interface TokenExpirationProps {
  timeZone: TimeZone;
  token: ApiKey;
}

const TokenExpiration = ({ timeZone, token }: TokenExpirationProps) => {
  const styles = useStyles2(getStyles);

  if (!token.expiration) {
    return (
      <span className={styles.neverExpire}>
        <Trans i18nKey="serviceaccounts.token-expiration.never">Never</Trans>
      </span>
    );
  }
  if (token.secondsUntilExpiration) {
    return (
      <span className={styles.secondsUntilExpiration} title={formatDate(timeZone, token.expiration)}>
        {formatSecondsLeftUntilExpiration(token.secondsUntilExpiration)}
      </span>
    );
  }
  if (token.hasExpired) {
    return (
      <span className={styles.hasExpired} title={formatDate(timeZone, token.expiration)}>
        <Trans i18nKey="serviceaccounts.token-expiration.expired-label">Expired</Trans>
        <span className={styles.tooltipContainer}>
          <Tooltip
            content={t('serviceaccounts.token-expiration.content-this-token-has-expired', 'This token has expired')}
          >
            <Icon name="exclamation-triangle" className={styles.toolTipIcon} />
          </Tooltip>
        </span>
      </span>
    );
  }
  return <span>{formatDate(timeZone, token.expiration)}</span>;
};

const getStyles = (theme: GrafanaTheme2) => ({
  tableRow: (hasExpired: boolean | undefined) =>
    css({
      color: hasExpired ? theme.colors.text.secondary : theme.colors.text.primary,
    }),
  tooltipContainer: css({
    marginLeft: theme.spacing(1),
  }),
  toolTipIcon: css({
    color: theme.colors.error.text,
  }),
  secondsUntilExpiration: css({
    color: theme.colors.warning.text,
  }),
  hasExpired: css({
    color: theme.colors.error.text,
  }),
  neverExpire: css({
    color: theme.colors.text.secondary,
  }),
  section: css({
    marginBottom: theme.spacing(4),
  }),
  stateCell: css({
    textAlign: 'center',
  }),
});
