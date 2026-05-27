import type * as React from 'react';

import { type DataSourceJsonData, type DataSourceSettings } from '@grafana/data';

export interface AzureAuthSettings {
  /** Set to true if Azure authentication supported by the datasource */
  readonly azureAuthSupported: boolean;

  /** Gets whether the Azure authentication currently enabled for the datasource */
  readonly getAzureAuthEnabled: (config: DataSourceSettings) => boolean;

  /** Enables/disables the Azure authentication from the datasource */
  readonly setAzureAuthEnabled: (config: DataSourceSettings, enabled: boolean) => Partial<DataSourceSettings>;

  /** Optional React component of additional Azure settings UI if authentication is enabled  */
  readonly azureSettingsUI?: React.ComponentType<HttpSettingsBaseProps>;
}

/**
 * Public SDK type consumed by every datasource plugin's config editor.
 *
 * `JSONData` and `SecureJSONData` defaults are intentionally typed as `any`
 * because every concrete datasource plugin extends `DataSourceJsonData` with
 * its own plugin-specific shape (e.g. `tlsAuth`, `oauthPassThru`,
 * `tlsAuthWithCACert`, `serverName`, `sigV4Auth`, `keepCookies`, `timeout`,
 * `azureEndpointResourceId`, `httpMode`, `timeInterval`, ...) and the
 * @grafana/ui-shipped DataSourceHttpSettings / BasicAuthSettings /
 * HttpProxySettings / TLSAuthSettings / CustomHeadersSettings components
 * read those plugin-specific fields directly from `dataSourceConfig.jsonData`
 * without knowing the concrete shape at compile time. Tightening the default
 * to `DataSourceJsonData` (or `{}` for `SecureJSONData`) would break every
 * existing datasource plugin's config-editor TypeScript build that does not
 * thread an explicit generic argument through every consumer site.
 *
 * Per AAP §0.8.6 step 7 (last-resort retained `any` with inline justification)
 * and §0.8.7 (Public API Surface Preservation Analysis).
 */
export interface HttpSettingsBaseProps<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HttpSettingsBaseProps is a public SDK type; the default must remain `any` so that consumer datasource plugins reading plugin-specific jsonData fields (tlsAuth, oauthPassThru, etc.) without an explicit generic argument continue to compile (AAP §0.8.7 public API preservation).
  JSONData extends DataSourceJsonData = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HttpSettingsBaseProps is a public SDK type; the default must remain `any` so that consumer datasource plugins reading plugin-specific secureJsonData fields (basicAuthPassword, tlsCACert, tlsClientCert, ...) without an explicit generic argument continue to compile (AAP §0.8.7 public API preservation).
  SecureJSONData = any,
> {
  /** The configuration object of the data source */
  dataSourceConfig: DataSourceSettings<JSONData, SecureJSONData>;
  /** Callback for handling changes to the configuration object */
  onChange: (config: DataSourceSettings<JSONData, SecureJSONData>) => void;
  /** Show the Forward OAuth identity option */
  showForwardOAuthIdentityOption?: boolean;
}

export interface HttpSettingsProps extends HttpSettingsBaseProps {
  /** The default url for the data source */
  defaultUrl: string;
  /** Set label for url option */
  urlLabel?: string;
  /** Added to default url tooltip */
  urlDocs?: React.ReactNode;
  /** Show the http access help box */
  showAccessOptions?: boolean;
  /** Show the SigV4 auth toggle option */
  sigV4AuthToggleEnabled?: boolean;
  /** Azure authentication settings **/
  azureAuthSettings?: AzureAuthSettings;
  /** If SIGV4 is enabled, provide an editor for SIGV4 connection config  **/
  renderSigV4Editor?: React.ReactNode;
  /** Show the Secure Socks Datasource Proxy toggle option */
  secureSocksDSProxyEnabled?: boolean;
}
