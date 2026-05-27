import { css } from '@emotion/css';
import { memo, useState, useEffect, useCallback, useMemo } from 'react';

import {
  type SelectableValue,
  getFieldDisplayName,
  type AnnotationEvent,
  type AnnotationEventMappings,
  type AnnotationEventFieldMapping,
  formattedValueToString,
  AnnotationEventFieldSource,
  getValueFormat,
  type GrafanaTheme2,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  type CellProps,
  type Column,
  Icon,
  InteractiveTable,
  Label,
  Select,
  Tooltip,
  useStyles2,
} from '@grafana/ui';

import { getAnnotationEventNames, type AnnotationFieldInfo } from '../standardAnnotationSupport';
import { type AnnotationQueryResponse } from '../types';

interface Props {
  response?: AnnotationQueryResponse;
  mappings?: AnnotationEventMappings;
  change: (mappings?: AnnotationEventMappings) => void;
}

interface AnnotationFieldRow extends AnnotationFieldInfo {
  mapping: AnnotationEventFieldMapping;
  preview: string;
}

export const AnnotationFieldMapper = memo(({ response, mappings, change }: Props) => {
  const styles = useStyles2(getStyles);
  const [fieldNames, setFieldNames] = useState<Array<SelectableValue<string>>>([]);

  useEffect(() => {
    const panelData = response?.panelData;
    const frame = panelData?.series?.[0] ?? panelData?.annotations?.[0];
    if (frame && frame.fields) {
      const newFieldNames = frame.fields.map((f) => {
        const name = getFieldDisplayName(f, frame);

        let description = '';
        for (let i = 0; i < frame.length; i++) {
          if (i > 0) {
            description += ', ';
          }
          if (i > 2) {
            description += '...';
            break;
          }
          description += f.values[i];
        }

        if (description.length > 50) {
          description = description.substring(0, 50) + '...';
        }

        return {
          label: `${name} (${f.type})`,
          value: name,
          description,
        };
      });
      setFieldNames(newFieldNames);
    }
  }, [response]);

  const onFieldNameChange = useCallback(
    (k: keyof AnnotationEvent, v: SelectableValue<string>) => {
      const currentMappings = mappings || {};

      // in case of clearing the value
      if (!v) {
        const newMappings = { ...mappings };
        delete newMappings[k];
        change(newMappings);
        return;
      }

      const mapping = currentMappings[k] || {};

      change({
        ...currentMappings,
        [k]: {
          ...mapping,
          value: v.value,
          source: AnnotationEventFieldSource.Field,
        },
      });
    },
    [mappings, change]
  );

  const data = useMemo<AnnotationFieldRow[]>(() => {
    const first = response?.events?.[0];
    const currentMappings = mappings || {};
    return getAnnotationEventNames().map((row) => {
      let value = first ? first[row.key] : '';
      if (value && row.key.startsWith('time')) {
        const fmt = getValueFormat('dateTimeAsIso');
        value = formattedValueToString(fmt(value));
      }
      if (value === null || value === undefined) {
        value = ''; // empty string
      }
      return {
        ...row,
        mapping: currentMappings[row.key] || {},
        preview: typeof value === 'string' ? value : String(value),
      };
    });
  }, [response, mappings]);

  const columns = useMemo<Array<Column<AnnotationFieldRow>>>(
    () => [
      {
        id: 'annotation',
        header: t('annotations.annotation-field-mapper.annotation', 'Annotation'),
        cell: ({ row: { original } }: CellProps<AnnotationFieldRow>) => (
          <Label htmlFor={`select-${original.key}`}>
            {original.label || original.key}{' '}
            {original.help && (
              <Tooltip content={original.help}>
                <Icon name="info-circle" />
              </Tooltip>
            )}
          </Label>
        ),
      },
      {
        id: 'from',
        header: t('annotations.annotation-field-mapper.from', 'From'),
        cell: ({ row: { original } }: CellProps<AnnotationFieldRow>) => {
          let picker = [...fieldNames];
          const current = original.mapping.value;
          let currentValue = fieldNames.find((f) => current === f.value);
          if (current && !currentValue) {
            picker.push({
              label: current,
              value: current,
            });
          }
          return (
            <Select
              value={currentValue}
              options={picker}
              inputId={`select-${original.key}`}
              placeholder={original.placeholder || original.key}
              onChange={(v: SelectableValue<string>) => {
                onFieldNameChange(original.key, v);
              }}
              noOptionsMessage={t(
                'annotations.annotation-field-mapper.noOptionsMessage-unknown-field-names',
                'Unknown field names'
              )}
              allowCustomValue={true}
              isClearable
            />
          );
        },
      },
      {
        id: 'preview',
        header: t('annotations.annotation-field-mapper.first-value', 'First value'),
        cell: ({ row: { original } }: CellProps<AnnotationFieldRow>) =>
          original.preview ? (
            <Tooltip content={original.preview}>
              <span className={styles.valueCell}>{original.preview}</span>
            </Tooltip>
          ) : null,
      },
    ],
    [fieldNames, onFieldNameChange, styles.valueCell]
  );

  return <InteractiveTable columns={columns} data={data} getRowId={(row) => row.key} />;
});

AnnotationFieldMapper.displayName = 'AnnotationFieldMapper';

const getStyles = (theme: GrafanaTheme2) => ({
  valueCell: css({
    display: 'block',
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
});
