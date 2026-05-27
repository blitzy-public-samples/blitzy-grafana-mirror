import { type VariableModel } from '@grafana/data';
import { formatRegistry, type FormatVariable } from '@grafana/scenes';
import { VariableFormatID } from '@grafana/schema';

import { getVariableWrapper } from './LegacyVariableWrapper';

export function formatVariableValue(
  value: unknown,
  format?: string | Function,
  variable?: Partial<VariableModel>,
  text?: unknown
): string {
  // for some scopedVars there is no variable
  variable = variable || {};

  if (value === null || value === undefined) {
    return '';
  }

  // Inline check (semantically identical to the now-deprecated isAdHoc(variable)
  // helper, which only checks model.type === 'adhoc'). Required because variable
  // is now typed as Partial<VariableModel> (whose name/type are optional) rather
  // than the full VariableModel that isAdHoc requires.
  if (variable.type === 'adhoc' && format !== VariableFormatID.QueryParam) {
    return '';
  }

  // if it's an object transform value to string
  if (!Array.isArray(value) && typeof value === 'object') {
    value = `${value}`;
  }

  if (typeof format === 'function') {
    return format(value, variable, formatVariableValue);
  }

  if (!format) {
    format = VariableFormatID.Glob;
  }

  // some formats have arguments that come after ':' character.
  // After the function-form early return above plus the falsy default just
  // applied, `format` is `string` for the remainder of the function.
  let args = format.split(':');
  if (args.length > 1) {
    format = args[0];
    args = args.slice(1);
  } else {
    args = [];
  }

  let formatItem = formatRegistry.getIfExists(format);

  if (!formatItem) {
    console.error(`Variable format ${format} not found. Using glob format as fallback.`);
    formatItem = formatRegistry.get(VariableFormatID.Glob);
  }

  const formatVariable = getVariableWrapper(variable, value, text ?? value);

  // scenes' FormatRegistryItem.formatter is strictly typed to require VariableValue
  // (= string | boolean | number | CustomVariableValue | array of these). Our
  // `value` is typed as `unknown` because callers pass arbitrary scoped-var values
  // (ScopedVar<T = any>). At runtime, the earlier guards in this function (null/
  // undefined returned early, non-array objects coerced to strings via template
  // literal) ensure `value` reaching this point is a primitive, an array, or a
  // string, all of which scenes' formatters handle correctly via Array.isArray /
  // value.join(',') / String(value) internally. We expose this runtime
  // guarantee to the type system by referencing the formatter through a method-
  // shorthand-typed local whose parameter is `unknown`. TypeScript checks methods
  // bivariantly, so this assignment is permitted by the type system, and at
  // runtime it is a no-op reference to the same registry entry.
  const lenientFormatter: {
    formatter(value: unknown, args: string[], variable: FormatVariable, fieldPath?: string): string;
  } = formatItem;
  return lenientFormatter.formatter(value, args, formatVariable);
}
