import { css } from '@emotion/css';
import { Fragment, type JSX, type ReactNode } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Alert, Stack, useStyles2 } from '@grafana/ui';

import { InstallControlsWarning } from '../components/InstallControls/InstallControlsWarning';
import { getLatestCompatibleVersion, hasInstallControlWarning } from '../helpers';
import { useInstallStatus, useIsRemotePluginsAvailable } from '../state/hooks';
import { type CatalogPlugin, PluginStatus } from '../types';

interface Props {
  plugin?: CatalogPlugin;
}

type PluginSubtitleExtension = (props: Props) => JSX.Element | null;

const pluginSubtitleExtensions: PluginSubtitleExtension[] = [];

export const registerPluginSubtitleExtension = (extension: PluginSubtitleExtension) => {
  pluginSubtitleExtensions.push(extension);
};

export const PluginSubtitle = ({ plugin }: Props) => {
  const isRemotePluginsAvailable = useIsRemotePluginsAvailable();
  const styles = useStyles2(getStyles);
  const { error: errorInstalling } = useInstallStatus();
  if (!plugin) {
    return null;
  }

  // Narrow the `unknown`-typed `errorInstalling` (cascaded from RequestInfo.error: unknown in ../types.ts)
  // into concrete `string` title and `ReactNode` body for the Alert. The narrowing preserves the
  // original runtime semantics:
  //   - string error  -> body = the string, title = ''
  //   - object error with `message: string` -> title = message
  //   - object error with `error` property -> body = String(error) (covers string/number cases)
  // Anything else collapses to empty title and empty body (Alert is still rendered when the value
  // itself is truthy, matching the original `{errorInstalling && (...)}` check).
  let errorTitle = '';
  let errorBody: ReactNode = '';
  if (errorInstalling !== null && errorInstalling !== undefined) {
    if (typeof errorInstalling === 'string') {
      errorBody = errorInstalling;
    } else if (typeof errorInstalling === 'object') {
      if ('message' in errorInstalling && typeof errorInstalling.message === 'string') {
        errorTitle = errorInstalling.message;
      }
      if ('error' in errorInstalling) {
        const errorField: unknown = errorInstalling.error;
        if (typeof errorField === 'string' || typeof errorField === 'number') {
          errorBody = String(errorField);
        } else if (errorField !== null && errorField !== undefined) {
          // Render anything renderable (objects with toString, numbers, etc.) — preserve original
          // behavior of plopping `errorInstalling.error` directly into JSX. React will render
          // strings/numbers; objects would have caused a runtime error originally as well.
          errorBody = String(errorField);
        }
      }
    }
  }

  const latestCompatibleVersion = getLatestCompatibleVersion(plugin.details?.versions);
  const pluginStatus = plugin.isInstalled
    ? plugin.hasUpdate
      ? PluginStatus.UPDATE
      : PluginStatus.UNINSTALL
    : PluginStatus.INSTALL;

  return (
    <div className={styles.subtitle}>
      {errorInstalling != null && <Alert title={errorTitle}>{errorBody}</Alert>}
      <Stack direction="row" justifyContent="space-between">
        <div>
          {plugin?.description && <div>{plugin?.description}</div>}
          {hasInstallControlWarning(plugin, isRemotePluginsAvailable, latestCompatibleVersion) && (
            <InstallControlsWarning
              plugin={plugin}
              pluginStatus={pluginStatus}
              latestCompatibleVersion={latestCompatibleVersion}
            />
          )}
        </div>
        {pluginSubtitleExtensions.map((extension) => {
          return <Fragment key={extension.name}>{extension({ plugin })}</Fragment>;
        })}
      </Stack>
    </div>
  );
};

export const getStyles = (theme: GrafanaTheme2) => {
  return { subtitle: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1) }) };
};
