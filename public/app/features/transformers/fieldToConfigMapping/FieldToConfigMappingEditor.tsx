import { css } from '@emotion/css';
import { capitalize } from 'lodash';
import { useCallback, useMemo } from 'react';

import {
  type DataFrame,
  getFieldDisplayName,
  type GrafanaTheme2,
  ReducerID,
  type SelectableValue,
} from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { InteractiveTable, Select, StatsPicker, useStyles2, type Column } from '@grafana/ui';

import {
  configMapHandlers,
  evaluateFieldMappings,
  type FieldToConfigMapHandler,
  type FieldToConfigMapping,
  type HandlerArguments,
  lookUpConfigHandler as findConfigHandlerFor,
} from '../fieldToConfigMapping/fieldToConfigMapping';

import {
  createsArgumentsEditor,
  FieldConfigMappingHandlerArgumentsEditor,
} from './FieldConfigMappingHandlerArgumentsEditor';

export interface Props {
  frame: DataFrame;
  mappings: FieldToConfigMapping[];
  onChange: (mappings: FieldToConfigMapping[]) => void;
  withReducers?: boolean;
  withNameAndValue?: boolean;
}

export function FieldToConfigMappingEditor({ frame, mappings, onChange, withReducers, withNameAndValue }: Props) {
  const styles = useStyles2(getStyles);
  const rows = getViewModelRows(frame, mappings, withNameAndValue);
  const configProps = configMapHandlers.map((def) => configHandlerToSelectOption(def, false)) as Array<
    SelectableValue<string>
  >;
  const hasAdditionalSettings = mappings.reduce(
    (prev, mapping) => prev || createsArgumentsEditor(mapping.handlerKey),
    false
  );

  const onChangeConfigProperty = useCallback(
    (row: FieldToConfigRowViewModel, value: SelectableValue<string | null>) => {
      const existingIdx = mappings.findIndex((x) => x.fieldName === row.fieldName);

      if (value) {
        if (existingIdx !== -1) {
          const update = [...mappings];
          update.splice(existingIdx, 1, { ...mappings[existingIdx], handlerKey: value.value! });
          onChange(update);
        } else {
          onChange([...mappings, { fieldName: row.fieldName, handlerKey: value.value! }]);
        }
      } else {
        if (existingIdx !== -1) {
          onChange(mappings.filter((x, index) => index !== existingIdx));
        } else {
          onChange([...mappings, { fieldName: row.fieldName, handlerKey: '__ignore' }]);
        }
      }
    },
    [mappings, onChange]
  );

  const onChangeReducer = useCallback(
    (row: FieldToConfigRowViewModel, reducerId: ReducerID) => {
      const existingIdx = mappings.findIndex((x) => x.fieldName === row.fieldName);

      if (existingIdx !== -1) {
        const update = [...mappings];
        update.splice(existingIdx, 1, { ...mappings[existingIdx], reducerId });
        onChange(update);
      } else {
        onChange([...mappings, { fieldName: row.fieldName, handlerKey: row.handlerKey, reducerId }]);
      }
    },
    [mappings, onChange]
  );

  const onChangeHandlerArguments = useCallback(
    (row: FieldToConfigRowViewModel, handlerArguments: HandlerArguments) => {
      const existingIdx = mappings.findIndex((x) => x.fieldName === row.fieldName);

      if (existingIdx !== -1) {
        const update = [...mappings];
        update.splice(existingIdx, 1, { ...mappings[existingIdx], handlerArguments });
        onChange(update);
      } else {
        onChange([...mappings, { fieldName: row.fieldName, handlerKey: row.handlerKey, handlerArguments }]);
      }
    },
    [mappings, onChange]
  );

  const columns = useMemo<Array<Column<FieldToConfigRowViewModel>>>(() => {
    const cols: Array<Column<FieldToConfigRowViewModel>> = [
      {
        id: 'fieldName',
        header: <Trans i18nKey="transformers.field-to-config-mapping-editor.field">Field</Trans>,
        cell: ({ row: { original } }) => <span className={styles.labelCell}>{original.fieldName}</span>,
      },
      {
        id: 'configOption',
        header: <Trans i18nKey="transformers.field-to-config-mapping-editor.use-as">Use as</Trans>,
        cell: ({ row: { original } }) => (
          <div className={styles.selectCell} data-testid={`${original.fieldName}-config-key`}>
            <Select
              options={configProps}
              value={original.configOption}
              placeholder={original.placeholder}
              isClearable={true}
              onChange={(value) => onChangeConfigProperty(original, value)}
            />
          </div>
        ),
      },
    ];

    if (withReducers) {
      cols.push({
        id: 'reducerId',
        header: <Trans i18nKey="transformers.field-to-config-mapping-editor.select">Select</Trans>,
        cell: ({ row: { original } }) => (
          <div data-testid={`${original.fieldName}-reducer`} className={styles.selectCell}>
            <StatsPicker
              stats={[original.reducerId]}
              defaultStat={original.reducerId}
              onChange={(stats: string[]) => onChangeReducer(original, stats[0] as ReducerID)}
            />
          </div>
        ),
      });
    }

    if (hasAdditionalSettings) {
      cols.push({
        id: 'handlerArguments',
        header: (
          <Trans i18nKey="transformers.field-to-config-mapping-editor.additional-settings">Additional settings</Trans>
        ),
        cell: ({ row: { original } }) => (
          <div data-testid={`${original.fieldName}-handler-arg`} className={styles.selectCell}>
            <FieldConfigMappingHandlerArgumentsEditor
              handlerKey={original.handlerKey}
              handlerArguments={original.handlerArguments}
              onChange={(args) => onChangeHandlerArguments(original, args)}
            />
          </div>
        ),
      });
    }

    return cols;
  }, [
    styles,
    configProps,
    withReducers,
    hasAdditionalSettings,
    onChangeConfigProperty,
    onChangeReducer,
    onChangeHandlerArguments,
  ]);

  return <InteractiveTable columns={columns} data={rows} getRowId={(row) => row.fieldName} />;
}

