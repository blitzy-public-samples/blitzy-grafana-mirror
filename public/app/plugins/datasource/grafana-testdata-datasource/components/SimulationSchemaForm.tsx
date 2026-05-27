import { css } from '@emotion/css';
import { type FormEvent, useState, type ChangeEvent } from 'react';

import { type DataFrameSchema, type FieldSchema, type GrafanaTheme2 } from '@grafana/data';
import { useStyles2, TextArea, InlineField, Input, FieldSet, InlineSwitch } from '@grafana/ui';

/**
 * Simulation config blob whose keys/values are determined dynamically by the
 * server-supplied `DataFrameSchema`. Values are narrowed to their declared
 * `FieldSchema['type']` at use sites in `renderInput`.
 */
export type Config = Record<string, unknown>;

interface SchemaFormProps {
  config: Config;
  schema: DataFrameSchema;
  onChange: (config: Config) => void;
}

const renderInput = (field: FieldSchema, onChange: SchemaFormProps['onChange'], config: SchemaFormProps['config']) => {
  const fieldValue = config?.[field.name];
  switch (field.type) {
    case 'number': {
      const numValue = typeof fieldValue === 'number' ? fieldValue : undefined;
      return (
        <Input
          type="number"
          defaultValue={numValue}
          onChange={(e: FormEvent<HTMLInputElement>) => {
            const newValue = e.currentTarget.valueAsNumber;
            onChange({ ...config, [field.name]: newValue });
          }}
        />
      );
    }
    case 'boolean': {
      const boolValue = typeof fieldValue === 'boolean' ? fieldValue : true;
      return (
        <InlineSwitch
          value={boolValue}
          onChange={() => {
            onChange({ ...config, [field.name]: !fieldValue });
          }}
        />
      );
    }
    default: {
      const strValue = typeof fieldValue === 'string' ? fieldValue : undefined;
      return (
        <Input
          type="string"
          value={strValue}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const newValue = e.target.value;
            onChange({ ...config, [field.name]: newValue });
          }}
        />
      );
    }
  }
};

const getStyles = (theme: GrafanaTheme2) => {
  return {
    jsonView: css({
      marginBottom: theme.spacing(1),
    }),
  };
};

export const SimulationSchemaForm = ({ config, schema, onChange }: SchemaFormProps) => {
  const [jsonView, setJsonView] = useState<boolean>(false);

  const styles = useStyles2(getStyles);

  const onUpdateTextArea = (event: FormEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    onChange(JSON.parse(element.value));
  };

  return (
    <FieldSet label="Config">
      <InlineSwitch
        className={styles.jsonView}
        label="JSON View"
        showLabel
        value={jsonView}
        onChange={() => setJsonView(!jsonView)}
      />
      {jsonView ? (
        <TextArea defaultValue={JSON.stringify(config, null, 2)} rows={7} onChange={onUpdateTextArea} />
      ) : (
        <>
          {schema.fields.map((field) => (
            <InlineField label={field.name} key={field.name} labelWidth={14}>
              {renderInput(field, onChange, config)}
            </InlineField>
          ))}
        </>
      )}
    </FieldSet>
  );
};
