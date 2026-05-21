import { css } from '@emotion/css';
import { type PropsWithChildren, useId } from 'react';
import * as React from 'react';

import { type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { Field, Select, useStyles2 } from '@grafana/ui';

interface VariableSelectFieldProps<T> {
  name: string;
  value?: SelectableValue<T>;
  options: Array<SelectableValue<T>>;
  onChange: (option: SelectableValue<T>) => void;
  testId?: string;
  width?: number;
  description?: React.ReactNode;
}

// Generic over the option value type `T` so each call site infers `T` from its own `options` /
// `onChange` props. Call sites that select between string-literal unions (e.g.
// `'before' | 'after' | 'sorted'` in `QueryVariableStaticOptions.tsx`) must declare the matching
// `SelectableValue<T>` shape on their options array so `T` is not widened to `string`; this avoids
// any `any` annotation while preserving inference for enum-valued and free-form call sites.
export function VariableSelectField<T>({
  name,
  description,
  value,
  options,
  onChange,
  testId,
  width,
}: PropsWithChildren<VariableSelectFieldProps<T>>) {
  const styles = useStyles2(getStyles);
  const uniqueId = useId();
  const inputId = `variable-select-input-${name}-${uniqueId}`;

  return (
    <Field label={name} description={description} htmlFor={inputId}>
      <Select<T>
        data-testid={testId}
        inputId={inputId}
        onChange={onChange}
        value={value}
        width={width ?? 30}
        options={options}
        className={styles.selectContainer}
      />
    </Field>
  );
}

function getStyles(theme: GrafanaTheme2) {
  return {
    selectContainer: css({
      marginRight: theme.spacing(0.5),
    }),
  };
}
