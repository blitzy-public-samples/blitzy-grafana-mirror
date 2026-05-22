/* eslint-disable @typescript-eslint/no-explicit-any --
 * Retained `any` annotations in this file are genuinely unresolvable per
 * AAP §0.6.2 / §0.9.2.7. DashboardMigrator processes historical dashboard
 * JSON spanning 40+ legacy schema versions; each version's input panels,
 * data links, value mappings, and grid-position records are a distinct
 * legacy shape that predates the current Dashboard/Panel/DataLink schemas.
 *
 * Migration handlers (`updateSchema`, `panelUpgrades.push((panel: any) => …)`,
 * `upgradeToGridLayout`, `addPanel`, `getPanelPosition`, `upgradePanelLink`,
 * `upgradeValueMappings`) must accept the open union of every historical
 * schema's panel/link/mapping format. Authoring 40+ separate legacy interfaces
 * per concrete migration step would balloon this file without improving
 * runtime correctness — the code intentionally uses dynamic property access
 * and feature-detection narrowing to read and rewrite legacy fields.
 *
 * The retained `any` here is the documented "last resort" path in AAP §0.8.6
 * step 7: untyped legacy data structures whose shape cannot be enumerated
 * without breaking runtime parity. Each handler treats its input as an opaque
 * legacy shape and emits a typed result that flows into the current
 * `PanelModel` / `DashboardModel` types.
 */
import { each, find, findIndex, flattenDeep, isArray, isString, map, max, some } from 'lodash';

import {
  type AnnotationQuery,
  type DataLink,
  DataLinkBuiltInVars,
  type DataQuery,
  type DataSourceRef,
  type FieldConfigSource,
  FieldMatcherID,
  FieldType,
  getActiveThreshold,
  getDataSourceRef,
  isDataSourceRef,
  isEmptyObject,
  MappingType,
  type ReducerID,
  SpecialValueMatch,
  standardEditorsRegistry,
  standardFieldConfigEditorRegistry,
  type ThresholdsConfig,
  urlUtil,
  type ValueMap,
  type ValueMapping,
  VariableHide,
} from '@grafana/data';
import { labelsToFieldsTransformer, mergeTransformer } from '@grafana/data/internal';
import { getDataSourceSrv, setDataSourceSrv } from '@grafana/runtime';
import { type DataTransformerConfig, type VariableModel, type VariableType } from '@grafana/schema';
import { AxisPlacement, type GraphFieldConfig } from '@grafana/ui';
import { migrateTableDisplayModeToCellOptions } from '@grafana/ui/internal';
import { getAllOptionEditors, getAllStandardFieldConfigs } from 'app/core/components/OptionsUI/registry';
import {
  DEFAULT_PANEL_SPAN,
  DEFAULT_ROW_HEIGHT,
  GRID_CELL_HEIGHT,
  GRID_CELL_VMARGIN,
  GRID_COLUMN_COUNT,
  MIN_PANEL_HEIGHT,
} from 'app/core/constants';
import getFactors from 'app/core/utils/factors';
import kbn from 'app/core/utils/kbn';
import { DatasourceSrv } from 'app/features/plugins/datasource_srv';
import {
  type RefIdTransformerOptions,
  type TimeSeriesTableTransformerOptions,
} from 'app/features/transformers/timeSeriesTable/timeSeriesTableTransformer';
import { alignCurrentWithMulti } from 'app/features/variables/shared/multiOptions';
import { type CloudWatchMetricsQuery } from 'app/plugins/datasource/cloudwatch/dataquery.gen';
import { type LegacyAnnotationQuery } from 'app/plugins/datasource/cloudwatch/types';
import { MIXED_DATASOURCE_NAME } from 'app/plugins/datasource/mixed/MixedDataSource';

import {
  migrateCloudWatchQuery,
  migrateMultipleStatsAnnotationQuery,
  migrateMultipleStatsMetricsQuery,
} from '../../../plugins/datasource/cloudwatch/migrations/dashboardMigrations';

import { type DashboardModel } from './DashboardModel';
import { PanelModel } from './PanelModel';
import { getPanelPluginToMigrateTo } from './getPanelPluginToMigrateTo';

standardEditorsRegistry.setInit(getAllOptionEditors);
standardFieldConfigEditorRegistry.setInit(getAllStandardFieldConfigs);

type PanelSchemeUpgradeHandler = (panel: PanelModel) => PanelModel;

/**
 * The current version of the dashboard schema.
 *
 * NOTE: Schema version 42 is the FINAL version for the v1 dashboard API.
 * DO NOT increment this number or add new schema migrations.
 *
 * This is necessary due to the migration of the legacy dashboards API to the app platform.
 *
 * For panel-specific migrations, implement them as panel migrations in the
 * individual panel plugin migration handlers instead of adding new schema versions.
 *
 * Legacy migration instructions (for reference only):
 * To add a dashboard migration increment this number
 * and then add your migration at the bottom of 'updateSchema'
 * hint: search "Add migration here"
 *
 * This number also needs to be updated on the CUE schema:
 * kinds/dashboard/dashboard_kind.cue
 * Example PR: #87712
 */
export const DASHBOARD_SCHEMA_VERSION = 42;
export class DashboardMigrator {
  dashboard: DashboardModel;

  constructor(dashboardModel: DashboardModel) {
    this.dashboard = dashboardModel;

    // for tests to pass
    if (!getDataSourceSrv()) {
      setDataSourceSrv(new DatasourceSrv());
    }
  }

