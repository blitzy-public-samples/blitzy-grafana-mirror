import { css } from '@emotion/css';

import { type GrafanaTheme2 } from '@grafana/data';
import { selectors as e2eSelectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
import {
  type Column,
  Dropdown,
  Field,
  Icon,
  IconButton,
  InteractiveTable,
  Menu,
  Spinner,
  Stack,
  Text,
  useStyles2,
} from '@grafana/ui';
import {
  useReshareAccessToRecipientMutation,
  useDeleteRecipientMutation,
  publicDashboardApi,
} from 'app/features/dashboard/api/publicDashboardApi';
import { type PublicDashboard } from 'app/features/dashboard/components/ShareModal/SharePublicDashboard/SharePublicDashboardUtils';
import { type DashboardScene } from 'app/features/dashboard-scene/scene/DashboardScene';
import { DashboardInteractions } from 'app/features/dashboard-scene/utils/interactions';

const selectors = e2eSelectors.pages.ShareDashboardModal.PublicDashboard.EmailSharingConfiguration;

type Recipient = NonNullable<PublicDashboard['recipients']>[number];

const RecipientMenu = ({ onDelete, onReshare }: { onDelete: () => void; onReshare: () => void }) => {
  return (
    <Menu>
      <Menu.Item label={t('public-dashboard.email-sharing.resend-invite-label', 'Resend invite')} onClick={onReshare} />
      <Menu.Item
        label={t('public-dashboard.email-sharing.revoke-access-label', 'Revoke access')}
        destructive
        onClick={onDelete}
      />
    </Menu>
  );
};

const EmailList = ({
  recipients,
  dashboardUid,
  publicDashboard,
}: {
  recipients: PublicDashboard['recipients'];
  dashboardUid: string;
  publicDashboard: PublicDashboard;
}) => {
  const styles = useStyles2(getStyles);

  const [deleteEmail, { isLoading: isDeleteLoading }] = useDeleteRecipientMutation();
  const [reshareAccess, { isLoading: isReshareLoading }] = useReshareAccessToRecipientMutation();

  const isLoading = isDeleteLoading || isReshareLoading;

  const onDeleteEmail = (recipientUid: string, recipientEmail: string) => {
    DashboardInteractions.revokePublicDashboardEmailClicked();
    deleteEmail({ recipientUid, recipientEmail, dashboardUid: dashboardUid, uid: publicDashboard.uid });
  };

  const onReshare = (recipientUid: string) => {
    DashboardInteractions.resendPublicDashboardEmailClicked();
    reshareAccess({ recipientUid, uid: publicDashboard.uid });
  };

  const columns: Array<Column<Recipient>> = [
    {
      id: 'recipient',
      cell: ({ row }) => (
        <Stack direction="row" gap={1} alignItems="center">
          <div className={styles.icon}>
            <Icon name="user" />
          </div>
          <Text color="secondary">{row.original.recipient}</Text>
        </Stack>
      ),
    },
    {
      id: 'loading',
      disableGrow: true,
      cell: () => (isLoading ? <Spinner /> : null),
    },
    {
      id: 'actions',
      disableGrow: true,
      cell: ({ row }) => (
        <Dropdown
          overlay={
            <RecipientMenu
              onDelete={() => onDeleteEmail(row.original.uid, row.original.recipient)}
              onReshare={() => onReshare(row.original.uid)}
            />
          }
        >
          <IconButton
            name="ellipsis-v"
            aria-label={t('dashboard-scene.email-list.aria-label-emailmenu', 'Toggle email menu')}
            variant="secondary"
            size="lg"
          />
        </Dropdown>
      ),
    },
  ];

  return (
    <div data-testid={selectors.EmailSharingList}>
      <InteractiveTable columns={columns} data={recipients ?? []} getRowId={(row) => row.uid} />
    </div>
  );
};

export const EmailListConfiguration = ({ dashboard }: { dashboard: DashboardScene }) => {
  const styles = useStyles2(getStyles);
  const { data: publicDashboard } = publicDashboardApi.endpoints?.getPublicDashboard.useQueryState(
    dashboard.state.uid!
  );

  return (
    <Field
      label={t('public-dashboard.email-sharing.recipient-list-title', 'People with access')}
      description={t(
        'public-dashboard.email-sharing.recipient-list-description',
        "Only people you've directly invited can access this dashboard"
      )}
      className={styles.listField}
    >
      {!!publicDashboard?.recipients?.length ? (
        <div className={styles.listContainer}>
          <EmailList
            recipients={publicDashboard.recipients}
            dashboardUid={dashboard.state.uid!}
            publicDashboard={publicDashboard}
          />
        </div>
      ) : (
        <></>
      )}
    </Field>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  listField: css({
    marginBottom: 0,
  }),
  listContainer: css({
    maxHeight: '140px',
    overflowY: 'auto',
  }),
  icon: css({
    border: `${theme.spacing(0.25)} solid ${theme.colors.text.secondary}`,
    padding: theme.spacing(0.125, 0.5),
    borderRadius: theme.shape.radius.circle,
    color: theme.colors.text.secondary,
  }),
});
