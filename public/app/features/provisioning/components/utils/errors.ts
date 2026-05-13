import { t } from '@grafana/i18n';
import { type FetchErrorDataProps, isFetchError } from '@grafana/runtime';
import { extractErrorMessage } from 'app/api/utils';

type ResourceType = 'dashboard' | 'folder';

const API_FILE_NOT_FOUND = 'file not found'; // from apps/provisioning/pkg/repository/repository.go

export function getProvisionedRequestError(
  error: unknown,
  resourceType: ResourceType,
  fallbackMessage: string
): string {
  // Narrow to the canonical fetch-error body so `error.data.message` is typed.
  if (isFetchError<FetchErrorDataProps>(error) && error.status === 404) {
    const apiMessage = typeof error.data?.message === 'string' ? error.data.message : '';

    if (apiMessage === API_FILE_NOT_FOUND) {
      return resourceType === 'dashboard'
        ? t(
            'provisioning.error.branch-not-found-dashboard',
            'You have selected a branch that does not contain this dashboard. Select another branch.'
          )
        : t(
            'provisioning.error.branch-not-found-folder',
            'You have selected a branch that does not contain this folder. Select another branch.'
          );
    }

    return apiMessage || fallbackMessage;
  }

  return extractErrorMessage(error, fallbackMessage);
}
