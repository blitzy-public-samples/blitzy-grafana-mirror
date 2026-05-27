import { isArray } from 'lodash';

import {
  type FieldConfigSource,
  MappingType,
  type PanelModel,
  type ValueMap,
  type RangeMap,
  type ValueMapping,
} from '@grafana/data';

import { type FieldConfig, type Options } from './panelcfg.gen';

/**
 * Subset of the legacy `natel-discrete-panel` angular options shape consumed by
 * the migration to state-timeline. Only the fields actually read by the
 * migration are typed; all other legacy properties are intentionally omitted
 * because they are ignored by the migration. Inner record fields are declared
 * as required (non-optional) to match the migration body, which assigns each
 * field directly to a `string`-typed local; runtime falsy guards in the body
 * (`if (color)`, `if (text && value)`) still catch any missing values produced
 * by older or partially-migrated dashboard JSON without altering behavior.
 */
interface LegacyDiscreteOptions {
  units?: string;
  colorMaps?: Array<{ color: string; text: string }>;
  valueMaps?: Array<{ op?: string; text: string; value: string }>;
  rangeMaps?: Array<{ from: string; to: string; text: string }>;
}

/**
 * Wrapper for the `prevOptions` argument of the panel-changed handler when
 * migrating from the angular `natel-discrete-panel`. The legacy options are
 * carried under the `angular` key.
 */
interface LegacyDiscretePrevOptions {
  angular?: LegacyDiscreteOptions;
}

/**
 * Permissive panel-model shape accepted by `timelinePanelChangedHandler`,
 * structurally compatible with both the SDK `PanelModel<Partial<Options>>` and
 * the looser dashboard `PanelModel` class used at the test call site (whose
 * `options` is declared as `{ [key: string]: any }`). Only the fields read or
 * written by the migration are typed.
 */
interface LegacyDiscretePanelModel {
  options?: Partial<Options>;
  fieldConfig?: FieldConfigSource;
}

// This is called when the panel changes from another panel
export const timelinePanelChangedHandler = (
  panel: PanelModel<Partial<Options>> | LegacyDiscretePanelModel,
  prevPluginId: string,
  prevOptions: LegacyDiscretePrevOptions
) => {
  let options: Partial<Options> = panel.options ?? {};

  // Changing from angular singlestat
  if (prevPluginId === 'natel-discrete-panel' && prevOptions.angular) {
    const oldOptions = prevOptions.angular;
    const fieldConfig: FieldConfigSource = panel.fieldConfig ?? { defaults: {}, overrides: [] };

    if (oldOptions.units) {
      fieldConfig.defaults.unit = oldOptions.units;
    }

    const custom: FieldConfig = {
      fillOpacity: 100,
      lineWidth: 0,
    };
    fieldConfig.defaults.custom = custom;
    options.mergeValues = true;

    // Convert mappings
    const valuemap: ValueMap = { type: MappingType.ValueToText, options: {} };
    fieldConfig.defaults.mappings = [valuemap];

    if (isArray(oldOptions.colorMaps)) {
      for (const p of oldOptions.colorMaps) {
        const color: string = p.color;
        if (color) {
          valuemap.options[p.text] = { color };
        }
      }
    }

    if (isArray(oldOptions.valueMaps)) {
      for (const p of oldOptions.valueMaps) {
        const text: string = p.text;
        const value: string = p.value;
        if (text && value) {
          let old = valuemap.options[value];
          if (old) {
            old.text = text;
          } else {
            valuemap.options[value] = { text };
          }
        }
      }
    }

    if (isArray(oldOptions.rangeMaps)) {
      for (const p of oldOptions.rangeMaps) {
        let from = +p.from;
        let to = +p.to;
        const text: string = p.text;
        if (text) {
          fieldConfig.defaults.mappings.push({
            type: MappingType.RangeToText,
            options: {
              from,
              to,
              result: { text },
            },
          });
        }
      }
    }

    if (fieldConfig.defaults.mappings?.length) {
      fieldConfig.defaults.mappings = expandColorMappings(fieldConfig.defaults.mappings);
    }

    // mutates the input
    panel.fieldConfig = fieldConfig;
  }

  return options;
};

function expandColorMappings(mappings: ValueMapping[]): ValueMapping[] {
  let keyToColor: Record<string, string> = {};
  for (const m of mappings) {
    if (isValueToText(m)) {
      for (const key in m.options) {
        const target = m.options[key];
        if (target.color?.length) {
          keyToColor[key] = target.color;
        }
      }
    } else if (isRangeMap(m)) {
      const { text, color } = m.options.result;
      if (text?.length && color?.length && !keyToColor[text]) {
        keyToColor[text] = color;
      }
    }
  }

  // Set a color for values that match
  return mappings.map((m) => {
    if (isValueToText(m)) {
      for (const key in m.options) {
        const target = m.options[key];
        if (!target.color?.length) {
          let c = keyToColor[key];
          if (!c && target.text) {
            c = keyToColor[target.text];
          }
          if (c) {
            target.color = c; // link the mapped color
          }
        }
      }
    } else if (isRangeMap(m)) {
      const { text, color } = m.options.result;
      if (!color && text && keyToColor[text]) {
        m.options.result.color = keyToColor[text];
      }
    }
    return m;
  });
}

function isValueToText(m: ValueMapping): m is ValueMap {
  return m.type === MappingType.ValueToText;
}

function isRangeMap(m: ValueMapping): m is RangeMap {
  return m.type === MappingType.RangeToText;
}
