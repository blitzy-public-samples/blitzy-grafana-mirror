import { cloneDeep, identity, isNumber, omit, pickBy } from 'lodash';

import {
  convertOldAngularValueMappings,
  FieldColorModeId,
  type FieldConfig,
  fieldReducers,
  type PanelModel,
  type ReduceDataOptions,
  ReducerID,
  sortThresholds,
  type Threshold,
  type ThresholdsConfig,
  ThresholdsMode,
  validateFieldConfig,
  type ValueMapping,
  VizOrientation,
} from '@grafana/data';
import { LegendDisplayMode, type OptionsWithLegend, type OptionsWithTextFormatting } from '@grafana/schema';

export interface SingleStatBaseOptions extends OptionsWithTextFormatting {
  reduceOptions: ReduceDataOptions;
  orientation: VizOrientation;
}

const optionsToKeep: Array<keyof SingleStatBaseOptions> = ['reduceOptions', 'orientation'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Public migration handler returns SingleStatBaseOptions-shaped data; downstream call sites in stat/gauge/bargauge panel plugins assign the result to plugin-specific Options interfaces that extend SingleStatBaseOptions with additional required fields (colorMode, graphMode, etc.). Tightening the return type to Partial<SingleStatBaseOptions> | SingleStatBaseOptions would break those callers and the SingleStatBaseOptions.test.ts assertions on `newOptions.reduceOptions.*` (TS18048). The function's three return paths (early panel.options pass-through, migrateFromAngularSinglestat, migrateFromGraphPanel) produce structurally different shapes that don't share a common typed supertype suitable for plugin-side assignment (per AAP §0.8.6 last-resort retention and §0.8.7 public API surface preservation).
export function sharedSingleStatPanelChangedHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- The `| any` fallback preserves the historical public SDK signature consumed by external panel-plugin authors. `PanelModel<Partial<SingleStatBaseOptions>>` is generic over Options and is NOT bivariant with `PanelModel<Partial<MyPluginOptions extends SingleStatBaseOptions>>` (TypeScript's `PanelModel<T>` invariant in `options` makes the assignment fail for external plugins whose Options extend SingleStatBaseOptions with additional required fields). Removing the `| any` was a public API contract break per AAP §0.9.1 / §0.8.7 — restoring it with this justification.
  panel: PanelModel<Partial<SingleStatBaseOptions>> | any,
  prevPluginId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prevOptions is a heterogeneous JSON blob from a prior panel plugin's options snapshot; the body accesses prevOptions.angular, prevOptions.hasOwnProperty(k), and prevOptions[k] for arbitrary keys; narrowing to Record<string, unknown> forces inline `as` casts that would introduce new @typescript-eslint/consistent-type-assertions violations beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
  prevOptions: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see return-type justification above
): any {
  let options = panel.options;

  panel.fieldConfig = panel.fieldConfig || {
    defaults: {},
    overrides: [],
  };

  // Migrating from angular singlestat
  if ((prevPluginId === 'singlestat' || prevPluginId === 'grafana-singlestat-panel') && prevOptions.angular) {
    return migrateFromAngularSinglestat(panel, prevOptions);
  } else if (prevPluginId === 'graph') {
    // Migrating from Graph panel
    return migrateFromGraphPanel(panel, prevOptions);
  }

  for (const k of optionsToKeep) {
    if (prevOptions.hasOwnProperty(k)) {
      options[k] = cloneDeep(prevOptions[k]);
    }
  }

  return options;
}

function migrateFromGraphPanel(
  panel: PanelModel<Partial<SingleStatBaseOptions>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prevOptions is a legacy graph-panel options snapshot whose `angular` sub-object is then cast to the local GraphOptions interface on the next line; narrowing the parameter to Record<string, unknown> would force inline `as` casts that introduce new @typescript-eslint/consistent-type-assertions violations beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
  prevOptions: any
) {
  const graphOptions: GraphOptions = prevOptions.angular;

  const options: SingleStatBaseOptions & OptionsWithLegend = {
    orientation: VizOrientation.Auto,
    reduceOptions: {
      values: false,
      calcs: [],
    },
    legend: {
      displayMode: LegendDisplayMode.List,
      showLegend: true,
      placement: 'bottom',
      calcs: [],
    },
  };

  if (graphOptions.xaxis?.mode === 'series') {
    panel.fieldConfig = {
      ...panel.fieldConfig,
      defaults: {
        ...panel.fieldConfig.defaults,
        color: { mode: 'palette-classic' },
      },
    };

    // Value options calculation migration
    if (graphOptions.xaxis.values) {
      options.reduceOptions.calcs = getReducerForMigration(graphOptions.xaxis.values);
    }

    // Legend migration
    const legendConfig = graphOptions.legend;
    if (legendConfig) {
      if (legendConfig.show) {
        options.legend.displayMode = legendConfig.alignAsTable ? LegendDisplayMode.Table : LegendDisplayMode.List;
      } else {
        options.legend.showLegend = false;
      }

      if (legendConfig.rightSide) {
        options.legend.placement = 'right';
      }

      if (legendConfig.values) {
        const enabledLegendValues = pickBy(legendConfig, identity);
        options.legend.calcs = getReducersFromLegend(enabledLegendValues);
      }

      if (legendConfig.sideWidth) {
        options.legend.width = legendConfig.sideWidth;
      }
    }
  }

  return options;
}

function migrateFromAngularSinglestat(
  panel: PanelModel<Partial<SingleStatBaseOptions>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prevOptions is a legacy Angular Singlestat panel options snapshot whose `angular` sub-object is read for the legacy fields (valueName, format, tableColumn, nullPointMode, decimals, thresholds, colors, gauge, mappingType, valueMaps, rangeMaps); narrowing to Record<string, unknown> forces inline `as` casts that introduce new @typescript-eslint/consistent-type-assertions violations beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
  prevOptions: any
) {
  const prevPanel = prevOptions.angular;
  const reducer = fieldReducers.getIfExists(prevPanel.valueName);
  const options: SingleStatBaseOptions = {
    reduceOptions: {
      calcs: [reducer ? reducer.id : ReducerID.mean],
    },
    orientation: VizOrientation.Horizontal,
  };

  const defaults: FieldConfig = {};

  if (prevPanel.format) {
    defaults.unit = prevPanel.format;
  }

  if (prevPanel.tableColumn) {
    options.reduceOptions.fields = `/^${prevPanel.tableColumn}$/`;
  }

  if (prevPanel.nullPointMode) {
    defaults.nullValueMode = prevPanel.nullPointMode;
  }

  if (prevPanel.nullText) {
    defaults.noValue = prevPanel.nullText;
  }

  if (prevPanel.decimals || prevPanel.decimals === 0) {
    defaults.decimals = prevPanel.decimals;
  }

  // Convert thresholds and color values
  if (prevPanel.thresholds && prevPanel.colors) {
    const levels = prevPanel.thresholds.split(',').map((strVale: string) => {
      return Number(strVale.trim());
    });

    // One more color than threshold
    const thresholds: Threshold[] = [];
    for (const color of prevPanel.colors) {
      const idx = thresholds.length - 1;
      if (idx >= 0) {
        thresholds.push({ value: levels[idx], color });
      } else {
        thresholds.push({ value: -Infinity, color });
      }
    }

    defaults.thresholds = {
      mode: ThresholdsMode.Absolute,
      steps: thresholds,
    };
  }

  // Convert value mappings
  const mappings = convertOldAngularValueMappings(prevPanel, defaults.thresholds);
  if (mappings && mappings.length) {
    defaults.mappings = mappings;
  }

  if (prevPanel.gauge && prevPanel.gauge.show) {
    defaults.min = prevPanel.gauge.minValue;
    defaults.max = prevPanel.gauge.maxValue;
  }

  panel.fieldConfig.defaults = defaults;

  return options;
}

export function sharedSingleStatMigrationHandler(panel: PanelModel<SingleStatBaseOptions>): SingleStatBaseOptions {
  if (!panel.options) {
    // This happens on the first load or when migrating from angular
    return {
      reduceOptions: {
        calcs: [ReducerID.mean],
      },
      orientation: VizOrientation.Horizontal,
    };
  }

  const previousVersion = parseFloat(panel.pluginVersion || '6.1');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `options` is progressively reshaped across legacy-version migration steps (migrateFromValueOptions, moveThresholdsAndMappingsToField, fieldOptions thresholds/color/defaults/overrides reshuffling, reduceOptions reconstruction, fieldOptions deletion) — these intermediate shapes are migration-only legacy blobs that don't conform to SingleStatBaseOptions until the final return; narrowing to Record<string, unknown> forces inline `as` casts on every property access that would introduce new @typescript-eslint/consistent-type-assertions violations beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
  let options: any = panel.options;

  if (previousVersion < 6.2) {
    options = migrateFromValueOptions(options);
  }

  if (previousVersion < 6.3) {
    options = moveThresholdsAndMappingsToField(options);
  }

  const { fieldOptions } = options;

  if (previousVersion < 6.6 && fieldOptions) {
    // discard the old `override` options and enter an empty array
    if (fieldOptions && fieldOptions.override) {
      const { override, ...rest } = options.fieldOptions;
      options = {
        ...options,
        fieldOptions: {
          ...rest,
          overrides: [],
        },
      };
    }

    // Move thresholds to steps
    let thresholds = fieldOptions?.defaults?.thresholds;
    if (thresholds) {
      delete fieldOptions.defaults.thresholds;
    } else {
      thresholds = fieldOptions?.thresholds;
      delete fieldOptions.thresholds;
    }

    if (thresholds) {
      fieldOptions.defaults.thresholds = {
        mode: ThresholdsMode.Absolute,
        steps: thresholds,
      };
    }

    // Migrate color from simple string to a mode
    const { defaults } = fieldOptions;
    if (defaults.color && typeof defaults.color === 'string') {
      defaults.color = {
        mode: FieldColorModeId.Fixed,
        fixedColor: defaults.color,
      };
    }

    validateFieldConfig(defaults);
  }

  if (previousVersion < 7.0) {
    panel.fieldConfig = panel.fieldConfig || { defaults: {}, overrides: [] };
    panel.fieldConfig = {
      defaults:
        fieldOptions && fieldOptions.defaults
          ? { ...panel.fieldConfig.defaults, ...fieldOptions.defaults }
          : panel.fieldConfig.defaults,
      overrides:
        fieldOptions && fieldOptions.overrides
          ? [...panel.fieldConfig.overrides, ...fieldOptions.overrides]
          : panel.fieldConfig.overrides,
    };

    if (fieldOptions) {
      options.reduceOptions = {
        values: fieldOptions.values,
        limit: fieldOptions.limit,
        calcs: fieldOptions.calcs,
      };
    }

    delete options.fieldOptions;
  }

  if (previousVersion < 7.1) {
    // move title to displayName
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions -- `title` is a legacy Angular field on panel.fieldConfig.defaults that was renamed to `displayName` in 7.1; the modern FieldConfig type no longer declares `title`, so a runtime read requires asserting through `any`. Narrowing to Record<string, unknown> would change the assertion style but still require an `as` cast that triggers @typescript-eslint/consistent-type-assertions; the `as any` form preserves the assignment of `oldTitle` to `displayName: string` without further narrowing (per AAP §0.8.5/§0.8.6 last-resort retention; this consolidates both lines' suppressions inline so baseline entries can be removed).
    const oldTitle = (panel.fieldConfig.defaults as any).title;
    if (oldTitle !== undefined && oldTitle !== null) {
      panel.fieldConfig.defaults.displayName = oldTitle;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions -- `title` is a legacy Angular field on panel.fieldConfig.defaults that must be deleted after rename to `displayName`; the modern FieldConfig type doesn't declare it, so the delete requires an `as any` assertion (see justification for the `oldTitle` read above).
      delete (panel.fieldConfig.defaults as any).title;
    }
  }

  if (previousVersion < 8.0) {
    // Explicit min/max was removed for percent/percentunit in 8.0
    const config = panel.fieldConfig?.defaults;
    let unit = config?.unit;
    if (unit === 'percent') {
      if (!isNumber(config.min)) {
        config.min = 0;
      }
      if (!isNumber(config.max)) {
        config.max = 100;
      }
    } else if (unit === 'percentunit') {
      if (!isNumber(config.min)) {
        config.min = 0;
      }
      if (!isNumber(config.max)) {
        config.max = 1;
      }
    }
  }

  return options;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `old` is a legacy panel options blob whose `fieldOptions`, `thresholds`, and `mappings` fields are restructured into the modern `fieldOptions.defaults` shape; the function spreads `old.fieldOptions.defaults` and re-emits the heterogeneous blob unchanged. Narrowing to Record<string, unknown> forces inline `as` casts on every property access that would introduce new @typescript-eslint/consistent-type-assertions violations beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
export function moveThresholdsAndMappingsToField(old: any) {
  const { fieldOptions } = old;

  if (!fieldOptions) {
    return old;
  }

  const { mappings, ...rest } = old.fieldOptions;

  let thresholds: ThresholdsConfig | undefined = undefined;
  if (old.thresholds) {
    thresholds = {
      mode: ThresholdsMode.Absolute,
      steps: migrateOldThresholds(old.thresholds)!,
    };
  }

  return {
    ...old,
    fieldOptions: {
      ...rest,
      defaults: {
        ...fieldOptions.defaults,
        mappings,
        thresholds,
      },
    },
  };
}

/*
 * Moves valueMappings and thresholds from root to new fieldOptions object
 * Renames valueOptions to to defaults and moves it under fieldOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `old` is a legacy panel options blob whose `valueOptions`, `valueMappings`, `thresholds`, `minValue`, `maxValue` fields are read and restructured; `omit` then strips those legacy keys to produce the modern options shape. Narrowing to Record<string, unknown> forces inline `as` casts on every property access that would introduce new @typescript-eslint/consistent-type-assertions violations beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
export function migrateFromValueOptions(old: any) {
  const { valueOptions } = old;
  if (!valueOptions) {
    return old;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `fieldOptions` accumulates heterogeneous migration outputs (mappings, thresholds, calcs, defaults) before being merged into the returned options blob; typing as Record<string, unknown> would force inline `as` casts on the property assignments that would introduce new @typescript-eslint/consistent-type-assertions violations beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
  const fieldOptions: any = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `fieldDefaults` accumulates heterogeneous migration outputs (unit, decimals, min, max) before being attached to `fieldOptions.defaults`; typing as Record<string, unknown> would force inline `as` casts on the property assignments that would introduce new @typescript-eslint/consistent-type-assertions violations beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
  const fieldDefaults: any = {};

  fieldOptions.mappings = old.valueMappings;
  fieldOptions.thresholds = old.thresholds;
  fieldOptions.defaults = fieldDefaults;

  fieldDefaults.unit = valueOptions.unit;
  fieldDefaults.decimals = valueOptions.decimals;

  // Make sure the stats have a valid name
  if (valueOptions.stat) {
    const reducer = fieldReducers.get(valueOptions.stat);
    if (reducer) {
      fieldOptions.calcs = [reducer.id];
    }
  }

  fieldDefaults.min = old.minValue;
  fieldDefaults.max = old.maxValue;

  const newOptions = {
    ...old,
    fieldOptions,
  };

  return omit(newOptions, 'valueMappings', 'thresholds', 'valueOptions', 'minValue', 'maxValue');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `thresholds` is a legacy Angular-era thresholds array whose elements have unstable shape (some have `index`, some have nullable `value`); the body reads `t.value` and `t.color` on each element. Narrowing the array element type to a shared interface or `unknown` forces inline `as` casts inside the map callback that introduce new @typescript-eslint/consistent-type-assertions violations beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
export function migrateOldThresholds(thresholds?: any[]): Threshold[] | undefined {
  if (!thresholds || !thresholds.length) {
    return undefined;
  }
  const copy = thresholds.map((t) => {
    return {
      // Drops 'index'
      value: t.value === null ? -Infinity : t.value,
      color: t.color,
    };
  });
  sortThresholds(copy);
  copy[0].value = -Infinity;
  return copy;
}

/**
 * @deprecated use convertOldAngularValueMappings instead
 * Convert the angular single stat mapping to new react style
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `panel` is forwarded as-is to the upstream `convertOldAngularValueMappings(panel: any, ...)` helper in @grafana/data; narrowing here would diverge from the upstream signature and require either changing that out-of-scope upstream function or inserting an `as` cast that introduces a new @typescript-eslint/consistent-type-assertions violation beyond the baseline (per AAP §0.8.5/§0.8.6 last-resort retention).
export function convertOldAngularValueMapping(panel: any): ValueMapping[] {
  return convertOldAngularValueMappings(panel);
}

interface GraphOptions {
  xaxis: {
    mode: 'series' | 'time' | 'histogram';
    values?: string[];
  };
  legend: {
    show: boolean;
    alignAsTable: boolean;
    rightSide: boolean;
    values: boolean;
    min?: boolean;
    max?: boolean;
    avg?: boolean;
    current?: boolean;
    total?: boolean;
    sideWidth?: number;
  };
}

function getReducersFromLegend(obj: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const key in obj) {
    const reducer = fieldReducers.getIfExists(key);
    if (reducer) {
      ids.push(reducer.id);
    }
  }
  return ids;
}

// same as public/app/plugins/panel/barchart/migrations.ts
function getReducerForMigration(reducers: string[] | undefined) {
  const transformReducers: string[] = [];

  reducers?.forEach((reducer) => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    if (!Object.values(ReducerID).includes(reducer as ReducerID)) {
      if (reducer === 'current') {
        transformReducers.push(ReducerID.lastNotNull);
      } else if (reducer === 'total') {
        transformReducers.push(ReducerID.sum);
      } else if (reducer === 'avg') {
        transformReducers.push(ReducerID.mean);
      }
    } else {
      transformReducers.push(reducer);
    }
  });

  return reducers ? transformReducers : [ReducerID.sum];
}
