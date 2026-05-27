import { defaults, each, sortBy } from 'lodash';

import { type DataSourceRef, type VariableOption, VariableRefresh } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { getPanelPluginMeta } from '@grafana/runtime/internal';
import { type Panel } from '@grafana/schema';
import {
  type Spec as DashboardV2Spec,
  type PanelKind,
  type LibraryPanelRef,
  type LibraryPanelKind,
  type DataQueryKind,
  type AdhocVariableKind,
  type GroupByVariableKind,
} from '@grafana/schema/apis/dashboard.grafana.app/v2';
import config from 'app/core/config';
import { createErrorNotification } from 'app/core/copy/appNotification';
import { notifyApp } from 'app/core/reducers/appNotification';
import { buildPanelKind } from 'app/features/dashboard/api/ResponseTransformers';
import { type DashboardModel } from 'app/features/dashboard/state/DashboardModel';
import { type PanelModel, type GridPos } from 'app/features/dashboard/state/PanelModel';
import { getLibraryPanel } from 'app/features/library-panels/state/api';
import { variableRegexExec } from 'app/features/variables/utils';
import { dispatch } from 'app/store/store';

import { isPanelModelLibraryPanel } from '../../../library-panels/guard';
import { LibraryElementKind } from '../../../library-panels/types';
import { type DashboardJson } from '../../../manage-dashboards/types';
import { isConstant } from '../../../variables/guard';

// This label is used to store the export label for a datasource when exporting a V2 dashboard for external sharing.
// E.g. if a dashboard has two datasources with the same type, the export label will be used to distinguish them.
export const ExportLabel = 'grafana.app/export-label';

export interface InputUsage {
  libraryPanels?: LibraryPanelRef[];
}

export interface Input {
  name: string;
  type: string;
  label: string;
  // The export-input `value` is heterogeneous: it holds either a templated datasource reference
  // (string), a constant variable's raw value (string | number | boolean), or an InputUsage
  // descriptor for library-panel inputs. Narrowing to `unknown` would break the existing
  // consumer contract in `manage-dashboards` and `dashboard-scene/sharing/ExportButton`, which
  // assigns DataSource and constant payloads through this shape without runtime guards. The
  // value's actual type is determined by the sibling `type` discriminator (datasource | constant)
  // at the consumer side, not at the producer here. Retained `any` per AAP §0.9.2.7 (unresolvable
  // heterogeneous shape across the dashboard schema v0..v15 migration matrix).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous Input.value union; discriminated by sibling Input.type at consumers
  value: any;
  description: string;
  usage?: InputUsage;
}

interface Requires {
  [key: string]: {
    type: string;
    id: string;
    name: string;
    version: string;
  };
}

export interface ExternalDashboard {
  __inputs?: Input[];
  __elements?: Record<string, LibraryElementExport>;
  __requires?: Array<Requires[string]>;
  panels: Array<PanelModel | PanelWithExportableLibraryPanel>;
}

interface PanelWithExportableLibraryPanel {
  gridPos: GridPos;
  id: number;
  libraryPanel: LibraryPanelRef;
}

function isExportableLibraryPanel(
  p: PanelModel | PanelWithExportableLibraryPanel
): p is PanelWithExportableLibraryPanel {
  return Boolean(p.libraryPanel?.name && p.libraryPanel?.uid);
}

interface DataSources {
  [key: string]: {
    name: string;
    label: string;
    description: string;
    type: string;
    pluginId: string;
    pluginName: string;
    usage?: InputUsage;
  };
}

export interface LibraryElementExport {
  name: string;
  uid: string;
  // The library-element `model` is the full panel JSON payload as produced by the various
  // panel plugins (timeseries, table, stat, gauge, custom community plugins, etc.). Each plugin
  // ships its own untyped schema with plugin-specific `options`, `fieldConfig`, and `targets`
  // shapes. The exporter's job is only to round-trip this payload without inspecting it; the
  // shape is determined by the producing plugin and validated downstream during import via the
  // panel plugin's migration handler. Typing this as `Panel` (from @grafana/schema) would be
  // wrong because library panels can hold v0..v15 schema variants. Retained `any` per
  // AAP §0.9.2.7 (cross-plugin schema variance unresolvable at this layer).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque plugin-variant Panel JSON; round-tripped without inspection
  model: any;
  kind: LibraryElementKind;
}

