import { type ComponentType } from 'react';

import { type FieldConfigOptionsRegistry } from '../field/FieldConfigOptionsRegistry';
import { type StandardEditorContext, type StandardEditorProps } from '../field/standardFieldConfigEditorRegistry';
import { type GrafanaTheme2 } from '../themes/types';

import { type OptionsEditorItem } from './OptionsUIRegistryBuilder';
import { type ScopedVars } from './ScopedVars';
import { type DataFrame, type Field, type FieldConfig, type ValueLinkConfig } from './dataFrame';
import { type DataLink, type LinkModel } from './dataLink';
import { type OptionEditorConfig } from './options';
import { type InterpolateFunction } from './panel';
import { type TimeZone } from './time';
import { type MatcherConfig } from './transformations';

export interface DynamicConfigValue {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- value is heterogeneous (varies per config property id: number, string, color object, thresholds, mappings, etc.) and downstream consumers across @grafana/data and @grafana/ui access shape-specific properties (e.g., value.fixedColor, value.wrapText) without narrowing; preserving `any` avoids cascading type-narrowing changes in out-of-scope files
  value?: any;
}

export interface ConfigOverrideRule {
  matcher: MatcherConfig;
  properties: DynamicConfigValue[];
}

/**
 * Describes config override rules created when interacting with Grafana.
 *
 * @internal
 */
export interface SystemConfigOverrideRule extends ConfigOverrideRule {
  __systemRef: string;
}

/**
 * Guard functionality to check if an override rule is of type {@link SystemConfigOverrideRule}.
 * It will only return true if the {@link SystemConfigOverrideRule} has the passed systemRef.
 *
 * @param ref system override reference
 * @internal
 */
export function isSystemOverrideWithRef<T extends SystemConfigOverrideRule>(ref: string) {
  return (override: ConfigOverrideRule): override is T => {
    return '__systemRef' in override && override.__systemRef === ref;
  };
}

/**
 * Guard functionality to check if an override rule is of type {@link SystemConfigOverrideRule}.
 * It will return true if the {@link SystemConfigOverrideRule} has any systemRef set.
 *
 * @internal
 */
export const isSystemOverride = (override: ConfigOverrideRule): override is SystemConfigOverrideRule => {
  return '__systemRef' in override && typeof override.__systemRef === 'string';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `TOptions = any` preserved for back-compat: FieldConfigSource is heavily used across panel plugins; consumers default to `any` for custom field config when not parameterizing
export interface FieldConfigSource<TOptions = any> {
  // Defaults applied to all numeric fields
  defaults: FieldConfig<TOptions>;

  // Rules to override individual values
  overrides: ConfigOverrideRule[];
}

export interface FieldOverrideContext extends StandardEditorContext<unknown> {
  field?: Field;
  dataFrameIndex?: number; // The index for the selected field frame
}

/** @deprecated Use StandardEditorProps instead */
export type FieldConfigEditorProps<TValue, TSettings extends {}> = StandardEditorProps<TValue, TSettings>;

/** @deprecated Use StandardEditorProps instead */
export type FieldOverrideEditorProps<TValue, TSettings extends {}> = StandardEditorProps<TValue, TSettings>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic defaults `TSettings = any, TValue = any` preserved for back-compat to match parent OptionEditorConfig defaults; field config editors omit explicit type parameters
export interface FieldConfigEditorConfig<TOptions, TSettings = any, TValue = any>
  extends OptionEditorConfig<TOptions, TSettings, TValue> {
  /**
   * Function that allows specifying whether or not this field config should apply to a given field.
   * @param field
   */
  shouldApply?: (field: Field) => boolean;

  /** Indicates that option shoukd not be available in the Field config tab */
  hideFromDefaults?: boolean;

  /** Indicates that option should not be available for the overrides */
  hideFromOverrides?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic defaults preserved for back-compat: FieldConfigPropertyItem is registered with 3 type parameters often omitted by callers; defaults to `any` for ergonomics in registry usage
export interface FieldConfigPropertyItem<TOptions = any, TValue = any, TSettings extends {} = any>
  extends OptionsEditorItem<TOptions, TSettings, StandardEditorProps<TValue, TSettings>, TValue> {
  // An editor that can be filled in with context info (template variables etc)
  override: ComponentType<StandardEditorProps<TValue, TSettings>>;

  /** true for plugin field config properties */
  isCustom?: boolean;

  /** Hides option from the Field config tab */
  hideFromDefaults?: boolean;

  /** Indicates that option should not be available for the overrides */
  hideFromOverrides?: boolean;

  /** Convert the override value to a well typed value */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `value` parameter must remain `any` to accept processor implementations whose `value` parameter is typed more strictly (e.g., booleanOverrideProcessor: (value: boolean) => ..., unitOverrideProcessor: (value: boolean) => ...); TypeScript function parameter contravariance prevents `unknown` here without modifying out-of-scope processor implementations
  process: (value: any, context: FieldOverrideContext, settings?: TSettings) => TValue | undefined | null;

  /** Checks if field should be processed */
  shouldApply: (field: Field) => boolean;
}

export type DataLinkPostProcessorOptions = {
  frame: DataFrame;
  field: Field;
  dataLinkScopedVars: ScopedVars;
  replaceVariables: InterpolateFunction;
  timeZone?: TimeZone;
  config: ValueLinkConfig;
  link: DataLink;
  linkModel: LinkModel;
};

export type DataLinkPostProcessor = (options: DataLinkPostProcessorOptions) => LinkModel<Field> | undefined;

export interface ApplyFieldOverrideOptions {
  data?: DataFrame[];
  fieldConfig: FieldConfigSource;
  fieldConfigRegistry?: FieldConfigOptionsRegistry;
  replaceVariables: InterpolateFunction;
  theme: GrafanaTheme2;
  timeZone?: TimeZone;
  dataLinkPostProcessor?: DataLinkPostProcessor;
}

export enum FieldConfigProperty {
  Unit = 'unit',
  Min = 'min',
  Max = 'max',
  FieldMinMax = 'fieldMinMax',
  Decimals = 'decimals',
  DisplayName = 'displayName',
  NoValue = 'noValue',
  Thresholds = 'thresholds',
  Mappings = 'mappings',
  Links = 'links',
  Actions = 'actions',
  Color = 'color',
  Filterable = 'filterable',
}
