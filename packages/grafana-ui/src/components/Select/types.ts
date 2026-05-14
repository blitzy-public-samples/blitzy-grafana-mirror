import type * as React from 'react';
import type { JSX } from 'react';
import {
  type ActionMeta as SelectActionMeta,
  type CommonProps as ReactSelectCommonProps,
  type GroupBase,
  type OptionsOrGroups,
} from 'react-select';

import { type SelectableValue } from '@grafana/data';

export type SelectValue<T> = T | SelectableValue<T> | T[] | Array<SelectableValue<T>>;
export type ActionMeta = SelectActionMeta<{}>;
export type InputActionMeta = {
  action: 'set-value' | 'input-change' | 'input-blur' | 'menu-close';
};
export type LoadOptionsCallback<T> = (options: Array<SelectableValue<T>>) => void;

export enum ToggleAllState {
  allSelected = 'allSelected',
  indeterminate = 'indeterminate',
  noneSelected = 'noneSelected',
}

export interface SelectCommonProps<T> {
  /** Aria label applied to the input field */
  ['aria-label']?: string;
  ['data-testid']?: string;
  allowCreateWhileLoading?: boolean;
  allowCustomValue?: boolean;
  /** Focus is set to the Select when rendered*/
  autoFocus?: boolean;
  backspaceRemovesValue?: boolean;
  blurInputOnSelect?: boolean;
  captureMenuScroll?: boolean;
  className?: string;
  closeMenuOnSelect?: boolean;
  /**
   * Used for custom components. For more information, see `react-select`.
   *
   * Note: This is intentionally typed as `any` because `react-select`'s
   * `SelectComponentsConfig<Option, IsMulti, Group>` is contravariant in
   * `Option` (component slots are `ComponentType<OptionProps<Option, ...>>` and
   * similar). Callers commonly pass component overrides whose props are typed
   * for a narrower `Option` than `SelectableValue<T>` (e.g., bespoke option
   * shapes such as `OptionProps<TagSelectOption>`, custom `SelectMenuOptionProps`,
   * or HOC-wrapped components from `withTheme2`). Contravariance prevents any
   * concrete instantiation of `SelectComponentsConfig` from accepting all such
   * narrower component types simultaneously, so a sound concrete type is
   * unrepresentable here without forcing breaking changes on every consumer.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- See JSDoc above: react-select component slots are contravariant in Option, making a sound concrete type unrepresentable for the public `components` API.
  components?: any;
  /** Sets the position of the createOption element in your options list. Defaults to 'last' */
  createOptionPosition?: 'first' | 'last';
  /**
   * The pre-populated value passed through to react-select. Intentionally typed
   * as `any` because callers historically pass three incompatible shapes —
   * raw `T` (from public/app/core/components/OptionsUI/select), `null` (from
   * TemplateSelector), and `SelectableValue<T>` (from Forms/Legacy/Select) —
   * and narrowing the public surface to a union breaks existing call sites
   * downstream of `@grafana/ui` (AAP §0.8.7 public API preservation; §0.8.6
   * step 7 last-resort retained `any`).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SelectCommonProps is a public SDK type; `defaultValue` historically accepts three incompatible shapes from downstream callers, narrowing would break the public API (AAP §0.8.7).
  defaultValue?: any;
  disabled?: boolean;
  filterOption?: (option: SelectableValue<T>, searchQuery: string) => boolean;
  formatOptionLabel?: (item: SelectableValue<T>, formatOptionMeta: FormatOptionLabelMeta<T>) => React.ReactNode;
  /** Function for formatting the text that is displayed when creating a new value*/
  formatCreateLabel?: (input: string) => React.ReactNode;
  getOptionLabel?: (item: SelectableValue<T>) => React.ReactNode;
  getOptionValue?: (item: SelectableValue<T>) => T | undefined;
  hideSelectedOptions?: boolean;
  inputValue?: string;
  invalid?: boolean;
  isClearable?: boolean;
  /** The id to set on the SelectContainer component. To set the id for a label (with htmlFor), @see inputId instead */
  id?: string;
  isLoading?: boolean;
  isMulti?: boolean;
  /** The id of the search input. Use this to set a matching label with htmlFor */
  inputId?: string;
  isOpen?: boolean;
  /** Disables the possibility to type into the input*/
  isSearchable?: boolean;
  showAllSelectedWhenOpen?: boolean;
  maxMenuHeight?: number;
  minMenuHeight?: number;
  maxVisibleValues?: number;
  menuPlacement?: 'auto' | 'bottom' | 'top';
  menuPosition?: 'fixed' | 'absolute';
  /**
   * Setting to false will prevent the menu from portalling to the body.
   */
  menuShouldPortal?: boolean;
  /** The message to display when no options could be found */
  noOptionsMessage?: string;
  onBlur?: () => void;
  onChange: (value: SelectableValue<T>, actionMeta: ActionMeta) => {} | void;
  onCloseMenu?: () => void;
  /** allowCustomValue must be enabled. Function decides what to do with that custom value. */
  onCreateOption?: (value: string) => void;
  onInputChange?: (value: string, actionMeta: InputActionMeta) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  /** Callback which fires when the user scrolls to the bottom of the menu */
  onMenuScrollToBottom?: (event: WheelEvent | TouchEvent) => void;
  /** Callback which fires when the user scrolls to the top of the menu */
  onMenuScrollToTop?: (event: WheelEvent | TouchEvent) => void;
  onOpenMenu?: () => void;
  onFocus?: () => void;
  toggleAllOptions?: {
    enabled: boolean;
    optionsFilter?: (v: SelectableValue<T>) => boolean;
    determineToggleAllState?: (
      selectedValues: Array<SelectableValue<T>>,
      options: Array<SelectableValue<T>>
    ) => ToggleAllState;
  };
  openMenuOnFocus?: boolean;
  options?: Array<SelectableValue<T>>;
  placeholder?: string;
  /** item to be rendered in front of the input */
  prefix?: JSX.Element | string | null;
  /** Use a custom element to control Select. A proper ref to the renderControl is needed if 'portal' isn't set to null*/
  renderControl?: ControlComponent<T>;
  tabSelectsValue?: boolean;
  value?: T | SelectValue<T> | null;
  /** Will wrap the MenuList in a react-window FixedSizeVirtualList for improved performance, does not support options with "description" properties */
  virtualized?: boolean;
  /** Sets the width to a multiple of 8px. Should only be used with inline forms. Setting width of the container is preferred in other cases.*/
  width?: number | 'auto';
  isOptionDisabled?: (option: SelectableValue<T>) => boolean;
  /** allowCustomValue must be enabled. Determines whether the "create new" option should be displayed based on the current input value, select value and options array. */
  isValidNewOption?: (
    inputValue: string,
    value: SelectableValue<T> | null,
    options: OptionsOrGroups<SelectableValue<T>, GroupBase<SelectableValue<T>>>
  ) => boolean;
  /** Message to display isLoading=true*/
  loadingMessage?: string;
  /** Disables wrapping of multi value values when closed */
  noMultiValueWrap?: boolean;
  /** Use a custom ref because generic component as output of React.forwardRef is not directly possible */
  selectRef?: React.Ref<HTMLElement>;
}

