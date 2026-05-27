import { type ReactNode, useMemo, useState } from 'react';

import { getTemplateSrv } from '@grafana/runtime';
import { type Column, InlineField, InteractiveTable, TextArea } from '@grafana/ui';

import { type DerivedFieldConfig } from '../types';

type Props = {
  derivedFields?: DerivedFieldConfig[];
  className?: string;
};
export const DebugSection = (props: Props) => {
  const { derivedFields, className } = props;
  const [debugText, setDebugText] = useState('');

  let debugFields: DebugField[] = [];
  if (debugText && derivedFields) {
    debugFields = makeDebugFields(derivedFields, debugText);
  }

  return (
    <div className={className}>
      <InlineField label="Debug log message" labelWidth={24} grow>
        <TextArea
          type="text"
          aria-label="Loki query"
          placeholder="Paste an example log line here to test the regular expressions of your derived fields"
          value={debugText}
          onChange={(event) => setDebugText(event.currentTarget.value)}
        />
      </InlineField>
      {!!debugFields.length && <DebugFields fields={debugFields} />}
    </div>
  );
};

type DebugFieldItemProps = {
  fields: DebugField[];
};
const DebugFields = ({ fields }: DebugFieldItemProps) => {
  const columns: Array<Column<DebugField>> = useMemo(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row: { original } }) => original.name,
      },
      {
        id: 'value',
        header: 'Value',
        cell: ({ row: { original } }) => {
          let value: ReactNode = original.value;
          if (original.error && original.error instanceof Error) {
            value = original.error.message;
          } else if (original.href) {
            value = <a href={original.href}>{original.value}</a>;
          }
          return value;
        },
      },
      {
        id: 'url',
        header: 'Url',
        cell: ({ row: { original } }) => (original.href ? <a href={original.href}>{original.href}</a> : ''),
      },
    ],
    []
  );

  return <InteractiveTable columns={columns} data={fields} getRowId={(field) => `${field.name}=${field.value}`} />;
};

type DebugField = {
  name: string;
  error?: unknown;
  value?: string;
  href?: string;
};

function makeDebugFields(derivedFields: DerivedFieldConfig[], debugText: string): DebugField[] {
  return derivedFields
    .filter((field) => field.name && field.matcherRegex)
    .map((field) => {
      try {
        const testMatch = debugText.match(field.matcherRegex);
        let href;
        const value = testMatch && testMatch[1];

        if (value) {
          href = getTemplateSrv().replace(field.url, {
            __value: {
              value: {
                raw: value,
              },
              text: 'Raw value',
            },
          });
        }
        const debugFiled: DebugField = {
          name: field.name,
          value: value || '<no match>',
          href,
        };
        return debugFiled;
      } catch (error) {
        return {
          name: field.name,
          error,
        };
      }
    });
}
