import { type Observable, from } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AlertState, type AlertStateInfo } from '@grafana/data';
import { config } from '@grafana/runtime';
import { contextSrv } from 'app/core/services/context_srv';
import { alertRuleApi } from 'app/features/alerting/unified/api/alertRuleApi';
import { ungroupRulesByFileName } from 'app/features/alerting/unified/api/prometheus';
import { Annotation } from 'app/features/alerting/unified/utils/constants';
import { GRAFANA_RULES_SOURCE_NAME } from 'app/features/alerting/unified/utils/datasource';
import { prometheusRuleType } from 'app/features/alerting/unified/utils/rules';
import { promAlertStateToAlertState } from 'app/features/dashboard-scene/scene/AlertStatesDataLayer';
import { dispatch } from 'app/store/store';
import { AccessControlAction } from 'app/types/accessControl';
import { type RuleNamespace } from 'app/types/unified-alerting';
import { type PromRuleGroupDTO } from 'app/types/unified-alerting-dto';

import {
  type DashboardQueryRunnerOptions,
  type DashboardQueryRunnerWorker,
  type DashboardQueryRunnerWorkerResult,
} from './types';
import { emptyResult, handleDashboardQueryRunnerWorkerError } from './utils';

export class UnifiedAlertStatesWorker implements DashboardQueryRunnerWorker {
  // maps dashboard uid to wether it has alert rules.
  // if it is determined that a dashboard does not have alert rules,
  // further attempts to get alert states for it will not be made
  private hasAlertRules: Record<string, boolean> = {};

  canWork({ dashboard, range }: DashboardQueryRunnerOptions): boolean {
    if (!dashboard.uid) {
      return false;
    }

    // Cannot fetch rules while on a public dashboard since it's unauthenticated
    if (config.publicDashboardAccessToken) {
      return false;
    }

    if (range.raw.to !== 'now') {
      return false;
    }

    if (this.hasAlertRules[dashboard.uid] === false) {
      return false;
    }

    const hasRuleReadPermission =
      contextSrv.hasPermission(AccessControlAction.AlertingRuleRead) &&
      contextSrv.hasPermission(AccessControlAction.AlertingRuleExternalRead);

    if (!hasRuleReadPermission) {
      return false;
    }

    return true;
  }

  work(options: DashboardQueryRunnerOptions): Observable<DashboardQueryRunnerWorkerResult> {
    if (!this.canWork(options)) {
      return emptyResult();
    }

    const { dashboard } = options;
    // `DashboardModel.uid` is now typed as `string | null`. The alerting and indexing APIs
    // below all consume a `string`-typed UID; coerce null to empty-string at this boundary.
    const dashboardUid = dashboard.uid ?? '';
    const fetchData: () => Promise<RuleNamespace[]> = async () => {
      const promRules = await dispatch(
        alertRuleApi.endpoints.prometheusRuleNamespaces.initiate(
          {
            ruleSourceName: GRAFANA_RULES_SOURCE_NAME,
            dashboardUid,
          },
          { forceRefetch: true }
        )
      );
      // Pre-refactor behavior: when the dispatched RTK Query result has no `data` (e.g. error or
      // not-yet-initialized), the worker returns an empty array. `ungroupRulesByFileName` already
      // handles an empty input via its default parameter, so downstream emission yields
      // { alertStates: [], annotations: [] }. The nullish-coalescing here preserves that exact
      // behavior while satisfying the new tighter `Promise<RuleNamespace[]>` return type.
      return promRules.data ?? [];
    };

    const res: Observable<PromRuleGroupDTO[]> = from(fetchData()).pipe(
      map((namespaces: RuleNamespace[]) => ungroupRulesByFileName(namespaces))
    );

    return res.pipe(
      map((groups: PromRuleGroupDTO[]) => {
        this.hasAlertRules[dashboardUid] = false;
        const panelIdToAlertState: Record<number, AlertStateInfo> = {};
        groups.forEach((group) =>
          group.rules.forEach((rule) => {
            if (prometheusRuleType.alertingRule(rule) && rule.annotations && rule.annotations[Annotation.panelID]) {
              this.hasAlertRules[dashboardUid] = true;
              const panelId = Number(rule.annotations[Annotation.panelID]);
              const state = promAlertStateToAlertState(rule.state);

              // there can be multiple alerts per panel, so we make sure we get the most severe state:
              // alerting > pending > ok
              if (!panelIdToAlertState[panelId]) {
                panelIdToAlertState[panelId] = {
                  state,
                  id: Object.keys(panelIdToAlertState).length,
                  panelId,
                  dashboardUID: dashboardUid,
                };
              } else if (state === AlertState.Alerting && panelIdToAlertState[panelId].state !== AlertState.Alerting) {
                panelIdToAlertState[panelId].state = AlertState.Alerting;
              } else if (
                state === AlertState.Pending &&
                panelIdToAlertState[panelId].state !== AlertState.Alerting &&
                panelIdToAlertState[panelId].state !== AlertState.Pending
              ) {
                panelIdToAlertState[panelId].state = AlertState.Pending;
              }
            }
          })
        );
        return { alertStates: Object.values(panelIdToAlertState), annotations: [] };
      }),
      catchError(handleDashboardQueryRunnerWorkerError)
    );
  }
}
