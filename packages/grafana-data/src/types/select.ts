/**
 * Used in select elements
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `T = any` preserved for back-compat: SelectableValue is one of the most-used generics across 100+ Grafana files; consumers default to `any` value when not parameterizing
export interface SelectableValue<T = any> {
  label?: string;
  ariaLabel?: string;
  value?: T;
  imgUrl?: string;
  icon?: string;
  // Secondary text under the title of the option.
  description?: string;
  // Adds a simple native title attribute to each option.
  title?: string;
  // Optional component that will be shown together with other options. Does not get passed any props.
  component?: React.ComponentType;
  isDisabled?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- open-ended index signature for back-compat: SelectableValue is plugin-extensible; consumers attach arbitrary metadata fields read without narrowing
  [key: string]: any;
}