export interface SelectAsyncProps<T> {
  /** When specified as boolean the loadOptions will execute when component is mounted */
  defaultOptions?: boolean | Array<SelectableValue<T>>;

  /** Asynchronously load select options */
  loadOptions?: (query: string, cb?: LoadOptionsCallback<T>) => Promise<Array<SelectableValue<T>>> | void;

  /** If cacheOptions is true, then the loaded data will be cached. The cache will remain until cacheOptions changes value. */
  cacheOptions?: boolean;
  /** Message to display when options are loading */
  loadingMessage?: string;
}

/** The VirtualizedSelect component uses a slightly different SelectableValue, description and other props are not supported */
export interface VirtualizedSelectProps<T> extends Omit<SelectCommonProps<T>, 'virtualized'> {
  options?: Array<Pick<SelectableValue<T>, 'label' | 'value'>>;
}

/** The AsyncVirtualizedSelect component uses a slightly different SelectableValue, description and other props are not supported */
export interface VirtualizedSelectAsyncProps<T>
  extends Omit<SelectCommonProps<T>, 'virtualized'>,
    SelectAsyncProps<T> {}

export interface MultiSelectCommonProps<T> extends Omit<SelectCommonProps<T>, 'onChange' | 'isMulti' | 'value'> {
  value?: Array<SelectableValue<T>> | T[];
  onChange: (item: Array<SelectableValue<T>>, actionMeta: ActionMeta) => {} | void;
}

