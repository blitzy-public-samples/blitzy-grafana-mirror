import { cloneDeep, defaultsDeep, isArray, isEqual } from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import {
  type DataConfigSource,
  type DataFrameDTO,
  type DataLink,
  type DataQuery,
  type DataTransformerConfig,
  EventBusSrv,
  type FieldConfigSource,
  type PanelPlugin,
  type PanelPluginDataSupport,
  type ScopedVars,
  type PanelModel as IPanelModel,
  type DataSourceRef,
  CoreApp,
  filterFieldConfigOverrides,
  getPanelOptionsWithDefaults,
  isStandardFieldProp,
  restoreCustomOverrideRules,
  getNextRefId,
} from '@grafana/data';
import { getTemplateSrv, RefreshEvent } from '@grafana/runtime';
import { type LibraryPanel, type LibraryPanelRef } from '@grafana/schema';
import config from 'app/core/config';
import { safeStringifyValue } from 'app/core/utils/explore';
import {
  PanelOptionsChangedEvent,
  PanelQueriesChangedEvent,
  PanelTransformationsChangedEvent,
  RenderEvent,
} from 'app/types/events';
import { type QueryGroupOptions } from 'app/types/query';

import { PanelQueryRunner } from '../../query/state/PanelQueryRunner';
import { type TimeOverrideResult } from '../utils/panel';

import { getPanelPluginToMigrateTo } from './getPanelPluginToMigrateTo';

export interface GridPos {
  x: number;
  y: number;
  w: number;
  h: number;
  static?: boolean;
}

type RunPanelQueryOptions = {
  dashboardUID: string;
  dashboardTimezone: string;
  dashboardTitle: string;
  timeData: TimeOverrideResult;
  width: number;
  publicDashboardAccessToken?: string;
};
const notPersistedProperties: { [str: string]: boolean } = {
  events: true,
  isViewing: true,
  isEditing: true,
  isInView: true,
  hasRefreshed: true,
  cachedPluginOptions: true,
  plugin: true,
  queryRunner: true,
  replaceVariables: true,
  configRev: true,
  hasSavedPanelEditChange: true,
  getDisplayTitle: true,
  dataSupport: true,
  key: true,
  isNew: true,
  refreshWhenInView: true,
};

// For angular panels we need to clean up properties when changing type
// To make sure the change happens without strange bugs happening when panels use same
// named property with different type / value expectations
// This is not required for react panels
const mustKeepProps: { [str: string]: boolean } = {
  id: true,
  gridPos: true,
  type: true,
  title: true,
  scopedVars: true,
  repeat: true,
  repeatPanelId: true,
  repeatDirection: true,
  repeatedByRow: true,
  minSpan: true,
  collapsed: true,
  panels: true,
  targets: true,
  datasource: true,
  timeFrom: true,
  timeShift: true,
  hideTimeOverride: true,
  description: true,
  links: true,
  fullscreen: true,
  isEditing: true,
  isViewing: true,
  hasRefreshed: true,
  events: true,
  cacheTimeout: true,
  queryCachingTTL: true,
  cachedPluginOptions: true,
  transparent: true,
  pluginVersion: true,
  queryRunner: true,
  transformations: true,
  fieldConfig: true,
  maxDataPoints: true,
  interval: true,
  replaceVariables: true,
  libraryPanel: true,
  getDisplayTitle: true,
  configRev: true,
  key: true,
};

const defaults: Partial<PanelModel> = {
  gridPos: { x: 0, y: 0, h: 3, w: 6 },
  targets: [{ refId: 'A' }],
  cachedPluginOptions: {},
  transparent: false,
  options: {},
  links: [],
  transformations: [],
  fieldConfig: {
    defaults: {},
    overrides: [],
  },
  title: '',
};

export const autoMigrateAngular: Record<string, string> = {
  graph: 'timeseries',
  'table-old': 'table',
  singlestat: 'stat', // also automigrated if dashboard schemaVerion < 27
  'grafana-singlestat-panel': 'stat',
  'grafana-piechart-panel': 'piechart',
  'grafana-worldmap-panel': 'geomap',
  'natel-discrete-panel': 'state-timeline',
};

