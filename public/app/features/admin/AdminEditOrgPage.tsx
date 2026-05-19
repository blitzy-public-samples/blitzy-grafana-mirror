import { css } from '@emotion/css';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom-v5-compat';
import { useAsyncFn } from 'react-use';

import { type GrafanaTheme2, type NavModelItem, type OrgRole } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Alert, Box, Button, Field, Input, Legend, useStyles2 } from '@grafana/ui';
import { Page } from 'app/core/components/Page/Page';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';
import { type OrgUser } from 'app/types/user';

import { OrgUsersTable } from './Users/OrgUsersTable';
import { getOrg, getOrgUsers, getUsersRoles, removeOrgUser, updateOrgName, updateOrgUserRole } from './api';

interface OrgNameDTO {
  orgName: string;
}

const AdminEditOrgPage = () => {
  const styles = useStyles2(getStyles);
  const { id = '' } = useParams();
  const orgId = parseInt(id, 10);
  const canWriteOrg = contextSrv.hasPermission(AccessControlAction.OrgsWrite);
  const canReadUsers = contextSrv.hasPermission(AccessControlAction.OrgUsersRead);

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [orgState, fetchOrg] = useAsyncFn(() => getOrg(orgId), []);
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<OrgNameDTO>();
  const [, fetchOrgUsers] = useAsyncFn(async (page) => {
    const result = await getOrgUsers(orgId, page);

    if (contextSrv.licensedAccessControlEnabled()) {
      await getUsersRoles(orgId, result.orgUsers);
    }

    const totalPages = result?.perPage !== 0 ? Math.ceil(result.totalCount / result.perPage) : 0;
    setTotalPages(totalPages);
    setUsers(result.orgUsers);
    return result.orgUsers;
  }, []);

  useEffect(() => {
    fetchOrg();
    fetchOrgUsers(page);
  }, [fetchOrg, fetchOrgUsers, page]);

  const onUpdateOrgName = async ({ orgName }: OrgNameDTO) => {
    await updateOrgName(orgName, orgId);
  };

  const renderMissingPermissionMessage = () => (
    <Alert
      severity="info"
      title={t('admin.admin-edit-org-page.render-missing-permission-message.title-access-denied', 'Access denied')}
    >
      <Trans i18nKey="admin.edit-org.access-denied">
        You do not have permission to see users in this organization. To update this organization, contact your server
        administrator.
      </Trans>
    </Alert>
  );

  const onPageChange = (toPage: number) => {
    setPage(toPage);
  };

  const onRemoveUser = async (orgUser: OrgUser) => {
    await removeOrgUser(orgUser, orgId);
    fetchOrgUsers(page);
  };

  const onRoleChange = async (role: OrgRole, orgUser: OrgUser) => {
    await updateOrgUserRole({ ...orgUser, role }, orgId);
    fetchOrgUsers(page);
  };

  const pageNav: NavModelItem = {
    text: orgState?.value?.name ?? '',
    icon: 'shield',
    subTitle: t(
      'admin.admin-edit-org-page.page-nav.subTitle.manage-settings-roles-organization',
      'Manage settings and user roles for an organization.'
    ),
  };

  return (
    <Page navId="global-orgs" pageNav={pageNav} subTitle="Manage settings for this specific org.">
      <Page.Contents>
        <>
          <Legend>
            <Trans i18nKey="admin.edit-org.heading">Edit Organization</Trans>
          </Legend>
          {orgState.value && (
            // Design system gap: @grafana/ui Form component is deprecated in favor of using react-hook-form's useForm hook directly with native <form>; raw <form> retained per recommended pattern.
            <form onSubmit={handleSubmit(onUpdateOrgName)} className={styles.form}>
              <Field
                label={t('admin.admin-edit-org-page.label-name', 'Name')}
                invalid={!!errors.orgName}
                error="Name is required"
                disabled={!canWriteOrg}
              >
                <Input
                  {...register('orgName', { required: true })}
                  id="org-name-input"
                  defaultValue={orgState.value.name}
                />
              </Field>
              <Button type="submit" disabled={!canWriteOrg}>
                <Trans i18nKey="admin.edit-org.update-button">Update</Trans>
              </Button>
            </form>
          )}

          <Box marginTop={2.5}>
            <Legend>
              <Trans i18nKey="admin.edit-org.users-heading">Organization users</Trans>
            </Legend>
            {!canReadUsers && renderMissingPermissionMessage()}
            {canReadUsers && !!users.length && (
              <OrgUsersTable
                users={users}
                orgId={orgId}
                onRoleChange={onRoleChange}
                onRemoveUser={onRemoveUser}
                changePage={onPageChange}
                page={page}
                totalPages={totalPages}
              />
            )}
          </Box>
        </>
      </Page.Contents>
    </Page>
  );
};

export default AdminEditOrgPage;

const getStyles = (theme: GrafanaTheme2) => ({
  form: css({
    maxWidth: theme.spacing(75), // 600px equivalent (8 * 75 = 600)
  }),
});