  updateSchema(old: any, targetSchemaVersion?: number) {
    let i, j, k, n;
    const oldVersion = this.dashboard.schemaVersion;
    const panelUpgrades: PanelSchemeUpgradeHandler[] = [];
    const finalTargetVersion = targetSchemaVersion || DASHBOARD_SCHEMA_VERSION;

    if (oldVersion === finalTargetVersion) {
      return;
    }

    // version 2 schema changes
    if (oldVersion < 2 && finalTargetVersion >= 2) {
      if (old.services) {
        if (old.services.filter) {
          this.dashboard.time = old.services.filter.time;
          this.dashboard.templating.list = old.services.filter.list || [];
        }
      }

      // we used to have graphite panel type migration logic here
      // but this is handled by auto migration, see public/app/features/dashboard/state/getPanelPluginToMigrateTo.ts
    }

    // schema version 3 changes
    if (oldVersion < 3 && finalTargetVersion >= 3) {
      // Panel ID assignment is now handled by ensurePanelsHaveUniqueIds() in DashboardModel
      // and the grid layout migration properly handles panels without IDs in rows
    }

    // schema version 4 changes
    if (oldVersion < 4 && finalTargetVersion >= 4) {
      // graph migration is handled through the auto migration
      // see autoMigrateAngular map in public/app/features/dashboard/state/PanelModel.ts
    }

    if (oldVersion < 6 && finalTargetVersion >= 6) {
      // move drop-downs to new schema
      const annotations = find(old.pulldowns, { type: 'annotations' });

      if (annotations) {
        this.dashboard.annotations = {
          list: annotations.annotations || [],
        };
      }

      // update template variables
      for (i = 0; i < this.dashboard.templating.list.length; i++) {
        // V0-V5 dashboards used a 'filter' type literal and an 'allFormat' field on
        // template variables that were both removed from the VariableModel schema
        // before V6. Widen the iteration target via a local cast so the migrator can
        // detect/replace these legacy values; runtime semantics are unchanged.
        // `Omit<VariableModel, 'type'>` is required (rather than a plain intersection)
        // so the `type` field can be widened to include the V0 'filter' literal — a
        // direct intersection would narrow `type` to its original `VariableType` value
        // because intersection of property types is an intersection, not a union.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- legitimate schema-migration boundary: legacy V0-V5 field access
        const variable = this.dashboard.templating.list[i] as Omit<VariableModel, 'type'> & {
          type: VariableType | 'filter';
          allFormat?: string;
        };
        if (variable.datasource === void 0) {
          variable.datasource = null;
        }
        if (variable.type === 'filter') {
          variable.type = 'query';
        }
        if (variable.type === void 0) {
          variable.type = 'query';
        }
        if (variable.allFormat === void 0) {
          delete variable.allFormat;
        }
      }
    }

    if (oldVersion < 7 && finalTargetVersion >= 7) {
      if (old.nav && old.nav.length) {
        this.dashboard.timepicker = old.nav[0];
      }
    }

    if (oldVersion < 8 && finalTargetVersion >= 8) {
      panelUpgrades.push((panel: any) => {
        each(panel.targets, (target) => {
          // update old influxdb query schema
          if (target.fields && target.tags && target.groupBy) {
            if (target.rawQuery) {
              delete target.fields;
              delete target.fill;
            } else {
              target.select = map(target.fields, (field) => {
                const parts = [];
                parts.push({ type: 'field', params: [field.name] });
                parts.push({ type: field.func, params: [] });
                if (field.mathExpr) {
                  parts.push({ type: 'math', params: [field.mathExpr] });
                }
                if (field.asExpr) {
                  parts.push({ type: 'alias', params: [field.asExpr] });
                }
                return parts;
              });
              delete target.fields;
              each(target.groupBy, (part) => {
                if (part.type === 'time' && part.interval) {
                  part.params = [part.interval];
                  delete part.interval;
                }
                if (part.type === 'tag' && part.key) {
                  part.params = [part.key];
                  delete part.key;
                }
              });

              if (target.fill) {
                target.groupBy.push({ type: 'fill', params: [target.fill] });
                delete target.fill;
              }
            }
          }
        });

        return panel;
      });
    }

    // schema version 9 changes
    if (oldVersion < 9 && finalTargetVersion >= 9) {
      // singlestat panel is automigrated to stat panel
      // see autoMigrateAngular map in public/app/features/dashboard/state/PanelModel.ts
    }

    // schema version 10 changes
    if (oldVersion < 10 && finalTargetVersion >= 10) {
      // move aliasYAxis changes
      panelUpgrades.push((panel: any) => {
        if (panel.type !== 'table') {
          return panel;
        }

        each(panel.styles, (style) => {
          if (style.thresholds && style.thresholds.length >= 3) {
            const k = style.thresholds;
            k.shift();
            style.thresholds = k;
          }
        });

        return panel;
      });
    }

    if (oldVersion < 12 && finalTargetVersion >= 12) {
      // update template variables
      each(this.dashboard.getVariables(), (templateVariable) => {
        if ('refresh' in templateVariable) {
          if (templateVariable.refresh) {
            templateVariable.refresh = 1;
          }
          if (!templateVariable.refresh) {
            templateVariable.refresh = 0;
          }
        }
        if ('hideVariable' in templateVariable && templateVariable.hideVariable) {
          templateVariable.hide = 2;
        } else if ('hideLabel' in templateVariable && templateVariable.hideLabel) {
          templateVariable.hide = 1;
        }
      });
    }

    if (oldVersion < 13 && finalTargetVersion >= 13) {
      // graph panel auto migrates to either barchart, bargauge, histogram or timeseries (all standard Grafana plugins)
      // see public/app/features/dashboard/state/getPanelPluginToMigrateTo.ts
    }

    if (oldVersion < 14 && finalTargetVersion >= 14) {
      this.dashboard.graphTooltip = old.sharedCrosshair ? 1 : 0;
    }

    if (oldVersion < 16 && finalTargetVersion >= 16) {
      this.upgradeToGridLayout(old);
    }

    if (oldVersion < 17 && finalTargetVersion >= 17) {
      panelUpgrades.push((panel: any) => {
        if (panel.minSpan) {
          const max = GRID_COLUMN_COUNT / panel.minSpan;
          const factors = getFactors(GRID_COLUMN_COUNT);
          // find the best match compared to factors
          // (ie. [1,2,3,4,6,12,24] for 24 columns)
          panel.maxPerRow =
            factors[
              findIndex(factors, (o) => {
                return o > max;
              }) - 1
            ];
        }

        delete panel.minSpan;

        return panel;
      });
    }

    if (oldVersion < 18 && finalTargetVersion >= 18) {
      // migrate change to gauge options
      panelUpgrades.push((panel: any) => {
        if (panel['options-gauge']) {
          panel.options = panel['options-gauge'];
          panel.options.valueOptions = {
            unit: panel.options.unit,
            stat: panel.options.stat,
            decimals: panel.options.decimals,
            prefix: panel.options.prefix,
            suffix: panel.options.suffix,
          };

          // correct order
          if (panel.options.thresholds) {
            panel.options.thresholds.reverse();
          }

          // this options prop was due to a bug
          delete panel.options.options;
          delete panel.options.unit;
          delete panel.options.stat;
          delete panel.options.decimals;
          delete panel.options.prefix;
          delete panel.options.suffix;
          delete panel['options-gauge'];
        }

        return panel;
      });
    }

    if (oldVersion < 19 && finalTargetVersion >= 19) {
      // migrate change to gauge options
      panelUpgrades.push((panel: any) => {
        if (panel.links && isArray(panel.links)) {
          panel.links = panel.links.map(upgradePanelLink);
        }

        return panel;
      });
    }

    if (oldVersion < 20 && finalTargetVersion >= 20) {
      const updateLinks = (link: DataLink) => {
        return {
          ...link,
          url: updateVariablesSyntax(link.url),
        };
      };
      panelUpgrades.push((panel: any) => {
        // For graph panel
        if (panel.options && panel.options.dataLinks && isArray(panel.options.dataLinks)) {
          panel.options.dataLinks = panel.options.dataLinks.map(updateLinks);
        }

        // For panel with fieldOptions
        if (panel.options && panel.options.fieldOptions && panel.options.fieldOptions.defaults) {
          if (panel.options.fieldOptions.defaults.links && isArray(panel.options.fieldOptions.defaults.links)) {
            panel.options.fieldOptions.defaults.links = panel.options.fieldOptions.defaults.links.map(updateLinks);
          }
          if (panel.options.fieldOptions.defaults.title) {
            panel.options.fieldOptions.defaults.title = updateVariablesSyntax(
              panel.options.fieldOptions.defaults.title
            );
          }
        }

        return panel;
      });
    }

    if (oldVersion < 21 && finalTargetVersion >= 21) {
      const updateLinks = (link: DataLink) => {
        return {
          ...link,
          url: link.url.replace(/__series.labels/g, '__field.labels'),
        };
      };
      panelUpgrades.push((panel: any) => {
        // For graph panel
        if (panel.options && panel.options.dataLinks && isArray(panel.options.dataLinks)) {
          panel.options.dataLinks = panel.options.dataLinks.map(updateLinks);
        }

        // For panel with fieldOptions
        if (panel.options && panel.options.fieldOptions && panel.options.fieldOptions.defaults) {
          if (panel.options.fieldOptions.defaults.links && isArray(panel.options.fieldOptions.defaults.links)) {
            panel.options.fieldOptions.defaults.links = panel.options.fieldOptions.defaults.links.map(updateLinks);
          }
        }

        return panel;
      });
    }

    if (oldVersion < 22 && finalTargetVersion >= 22) {
      panelUpgrades.push((panel: any) => {
        if (panel.type !== 'table') {
          return panel;
        }

        each(panel.styles, (style) => {
          style.align = 'auto';
        });

        return panel;
      });
    }

    if (oldVersion < 23 && finalTargetVersion >= 23) {
      for (const variable of this.dashboard.templating.list) {
        // The `isMulti` type guard from `@grafana/data` narrows to that package's
        // `VariableWithMultiSupport`, but the loop variable is typed against
        // `@grafana/schema`'s `VariableModel`. The two packages declare nominally
        // distinct `VariableHide` enums, so the intersection collapses to `never`
        // and downstream property accesses fail to typecheck. Replicate the
        // runtime semantics of `isMulti` (presence of the `multi` key) inline so
        // narrowing is performed against the schema-typed shape — this preserves
        // behavior without depending on the cross-package type guard.
        if (!('multi' in variable) || variable.multi == null) {
          continue;
        }
        const { multi, current } = variable;
        if (current == null || isEmptyObject(current)) {
          continue;
        }
        // `alignCurrentWithMulti` is typed against `@grafana/data`'s `VariableOption`,
        // which requires `selected: boolean`; `@grafana/schema`'s `VariableOption`
        // (the type of `variable.current` here) has `selected?: boolean`. The cast
        // is benign because `alignCurrentWithMulti` only reads `value` and `text` —
        // the `selected` field is never consumed by the migration. We deliberately
        // avoid injecting a default `selected` value because that would change
        // observable behavior: callers (and tests) deep-equal the resulting
        // `current` object and expect the field set to match the input.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- schema `VariableOption.selected?: boolean` vs data `VariableOption.selected: boolean`; structurally compatible and `selected` is unused
        variable.current = alignCurrentWithMulti(current as Parameters<typeof alignCurrentWithMulti>[0], multi);
      }
    }

    if (oldVersion < 24 && finalTargetVersion >= 24) {
      // 7.0
      // - migrate existing tables to 'table-old'
      panelUpgrades.push((panel: any) => {
        const wasAngularTable = panel.type === 'table';
        if (wasAngularTable && !panel.styles) {
          return panel; // styles are missing so assumes default settings
        }
        const wasReactTable = panel.table === 'table2';
        if (!wasAngularTable || wasReactTable) {
          return panel;
        }
        panel.type = wasAngularTable ? 'table-old' : 'table';
        // Hacky way to call the automigrate feature
        if (panel.type === 'table-old') {
          const newType = getPanelPluginToMigrateTo(panel);
          if (newType) {
            panel.autoMigrateFrom = panel.type;
            panel.type = newType;
          }
        }
        return panel;
      });
    }

    if (oldVersion < 25 && finalTargetVersion >= 25) {
      // tags are removed in version 28
    }

    if (oldVersion < 26 && finalTargetVersion >= 26) {
      panelUpgrades.push((panel: PanelModel) => {
        const wasReactText = panel.type === 'text2';
        if (!wasReactText) {
          return panel;
        }

        panel.type = 'text';
        delete panel.options.angular;
        return panel;
      });
    }

    if (oldVersion < 27 && finalTargetVersion >= 27) {
      // remove old repeated panel left-overs
      this.removeRepeatedPanels();

      // The legacy `isConstant` type guard narrows to `@grafana/data`'s
      // `ConstantVariableModel`, but the loop variable is typed against
      // `@grafana/schema`'s `VariableModel`. The two packages declare nominally
      // distinct `VariableHide` enums, so the intersection collapses to `never`
      // and the spread on the narrowed variable fails to typecheck. Replicate
      // the runtime semantics of `isConstant` (a discriminator check on the
      // `type` field) inline so narrowing happens within the schema-typed
      // shape; the migration result is then assigned back to the typed
      // templating list via a single justified cast at the boundary.
      const migrated = this.dashboard.templating.list.map((variable) => {
        if (variable.type !== 'constant') {
          return variable;
        }

        // Spread the schema-typed VariableModel into a new object and populate the
        // fields the V27 migration requires (`current`, `options`, optionally a
        // 'textbox' type literal). Type inference is used here rather than an
        // explicit `ConstantVariableModel | TextBoxVariableModel` annotation
        // because those `@grafana/data` types extend `BaseVariableModel` (with
        // required `id`, `state`, etc.) which the schema-typed `variable` does
        // not satisfy in a strictly typed sense, while remaining structurally
        // compatible at runtime. Constant-variable `query` is historically a
        // string at runtime even though the schema permits a wider union; the
        // narrowing below preserves prior runtime behavior.
        const queryString = typeof variable.query === 'string' ? variable.query : '';
        const newCurrent = { selected: true, text: queryString, value: queryString };
        const withOptions = {
          ...variable,
          current: newCurrent,
          options: [newCurrent],
        };

        if (variable.hide === VariableHide.dontHide || variable.hide === VariableHide.hideLabel) {
          return {
            ...withOptions,
            type: 'textbox' as const,
          };
        }

        return withOptions;
      });
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- migration boundary: V27 emits objects shaped as ConstantVariableModel/TextBoxVariableModel that are structurally compatible with @grafana/schema's VariableModel at runtime
      this.dashboard.templating.list = migrated as VariableModel[];
    }

    if (oldVersion < 28 && finalTargetVersion >= 28) {
      for (const v of this.dashboard.templating.list) {
        // The `tags`, `tagsQuery`, `tagValuesQuery`, and `useTags` fields were
        // removed from the VariableModel schema in V28. The migrator
        // legitimately needs to detect and delete these legacy properties when
        // upgrading dashboards from V27 or earlier. Widen via a local cast so
        // the property accesses below typecheck; runtime semantics are
        // unchanged.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- legitimate schema-migration boundary: legacy pre-V28 field access
        const variable = v as VariableModel & {
          tags?: unknown;
          tagsQuery?: unknown;
          tagValuesQuery?: unknown;
          useTags?: unknown;
        };
        if (variable.tags) {
          delete variable.tags;
        }

        if (variable.tagsQuery) {
          delete variable.tagsQuery;
        }

        if (variable.tagValuesQuery) {
          delete variable.tagValuesQuery;
        }

        if (variable.useTags) {
          delete variable.useTags;
        }
      }
    }

    if (oldVersion < 29 && finalTargetVersion >= 29) {
      for (const variable of this.dashboard.templating.list) {
        if (variable.type !== 'query') {
          continue;
        }

        if (variable.refresh !== 1 && variable.refresh !== 2) {
          variable.refresh = 1;
        }

        if (variable.options?.length) {
          variable.options = [];
        }
      }
    }

    if (oldVersion < 30 && finalTargetVersion >= 30) {
      panelUpgrades.push(upgradeValueMappingsForPanel);
      panelUpgrades.push(migrateTooltipOptions);
    }

    if (oldVersion < 31 && finalTargetVersion >= 31) {
      panelUpgrades.push((panel: PanelModel) => {
        if (panel.transformations) {
          for (const t of panel.transformations) {
            if (t.id === labelsToFieldsTransformer.id) {
              return appendTransformerAfter(panel, labelsToFieldsTransformer.id, {
                id: mergeTransformer.id,
                options: {},
              });
            }
          }
        }
        return panel;
      });
    }

    if (oldVersion < 32 && finalTargetVersion >= 32) {
      // CloudWatch migrations have been moved to version 34
    }

    // Replace datasource name with reference, uid and type
    if (oldVersion < 33 && finalTargetVersion >= 33) {
      panelUpgrades.push((panel) => {
        panel.datasource = migrateDatasourceNameToRef(panel.datasource, { returnDefaultAsNull: true });

        if (!panel.targets) {
          return panel;
        }

        for (const target of panel.targets) {
          const targetRef = migrateDatasourceNameToRef(target.datasource, { returnDefaultAsNull: true });
          if (targetRef != null) {
            target.datasource = targetRef;
          }
        }

        return panel;
      });
    }

    if (oldVersion < 34 && finalTargetVersion >= 34) {
      panelUpgrades.push((panel: PanelModel) => {
        this.migrateCloudWatchQueries(panel);
        return panel;
      });

      this.migrateCloudWatchAnnotationQuery();
    }

    if (oldVersion < 35 && finalTargetVersion >= 35) {
      panelUpgrades.push(ensureXAxisVisibility);
    }

    if (oldVersion < 36 && finalTargetVersion >= 36) {
      // Migrate datasource to refs in annotations
      for (const query of this.dashboard.annotations.list) {
        query.datasource = migrateDatasourceNameToRef(query.datasource, { returnDefaultAsNull: false });
      }

      // Migrate datasource: null to current default
      const defaultDs = getDataSourceSrv().getInstanceSettings(null);
      if (defaultDs) {
        for (const variable of this.dashboard.templating.list) {
          if (variable.type === 'query' && variable.datasource === null) {
            variable.datasource = getDataSourceRef(defaultDs);
          }
        }

        panelUpgrades.push((panel: PanelModel) => {
          if (panel.targets) {
            let panelDataSourceWasDefault = false;
            if (panel.datasource == null && panel.targets.length > 0) {
              panel.datasource = getDataSourceRef(defaultDs);
              panelDataSourceWasDefault = true;
            }

            for (const target of panel.targets) {
              if (target.datasource == null || target.datasource.uid == null) {
                if (panel.datasource?.uid !== MIXED_DATASOURCE_NAME) {
                  target.datasource = { ...panel.datasource };
                } else {
                  target.datasource = migrateDatasourceNameToRef(target.datasource, { returnDefaultAsNull: false });
                }
              }

              if (panelDataSourceWasDefault && target.datasource?.uid !== '__expr__') {
                // We can have situations when default ds changed and the panel level data source is different from the queries
                // In this case we use the query level data source as source for truth
                panel.datasource = target.datasource;
              }
            }
          }
          return panel;
        });
      }
    }

    if (oldVersion < 37 && finalTargetVersion >= 37) {
      panelUpgrades.push((panel: PanelModel) => {
        if (panel.options?.legend && typeof panel.options.legend === 'object') {
          // There were two ways to hide the legend, this normalizes to `legend.showLegend`
          if (panel.options.legend.displayMode === 'hidden' || panel.options.legend.showLegend === false) {
            panel.options.legend.displayMode = 'list';
            panel.options.legend.showLegend = false;
          } else {
            panel.options.legend = { ...panel.options.legend, showLegend: true };
          }
        }

        return panel;
      });
    }

    // Update old table cell display configuration to the new
    // format which uses an object for configuration
    if (oldVersion < 38 && finalTargetVersion >= 38) {
      panelUpgrades.push((panel: PanelModel) => {
        if (panel.type === 'table' && panel.fieldConfig !== undefined) {
          const displayMode = panel.fieldConfig.defaults?.custom?.displayMode;

          // Update field configuration
          if (displayMode !== undefined) {
            // Migrate any options for the panel
            panel.fieldConfig.defaults.custom.cellOptions = migrateTableDisplayModeToCellOptions(displayMode);

            // Delete the legacy field
            delete panel.fieldConfig.defaults.custom.displayMode;
          }

          // Update any overrides referencing the cell display mode
          if (panel.fieldConfig?.overrides) {
            for (const override of panel.fieldConfig.overrides) {
              for (let j = 0; j < (override.properties?.length || 0); j++) {
                let overrideDisplayMode = override.properties[j].value;
                if (override.properties[j].id === 'custom.displayMode') {
                  override.properties[j].id = 'custom.cellOptions';
                  override.properties[j].value = migrateTableDisplayModeToCellOptions(overrideDisplayMode);
                }
              }
            }
          }
        }

        return panel;
      });
    }

    // Update the configuration of the Timeseries to table transformation
    // to support multiple options per query
    if (oldVersion < 39 && finalTargetVersion >= 39) {
      panelUpgrades.push((panel: PanelModel) => {
        panel.transformations?.forEach((transformation) => {
          // If we run into a timeSeriesTable transformation
          // and it doesn't have undefined options then we migrate
          if (
            transformation.id === 'timeSeriesTable' &&
            transformation.options !== undefined &&
            transformation.options.refIdToStat !== undefined
          ) {
            let tableTransformOptions: TimeSeriesTableTransformerOptions = {};

            // For each {refIdtoStat} record which maps refId to a statistic
            // we add that to the stat property of the new
            // RefIdTransformerOptions interface which includes multiple settings
            for (const [refId, stat] of Object.entries(transformation.options.refIdToStat)) {
              let newSettings: RefIdTransformerOptions = {};
              // In this case the easiest way is just to do a type
              // assertion as iterated entries have unknown types
              newSettings.stat = stat as ReducerID;
              tableTransformOptions[refId] = newSettings;
            }

            // Update the options
            transformation.options = tableTransformOptions;
          }
        });

        return panel;
      });
    }

    if (oldVersion < 40 && finalTargetVersion >= 40) {
      // In old dashboards refresh property can be a boolean
      if (typeof this.dashboard.refresh !== 'string') {
        this.dashboard.refresh = '';
      }
    }

    if (oldVersion < 41 && finalTargetVersion >= 41) {
      // time_options is a legacy property that was not used since grafana version 5
      //  therefore deprecating this property from the schema
      if ('time_options' in this.dashboard.timepicker) {
        delete this.dashboard.timepicker.time_options;
      }
    }

    if (oldVersion < 42 && finalTargetVersion >= 42) {
      panelUpgrades.push(migrateHideFromFunctionality);
    }

    /**
     * ⚠️  WARNING: DO NOT ADD NEW MIGRATIONS HERE ⚠️
     *
     * Schema version 42 is the FINAL version for the v1 dashboard API.
     * This is due to the migration of the legacy dashboards API to the app platform.
     *
     * For panel-specific migrations, implement them as panel migrations in the
     * individual panel plugin migration handlers instead of adding new schema versions.
     */

    // Apply panel upgrades if any exist
    if (panelUpgrades.length > 0) {
      for (j = 0; j < this.dashboard.panels.length; j++) {
        for (k = 0; k < panelUpgrades.length; k++) {
          this.dashboard.panels[j] = panelUpgrades[k].call(this, this.dashboard.panels[j]);
          const rowPanels = this.dashboard.panels[j].panels;
          if (rowPanels) {
            for (n = 0; n < rowPanels.length; n++) {
              rowPanels[n] = panelUpgrades[k].call(this, rowPanels[n]);
            }
          }
        }
      }
    }

    // Always update schema version after migrations, regardless of panel upgrades
    // Only update schema version if migrations were actually needed
    if (oldVersion < finalTargetVersion) {
      this.dashboard.schemaVersion = finalTargetVersion;
    }
  }

