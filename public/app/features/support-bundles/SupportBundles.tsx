import { useEffect, useMemo } from 'react';
import { connect, type ConnectedProps } from 'react-redux';

import { dateTimeFormat } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { InteractiveTable, LinkButton, Spinner, IconButton, type Column, type CellProps } from '@grafana/ui';
import { Page } from 'app/core/components/Page/Page';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';
import { type StoreState } from 'app/types/store';
import { type SupportBundle } from 'app/types/supportBundles';

import { loadBundles, removeBundle, checkBundles } from './state/actions';

const NewBundleButton = (
  <LinkButton icon="plus" href="support-bundles/create" variant="primary">
    <Trans i18nKey="support-bundles.new-bundle-button.new-support-bundle">New support bundle</Trans>
  </LinkButton>
);

const mapStateToProps = (state: StoreState) => {
  return {
    supportBundles: state.supportBundles.supportBundles,
    isLoading: state.supportBundles.isLoading,
  };
};

const mapDispatchToProps = {
  loadBundles,
  removeBundle,
  checkBundles,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

type Props = ConnectedProps<typeof connector>;

const SupportBundlesUnconnected = ({ supportBundles, isLoading, loadBundles, removeBundle, checkBundles }: Props) => {
  const isPending = supportBundles.some((b) => b.state === 'pending');

  useEffect(() => {
    loadBundles();
  }, [loadBundles]);

  useEffect(() => {
    if (isPending) {
      checkBundles();
    }
  });

  const hasAccess = contextSrv.hasPermission(AccessControlAction.ActionSupportBundlesCreate);
  const hasDeleteAccess = contextSrv.hasPermission(AccessControlAction.ActionSupportBundlesDelete);

  const tableData = useMemo<SupportBundle[]>(() => supportBundles ?? [], [supportBundles]);

  const columns = useMemo<Array<Column<SupportBundle>>>(
    () => [
      {
        id: 'createdAt',
        header: t('support-bundles.support-bundles-unconnected.created-on', 'Created on'),
        cell: ({ row: { original } }: CellProps<SupportBundle>) => dateTimeFormat(original.createdAt * 1000),
      },
      {
        id: 'creator',
        header: t('support-bundles.support-bundles-unconnected.requested-by', 'Requested by'),
        cell: ({ row: { original } }: CellProps<SupportBundle>) => original.creator,
      },
      {
        id: 'expiresAt',
        header: t('support-bundles.support-bundles-unconnected.expires', 'Expires'),
        cell: ({ row: { original } }: CellProps<SupportBundle>) => dateTimeFormat(original.expiresAt * 1000),
      },
      {
        id: 'state',
        disableGrow: true,
        cell: ({ row: { original } }: CellProps<SupportBundle>) => (original.state === 'pending' ? <Spinner /> : null),
      },
      {
        id: 'download',
        disableGrow: true,
        cell: ({ row: { original } }: CellProps<SupportBundle>) => (
          <LinkButton
            fill="outline"
            disabled={original.state !== 'complete'}
            target={'_self'}
            href={`/api/support-bundles/${original.uid}`}
          >
            <Trans i18nKey="support-bundles.support-bundles-unconnected.download">Download</Trans>
          </LinkButton>
        ),
      },
      {
        id: 'actions',
        disableGrow: true,
        cell: ({ row: { original } }: CellProps<SupportBundle>) =>
          hasDeleteAccess ? (
            <IconButton
              onClick={() => removeBundle(original.uid)}
              name="trash-alt"
              variant="destructive"
              tooltip={t('support-bundles.support-bundles-unconnected.tooltip-remove-bundle', 'Remove bundle')}
            />
          ) : null,
      },
    ],
    [hasDeleteAccess, removeBundle]
  );

  const actions = hasAccess ? NewBundleButton : undefined;

  const subTitle = (
    <span>
      <Trans i18nKey="support-bundles.support-bundles-unconnected.sub-title">
        Support bundles allow you to easily collect and share Grafana logs, configuration, and data with the Grafana
        Labs team.
      </Trans>
    </span>
  );

  return (
    <Page navId="support-bundles" subTitle={subTitle} actions={actions}>
      <Page.Contents isLoading={isLoading}>
        <InteractiveTable columns={columns} data={tableData} getRowId={(bundle) => bundle.uid} />
      </Page.Contents>
    </Page>
  );
};

export default connector(SupportBundlesUnconnected);
