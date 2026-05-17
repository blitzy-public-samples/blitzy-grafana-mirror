import { type VariableValue, type FormatVariable } from '@grafana/scenes';
import { type VariableModel, type VariableType } from '@grafana/schema';

import { ALL_VARIABLE_TEXT, ALL_VARIABLE_VALUE } from '../variables/constants';

export class LegacyVariableWrapper implements FormatVariable {
  state: { name: string; value: VariableValue; text: VariableValue; type: VariableType };

  constructor(variable: Partial<VariableModel>, value: unknown, text: unknown) {
    this.state = {
      name: variable.name ?? '',
      value: toVariableValue(value),
      text: toVariableValue(text),
      type: variable.type ?? 'constant',
    };
  }

  getValue(_fieldPath: string): VariableValue {
    let { value } = this.state;

    if (value === 'string' || value === 'number' || value === 'boolean') {
      return value;
    }

    return String(value);
  }

  getValueText(): string {
    const { value, text } = this.state;

    if (typeof text === 'string') {
      return value === ALL_VARIABLE_VALUE ? ALL_VARIABLE_TEXT : text;
    }

    if (Array.isArray(text)) {
      return text.join(' + ');
    }

    console.log('value', text);
    return String(text);
  }
}

/**
 * Coerce an arbitrary unknown value to scenes' VariableValue type.
 *
 * Used by LegacyVariableWrapper to satisfy the FormatVariable contract while
 * accepting the wider input types that flow through formatVariableValue's
 * caller chain (template_srv -> IndexedVariable.current.value, ScopedVar.value,
 * macros, etc.). Runtime behavior is preserved because the upstream
 * formatVariableValue object-to-string coercion ensures incoming values are
 * already primitives or arrays of primitives by the time we reach this
 * function in production code paths.
 *
 * null/undefined are coerced to '' because they are not valid VariableValue types.
 * Non-primitive array elements and non-array objects are stringified via String().
 */
function toVariableValue(v: unknown): VariableValue {
  if (v === null || v === undefined) {
    return '';
  }
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return v;
  }
  if (Array.isArray(v)) {
    return v.map((item): string | number | boolean => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return item;
      }
      return String(item);
    });
  }
  return String(v);
}

let legacyVariableWrapper: LegacyVariableWrapper | undefined;

/**
 * Reuses a single instance to avoid unnecessary memory allocations
 */
export function getVariableWrapper(variable: Partial<VariableModel>, value: unknown, text: unknown) {
  // TODO: provide more legacy variable properties, i.e. multi, includeAll that are used in custom interpolators,
  // see Prometheus data source for example
  if (!legacyVariableWrapper) {
    legacyVariableWrapper = new LegacyVariableWrapper(variable, value, text);
  } else {
    legacyVariableWrapper.state.name = variable.name ?? '';
    legacyVariableWrapper.state.type = variable.type ?? 'constant';
    legacyVariableWrapper.state.value = toVariableValue(value);
    legacyVariableWrapper.state.text = toVariableValue(text);
  }

  return legacyVariableWrapper;
}
