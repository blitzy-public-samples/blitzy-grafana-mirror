import { type UrlQueryValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { contextSrv } from 'app/core/services/context_srv';
import { accessControlQueryParam } from 'app/core/utils/accessControl';
import { AccessControlAction, type Role } from 'app/types/accessControl';
import { type Organization } from 'app/types/organization';
import { type OrgUser } from 'app/types/user';

const perPage = 30;

// Paginated response shape returned by `/api/orgs/:id/users/search`.
export interface OrgUsersSearchResponse {
  orgUsers: OrgUser[];
  totalCount: number;
  perPage: number;
  page: number;
}

export const getOrg = async (orgId: UrlQueryValue): Promise<Organization> => {
  return await getBackendSrv().get<Organization>(`/api/orgs/${orgId}`);
};

export const getOrgUsers = async (orgId: UrlQueryValue, page: number): Promise<OrgUsersSearchResponse> => {
  if (contextSrv.hasPermission(AccessControlAction.OrgUsersRead)) {
    return getBackendSrv().get<OrgUsersSearchResponse>(
      `/api/orgs/${orgId}/users/search`,
      accessControlQueryParam({ perpage: perPage, page })
    );
  }
  return { orgUsers: [], totalCount: 0, perPage, page };
};

export const getUsersRoles = async (orgId: number, users: OrgUser[]) => {
  const userIds = users.map((u) => u.userId);
  const roles = await getBackendSrv().post<Record<number, Role[]> | undefined>(
    `/api/access-control/users/roles/search?includeMapped=true`,
    {
      userIds,
      orgId,
    }
  );
  users.forEach((u) => {
    u.roles = roles ? roles[u.userId] || [] : [];
  });
};

export const updateOrgUserRole = (orgUser: OrgUser, orgId: UrlQueryValue) => {
  return getBackendSrv().patch(`/api/orgs/${orgId}/users/${orgUser.userId}`, orgUser);
};

export const removeOrgUser = (orgUser: OrgUser, orgId: UrlQueryValue) => {
  return getBackendSrv().delete(`/api/orgs/${orgId}/users/${orgUser.userId}`);
};

export const updateOrgName = (name: string, orgId: number) => {
  return getBackendSrv().put(`/api/orgs/${orgId}`, { name });
};