  private removeRepeatedPanels() {
    const newPanels = [];

    for (const panel of this.dashboard.panels) {
      // @ts-expect-error
      if (panel.repeatPanelId || panel.repeatByRow) {
        continue;
      }

      // Filter out repeats in collapsed rows
      if (panel.type === 'row' && Array.isArray(panel.panels)) {
        panel.panels = panel.panels.filter((x) => !x.repeatPanelId);
      }

      newPanels.push(panel);
    }

    this.dashboard.panels = newPanels;
  }

  // Migrates metric queries and/or annotation queries that use more than one statistic.
  // E.g query.statistics = ['Max', 'Min'] will be migrated to two queries - query1.statistic = 'Max' and query2.statistic = 'Min'
  // New queries, that were created during migration, are put at the end of the array.
  migrateCloudWatchQueries(panel: PanelModel) {
    for (const target of panel.targets || []) {
      if (isCloudWatchQuery(target)) {
        migrateCloudWatchQuery(target);
        if (target.hasOwnProperty('statistics')) {
          // New queries, that were created during migration, are put at the end of the array.
          const newQueries = migrateMultipleStatsMetricsQuery(target, [...panel.targets]);
          for (const newQuery of newQueries) {
            panel.targets.push(newQuery);
          }
        }
      }
    }
  }