// This is the type of *our* SelectBase component, not ReactSelect's prop, although
// they should be mostly compatible.
export interface SelectBaseProps<T> extends SelectCommonProps<T>, SelectAsyncProps<T> {
  invalid?: boolean;
}

// This is used for the `renderControl` prop on *our* SelectBase component
export interface CustomControlProps<T> {
  /**
   * Forwarded ref from react-select to the rendered control element.
   * Intentionally typed as `React.Ref<any>` because consumers of the public
   * `renderControl` API pass refs targeting diverse element types (HTMLInputElement,
   * HTMLDivElement, react-select internal component instances, etc.). Narrowing
   * to `React.Ref<HTMLElement>` rejects valid existing usages and is therefore a
   * breaking change to the public SDK surface (AAP §0.8.7 public API preservation).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CustomControlProps is a public SDK type; `ref` must accept refs of varying element types from external callers (AAP §0.8.7).
  ref: React.Ref<any>;
  isOpen: boolean;
  /** Currently selected value */
  value?: SelectableValue<T>;
  /** onClick will be automatically passed to custom control allowing menu toggle */
  onClick: () => void;
  /** onBlur will be automatically passed to custom control closing the menu on element blur */
  onBlur: () => void;
  disabled: boolean;
  invalid: boolean;
}

export type ControlComponent<T> = React.ComponentType<CustomControlProps<T>>;

/**
 * Public SDK type. Generic default `any` and index signature `any` are
 * intentionally retained: plugin authors use `SelectableOptGroup` without
 * specifying a generic argument and depend on the index signature to attach
 * react-select-specific bag fields (`isFixed`, `isDisabled`, custom
 * grouping metadata). Narrowing to `unknown` rejects existing call sites and
 * breaks plugin authoring (AAP §0.8.7 public API preservation; §0.8.6 step 7).
 */
export interface SelectableOptGroup<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SelectableOptGroup is a public SDK type; default must remain `any` so plugin authors who omit the generic argument keep backwards-compatible typing (AAP §0.8.7).
  T = any,
> {
  label: string;
  options: Array<SelectableValue<T>>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Public SDK index signature; consumers attach react-select-specific bag fields of varying shape. Narrowing to `unknown` breaks downstream reads (AAP §0.8.7).
  [key: string]: any;
}

export type SelectOptions<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SelectOptions is a public SDK type; default must remain `any` so plugin authors who omit the generic argument keep backwards-compatible typing (AAP §0.8.7).
  T = any,
> =
  | SelectableValue<T>
  | Array<SelectableValue<T> | SelectableOptGroup<T> | Array<SelectableOptGroup<T>>>;

export type FormatOptionLabelMeta<T> = { context: string; inputValue: string; selectValue: Array<SelectableValue<T>> };

// This is the type of `selectProps` our custom components (like SelectContainer, etc) recieve
// It's slightly different to the base react select props because we pass in additional props directly to
// react select
export type ReactSelectProps<Option, IsMulti extends boolean, Group extends GroupBase<Option>> = ReactSelectCommonProps<
  Option,
  IsMulti,
  Group
>['selectProps'] &
  SelectCommonProps<Option> & {
    autoWidth: boolean;
  };

// Use this type when implementing custom components for react select.
// See SelectContainerProps in SelectContainer.tsx
export interface CustomComponentProps<Option, isMulti extends boolean, Group extends GroupBase<Option>> {
  selectProps: ReactSelectProps<Option, isMulti, Group>;
}