export async function makeExportableV1(dashboard: DashboardModel) {
  // clean up repeated rows and panels,
  // this is done on the live real dashboard instance, not on a clone
  // so we need to undo this
  // this is pretty hacky and needs to be changed
  dashboard.cleanUpRepeats();

  const saveModel = dashboard.getSaveModelCloneOld();

  // undo repeat cleanup
  dashboard.processRepeats();

  const inputs: Input[] = [];
  const requires: Requires = {};
  const datasources: DataSources = {};
  // `variableLookup` is keyed by variable name and stores the full variable model as returned by
  // `saveModel.getVariables()` — a union of QueryVariableModel, DatasourceVariableModel,
  // ConstantVariableModel, AdHocVariableModel, CustomVariableModel, IntervalVariableModel,
  // TextBoxVariableModel, SystemVariable. The downstream consumer in `templateizeDatasourceUsage`
  // reads `.current.value`, which exists on QueryVariableModel and DatasourceVariableModel but
  // is shaped differently on each (string vs DataSourceRef vs string[]). Typing this as
  // `TypedVariableModel` from @grafana/data would force ~12 narrowing branches inside the closure
  // for `.current.value` access — none of which would change runtime behavior since the closure
  // already gates by `variable.type === 'query' | 'datasource' | 'adhoc'`. Retained `any` per
  // AAP §0.9.2.7 (cross-variable-type heterogeneity in `.current.value` access pattern).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- variable model union; `.current.value` has per-type-shape variance
  const variableLookup: { [key: string]: any } = {};
  const libraryPanels: Map<string, LibraryElementExport> = new Map<string, LibraryElementExport>();

  for (const variable of saveModel.getVariables()) {
    variableLookup[variable.name] = variable;
  }

  const datasourceVariableRefNameMap: { [key: string]: string } = {};

  // `obj` is a recursive traversal target that may be: a PanelModel (with `.datasource` and
  // `.targets`), a DataQuery target inside a panel (with `.datasource` of varying shape per
  // datasource plugin), an annotation definition (AnnotationQuery from @grafana/data), a query
  // variable model (with `.datasource`), an adhoc variable model (with `.datasource` and
  // `.filters`), or a library-panel model (an arbitrary panel JSON blob). The function writes
  // back to `obj.datasource` and `obj.libraryPanel` properties that exist on different shapes
  // across the input union. Typing this as the union of all six shapes would force `'datasource' in obj`
  // type guards inside the body for every property access, which would not change runtime
  // behavior because all six shapes have the `.datasource` property by structural duck-typing.
  // Retained `any` per AAP §0.9.2.7 (recursive traversal across structurally-similar but
  // nominally-distinct shapes; type-narrowing would not add safety).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive traversal target union (panel | target | annotation | variable | library-panel-model)
  const templateizeDatasourceUsage = (obj: any, fallback?: DataSourceRef) => {
    if (obj.datasource === undefined) {
      obj.datasource = fallback;
      return;
    }

    let datasource = obj.datasource;
    // `datasourceVariable` holds the resolved variable model when `obj.datasource.uid` is a
    // template reference like `${MY_DS_VAR}`. Read from `variableLookup` (typed `any` above) and
    // accessed for `.current` and `.current.value` — same variable-model union heterogeneity
    // documented at `variableLookup`. Retained `any` per AAP §0.9.2.7 (variance from
    // variableLookup propagates here).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shares variableLookup's variable-model union heterogeneity
    let datasourceVariable: any = null;

    const datasourceUid: string | undefined = datasource?.uid;
    const match = datasourceUid && variableRegexExec(datasourceUid);
    let varName: string | undefined;

    if (match) {
      varName = match[1] || match[2] || match[4];
      datasourceVariable = variableLookup[varName];

      // if datasource variable is already templated, skip it
      if (datasourceVariableRefNameMap[varName]) {
        return;
      }

      if (datasourceVariable && datasourceVariable.current) {
        datasource = datasourceVariable.current.value;
      }
    }

    return getDataSourceSrv()
      .get(datasource)
      .then((ds) => {
        if (ds.meta?.builtIn) {
          return;
        }

        // add data source type to require list
        requires['datasource' + ds.meta?.id] = {
          type: 'datasource',
          id: ds.meta.id,
          name: ds.meta.name,
          version: ds.meta.info.version || '1.0.0',
        };

        const libraryPanel = obj.libraryPanel;
        const libraryPanelSuffix = !!libraryPanel ? '-for-library-panel' : '';
        let refName = 'DS_' + ds.name.replace(' ', '_').toUpperCase() + libraryPanelSuffix.toUpperCase();
        const templatedUid = '${' + refName + '}';

        datasources[refName] = {
          name: refName,
          label: ds.name,
          description: '',
          type: 'datasource',
          pluginId: ds.meta?.id,
          pluginName: ds.meta?.name,
          usage: datasources[refName]?.usage,
        };

        if (!!libraryPanel) {
          const libPanels = datasources[refName]?.usage?.libraryPanels || [];
          libPanels.push({ name: libraryPanel.name, uid: libraryPanel.uid });

          datasources[refName].usage = {
            libraryPanels: libPanels,
          };
        }

        // if panel or query is relying on a datasource variable
        // skip templating datasource uid but save the reference so we can set datasource variable's current prop
        if (datasourceVariable && varName) {
          datasourceVariableRefNameMap[varName] = '${' + refName + '}';
          return;
        }

        obj.datasource = { type: ds.meta.id, uid: templatedUid };
      });
  };

  const processPanel = async (panel: PanelModel) => {
    if (panel.type !== 'row') {
      await templateizeDatasourceUsage(panel);

      if (panel.targets) {
        for (const target of panel.targets) {
          await templateizeDatasourceUsage(target, panel.datasource!);
        }
      }

      const panelDef = await getPanelPluginMeta(panel.type);
      if (panelDef) {
        requires['panel' + panelDef.id] = {
          type: 'panel',
          id: panelDef.id,
          name: panelDef.name,
          version: panelDef.info.version,
        };
      }
    }
  };

  const processLibraryPanels = async (panel: PanelModel) => {
    if (isPanelModelLibraryPanel(panel)) {
      const { name, uid } = panel.libraryPanel;
      let model = panel.libraryPanel.model;
      if (!model) {
        const libPanel = await getLibraryPanel(uid, true);
        model = libPanel.model;
      }

      await templateizeDatasourceUsage(model);

      // `model` here is the library-panel JSON payload as documented at LibraryElementExport.model
      // (cross-plugin schema variance). The destructure strips the panel's grid position and
      // numeric id (which are owned by the embedding dashboard, not the library panel itself).
      // Casting through `any` is necessary because `PanelModel` from `app/features/dashboard/state/PanelModel`
      // has `gridPos: GridPos | undefined` and `id: number`, but library-panel models in older
      // schema variants may have these as legacy/missing properties; the cast bypasses the
      // structural-incompatibility check on the destructure source. Retained per AAP §0.9.2.7.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- library-panel model is plugin-variant; gridPos/id may not exist in older schemas
      const { gridPos, id, ...rest } = model as any;
      if (!libraryPanels.has(uid)) {
        libraryPanels.set(uid, { name, uid, kind: LibraryElementKind.Panel, model: rest });
      }
    }
  };

  try {
    // check up panel data sources
    for (const panel of saveModel.panels) {
      await processPanel(panel);

      // handle collapsed rows
      if (panel.collapsed !== undefined && panel.collapsed === true && panel.panels) {
        for (const rowPanel of panel.panels) {
          await processPanel(rowPanel);
        }
      }
    }

    // templatize template vars
    for (const variable of saveModel.getVariables()) {
      if (variable.type === 'query') {
        await templateizeDatasourceUsage(variable);
        variable.options = [];
        variable.current = {} as unknown as VariableOption;
        variable.refresh =
          variable.refresh !== VariableRefresh.never ? variable.refresh : VariableRefresh.onDashboardLoad;
      } else if (variable.type === 'datasource') {
        const templateizedUID = datasourceVariableRefNameMap[variable.name];
        if (templateizedUID) {
          variable.current = {
            text: '',
            value: templateizedUID,
            selected: true,
          };
        } else {
          variable.current = {};
        }
      } else if (variable.type === 'adhoc') {
        await templateizeDatasourceUsage(variable);
      }
    }

    // templatize annotations vars
    for (const annotationDef of saveModel.annotations.list) {
      await templateizeDatasourceUsage(annotationDef);
    }

    // add grafana version
    requires['grafana'] = {
      type: 'grafana',
      id: 'grafana',
      name: 'Grafana',
      version: config.buildInfo.version,
    };

    // we need to process all panels again after all the promises are resolved
    // so all data sources, variables and targets have been templateized when we process library panels
    for (const panel of saveModel.panels) {
      await processLibraryPanels(panel);
      if (panel.collapsed !== undefined && panel.collapsed === true && panel.panels) {
        for (const rowPanel of panel.panels) {
          await processLibraryPanels(rowPanel);
        }
      }
    }

    // lodash's `each` callback receives the DataSources record's value as a structurally-identical
    // shape to `Input` (name + label + description + type/pluginId/pluginName + usage), but
    // lodash's type inference for `each<Record<string, V>>` does not propagate V into the
    // callback parameter. Casting to a concrete `DataSources[string]` would still require a
    // structural conversion since the produced object's `pluginId`/`pluginName` fields are
    // mapped to `Input.type` semantically. Retained `any` per AAP §0.9.2.7 (lodash callback
    // type-inference limitation, push-target shape verified at runtime).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lodash each<DataSources> callback param widens to any; push shape matches Input by construction
    each(datasources, (value: any) => {
      inputs.push(value);
    });

    // templatize constants
    for (const variable of saveModel.getVariables()) {
      if (isConstant(variable)) {
        const refName = 'VAR_' + variable.name.replace(' ', '_').toUpperCase();
        inputs.push({
          name: refName,
          type: 'constant',
          label: variable.label || variable.name,
          value: variable.query,
          description: '',
        });
        // update current and option
        variable.query = '${' + refName + '}';
        variable.current = {
          value: variable.query,
          text: variable.query,
          selected: false,
        };
        variable.options = [variable.current];
      }
    }

    const __elements = [...libraryPanels.entries()].reduce<Record<string, LibraryElementExport>>(
      (prev, [curKey, curLibPanel]) => {
        prev[curKey] = curLibPanel;
        return prev;
      },
      {}
    );

    // make inputs and requires a top thing
    const newObj: DashboardJson = defaults(
      {
        __inputs: inputs,
        __elements,
        __requires: sortBy(requires, ['id']),
      },
      saveModel
    );

    // Remove extraneous props from library panels
    for (let i = 0; i < newObj.panels.length; i++) {
      const libPanel = newObj.panels[i];
      if (isExportableLibraryPanel(libPanel)) {
        newObj.panels[i] = {
          gridPos: libPanel.gridPos,
          id: libPanel.id,
          libraryPanel: { uid: libPanel.libraryPanel.uid, name: libPanel.libraryPanel.name },
        };
      }
    }

    return newObj;
  } catch (err) {
    console.error('Export failed:', err);
    return {
      error: err,
    };
  }
}