export class PanelModel implements DataConfigSource, IPanelModel {
  /* persisted id, used in URL to identify a panel */
  id!: number;
  gridPos!: GridPos;
  type!: string;
  title!: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- alert is the legacy Angular alerting rule blob (deeply nested with plugin-specific conditions/evaluator/notifications). Narrowing to `unknown` cascades into `public/app/features/alerting/state/ThresholdMapper.{ts,test.ts}` (out-of-scope) which access `panel.alert.conditions` directly. Retained at AAP §0.8.6 step 7 per §0.9.2.12 minimal-change mandate.
  alert?: any;
  scopedVars?: ScopedVars;
  repeat?: string;
  repeatIteration?: number;
  repeatPanelId?: number;
  repeatDirection?: string;
  repeatedByRow?: boolean;
  maxPerRow?: number;
  collapsed?: boolean;

  panels?: PanelModel[];
  declare targets: DataQuery[];
  transformations?: DataTransformerConfig[];
  datasource: DataSourceRef | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thresholds is the legacy threshold array attached to graph/singlestat panels prior to fieldConfig migration. Narrowing to `unknown` cascades into `public/app/features/alerting/state/ThresholdMapper.{ts,test.ts}` (out-of-scope) which iterates `panel.thresholds[i].op/value`. Retained at AAP §0.8.6 step 7 per §0.9.2.12 minimal-change mandate.
  thresholds?: any;
  pluginVersion?: string;
  snapshotData?: DataFrameDTO[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- timeFrom/timeShift legacy panel time overrides can be either a relative duration string ('2h') or null at persistence boundaries. Narrowing to `string | null` cascades into dashboard-scene's PanelTimeRange (`string | undefined`) and ShareModal utils consumers (out-of-scope). Retained at AAP §0.8.6 step 7 per §0.9.2.12 minimal-change mandate.
  timeFrom?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see timeFrom rationale above
  timeShift?: any;
  hideTimeOverride?: boolean;
  timeCompare?: string;
  declare options: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- panel options are plugin-specific and dynamically typed; converting to `unknown` would cascade narrowing requirements across hundreds of plugin sites that read `panel.options.legend.showLegend`, `panel.options.fieldName`, etc. Per AAP §0.6.1 plugin-options guidance and §0.9.2.12 minimal-change mandate, this is retained at the option boundary.
    [key: string]: any;
  };
  declare fieldConfig: FieldConfigSource;

  maxDataPoints?: number | null;
  interval?: string | null;
  description?: string;
  links?: DataLink[];
  declare transparent: boolean;

  libraryPanel?: LibraryPanelRef | LibraryPanel;

  autoMigrateFrom?: string;

  // non persisted
  isViewing = false;
  isEditing = false;
  isInView = false;
  configRev = 0; // increments when configs change
  hasSavedPanelEditChange?: boolean;
  hasRefreshed?: boolean;
  cacheTimeout?: string | null;
  queryCachingTTL?: number | null;
  isNew?: boolean;
  refreshWhenInView = true;

  cachedPluginOptions: Record<string, PanelOptionsCache> = {};
  legend?: { show: boolean; sort?: string; sortDesc?: boolean };
  plugin?: PanelPlugin;
  /**
   * Unique in application state, this is used as redux key for panel and for redux panel state
   * Change will cause unmount and re-init of panel
   */
  key: string;

  /**
   * The PanelModel event bus only used for internal and legacy angular support.
   * The EventBus passed to panels is based on the dashboard event model.
   */
  events: EventBusSrv;

  private queryRunner?: PanelQueryRunner;

  constructor(model: unknown) {
    this.events = new EventBusSrv();
    this.restoreModel(model);
    this.replaceVariables = this.replaceVariables.bind(this);
    this.key = uuidv4();
  }

