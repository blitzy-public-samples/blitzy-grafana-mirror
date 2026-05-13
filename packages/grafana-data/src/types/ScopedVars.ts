import { type DataFrame, type Field } from './dataFrame';
import { type DisplayValue } from './displayValue';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `T = any` preserved for back-compat: ScopedVar is one of the most-used types across Grafana variable interpolation; consumers default to `any` value when not parameterizing
export interface ScopedVar<T = any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `text` is the heterogeneous human-readable representation of a variable value (string, string[], number, etc.) consumed directly by template_srv.getVariableText and scene LocalValueVariable.text (typed as VariableValue from @grafana/scenes); tightening to `unknown` would force narrowing in interpolation hot paths that are out of scope per AAP §0.9.2.12 minimal-change mandate
  text?: any;
  value: T;
}

export interface ScopedVars {
  __dataContext?: DataContextScopedVar;
  [key: string]: ScopedVar | undefined;
}

/**
 * Used by data link macros
 */
export interface DataContextScopedVar {
  value: {
    data: DataFrame[];
    frame: DataFrame;
    field: Field;
    rowIndex?: number;
    frameIndex?: number;
    calculatedValue?: DisplayValue;
  };
}
