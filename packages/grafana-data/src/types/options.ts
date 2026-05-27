import { type DataFrame } from './dataFrame';

/**
 * Base class for editor builders
 *
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic defaults `TSettings = any, TValue = any` preserved for back-compat with panel/field config builders that omit explicit type parameters across hundreds of call sites
export interface OptionEditorConfig<TOptions, TSettings = any, TValue = any> {
  /**
   * Path of the option property to control.
   *
   * @example
   * Given options object of a type:
   * ```ts
   * interface Options {
   *   a: {
   *     b: string;
   *   }
   * }
   * ```
   *
   * path can be either 'a' or 'a.b'.
   */
  path: (keyof TOptions & string) | string;

  /**
   * Name of the option. Will be displayed in the UI as form element label.
   */
  name: string;

  /**
   * Description of the option. Will be displayed in the UI as form element description.
   */
  description?: string;

  /**
   * Custom settings of the editor.
   */
  settings?: TSettings;

  /**
   * Array of strings representing category of the option. First element in the array will make option render as collapsible section.
   */
  category?: string[];

  /**
   * Set this value if undefined
   */
  defaultValue?: TValue;

  /**
   * Function that enables configuration of when option editor should be shown based on current panel option properties.
   */
  showIf?: (currentOptions: TOptions, data?: DataFrame[], annotations?: DataFrame[]) => boolean | undefined;
}
