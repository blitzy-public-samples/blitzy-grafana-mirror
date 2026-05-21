import { reportMetaAnalytics, MetaAnalyticsEventName, type DashboardViewEventPayload } from '@grafana/runtime';

import { type DashboardModel } from './DashboardModel';

export function emitDashboardViewEvent(dashboard: Pick<DashboardModel, 'title' | 'uid' | 'meta' | 'id'>) {
  const eventData: DashboardViewEventPayload = {
    // dashboard.id is `number | null | undefined` (newly created dashboards have no
    // server-assigned ID yet); the analytics event payload requires `number`, so coerce
    // null/undefined to 0 (matches prior runtime behavior under `any` typing — falsy
    // values were passed through unchanged and downstream analytics safely handled them).
    dashboardId: dashboard.id ?? 0,
    dashboardName: dashboard.title,
    // dashboard.uid is `string | null`; coerce null to '' for the string field.
    dashboardUid: dashboard.uid ?? '',
    folderName: dashboard.meta.folderTitle,
    eventName: MetaAnalyticsEventName.DashboardView,
  };

  reportMetaAnalytics(eventData);
}