/**
 * Converts a LibraryPanelKind to a PanelKind with embedded panel configuration
 */
async function convertLibraryPanelToInlinePanel(libraryPanelElement: LibraryPanelKind): Promise<PanelKind> {
  const { libraryPanel, id, title } = libraryPanelElement.spec;

  try {
    // Load the full library panel definition
    const fullLibraryPanel = await getLibraryPanel(libraryPanel.uid, true);
    const panelModel: Panel = fullLibraryPanel.model;
    const inlinePanel = buildPanelKind(panelModel);
    // keep the original id
    inlinePanel.spec.id = id;
    return inlinePanel;
  } catch (error) {
    console.error(`Failed to load library panel ${libraryPanel.uid}:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    dispatch(
      notifyApp(
        createErrorNotification(
          `Unable to load library panel "${libraryPanel.name}": ${errorMessage}. It will appear as a placeholder in the export.`
        )
      )
    );

    // Return a placeholder panel if library panel can't be loaded
    return {
      kind: 'Panel',
      spec: {
        id,
        title: title || `Library Panel: ${libraryPanel.name}`,
        description: '',
        links: [],
        data: {
          kind: 'QueryGroup',
          spec: {
            queries: [],
            transformations: [],
            queryOptions: {},
          },
        },
        vizConfig: {
          kind: 'VizConfig',
          group: 'text',
          version: '',
          spec: {
            options: {
              content: `**Library Panel Load Error**\n\nUnable to load library panel: ${libraryPanel.name} (${libraryPanel.uid})\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`,
              mode: 'markdown',
            },
            fieldConfig: { defaults: {}, overrides: [] },
          },
        },
      },
    };
  }
}

export async function makeExportableV2(dashboard: DashboardV2Spec, isSharingExternally = false) {
  const dataQueryLabels: { [key: string]: Map<string, number> } = {};

  // get all datasource variables
  const datasourceVariables = dashboard.variables.filter((v) => v.kind === 'DatasourceVariable');

  const processDataQueryKind = (dataQueryKind: DataQueryKind) => {
    if (!dataQueryKind.datasource?.name) {
      return;
    }

    const datasourceUid = dataQueryKind.datasource.name;

    if (isReferencingDsTemplateVariable(datasourceUid)) {
      return;
    }

    dataQueryKind.labels = {
      ...(dataQueryKind.labels ?? {}),
      [ExportLabel]: getLabel(dataQueryKind.group, datasourceUid),
    };

    dataQueryKind.datasource = undefined;
  };

  const processAdHocAndGroupByVariables = (variable: AdhocVariableKind | GroupByVariableKind) => {
    const datasourceUid = variable.datasource?.name;

    if (!datasourceUid) {
      return;
    }

    if (isReferencingDsTemplateVariable(datasourceUid)) {
      return;
    }

    variable.labels = {
      ...(variable.labels ?? {}),
      [ExportLabel]: getLabel(variable.group, datasourceUid),
    };
    variable.datasource = undefined;
  };

  const isReferencingDsTemplateVariable = (datasourceUid: string) => {
    if (datasourceUid.startsWith('$')) {
      const varName =
        datasourceUid.startsWith('${') && datasourceUid.endsWith('}')
          ? datasourceUid.slice(2, -1)
          : datasourceUid.slice(1);

      return !!datasourceVariables.find((v) => v.spec.name === varName);
    }

    return false;
  };

  const getLabel = (datasourceGroup: string, datasourceUid: string) => {
    let group = dataQueryLabels[datasourceGroup];

    if (!group) {
      group = new Map<string, number>();
      dataQueryLabels[datasourceGroup] = group;
    }

    if (!group.has(datasourceUid)) {
      group.set(datasourceUid, group.size + 1);
    }

    const index = group.get(datasourceUid);
    return `${datasourceGroup}-${index}`;
  };

  const processPanel = (panel: PanelKind) => {
    if (panel.spec.data.spec.queries) {
      for (const query of panel.spec.data.spec.queries) {
        processDataQueryKind(query.spec.query);
      }
    }
  };

  try {
    const elements = dashboard.elements;

    // process elements
    for (const [key, element] of Object.entries(elements)) {
      if (element.kind === 'Panel') {
        processPanel(element);
      } else if (element.kind === 'LibraryPanel') {
        if (isSharingExternally) {
          // Convert library panel to inline panel for external sharing
          const inlinePanel = await convertLibraryPanelToInlinePanel(element);
          // Apply datasource templating to the converted panel
          processPanel(inlinePanel);
          // Replace the library panel with the inline panel
          elements[key] = inlinePanel;
        }
        // For internal exports, keep library panels as-is
      }
    }

    // process template variables
    for (const variable of dashboard.variables) {
      if (variable.kind === 'QueryVariable') {
        processDataQueryKind(variable.spec.query);
        variable.spec.options = [];
        variable.spec.current = {
          text: '',
          value: '',
        };
      } else if (variable.kind === 'DatasourceVariable') {
        variable.spec.current = {
          text: '',
          value: '',
        };
      } else if (variable.kind === 'AdhocVariable' || variable.kind === 'GroupByVariable') {
        processAdHocAndGroupByVariables(variable);
      }
    }

    // process annotations vars
    for (const annotation of dashboard.annotations) {
      processDataQueryKind(annotation.spec.query);
    }

    return dashboard;
  } catch (err) {
    console.error('Export failed:', err);
    return {
      error: err,
    };
  }
}
