import { omit } from 'lodash';

import {
  type ChannelValues,
  type ReceiverFormValues,
  type ReceiverSettingValue,
  type ReceiverSettings,
} from '../../../types/receiver-form';

/**
 * Older Prometheus Alertmanager `http_config` shape that uses inline bearer
 * tokens. Extends {@link ReceiverSettings} so an instance of this interface
 * can be safely assigned to a `ChannelValues.settings.http_config` slot
 * (a {@link ReceiverSettingValue}) without losing structural typing.
 */
export interface DeprecatedAuthHTTPConfig extends ReceiverSettings {
  bearer_token?: string;
  bearer_token_file?: string;
}

/**
 * Nested authorization block used by the newer {@link HTTPAuthConfig} shape.
 * Extends {@link ReceiverSettings} for the same reason as
 * {@link DeprecatedAuthHTTPConfig} - the value is embedded as a
 * {@link ReceiverSettingValue}.
 */
interface AuthorizationConfig extends ReceiverSettings {
  type: string;
  credentials?: string;
  credentials_file?: string;
}

/**
 * Newer Prometheus Alertmanager `http_config` shape that uses a structured
 * `authorization` block. Extends {@link ReceiverSettings} for embeddability
 * within {@link ChannelValues}.`settings`.
 */
export interface HTTPAuthConfig extends ReceiverSettings {
  authorization?: AuthorizationConfig;
}

// convert the newer http_config to the older (deprecated) format
export function normalizeFormValues(
  values?: ReceiverFormValues<ChannelValues>
): ReceiverFormValues<ChannelValues> | undefined {
  if (!values) {
    return;
  }

  return {
    ...values,
    items: values.items.map((item) => ({
      ...item,
      settings: {
        ...item.settings,
        http_config: normalizeHTTPConfig(item.settings?.http_config),
      },
    })),
  };
}

/**
 * Narrow an arbitrary {@link ReceiverSettingValue} (which is what the upstream
 * `ChannelValues.settings.http_config` slot exposes) into either the new
 * {@link HTTPAuthConfig} or legacy {@link DeprecatedAuthHTTPConfig} shape and
 * convert it to the deprecated representation.
 *
 * Returns `undefined` for non-object inputs (falsy primitives, arrays, null),
 * preserving the previous behavior where the call-site truthy check
 * (`item.settings?.http_config ? normalizeHTTPConfig(...) : undefined`)
 * short-circuited normalization for those cases.
 */
function normalizeHTTPConfig(config: ReceiverSettingValue): DeprecatedAuthHTTPConfig | undefined {
  if (config === null || config === undefined) {
    return undefined;
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }

  // After the runtime guard above, TypeScript narrows `config` to
  // `ReceiverSettings`, which is the index-signature interface that both
  // `DeprecatedAuthHTTPConfig` and `HTTPAuthConfig` extend.
  if (isDeprecatedHTTPAuthConfig(config)) {
    return config;
  }

  // Treat anything that is not the deprecated shape as the newer
  // `HTTPAuthConfig`. Missing `authorization` fields produce `undefined`
  // bearer values, which `toEqual` (used by util.test.ts) treats as absent --
  // matching the legacy behavior exactly.
  const authorization = isHTTPAuthConfig(config) ? config.authorization : undefined;
  return {
    ...omit(config, 'authorization'),
    bearer_token: authorization?.credentials,
    bearer_token_file: authorization?.credentials_file,
  };
}

function isDeprecatedHTTPAuthConfig(config: ReceiverSettings): config is DeprecatedAuthHTTPConfig {
  return ['bearer_token', 'bearer_token_file'].some((prop) => prop in config);
}

function isHTTPAuthConfig(config: ReceiverSettings): config is HTTPAuthConfig {
  return 'authorization' in config;
}
