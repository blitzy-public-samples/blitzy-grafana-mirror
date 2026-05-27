import { type ComponentType } from 'react';

import { type EventBus } from '../events/types';
import { type DataFrame } from '../types/dataFrame';
import { type VariableSuggestionsScope, type VariableSuggestion } from '../types/dataLink';
import { type InterpolateFunction } from '../types/panel';
import { Registry, type RegistryItem } from '../utils/Registry';

import { FieldConfigOptionsRegistry } from './FieldConfigOptionsRegistry';

export interface StandardEditorContext<
  TOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TState default must remain `any` for back-compat: `PanelOptionsSupplier<TOptions>` in `panel/PanelPlugin.ts` uses `StandardEditorContext<TOptions>` (one type param), and panel modules access `context.instanceState` as a concrete type (e.g., `const state: InstanceState = context.instanceState` in `public/app/plugins/panel/canvas/module.tsx`); tightening to `unknown` would force narrowing in every `setPanelOptions` callback across all panel plugins (mass downstream regression per AAP §0.8.7)
  TState = any,
> {
  data: DataFrame[]; // All results
  replaceVariables?: InterpolateFunction;
  eventBus?: EventBus;
  getSuggestions?: (scope?: VariableSuggestionsScope) => VariableSuggestion[];
  options?: TOptions;
  instanceState?: TState;
  isOverride?: boolean;
  annotations?: DataFrame[];
}

export interface StandardEditorProps<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TValue is invariant: appears in `value: TValue` (covariant) and `onChange: (value?: TValue) => void` (contravariant); only `any` provides bilateral assignability for the heterogeneous editor registry pattern where `Registry<StandardEditorsRegistryItem>` stores items of unrelated `TValue` types under a single registry type
  TValue = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSettings is invariant via the registry pattern: editors with varying settings types must coexist in `Registry<StandardEditorsRegistryItem>`; only `any` provides bilateral assignability
  TSettings = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TOptions default must remain `any`: panel module editors (e.g., `public/app/plugins/panel/alertlist/module.tsx`) access `props.context.options.<field>` without explicitly passing TOptions, and the registry pattern (`Registry<StandardEditorsRegistryItem>` storing `ComponentType<StandardEditorProps<any, any>>`) requires bilateral compatibility — tightening to `unknown` would break ComponentType variance for every consumer that specifies a concrete TOptions like `StandardEditorProps<MyValue, MySettings, MyOptions>`
  TOptions = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TState default must remain `any`: editors like `MapViewEditor` and `LayersEditor` declare `StandardEditorProps<..., ..., ..., GeomapInstanceState>` with concrete TState types, and the registry-stored `ComponentType<StandardEditorProps<any, any>>` must remain bilaterally assignable — tightening to `unknown` would fail contravariance against concrete TState types
  TState = any,
> {
  value: TValue;
  onChange: (value?: TValue) => void;
  context: StandardEditorContext<TOptions, TState>;
  id?: string;

  item: RegistryItem & {
    settings?: TSettings;
  };
}

export interface StandardEditorsRegistryItem<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TValue requires bilateral compatibility: registry holds heterogeneous editor items (e.g., StandardEditorsRegistryItem<number>, StandardEditorsRegistryItem<string>) which must be assignable to StandardEditorsRegistryItem<any> for `Registry<StandardEditorsRegistryItem>` lookup; function-parameter contravariance in editor's `onChange` prevents `unknown` substitution
  TValue = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSettings requires bilateral compatibility for same reason as TValue: heterogeneous settings types per editor item
  TSettings = any,
> extends RegistryItem {
  editor: ComponentType<StandardEditorProps<TValue, TSettings>>;
  settings?: TSettings;
}
export const standardFieldConfigEditorRegistry = new FieldConfigOptionsRegistry();

export const standardEditorsRegistry = new Registry<StandardEditorsRegistryItem>();