  /** Given a persistened PanelModel restores property values */
  restoreModel(model: unknown) {
    // Narrow once at entry: callers may pass any value but only object-shaped models carry data.
    // The structural narrowing through `Record<string, unknown>` is the minimum safe form for
    // dynamically iterating over an opaque persisted object whose precise shape varies per panel
    // type / persistence version. See AAP §0.8.6 step 5 (unknown + narrowing).
    const modelObj: Record<string, unknown> =
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowing `unknown` to a string-keyed record after the runtime `typeof model === 'object'` guard
      model && typeof model === 'object' ? (model as Record<string, unknown>) : {};
    // Dynamic alias for `this` to permit string-indexed reads/writes/deletes on the class
    // instance without re-introducing `any`. The double-cast (via `unknown`) is the canonical
    // pattern for treating a class instance as a string-keyed dictionary in strict TypeScript.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- dynamic property iteration on the class instance; see comment above and AAP §0.6.1 PanelModel guidance
    const dynamicThis = this as unknown as Record<string, unknown>;

    // Start with clean-up
    for (const property in this) {
      if (notPersistedProperties[property] || !this.hasOwnProperty(property)) {
        continue;
      }

      if (modelObj[property]) {
        continue;
      }

      if (typeof dynamicThis[property] === 'function') {
        continue;
      }

      if (typeof dynamicThis[property] === 'symbol') {
        continue;
      }

      delete dynamicThis[property];
    }

    // copy properties from persisted model
    for (const property in modelObj) {
      dynamicThis[property] = modelObj[property];
    }

    const newType = getPanelPluginToMigrateTo(this);
    if (newType) {
      this.autoMigrateFrom = this.type;
      this.type = newType;
    }

    // defaults
    defaultsDeep(this, cloneDeep(defaults));

    // queries must have refId
    this.ensureQueryIds();
  }

  generateNewKey() {
    this.key = uuidv4();
  }

  ensureQueryIds() {
    if (this.targets && isArray(this.targets)) {
      for (const query of this.targets) {
        if (!query.refId) {
          query.refId = getNextRefId(this.targets);
        }
      }
    }
  }

  getOptions() {
    return this.options;
  }

  get hasChanged(): boolean {
    return this.configRev > 0;
  }

  updateOptions(options: object) {
    this.options = options;
    this.configRev++;
    this.events.publish(new PanelOptionsChangedEvent());
    this.render();
  }

  updateFieldConfig(config: FieldConfigSource) {
    this.fieldConfig = config;
    this.configRev++;
    this.events.publish(new PanelOptionsChangedEvent());

    this.resendLastResult();
    this.render();
  }