  // Migrates CloudWatch annotation queries that use multiple statistics into separate queries.
  // For example, if an annotation query uses ['Max', 'Min'] statistics, it will be split into
  // two separate annotation queries - one with 'Max' and another with 'Min'.
  // The new annotation queries are added to the end of the annotations list.
  migrateCloudWatchAnnotationQuery() {
    for (const annotation of this.dashboard.annotations.list) {
      if (isLegacyCloudWatchAnnotationQuery(annotation)) {
        const newAnnotationQueries = migrateMultipleStatsAnnotationQuery(annotation);
        for (const newAnnotationQuery of newAnnotationQueries) {
          this.dashboard.annotations.list.push(newAnnotationQuery);
        }
      }
    }
  }

  upgradeToGridLayout(old: any) {
    let yPos = 0;
    const widthFactor = GRID_COLUMN_COUNT / 12;

    // Find max panel ID from both rows and existing top-level panels
    // Top-level panels may have been assigned IDs by ensurePanelsHaveUniqueIds
    const rowPanelIds = flattenDeep(
      map(old.rows, (row) => {
        return map(row.panels, 'id');
      })
    ).filter((id) => id != null);

    const topLevelPanelIds = map(this.dashboard.panels, 'id').filter((id) => id != null);

    const maxPanelId = max([...rowPanelIds, ...topLevelPanelIds]) || 0;
    let nextRowId = maxPanelId + 1;

    if (!old.rows) {
      return;
    }

    // Add special "row" panels if even one row is collapsed, repeated or has visible title
    const showRows = some(old.rows, (row) => row.collapse || row.showTitle || row.repeat);

    for (const row of old.rows) {
      if (row.repeatIteration) {
        continue;
      }

      const height = row.height || DEFAULT_ROW_HEIGHT;
      const rowGridHeight = getGridHeight(height);

      const rowPanel: any = {};
      let rowPanelModel: PanelModel | undefined;

      if (showRows) {
        // add special row panel
        rowPanel.id = nextRowId;
        rowPanel.type = 'row';
        rowPanel.title = row.title;
        rowPanel.collapsed = row.collapse;
        rowPanel.repeat = row.repeat;
        rowPanel.panels = [];
        rowPanel.gridPos = {
          x: 0,
          y: yPos,
          w: GRID_COLUMN_COUNT,
          h: rowGridHeight,
        };
        rowPanelModel = new PanelModel(rowPanel);
        nextRowId++;
        yPos++;
      }

      const rowArea = new RowArea(rowGridHeight, GRID_COLUMN_COUNT, yPos);

      for (const panel of row.panels) {
        panel.span = panel.span || DEFAULT_PANEL_SPAN;
        if (panel.minSpan) {
          panel.minSpan = Math.min(GRID_COLUMN_COUNT, (GRID_COLUMN_COUNT / 12) * panel.minSpan);
        }
        const panelWidth = Math.floor(panel.span) * widthFactor;
        const panelHeight = panel.height ? getGridHeight(panel.height) : rowGridHeight;

        const panelPos = rowArea.getPanelPosition(panelHeight, panelWidth);
        yPos = rowArea.yPos;
        panel.gridPos = {
          x: panelPos.x,
          y: yPos + panelPos.y,
          w: panelWidth,
          h: panelHeight,
        };
        rowArea.addPanel(panel.gridPos);

        delete panel.span;

        if (rowPanelModel && rowPanel.collapsed) {
          rowPanelModel.panels?.push(panel);
        } else {
          this.dashboard.panels.push(new PanelModel(panel));
        }
      }

      if (rowPanelModel) {
        this.dashboard.panels.push(rowPanelModel);
      }

      if (!(rowPanelModel && rowPanel.collapsed)) {
        yPos += rowGridHeight;
      }
    }
  }
}

