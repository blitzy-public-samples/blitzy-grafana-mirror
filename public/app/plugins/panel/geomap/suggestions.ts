import { VisualizationSuggestionScore, type VisualizationSuggestionsSupplier } from '@grafana/data';
import { type GraphFieldConfig } from '@grafana/ui';
import { getGeometryField, getDefaultLocationMatchers } from 'app/features/geo/utils/location';

import { type Options } from './panelcfg.gen';

export const geomapSuggestionsSupplier: VisualizationSuggestionsSupplier<Options, GraphFieldConfig> = (dataSummary) => {
  if (!dataSummary.hasData || !dataSummary.rawFrames) {
    return;
  }

  // use getGeometryField to see if any frames have geolocation info
  const location = getDefaultLocationMatchers();
  if (!dataSummary.rawFrames.some((frame) => !getGeometryField(frame, location).warning)) {
    return;
  }

  return [
    {
      score: VisualizationSuggestionScore.Best,
      fieldConfig: {
        defaults: {
          custom: {},
        },
        overrides: [],
      },
      cardOptions: {
        previewModifier: (s) => {
          s.options!.controls = {
            showZoom: false,
            showScale: false,
            showAttribution: false,
            showMeasure: false,
          };
          // FIXME: this doesn't work. I want to disable legends in the preview.
          s.options?.layers?.forEach((layer) => {
            // `layer.config` is `unknown` after the schema veneer's
            // `any -> unknown` change to `MapLayerOptions<TConfig>`. Build a
            // fresh `Record<string, unknown>` (preserving existing entries
            // when `layer.config` is a plain object) so we can attach
            // `showLegend` without a type assertion.
            let cfg: Record<string, unknown>;
            if (layer.config && typeof layer.config === 'object') {
              cfg = Object.fromEntries(Object.entries(layer.config));
            } else {
              cfg = {};
            }
            cfg.showLegend = false;
            layer.config = cfg;
          });
        },
      },
    },
  ];
};