  /**
   * The save model is a structurally-shaped JSON representation of the panel suitable for
   * persistence. It omits non-persisted runtime properties (per `notPersistedProperties`)
   * and may include collapsed-row reduced shapes `{ id, title, gridPos, libraryPanel }` for
   * library panels nested inside rows. Downstream consumers (LibraryPanel persistence
   * helpers, ImportOverviewV1, dashboard-scene transformers, etc.) treat this loosely as
   * either `PanelModel`-shaped JSON or `Panel`-shaped schema JSON. Returning `any` here is
   * the legacy contract — narrowing to `PanelModel` would falsely promise runtime methods
   * (events, configRev) which the save model does NOT carry. Public method signature
   * preserved per AAP §0.9.2.12 minimal-change mandate.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- save model is a dynamic JSON subset that does not satisfy any single TypeScript interface (mixes PanelModel-shaped entries and reduced library-panel shapes for collapsed rows). Cascading narrower types causes failures in library-panels/{state/api.ts,utils.ts}, manage-dashboards/ImportOverviewV1, dashboard/utils/panelMerge, and ShareModal consumers (out-of-scope). Retained at AAP §0.8.6 step 7.
  getSaveModel(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy dynamic save-model accumulator; field types are heterogeneous across panel/plugin types
    const model: any = {};
    // Dynamic aliases to permit string-indexed reads on the class instance and on the
    // structurally-typed `defaults` constant without re-introducing `any` at the local variable
    // boundary. Runtime semantics are identical to the previous `this[property]` /
    // `defaults[property]` accesses.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- dynamic property iteration on the class instance; see comment above
    const dynamicThis = this as unknown as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- string-indexed read on the `Partial<PanelModel>` defaults constant during dynamic comparison
    const dynamicDefaults = defaults as unknown as Record<string, unknown>;

    for (const property in this) {
      if (notPersistedProperties[property] || !this.hasOwnProperty(property)) {
        continue;
      }

      if (isEqual(dynamicThis[property], dynamicDefaults[property])) {
        continue;
      }

      model[property] = cloneDeep(dynamicThis[property]);
    }

    // clean libraryPanel from collapsed rows
    if (this.type === 'row' && this.panels && this.panels.length > 0) {
      model.panels = this.panels.map((panel) => {
        if (panel.libraryPanel) {
          const { id, title, libraryPanel, gridPos } = panel;
          return {
            id,
            title,
            gridPos,
            libraryPanel: {
              uid: libraryPanel.uid,
              name: libraryPanel.name,
            },
          };
        }

        return panel;
      });
    }

    return model;
  }

  setIsViewing(isViewing: boolean) {
    this.isViewing = isViewing;
  }

  updateGridPos(newPos: GridPos, manuallyUpdated = true) {
    if (
      newPos.x === this.gridPos.x &&
      newPos.y === this.gridPos.y &&
      newPos.h === this.gridPos.h &&
      newPos.w === this.gridPos.w
    ) {
      return;
    }

    this.gridPos.x = newPos.x;
    this.gridPos.y = newPos.y;
    this.gridPos.w = newPos.w;
    this.gridPos.h = newPos.h;
    if (manuallyUpdated) {
      this.configRev++;
    }

    // Maybe a bit heavy. Could add a "GridPosChanged" event instead?
    this.render();
  }

  runAllPanelQueries({ dashboardUID, dashboardTimezone, timeData, width, dashboardTitle }: RunPanelQueryOptions) {
    this.getQueryRunner().run({
      datasource: this.datasource,
      queries: this.targets,
      panelId: this.id,
      panelName: this.title,
      panelPluginId: this.type,
      dashboardUID: dashboardUID,
      dashboardTitle: dashboardTitle,
      timezone: dashboardTimezone,
      timeRange: timeData.timeRange,
      timeInfo: timeData.timeInfo,
      maxDataPoints: this.maxDataPoints || Math.floor(width),
      minInterval: this.interval,
      scopedVars: this.scopedVars,
      cacheTimeout: this.cacheTimeout,
      queryCachingTTL: this.queryCachingTTL,
      transformations: this.transformations,
      app: this.isEditing ? CoreApp.PanelEditor : this.isViewing ? CoreApp.PanelViewer : CoreApp.Dashboard,
    });
  }

  refresh() {
    this.hasRefreshed = true;
    this.events.publish(new RefreshEvent());
  }

  render() {
    if (!this.hasRefreshed) {
      this.refresh();
    } else {
      this.events.publish(new RenderEvent());
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the returned "options-to-remember" bag is consumed by `callPanelTypeChangeHandler` and by dashboard-scene's `angularMigration` (out-of-scope) which both access `.options` as a plugin-specific dynamic shape forwarded to `plugin.onPanelTypeChanged`. Narrowing to `Record<string, unknown>` would propagate `unknown` typing to the plugin handler signature (Record<string, any>) and cascade out-of-scope. Retained at AAP §0.8.6 step 7 per §0.9.2.12 minimal-change mandate.
  public getOptionsToRemember(): any {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- dynamic property iteration on the class instance during option capture; see Change 7 in AAP §0.6.1
    const dynamicThis = this as unknown as Record<string, unknown>;
    return Object.keys(this).reduce<Record<string, unknown>>((acc, property) => {
      if (notPersistedProperties[property] || mustKeepProps[property]) {
        return acc;
      }
      return {
        ...acc,
        [property]: dynamicThis[property],
      };
    }, {});
  }

  private restorePanelOptions(pluginId: string) {
    const prevOptions = this.cachedPluginOptions[pluginId];

    if (!prevOptions) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- dynamic property restoration on the class instance from a previously-cached options bag; see Change 8 in AAP §0.6.1
    const dynamicThis = this as unknown as Record<string, unknown>;
    Object.keys(prevOptions.properties).map((property) => {
      dynamicThis[property] = prevOptions.properties[property];
    });

    this.fieldConfig = restoreCustomOverrideRules(this.fieldConfig, prevOptions.fieldConfig);
  }

  applyPluginOptionDefaults(plugin: PanelPlugin, isAfterPluginChange: boolean) {
    const options = getPanelOptionsWithDefaults({
      plugin,
      currentOptions: this.options,
      currentFieldConfig: this.fieldConfig,
      isAfterPluginChange: isAfterPluginChange,
    });

    this.fieldConfig = options.fieldConfig;
    this.options = options.options;
  }

  async pluginLoaded(plugin: PanelPlugin) {
    this.plugin = plugin;

    const version = getPluginVersion(plugin);

    if (this.autoMigrateFrom) {
      const wasAngular = autoMigrateAngular[this.autoMigrateFrom] != null;
      const oldOptions = this.getOptionsToRemember();
      const prevPluginId = this.autoMigrateFrom;
      const newPluginId = this.type;

      this.clearPropertiesBeforePluginChange();

      // Need to set these again as they get cleared by the above function
      this.type = newPluginId;
      this.plugin = plugin;

      this.callPanelTypeChangeHandler(plugin, prevPluginId, oldOptions, wasAngular);
    }

    if (plugin.onPanelMigration) {
      if (version !== this.pluginVersion || plugin.shouldMigrate?.(this)) {
        const newPanelOptions = plugin.onPanelMigration(this);
        this.options = await newPanelOptions;
        this.pluginVersion = version;
      }
    }

    this.applyPluginOptionDefaults(plugin, false);
    this.resendLastResult();
  }

  clearPropertiesBeforePluginChange() {
    // remove panel type specific  options
    for (const key in this) {
      if (mustKeepProps[key]) {
        continue;
      }
      delete this[key];
    }

    this.options = {};

    // clear custom options
    this.fieldConfig = {
      defaults: {
        ...this.fieldConfig.defaults,
        custom: {},
      },
      // filter out custom overrides
      overrides: filterFieldConfigOverrides(this.fieldConfig.overrides, isStandardFieldProp),
    };
  }

  // Let panel plugins inspect options from previous panel and keep any that it can use
  private callPanelTypeChangeHandler(
    newPlugin: PanelPlugin,
    oldPluginId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- oldOptions is the dynamic plugin-options snapshot returned by `getOptionsToRemember()`. The plugin handler's published signature is `PanelTypeChangedHandler<TOptions = any>(panel, prevPluginId, prevOptions: Record<string, any>, prevFieldConfig)` (packages/grafana-data/src/types/panel.ts:171), so widening here propagates the public contract correctly.
    oldOptions: any,
    wasAngular: boolean
  ) {
    if (newPlugin.onPanelTypeChanged) {
      const prevOptions = wasAngular ? { angular: oldOptions } : oldOptions.options;
      Object.assign(this.options, newPlugin.onPanelTypeChanged(this, oldPluginId, prevOptions, this.fieldConfig));
    }
  }

  changePlugin(newPlugin: PanelPlugin) {
    const pluginId = newPlugin.meta.id;
    const oldOptions = this.getOptionsToRemember();
    const prevFieldConfig = this.fieldConfig;
    const oldPluginId = this.type;
    const angularId = this.autoMigrateFrom || oldPluginId;
    const wasAngular = Boolean(autoMigrateAngular[angularId]);
    this.cachedPluginOptions[oldPluginId] = {
      properties: oldOptions,
      fieldConfig: prevFieldConfig,
    };

    this.clearPropertiesBeforePluginChange();
    this.restorePanelOptions(pluginId);

    // Potentially modify current options
    this.callPanelTypeChangeHandler(newPlugin, oldPluginId, oldOptions, wasAngular);

    // switch
    this.type = pluginId;
    this.plugin = newPlugin;
    this.configRev++;

    this.applyPluginOptionDefaults(newPlugin, true);

    if (newPlugin.onPanelMigration) {
      this.pluginVersion = getPluginVersion(newPlugin);
    }
  }

  updateQueries(options: QueryGroupOptions) {
    const { dataSource } = options;
    this.datasource = dataSource;

    this.cacheTimeout = options.cacheTimeout;
    this.queryCachingTTL = options.queryCachingTTL;
    this.timeFrom = options.timeRange?.from;
    this.timeShift = options.timeRange?.shift;
    this.hideTimeOverride = options.timeRange?.hide;
    this.interval = options.minInterval;
    this.maxDataPoints = options.maxDataPoints;
    this.targets = options.queries;
    this.configRev++;

    this.events.publish(new PanelQueriesChangedEvent());
  }

  addQuery(query?: Partial<DataQuery>) {
    query = query || { refId: 'A' };
    query.refId = getNextRefId(this.targets);
    this.targets.push(query as DataQuery);
    this.configRev++;
  }

  changeQuery(query: DataQuery, index: number) {
    // ensure refId is maintained
    query.refId = this.targets[index].refId;
    this.configRev++;

    // update query in array
    this.targets = this.targets.map((item, itemIndex) => {
      if (itemIndex === index) {
        return query;
      }
      return item;
    });
  }

  getEditClone() {
    const sourceModel = this.getSaveModel();

    const clone = new PanelModel(sourceModel);
    clone.isEditing = true;
    clone.plugin = this.plugin;

    const sourceQueryRunner = this.getQueryRunner();

    // Copy last query result
    clone.getQueryRunner().useLastResultFrom(sourceQueryRunner);

    return clone;
  }

  getTransformations() {
    return this.transformations;
  }

  getFieldOverrideOptions() {
    if (!this.plugin) {
      return undefined;
    }

    return {
      fieldConfig: this.fieldConfig,
      replaceVariables: this.replaceVariables,
      fieldConfigRegistry: this.plugin.fieldConfigRegistry,
      theme: config.theme2,
    };
  }

  getDataSupport(): PanelPluginDataSupport {
    return this.plugin?.dataSupport ?? { annotations: false, alertStates: false };
  }

  getQueryRunner(): PanelQueryRunner {
    if (!this.queryRunner) {
      this.queryRunner = new PanelQueryRunner(this);
    }
    return this.queryRunner;
  }

  hasTitle() {
    return this.title && this.title.length > 0;
  }

  destroy() {
    this.events.removeAllListeners();

    if (this.queryRunner) {
      this.queryRunner.destroy();
    }
  }

  setTransformations(transformations: DataTransformerConfig[]) {
    this.transformations = transformations;
    this.resendLastResult();
    this.configRev++;
    this.events.publish(new PanelTransformationsChangedEvent());
  }

  setProperty(key: keyof this, value: unknown) {
    // The assignment is intrinsically dynamic over the union of PanelModel field types — `key` may
    // refer to any class property. Callers narrow `value` at the call site (e.g., PanelEditor.tsx
    // passes `value: unknown` after schema-driven editor narrowing; DashboardRow.tsx passes typed
    // strings). The cast through `this[keyof this]` is the minimum required to satisfy strict
    // assignability checks; `value: unknown` enforces narrowing at all call sites.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- dynamic key/value assignment on a class instance; see comment above
    this[key] = value as this[keyof this];
    this.configRev++;

    // Custom handling of repeat dependent options, handled here as PanelEditor can
    // update one key at a time right now
    if (key === 'repeat') {
      if (this.repeat && !this.repeatDirection) {
        this.repeatDirection = 'h';
      } else if (!this.repeat) {
        delete this.repeatDirection;
        delete this.maxPerRow;
      }
    }
  }

  replaceVariables(value: string, extraVars: ScopedVars | undefined, format?: string | Function) {
    const lastRequest = this.getQueryRunner().getLastRequest();
    const vars: ScopedVars = Object.assign({}, this.scopedVars, lastRequest?.scopedVars, extraVars);
    return getTemplateSrv().replace(value, vars, format);
  }

  resendLastResult() {
    if (!this.plugin) {
      return;
    }

    this.getQueryRunner().resendLastResult();
  }

  /*
   * This is the title used when displaying the title in the UI so it will include any interpolated variables.
   * If you need the raw title without interpolation use title property instead.
   * */
  getDisplayTitle(): string {
    return this.replaceVariables(this.title, undefined, 'text');
  }