function getGridHeight(height: number | string) {
  if (isString(height)) {
    height = parseInt(height.replace('px', ''), 10);
  }

  if (height < MIN_PANEL_HEIGHT) {
    height = MIN_PANEL_HEIGHT;
  }

  const gridHeight = Math.ceil(height / (GRID_CELL_HEIGHT + GRID_CELL_VMARGIN));
  return gridHeight;
}

/**
 * RowArea represents dashboard row filled by panels
 * area is an array of numbers represented filled column's cells like
 *  -----------------------
 * |******** ****
 * |******** ****
 * |********
 *  -----------------------
 *  33333333 2222 00000 ...
 */
class RowArea {
  area: number[];
  yPos: number;
  height: number;

  constructor(height: number, width = GRID_COLUMN_COUNT, rowYPos = 0) {
    this.area = new Array(width).fill(0);
    this.yPos = rowYPos;
    this.height = height;
  }

  reset() {
    this.area.fill(0);
  }

  /**
   * Update area after adding the panel.
   */
  addPanel(gridPos: any) {
    for (let i = gridPos.x; i < gridPos.x + gridPos.w; i++) {
      if (!this.area[i] || gridPos.y + gridPos.h - this.yPos > this.area[i]) {
        this.area[i] = gridPos.y + gridPos.h - this.yPos;
      }
    }
    return this.area;
  }

