import { type PanelPlugin } from '../panel/PanelPlugin';
import { type PluginMeta } from '../types/plugin';

export function throwIfAngular(module?: System.Module): void;
export function throwIfAngular(panel?: PanelPlugin): void;
export function throwIfAngular(plugin?: PluginMeta): void;
export function throwIfAngular(data?: unknown): void {
  // The three overloads above accept structurally disjoint shapes (System.Module is index-only,
  // PanelPlugin is a class with no angular fields, PluginMeta lacks angularPanelCtrl/PanelCtrl/ConfigCtrl).
  // Narrowing via a single typed view of the legacy Angular plugin shape is the only way to access
  // these heterogeneous fields without resorting to `any`. The cast is local and read-only.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowing unknown to the union of legacy Angular plugin shapes is structurally required to access fields that are not common across the three overload types
  const d = data as
    | {
        angular?: { detected?: boolean };
        angularDetected?: boolean;
        angularPanelCtrl?: unknown;
        PanelCtrl?: unknown;
        ConfigCtrl?: unknown;
      }
    | undefined;
  const isAngularPlugin = d?.angular?.detected ?? d?.angularDetected ?? false;
  const isAngularPanel = d?.angularPanelCtrl ?? false;
  // PRESERVE original behavior: `d!.PanelCtrl` does NOT use optional chaining,
  // matching the original `data.PanelCtrl` which intentionally throws TypeError if data is undefined.
  const isAngularModule = d!.PanelCtrl ?? d?.ConfigCtrl ?? false;
  if (isAngularPlugin || isAngularPanel || isAngularModule) {
    throw new Error('Angular plugins are not supported');
  }
}
