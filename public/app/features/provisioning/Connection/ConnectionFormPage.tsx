import { css } from '@emotion/css';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useParams } from 'react-router-dom-v5-compat';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { isFetchError } from '@grafana/runtime';
import { Alert, Card, EmptyState, Stack, Text, TextLink, useStyles2 } from '@grafana/ui';
import { useGetConnectionRepositoriesQuery, useListRepositoryQuery } from 'app/api/clients/provisioning/v0alpha1';
import { Page } from 'app/core/components/Page/Page';

import { CONNECTIONS_URL, PROVISIONING_URL } from '../constants';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { type ExternalRepository } from '../types';

import { ConnectionForm } from './ConnectionForm';

export default function ConnectionFormPage() {
  const styles = useStyles2(getStyles);
  const { name = '' } = useParams();
  const isCreate = !name;

  const { connection, isLoading, isError, error, isDisconnected, disconnectMessage } = useConnectionStatus(
    isCreate ? undefined : name
  );

  // Grafana repositories that use this connection
  const connectedReposQuery = useListRepositoryQuery(
    isCreate ? skipToken : { fieldSelector: `spec.connection.name=${name}` }
  );
  const connectedRepos = connectedReposQuery.data?.items ?? [];

  // Available external repositories from the provider
  const availableReposQuery = useGetConnectionRepositoriesQuery(isCreate ? skipToken : { name });
  const availableRepos = availableReposQuery.data?.items ?? [];

  const notFound = !isCreate && isError && isFetchError(error) && error.status === 404;
  const showDisconnectMessage = disconnectMessage && !connection?.status?.fieldErrors?.length;

  const pageTitle = isCreate
    ? t('provisioning.connection-form.page-title-create', 'Create connection')
    : t('provisioning.connection-form.page-title-edit', 'Edit connection');

  return (
    <Page
      navId="provisioning"
      pageNav={{
        text: pageTitle,
        subTitle: t(
          'provisioning.connection-form.page-subtitle',
          'Configure a connection to authenticate with external providers'
        ),
      }}
    >
      <Page.Contents isLoading={!isCreate && isLoading}>
        {notFound ? (
          <EmptyState message={t('provisioning.connection-form.not-found', 'Connection not found')} variant="not-found">
            <Text element="p">
              <Trans i18nKey="provisioning.connection-form.not-found-description">
                The connection you are looking for does not exist.
              </Trans>
            </Text>
            <TextLink href={CONNECTIONS_URL}>
              <Trans i18nKey="provisioning.connection-form.back-to-connections">Back to connections</Trans>
            </TextLink>
          </EmptyState>
        ) : (
          <Stack direction="column" gap={2}>
            {isDisconnected && (
              <Alert
                severity="error"
                title={t('provisioning.connection.disconnected-title', 'Connection is disconnected')}
              >
                <Trans i18nKey="provisioning.connection.disconnected-message">
                  This GitHub App connection has lost access. The app may have been uninstalled or the repository access
                  was revoked.
                </Trans>
                {/* Field errors are shown inline in the form */}
                {showDisconnectMessage && <Text element="p">{disconnectMessage}</Text>}
              </Alert>
            )}
            {!isCreate && connectedRepos.length > 0 && (
              <div className={styles.cardContainer}>
                <Card noMargin>
                  <Card.Heading>
                    <Trans i18nKey="provisioning.connection-form.grafana-repositories">
                      Repositories using this connection
                    </Trans>
                  </Card.Heading>
                  <Card.Description>
                    <Stack direction="column" gap={0.5}>
                      {connectedRepos.map((repo) => (
                        <TextLink key={repo.metadata?.name} href={`${PROVISIONING_URL}/${repo.metadata?.name}`}>
                          {repo.spec?.title || repo.metadata?.name}
                        </TextLink>
                      ))}
                    </Stack>
                  </Card.Description>
                </Card>
              </div>
            )}

            {!isCreate && availableRepos.length > 0 && (
              <div className={styles.cardContainer}>
                <Card noMargin>
                  <Card.Heading>
                    <Trans i18nKey="provisioning.connection-form.available-repositories">
                      This connection has access to the following repositories
                    </Trans>
                  </Card.Heading>
                  <Card.Description>
                    <Stack direction="column" gap={0.5}>
                      {availableRepos.map((repo: ExternalRepository, index: number) =>
                        repo.url ? (
                          <TextLink key={repo.name || index} href={repo.url} external>
                            {repo.name || repo.url}
                          </TextLink>
                        ) : (
                          <Text key={repo.name || index}>{repo.name || 'Unknown'}</Text>
                        )
                      )}
                    </Stack>
                  </Card.Description>
                </Card>
              </div>
            )}

            <ConnectionForm data={isCreate ? undefined : connection} />
          </Stack>
        )}
      </Page.Contents>
    </Page>
  );
}

// Migrated from two inline style={{ maxWidth: 700 }} occurrences per AAP Dimension 3
// (inline-style → useStyles2). 700px matches the parent <ConnectionForm> maxWidth so the
// connected-repositories and available-repositories info cards align with the form below.
const getStyles = (_theme: GrafanaTheme2) => ({
  cardContainer: css({
    maxWidth: 700,
  }),
});