  /**
   * Calculate position for the new panel in the row.
   */
  getPanelPosition(panelHeight: number, panelWidth: number, callOnce = false): any {
    let startPlace, endPlace;
    let place;
    for (let i = this.area.length - 1; i >= 0; i--) {
      if (this.height - this.area[i] > 0) {
        if (endPlace === undefined) {
          endPlace = i;
        } else {
          if (i < this.area.length - 1 && this.area[i] <= this.area[i + 1]) {
            startPlace = i;
          } else {
            break;
          }
        }
      } else {
        break;
      }
    }

    if (startPlace !== undefined && endPlace !== undefined && endPlace - startPlace >= panelWidth - 1) {
      const yPos = max(this.area.slice(startPlace));
      place = {
        x: startPlace,
        y: yPos,
      };
    } else if (!callOnce) {
      // wrap to next row
      this.yPos += this.height;
      this.reset();
      return this.getPanelPosition(panelHeight, panelWidth, true);
    } else {
      return null;
    }

    return place;
  }
}

function upgradePanelLink(link: any): DataLink {
  let url = link.url;

  if (!url && link.dashboard) {
    url = `dashboard/db/${kbn.slugifyForUrl(link.dashboard)}`;
  }

  if (!url && link.dashUri) {
    url = `dashboard/${link.dashUri}`;
  }

  // some models are incomplete and have no dashboard or dashUri
  if (!url) {
    url = '/';
  }

  if (link.keepTime) {
    url = urlUtil.appendQueryToUrl(url, `$${DataLinkBuiltInVars.keepTime}`);
  }

  if (link.includeVars) {
    url = urlUtil.appendQueryToUrl(url, `$${DataLinkBuiltInVars.includeVars}`);
  }

  if (link.params) {
    url = urlUtil.appendQueryToUrl(url, link.params);
  }

  return {
    url: url,
    title: link.title,
    targetBlank: link.targetBlank,
  };
}

