import { debounce } from 'lodash';

import { getBackendSrv } from '@grafana/runtime';
import { fetchRoleOptions } from 'app/core/components/RolePicker/api';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction, type Role } from 'app/types/accessControl';
import { type ServiceAccountDTO, ServiceAccountStateFilter } from 'app/types/serviceaccount';
import { type ThunkResult } from 'app/types/store';

import { type ServiceAccountToken } from '../components/CreateTokenModal';

import {
  acOptionsLoaded,
  pageChanged,
  queryChanged,
  rolesFetchBegin,
  rolesFetchEnd,
  serviceAccountsFetchBegin,
  serviceAccountsFetched,
  serviceAccountsFetchEnd,
  stateFilterChanged,
  type ServiceAccountsFetched,
} from './reducers';

// Server response shape for POST /api/access-control/users/roles/search.
// Maps a user id to that user's roles. Untyped on the wire, so we narrow here.
type UserRolesSearchResponse = Record<number, Role[]> | undefined;

const BASE_URL = `/api/serviceaccounts`;

export function fetchACOptions(): ThunkResult<void> {
  return async (dispatch) => {
    try {
      if (contextSrv.licensedAccessControlEnabled() && contextSrv.hasPermission(AccessControlAction.ActionRolesList)) {
        const options = await fetchRoleOptions();
        dispatch(acOptionsLoaded(options));
      }
    } catch (error) {
      console.error(error);
    }
  };
}

interface FetchServiceAccountsParams {
  withLoadingIndicator: boolean;
}

export function fetchServiceAccounts(
  { withLoadingIndicator }: FetchServiceAccountsParams = { withLoadingIndicator: false }
): ThunkResult<void> {
  return async (dispatch, getState) => {
    try {
      if (contextSrv.hasPermission(AccessControlAction.ServiceAccountsRead)) {
        if (withLoadingIndicator) {
          dispatch(serviceAccountsFetchBegin());
        }
        const { perPage, page, query, serviceAccountStateFilter } = getState().serviceAccounts;
        const result = await getBackendSrv().get<ServiceAccountsFetched>(
          `/api/serviceaccounts/search?perpage=${perPage}&page=${page}&query=${query}${getStateFilter(
            serviceAccountStateFilter
          )}&accesscontrol=true`
        );

        if (
          contextSrv.licensedAccessControlEnabled() &&
          contextSrv.hasPermission(AccessControlAction.ActionUserRolesList)
        ) {
          dispatch(rolesFetchBegin());
          const orgId = contextSrv.user.orgId;
          const userIds = result?.serviceAccounts.map((u: ServiceAccountDTO) => u.id);
          const roles = await getBackendSrv().post<UserRolesSearchResponse>(
            `/api/access-control/users/roles/search?includeHidden=true`,
            {
              userIds,
              orgId,
            }
          );
          result.serviceAccounts.forEach((u: ServiceAccountDTO) => {
            u.roles = roles ? roles[u.id] || [] : [];
          });
          dispatch(rolesFetchEnd());
        }

        dispatch(serviceAccountsFetched(result));
      }
    } catch (error) {
      console.error(error);
    } finally {
      dispatch(serviceAccountsFetchEnd());
    }
  };
}

const fetchServiceAccountsWithDebounce = debounce((dispatch) => dispatch(fetchServiceAccounts()), 500, {
  leading: true,
});

export function updateServiceAccount(serviceAccount: ServiceAccountDTO): ThunkResult<void> {
  return async (dispatch) => {
    await getBackendSrv().patch(`${BASE_URL}/${serviceAccount.uid}?accesscontrol=true`, {
      ...serviceAccount,
    });
    dispatch(fetchServiceAccounts());
  };
}

export function deleteServiceAccount(serviceAccountUid: string): ThunkResult<void> {
  return async (dispatch) => {
    await getBackendSrv().delete(`${BASE_URL}/${serviceAccountUid}`);
    dispatch(fetchServiceAccounts());
  };
}

// Server response shape for POST /api/serviceaccounts/:saUid/tokens.
// Only the `key` field is consumed by the caller.
interface CreateServiceAccountTokenResponse {
  key: string;
}

export function createServiceAccountToken(
  saUid: string,
  token: ServiceAccountToken,
  onTokenCreated: (key: string) => void
): ThunkResult<void> {
  return async (dispatch) => {
    const result = await getBackendSrv().post<CreateServiceAccountTokenResponse>(
      `${BASE_URL}/${saUid}/tokens`,
      token
    );
    onTokenCreated(result.key);
    dispatch(fetchServiceAccounts());
  };
}

// search / filtering of serviceAccounts
const getStateFilter = (value: ServiceAccountStateFilter) => {
  switch (value) {
    case ServiceAccountStateFilter.WithExpiredTokens:
      return '&expiredTokens=true';
    case ServiceAccountStateFilter.Disabled:
      return '&disabled=true';
    case ServiceAccountStateFilter.External:
      return '&external=true';
    default:
      return '';
  }
};

export function changeQuery(query: string): ThunkResult<void> {
  return async (dispatch) => {
    dispatch(queryChanged(query));
    fetchServiceAccountsWithDebounce(dispatch);
  };
}

export function changeStateFilter(filter: ServiceAccountStateFilter): ThunkResult<void> {
  return async (dispatch) => {
    dispatch(stateFilterChanged(filter));
    dispatch(fetchServiceAccounts());
  };
}

export function changePage(page: number): ThunkResult<void> {
  return async (dispatch) => {
    dispatch(pageChanged(page));
    dispatch(fetchServiceAccounts());
  };
}
