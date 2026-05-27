import { autoMigrateAngular } from './PanelModel';

/**
 * Minimal panel shape inspected by {@link getPanelPluginToMigrateTo}. Includes
 * legacy Angular graph-panel fields (`xaxis`, `legend.values`) that do not
 * appear on the modern `PanelModel` or `Panel` schema types — they exist only
 * in legacy dashboard JSON undergoing migration. Any `PanelModel` instance
 * structurally satisfies this shape because the legacy fields are optional and
 * `PanelModel.type: string` is required.
 *
 * The nested `legend` declaration includes an `[key: string]: unknown` index
 * signature so that the `PanelModel.legend` shape (`{ show; sort?; sortDesc? }`)
 * remains structurally assignable here — without the index signature TypeScript
 * treats `{ values?: unknown }` as a "weak type" and rejects the assignment
 * because the modern and legacy shapes share no property names.
 */
interface PanelLikeForMigration {
  type: string;
  xaxis?: { mode?: string };
  legend?: { values?: unknown; [key: string]: unknown };
}

export function getPanelPluginToMigrateTo(panel: PanelLikeForMigration): string | undefined {
  // Graph needs special logic as it can be migrated to multiple panels
  // Also, graphite was previously migrated to graph in the schema version 2 migration in DashboardMigrator.ts
  // but this was a bug because in there graphite was set to graph, but since those migrations run
  // after PanelModel.restoreModel where autoMigrateFrom is set, this caused the graph migration to be skipped.
  // And this resulted in a dashboard with invalid panels.
  if (panel.type === 'graph' || panel.type === 'graphite') {
    if (panel.xaxis?.mode === 'series') {
      if (panel.legend?.values) {
        return 'bargauge';
      }

      return 'barchart';
    }

    if (panel.xaxis?.mode === 'histogram') {
      return 'histogram';
    }

    return 'timeseries';
  }

  return autoMigrateAngular[panel.type];
}