  initLibraryPanel(libPanel: LibraryPanel) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- dynamic property assignment from library panel model onto the class instance; see Change 11 in AAP §0.6.1
    const dynamicThis = this as unknown as Record<string, unknown>;
    for (const [key, val] of Object.entries(libPanel.model)) {
      switch (key) {
        case 'id':
        case 'gridPos':
        case 'libraryPanel': // recursive?
          continue;
      }
      dynamicThis[key] = val; // :grimmice:
    }
    this.libraryPanel = libPanel;
  }

  unlinkLibraryPanel() {
    delete this.libraryPanel;
    this.configRev++;
    this.render();
  }
}

export function getPluginVersion(plugin: PanelPlugin): string {
  return plugin && plugin.meta.info.version ? plugin.meta.info.version : config.buildInfo.version;
}

interface PanelOptionsCache {
  properties: Record<string, unknown>;
  fieldConfig: FieldConfigSource;
}

// For cases where we immediately want to stringify the panel model without cloning each property
export function stringifyPanelModel(panel: PanelModel) {
  const model: Record<string, unknown> = {};
  // String-indexed alias for the structurally-typed `defaults` constant; runtime semantics are
  // identical to the previous direct `defaults[prop]` access (which compiled only because
  // `defaults` was typed `any`).
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- string-indexed read on the `Partial<PanelModel>` defaults constant during dynamic equality comparison
  const dynamicDefaults = defaults as unknown as Record<string, unknown>;

  Object.entries(panel)
    .filter(
      ([prop, val]) =>
        !notPersistedProperties[prop] && panel.hasOwnProperty(prop) && !isEqual(val, dynamicDefaults[prop])
    )
    .forEach(([k, v]) => {
      model[k] = v;
    });

  return safeStringifyValue(model);
}