function updateVariablesSyntax(text: string) {
  const legacyVariableNamesRegex = /(__series_name)|(\$__series_name)|(__value_time)|(__field_name)|(\$__field_name)/g;

  return text.replace(legacyVariableNamesRegex, (match, seriesName, seriesName1, valueTime, fieldName, fieldName1) => {
    if (seriesName) {
      return '__series.name';
    }
    if (seriesName1) {
      return '${__series.name}';
    }
    if (valueTime) {
      return '__value.time';
    }
    if (fieldName) {
      return '__field.name';
    }
    if (fieldName1) {
      return '${__field.name}';
    }
    return match;
  });
}

interface MigrateDatasourceNameOptions {
  returnDefaultAsNull: boolean;
}

export function migrateDatasourceNameToRef(
  nameOrRef: string | DataSourceRef | null | undefined,
  options: MigrateDatasourceNameOptions
): DataSourceRef | null {
  if (options.returnDefaultAsNull && (nameOrRef == null || nameOrRef === 'default')) {
    return null;
  }

  if (isDataSourceRef(nameOrRef)) {
    return nameOrRef;
  }

  const ds = getDataSourceSrv().getInstanceSettings(nameOrRef);
  if (!ds) {
    return { uid: nameOrRef ? nameOrRef : undefined }; // not found
  }

  return getDataSourceRef(ds);
}