interface FieldToConfigRowViewModel {
  handlerKey: string | null;
  fieldName: string;
  configOption: SelectableValue<string | null> | null;
  placeholder?: string;
  missingInFrame?: boolean;
  reducerId: string;
  handlerArguments: HandlerArguments;
}

function getViewModelRows(
  frame: DataFrame,
  mappings: FieldToConfigMapping[],
  withNameAndValue?: boolean
): FieldToConfigRowViewModel[] {
  const rows: FieldToConfigRowViewModel[] = [];
  const mappingResult = evaluateFieldMappings(frame, mappings ?? [], withNameAndValue);

  for (const field of frame.fields) {
    const fieldName = getFieldDisplayName(field, frame);
    const mapping = mappingResult.index[fieldName];
    const option = configHandlerToSelectOption(mapping.handler, mapping.automatic);

    rows.push({
      fieldName,
      configOption: mapping.automatic ? null : option,
      placeholder: mapping.automatic ? option?.label : 'Choose',
      handlerKey: mapping.handler?.key ?? null,
      reducerId: mapping.reducerId,
      handlerArguments: mapping.handlerArguments,
    });
  }

  // Add rows for mappings that have no matching field
  for (const mapping of mappings) {
    if (!rows.find((x) => x.fieldName === mapping.fieldName)) {
      const handler = findConfigHandlerFor(mapping.handlerKey);

      rows.push({
        fieldName: mapping.fieldName,
        handlerKey: mapping.handlerKey,
        configOption: configHandlerToSelectOption(handler, false),
        missingInFrame: true,
        reducerId: mapping.reducerId ?? ReducerID.lastNotNull,
        handlerArguments: {},
      });
    }
  }

  return Object.values(rows);
}

function configHandlerToSelectOption(
  def: FieldToConfigMapHandler | null,
  isAutomatic: boolean
): SelectableValue<string> | null {
  if (!def) {
    return null;
  }

  let name = def.name ?? capitalize(def.key);

  if (isAutomatic) {
    name = `${name} (auto)`;
  }

  return {
    label: name,
    value: def.key,
  };
}

const getStyles = (theme: GrafanaTheme2) => ({
  labelCell: css({
    fontSize: theme.typography.bodySmall.fontSize,
    background: theme.colors.background.secondary,
    padding: theme.spacing(0, 1),
    maxWidth: '400px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: '140px',
  }),
  selectCell: css({
    padding: 0,
    minWidth: '161px',
  }),
});
