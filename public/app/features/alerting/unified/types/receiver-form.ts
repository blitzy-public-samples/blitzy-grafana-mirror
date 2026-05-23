import type * as React from 'react';

import { type CloudNotifierType, type NotifierType } from 'app/features/alerting/unified/types/alerting';
import { type GrafanaManagedReceiverConfig } from 'app/plugins/datasource/alertmanager/types';

import { type ControlledField } from '../hooks/useControlledFieldArray';

/**
 * A single value within a contact-point integration `settings` object.
 *
 * Receiver settings are heterogeneous across the 30+ supported integration
 * types (slack, email, pagerduty, telegram, sns, webhook, ...) and may be a
 * primitive (`string | number | boolean`), nullish, a nested settings object
 * (e.g., SNS `sigv4: { region, access_key, secret_key }`), or an array of any
 * of the above (e.g., subform-array option values). The recursive structure
 * matches the runtime payload produced by
 * {@link grafanaChannelConfigToFormChannelValues} which spreads the upstream
 * `GrafanaManagedReceiverConfig.settings` (typed `Record<string, any>` with an
 * explicit justification in `public/app/plugins/datasource/alertmanager/types.ts`)
 * into `ChannelValues.settings` without altering the contained structure.
 */
export type ReceiverSettingValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReceiverSettings
  | ReceiverSettingValue[];

/**
 * Map of arbitrary string keys to {@link ReceiverSettingValue} for a contact-point
 * integration. Modeling the structure recursively rather than as `Record<string,
 * any>` or `Record<string, unknown>` preserves type safety while still permitting
 * the nested integration shapes (e.g., `sigv4`, `oauth2`, `tls_config`) without
 * forcing every consumer to perform `any` casts.
 *
 * Consumers that read a known nested field must narrow the value at the use
 * site (typically with `typeof x === 'object' && x !== null && !Array.isArray(x)`)
 * before accessing further properties; consumers that already know the shape
 * by integration type can cast through {@link ReceiverSettings} once after the
 * narrow.
 */
export interface ReceiverSettings {
  [key: string]: ReceiverSettingValue;
}

export interface ChannelValues {
  __id: string; // used to correlate form values to original DTOs
  type: string;
  version?: string; // Integration version (e.g. "v0" for Mimir legacy, "v1" for Grafana)
  settings: ReceiverSettings;
  secureFields: Record<string, boolean | ''>;
}

export interface ReceiverFormValues<R extends ChannelValues> {
  name: string;
  items: Array<ControlledField<R>>;
}

export interface CloudChannelValues extends ChannelValues {
  type: string;
  sendResolved: boolean;
}

export interface GrafanaChannelValues extends ChannelValues {
  type: NotifierType;
  provenance?: string;
  disableResolveMessage?: boolean;
}

export interface CommonSettingsComponentProps {
  pathPrefix: string;
  className?: string;
  readOnly?: boolean;
}
export type CommonSettingsComponentType = React.ComponentType<CommonSettingsComponentProps>;

export type CloudChannelConfig = {
  send_resolved: boolean;
  /**
   * Cloud channel configs come from Alertmanager YAML and have a heterogeneous
   * structure per notifier type. Using {@link ReceiverSettingValue} keeps the
   * value type compatible with {@link ReceiverSettings} so that spreading
   * `{ ...channel }` into a `ChannelValues.settings` field type-checks
   * without losing nested-object support (e.g., `sigv4`, `http_config`).
   */
  [key: string]: ReceiverSettingValue;
};

// id to notifier
export type GrafanaChannelMap = Record<string, GrafanaManagedReceiverConfig>;
export type CloudChannelMap = Record<
  string,
  {
    type: CloudNotifierType;
    config: CloudChannelConfig;
  }
>;