// mutates transformations appending a new transformer after the existing one
function appendTransformerAfter(panel: PanelModel, id: string, cfg: DataTransformerConfig) {
  if (panel.transformations) {
    const transformations: DataTransformerConfig[] = [];
    for (const t of panel.transformations) {
      transformations.push(t);
      if (t.id === id) {
        transformations.push({ ...cfg });
      }
    }
    panel.transformations = transformations;
  }
  return panel;
}

function upgradeValueMappingsForPanel(panel: PanelModel) {
  const fieldConfig = panel.fieldConfig;
  if (!fieldConfig) {
    return panel;
  }

  if (fieldConfig.defaults && fieldConfig.defaults.mappings) {
    fieldConfig.defaults.mappings = upgradeValueMappings(
      fieldConfig.defaults.mappings,
      fieldConfig.defaults.thresholds
    );
  }

  // Protect against no overrides
  if (Array.isArray(fieldConfig.overrides)) {
    for (const override of fieldConfig.overrides) {
      for (const prop of override.properties) {
        if (prop.id === 'mappings') {
          prop.value = upgradeValueMappings(prop.value);
        }
      }
    }
  }

  return panel;
}

function isCloudWatchQuery(target: DataQuery): target is CloudWatchMetricsQuery {
  return (
    target.hasOwnProperty('dimensions') &&
    target.hasOwnProperty('namespace') &&
    target.hasOwnProperty('region') &&
    target.hasOwnProperty('metricName')
  );
}

function isLegacyCloudWatchAnnotationQuery(
  target: AnnotationQuery<DataQuery>
): target is AnnotationQuery<LegacyAnnotationQuery> {
  return (
    target.hasOwnProperty('dimensions') &&
    target.hasOwnProperty('namespace') &&
    target.hasOwnProperty('region') &&
    target.hasOwnProperty('prefixMatching') &&
    target.hasOwnProperty('statistics')
  );
}

function upgradeValueMappings(oldMappings: any, thresholds?: ThresholdsConfig): ValueMapping[] | undefined {
  if (!oldMappings) {
    return undefined;
  }

  const valueMaps: ValueMap = { type: MappingType.ValueToText, options: {} };
  const newMappings: ValueMapping[] = [];

  for (const old of oldMappings) {
    // when migrating singlestat to stat/gauge, mappings are handled by panel type change handler used in that migration
    if (old.type && old.options) {
      // collect al value->text mappings in a single value map object. These are migrated by panel change handler as a separate value maps
      if (old.type === MappingType.ValueToText) {
        valueMaps.options = {
          ...valueMaps.options,
          ...old.options,
        };
      } else {
        newMappings.push(old);
      }
      continue;
    }

    // Use the color we would have picked from thesholds
    let color: string | undefined = undefined;
    const numeric = parseFloat(old.text);
    if (thresholds && !isNaN(numeric)) {
      const level = getActiveThreshold(numeric, thresholds.steps);
      if (level && level.color) {
        color = level.color;
      }
    }

    switch (old.type) {
      case 1: // MappingType.ValueToText:
        if (old.value != null) {
          if (old.value === 'null') {
            newMappings.push({
              type: MappingType.SpecialValue,
              options: {
                match: SpecialValueMatch.Null,
                result: { text: old.text, color },
              },
            });
          } else {
            valueMaps.options[String(old.value)] = {
              text: old.text,
              color,
            };
          }
        }
        break;
      case 2: // MappingType.RangeToText:
        newMappings.push({
          type: MappingType.RangeToText,
          options: {
            from: +old.from,
            to: +old.to,
            result: { text: old.text, color },
          },
        });
        break;
    }
  }

  if (Object.keys(valueMaps.options).length > 0) {
    newMappings.unshift(valueMaps);
  }

  return newMappings;
}

function migrateTooltipOptions(panel: PanelModel) {
  if (panel.type === 'timeseries' || panel.type === 'xychart' || panel.type === 'xychart2') {
    if (panel.options.tooltipOptions) {
      panel.options = {
        ...panel.options,
        tooltip: panel.options.tooltipOptions,
      };
      delete panel.options.tooltipOptions;
    }
  }

  return panel;
}

// This migration is performed when there is a time series panel with all axes configured to be hidden
// To avoid breaking dashboards we add override that persists x-axis visibility
function ensureXAxisVisibility(panel: PanelModel) {
  if (panel.type === 'timeseries') {
    if (
      (panel.fieldConfig as FieldConfigSource<GraphFieldConfig>)?.defaults.custom?.axisPlacement ===
      AxisPlacement.Hidden
    ) {
      panel.fieldConfig = {
        ...panel.fieldConfig,
        overrides: [
          ...panel.fieldConfig.overrides,
          {
            matcher: {
              id: FieldMatcherID.byType,
              options: FieldType.time,
            },
            properties: [
              {
                id: 'custom.axisPlacement',
                value: AxisPlacement.Auto,
              },
            ],
          },
        ],
      };
    }
  }

  return panel;
}

function migrateHideFromFunctionality(panel: PanelModel) {
  // migrate overrides with hideFrom.viz = true to also set tooltip = true
  // this includes the __systemRef override
  if (panel.fieldConfig && panel.fieldConfig.overrides) {
    panel.fieldConfig.overrides = panel.fieldConfig.overrides.map((override) => {
      if (override.properties) {
        override.properties = override.properties.map((property) => {
          if (property.id === 'custom.hideFrom' && property.value?.viz === true) {
            property.value.tooltip = true;
          }
          return property;
        });
      }
      return override;
    });
  }

  return panel;
}
