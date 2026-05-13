import { lastValueFrom } from 'rxjs';

import { getBackendSrv, isFetchError } from '@grafana/runtime';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';
import { type Settings, type UpdateSettingsQuery } from 'app/types/settings';
import { type ThunkResult } from 'app/types/store';

import { getAuthProviderStatus, getRegisteredAuthProviders } from '..';
import { type AuthProviderStatus, type SettingsError, type SSOProvider } from '../types';

import {
  loadingBegin,
  loadingEnd,
  providersLoaded,
  providerStatusesLoaded,
  resetError,
  setError,
  settingsUpdated,
} from './reducers';

export function loadSettings(showSpinner = true): ThunkResult<Promise<Settings>> {
  return async (dispatch) => {
    if (contextSrv.hasPermission(AccessControlAction.SettingsRead)) {
      if (showSpinner) {
        dispatch(loadingBegin());
      }
      dispatch(loadProviders());
      const result = await getBackendSrv().get<Settings>('/api/admin/settings');
      dispatch(settingsUpdated(result));
      await dispatch(loadProviderStatuses());
      if (showSpinner) {
        dispatch(loadingEnd());
      }
      return result;
    }
    // Without SettingsRead permission, return an empty Settings object so the
    // thunk's return type contract (Promise<Settings>) is honored on all paths.
    // Declaring the local with the explicit `Settings` type avoids a type
    // assertion — the empty object literal `{}` is structurally assignable to
    // `Settings = { [key: string]: SettingsSection }` via its index signature.
    const empty: Settings = {};
    return empty;
  };
}

export function loadProviders(provider = ''): ThunkResult<Promise<SSOProvider[]>> {
  return async (dispatch) => {
    // The endpoint returns a single SSOProvider when a specific provider is requested
    // and an array of SSOProvider otherwise. Type the response as a union and normalize
    // to SSOProvider[] before dispatching/returning. Using `Array.isArray` narrows the
    // union at runtime without requiring a type assertion.
    const result = await getBackendSrv().get<SSOProvider | SSOProvider[]>(
      `/api/v1/sso-settings${provider ? `/${provider}` : ''}`
    );
    const providers = Array.isArray(result) ? result : [result];
    dispatch(providersLoaded(providers));
    return providers;
  };
}

export function loadProviderStatuses(): ThunkResult<void> {
  return async (dispatch) => {
    const registeredProviders = getRegisteredAuthProviders();
    const providerStatuses: Record<string, AuthProviderStatus> = {};
    const getStatusPromises: Array<Promise<AuthProviderStatus>> = [];
    for (const provider of registeredProviders) {
      getStatusPromises.push(getAuthProviderStatus(provider.id));
    }
    const statuses = await Promise.all(getStatusPromises);
    for (let i = 0; i < registeredProviders.length; i++) {
      const provider = registeredProviders[i];
      providerStatuses[provider.id] = statuses[i];
    }
    dispatch(providerStatusesLoaded(providerStatuses));
  };
}

export function saveSettings(data: UpdateSettingsQuery): ThunkResult<Promise<boolean>> {
  return async (dispatch) => {
    if (contextSrv.hasPermission(AccessControlAction.SettingsWrite)) {
      try {
        await lastValueFrom(
          getBackendSrv().fetch({
            url: '/api/admin/settings',
            method: 'PUT',
            data,
            showSuccessAlert: false,
            showErrorAlert: false,
          })
        );
        dispatch(resetError());
        return true;
      } catch (error) {
        console.log(error);
        if (isFetchError<SettingsError>(error)) {
          error.isHandled = true;
          const updateErr: SettingsError = {
            message: error.data?.message,
            errors: error.data?.errors,
          };
          dispatch(setError(updateErr));
          return false;
        }
      }
    }
    return false;
  };
}
