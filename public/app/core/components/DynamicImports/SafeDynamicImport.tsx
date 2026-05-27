import { lazy } from 'react';

import { type GrafanaRouteComponent } from 'app/core/navigation/types';

export const SafeDynamicImport = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `Promise<any>` is retained because tightening this loader signature causes TypeScript compile errors at downstream call sites: (1) `public/app/routes/routes.tsx` line 389 imports `app/features/admin/ServerStats` which lacks a `default` export (a latent runtime bug currently masked by this `any`); (2) `public/app/features/alerting/routes.tsx` line 438's `importAlertingComponent(loader: () => any)` propagates its untyped loader into this signature. Reconciling both requires coordinated fixes outside this file's scope per the minimal-change mandate. `React.lazy()` performs runtime enforcement of the `{ default: ComponentType<...> }` contract on the resolved module shape.
  loader: () => Promise<any>
): GrafanaRouteComponent => lazy(loader);
