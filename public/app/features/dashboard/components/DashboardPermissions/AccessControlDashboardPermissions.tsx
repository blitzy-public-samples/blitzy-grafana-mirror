import { Permissions } from 'app/core/components/AccessControl/Permissions';
import { Page } from 'app/core/components/Page/Page';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';

import { type SettingsPageProps } from '../DashboardSettings/types';

export const AccessControlDashboardPermissions = ({ dashboard, sectionNav }: SettingsPageProps) => {
  const canSetPermissions = contextSrv.hasPermission(AccessControlAction.DashboardsPermissionsWrite);
  const pageNav = sectionNav.node.parentItem;

  return (
    <Page navModel={sectionNav} pageNav={pageNav}>
      {/* `DashboardModel.uid` is `string | null`; coerce to empty-string for the permissions API. */}
      <Permissions resource={'dashboards'} resourceId={dashboard.uid ?? ''} canSetPermissions={canSetPermissions} />
    </Page>
  );
};
