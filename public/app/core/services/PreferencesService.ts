import { type PreferencesSpec as UserPreferencesDTO } from '@grafana/api-clients/rtkq/preferences/v1alpha1';

import { backendSrv } from './backend_srv';

export class PreferencesService {
  constructor(private resourceUri: string) {}

  /**
   * Overrides all preferences
   */
  update(preferences: UserPreferencesDTO): Promise<void> {
    return backendSrv.put<void>(`/api/${this.resourceUri}/preferences`, preferences);
  }

  /**
   * Updates only provided preferences
   */
  patch(preferences: Partial<UserPreferencesDTO>): Promise<void> {
    return backendSrv.patch<void>(`/api/${this.resourceUri}/preferences`, preferences);
  }

  load(): Promise<UserPreferencesDTO> {
    return backendSrv.get<UserPreferencesDTO>(`/api/${this.resourceUri}/preferences`);
  }
}
