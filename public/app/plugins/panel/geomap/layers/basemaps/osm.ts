import type OpenLayersMap from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';

import { type MapLayerRegistryItem, type MapLayerOptions, type EventBus } from '@grafana/data';

// `MapLayerRegistryItem<TConfig>` defaults `TConfig` to `MapLayerOptions`, which
// makes the `create` callback expect `MapLayerOptions<MapLayerOptions<unknown>>`
// — a doubly-wrapped shape that does not match how OSM consumers actually pass
// options. Explicitly parameterize with `unknown` (OSM has no layer-specific
// config) so the callback receives the canonical `MapLayerOptions<unknown>`.
export const standard: MapLayerRegistryItem<unknown> = {
  id: 'osm-standard',
  name: 'Open Street Map',
  description: 'Add map from a collaborative free geographic world database',
  isBaseMap: true,

  /**
   * Function that configures transformation and returns a transformer
   * @param options
   */
  create: async (map: OpenLayersMap, options: MapLayerOptions<unknown>, eventBus: EventBus) => ({
    init: () => {
      const noRepeat = options.noRepeat ?? false;

      return new TileLayer({
        source: new OSM({ wrapX: !noRepeat }),
      });
    },
  }),
};

export const osmLayers = [standard];
