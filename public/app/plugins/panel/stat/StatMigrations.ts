import { FieldColorModeId, type FieldConfigSource, type PanelModel } from '@grafana/data';
import { BigValueTextMode, BigValueGraphMode, BigValueColorMode } from '@grafana/schema';
import { sharedSingleStatPanelChangedHandler } from '@grafana/ui';

import { type Options } from './panelcfg.gen';

// This is called when the panel changes from another panel
export const statPanelChangedHandler = (
  panel: PanelModel<Partial<Options>>,
  prevPluginId: string,
  prevOptions: LegacySinglestatOptions
) => {
  // This handles most config changes
  const options: Options = sharedSingleStatPanelChangedHandler(panel, prevPluginId, prevOptions);

  // Changing from angular singlestat
  if (prevOptions.angular && (prevPluginId === 'singlestat' || prevPluginId === 'grafana-singlestat-panel')) {
    const oldOptions = prevOptions.angular;

    options.graphMode = BigValueGraphMode.None;
    if (oldOptions.sparkline && oldOptions.sparkline.show) {
      options.graphMode = BigValueGraphMode.Area;
    }

    if (oldOptions.colorBackground) {
      options.colorMode = BigValueColorMode.Background;
    } else if (oldOptions.colorValue) {
      options.colorMode = BigValueColorMode.Value;
    } else {
      options.colorMode = BigValueColorMode.None;
      if (oldOptions.sparkline?.lineColor && options.graphMode === BigValueGraphMode.Area) {
        const cfg: FieldConfigSource = panel.fieldConfig ?? {};
        cfg.defaults.color = {
          mode: FieldColorModeId.Fixed,
          fixedColor: oldOptions.sparkline.lineColor,
        };
        panel.fieldConfig = cfg;
      }
    }

    if (oldOptions.valueName === 'name') {
      options.textMode = BigValueTextMode.Name;
    }
  }

  return options;
};

/**
 * Shape of the legacy singlestat (angular) panel options that may be passed to
 * `statPanelChangedHandler` when migrating from the old `singlestat` /
 * `grafana-singlestat-panel` plugin. Only the properties the migration logic
 * actually reads are modeled here; the rest of `prevOptions` is forwarded to
 * `sharedSingleStatPanelChangedHandler` (which still accepts `any`).
 */
interface LegacySinglestatOptions {
  angular?: LegacySinglestatAngularOptions;
}

interface LegacySinglestatAngularOptions {
  format?: string;
  decimals?: number;
  sparkline?: {
    show?: boolean;
    lineColor?: string;
  };
  colorBackground?: boolean;
  colorValue?: boolean;
  valueName?: string;
}
