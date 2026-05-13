import { getBackendSrv } from '@grafana/runtime';
import { updateConfigurationSubtitle } from 'app/core/reducers/navModel';
import { type Organization } from 'app/types/organization';
import { type ThunkResult } from 'app/types/store';
import { type UserOrg } from 'app/types/user';

import { organizationLoaded, userOrganizationsLoaded } from './reducers';

type OrganizationDependencies = { getBackendSrv: typeof getBackendSrv };

export function loadOrganization(
  dependencies: OrganizationDependencies = { getBackendSrv: getBackendSrv }
): ThunkResult<void> {
  return async (dispatch) => {
    const organizationResponse = await dependencies.getBackendSrv().get<Organization>('/api/org');
    dispatch(organizationLoaded(organizationResponse));

    return organizationResponse;
  };
}

export function updateOrganization(
  dependencies: OrganizationDependencies = { getBackendSrv: getBackendSrv }
): ThunkResult<void> {
  return async (dispatch, getStore) => {
    const organization = getStore().organization.organization;

    await dependencies.getBackendSrv().put('/api/org', { name: organization.name });

    dispatch(updateConfigurationSubtitle(organization.name));
    dispatch(loadOrganization(dependencies));
  };
}

export function setUserOrganization(
  orgId: number,
  dependencies: OrganizationDependencies = { getBackendSrv: getBackendSrv }
): ThunkResult<void> {
  return async (dispatch) => {
    // `/api/user/using/:orgId` returns the newly selected org metadata; only
    // `name` is consumed for the navmodel subtitle update.
    const organizationResponse = await dependencies
      .getBackendSrv()
      .post<{ name: string }>('/api/user/using/' + orgId);

    dispatch(updateConfigurationSubtitle(organizationResponse.name));
  };
}

export function createOrganization(
  newOrg: { name: string },
  dependencies: OrganizationDependencies = { getBackendSrv: getBackendSrv }
): ThunkResult<void> {
  return async (dispatch) => {
    // `POST /api/orgs` returns the created org's id; downstream uses it to
    // switch the user into the new org.
    const result = await dependencies.getBackendSrv().post<{ orgId: number }>('/api/orgs/', newOrg);

    dispatch(setUserOrganization(result.orgId));
  };
}

export function getUserOrganizations(
  dependencies: OrganizationDependencies = { getBackendSrv: getBackendSrv }
): ThunkResult<Promise<UserOrg[]>> {
  return async (dispatch) => {
    const result = await dependencies.getBackendSrv().get<UserOrg[]>('/api/user/orgs');
    dispatch(userOrganizationsLoaded(result));

    return result;
  };
}
