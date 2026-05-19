import { useEffect, useState } from 'react';

import {
  DataTransformerID,
  type KeyValue,
  standardTransformers,
  type TransformerRegistryItem,
  type TransformerUIProps,
  getFieldDisplayName,
  stringToJsRegex,
  TransformerCategory,
  type SelectableValue,
} from '@grafana/data';
import { type FilterFieldsByNameTransformerOptions } from '@grafana/data/internal';
import { t } from '@grafana/i18n';
import { getTemplateSrv } from '@grafana/runtime';
import { Input, FilterPill, InlineFieldRow, InlineField, InlineSwitch, Select } from '@grafana/ui';

import { getTransformationContent } from '../docs/getTransformationContent';
import darkImage from '../images/dark/filterFieldsByName.svg';
import lightImage from '../images/light/filterFieldsByName.svg';

interface FilterByNameTransformerEditorProps extends TransformerUIProps<FilterFieldsByNameTransformerOptions> {}

interface FilterByNameTransformerEditorState {
  include: string[];
  options: FieldNameInfo[];
  selected: string[];
  regex?: string;
  variable?: string;
  variables: SelectableValue[];
  byVariable: boolean;
  isRegexValid?: boolean;
}

interface FieldNameInfo {
  name: string;
  count: number;
}
export const FilterByNameTransformerEditor = (props: FilterByNameTransformerEditorProps) => {
  const { input, options, onChange: propsOnChange } = props;

  const [state, setState] = useState<FilterByNameTransformerEditorState>(() => ({
    include: options.include?.names || [],
    regex: options.include?.pattern,
    variable: options.include?.variable,
    byVariable: options.byVariable || false,
    options: [],
    variables: [],
    selected: [],
    isRegexValid: true,
  }));

  // Equivalent to class componentDidMount + componentDidUpdate(oldProps) when input changes.
  // initOptions is intentionally invoked only when `input` changes; `options` is read inside but
  // is a stable reference for the duration this effect runs (the parent re-renders provide a fresh
  // `options` along with each `input`). Including `options` in deps would re-run the effect on
  // every parent re-render, which the class form did NOT do — preserve original behavior.
  useEffect(() => {
    const configuredOptions = Array.from(options.include?.names ?? []);

    const variables = getTemplateSrv()
      .getVariables()
      .map((v) => ({ label: '$' + v.name, value: '$' + v.name }));
    const allNames: FieldNameInfo[] = [];
    const byName: KeyValue<FieldNameInfo> = {};

    for (const frame of input) {
      for (const field of frame.fields) {
        const displayName = getFieldDisplayName(field, frame, input);
        let v = byName[displayName];

        if (!v) {
          v = byName[displayName] = {
            name: displayName,
            count: 0,
          };
          allNames.push(v);
        }

        v.count++;
      }
    }

    if (options.include?.pattern) {
      try {
        const regex = stringToJsRegex(options.include.pattern);

        for (const info of allNames) {
          if (regex.test(info.name)) {
            configuredOptions.push(info.name);
          }
        }
      } catch (error) {
        console.error(error);
      }
    }

    if (configuredOptions.length) {
      const selected: FieldNameInfo[] = allNames.filter((n) => configuredOptions.includes(n.name));

      setState((prev) => ({
        ...prev,
        options: allNames,
        selected: selected.map((s) => s.name),
        variables: variables,
        byVariable: options.byVariable || false,
        variable: options.include?.variable,
        regex: options.include?.pattern,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        options: allNames,
        selected: allNames.map((n) => n.name),
        variables: variables,
        byVariable: options.byVariable || false,
        variable: options.include?.variable,
        regex: options.include?.pattern,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const onFieldChange = (selected: string[]) => {
    const newOptions: FilterFieldsByNameTransformerOptions = {
      ...options,
      include: { names: selected },
    };

    if (state.regex && state.isRegexValid) {
      newOptions.include = newOptions.include ?? {};
      newOptions.include.pattern = state.regex;
    }

    setState((prev) => ({ ...prev, selected }));
    propsOnChange(newOptions);
  };

  const onFieldToggle = (fieldName: string) => {
    if (state.selected.indexOf(fieldName) > -1) {
      onFieldChange(state.selected.filter((s) => s !== fieldName));
    } else {
      onFieldChange([...state.selected, fieldName]);
    }
  };

  const onInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let isRegexValid = true;

    try {
      if (state.regex) {
        stringToJsRegex(state.regex);
      }
    } catch (e) {
      isRegexValid = false;
    }

    if (isRegexValid) {
      propsOnChange({
        ...options,
        include: { pattern: state.regex },
      });
    } else {
      propsOnChange({
        ...options,
        include: { names: state.selected },
      });
    }

    setState((prev) => ({ ...prev, isRegexValid }));
  };

  const onVariableChange = (selected: SelectableValue) => {
    propsOnChange({
      ...options,
      include: { variable: selected.value },
    });

    setState((prev) => ({ ...prev, variable: selected.value }));
  };

  const onFromVariableChange = (e: React.FormEvent<HTMLInputElement>) => {
    const val = e.currentTarget.checked;
    propsOnChange({ ...options, byVariable: val });
    setState((prev) => ({ ...prev, byVariable: val }));
  };

  const { options: nameOptions, selected, isRegexValid } = state;
  return (
    <div>
      <InlineFieldRow label={t('transformers.filter-by-name-transformer-editor.label-use-variable', 'Use variable')}>
        <InlineField label={t('transformers.filter-by-name-transformer-editor.label-from-variable', 'From variable')}>
          <InlineSwitch value={state.byVariable} onChange={onFromVariableChange}></InlineSwitch>
        </InlineField>
      </InlineFieldRow>
      {state.byVariable ? (
        <InlineFieldRow>
          <InlineField label={t('transformers.filter-by-name-transformer-editor.label-variable', 'Variable')}>
            <Select value={state.variable} onChange={onVariableChange} options={state.variables || []}></Select>
          </InlineField>
        </InlineFieldRow>
      ) : (
        <InlineFieldRow label={t('transformers.filter-by-name-transformer-editor.label-identifier', 'Identifier')}>
          <InlineField
            label={t('transformers.filter-by-name-transformer-editor.label-identifier', 'Identifier')}
            invalid={!isRegexValid}
            error={!isRegexValid ? 'Invalid pattern' : undefined}
          >
            <Input
              placeholder={t(
                'transformers.filter-by-name-transformer-editor.placeholder-regular-expression-pattern',
                'Regular expression pattern'
              )}
              value={state.regex || ''}
              onChange={(e) => setState((prev) => ({ ...prev, regex: e.currentTarget.value }))}
              onBlur={onInputBlur}
              width={25}
            />
          </InlineField>
          {nameOptions.map((o, i) => {
            const label = `${o.name}${o.count > 1 ? ' (' + o.count + ')' : ''}`;
            const isSelected = selected.indexOf(o.name) > -1;
            return (
              <FilterPill
                key={`${o.name}/${i}`}
                onClick={() => {
                  onFieldToggle(o.name);
                }}
                label={label}
                selected={isSelected}
              />
            );
          })}
        </InlineFieldRow>
      )}
    </div>
  );
};

export const getFilterFieldsByNameTransformRegistryItem: () => TransformerRegistryItem<FilterFieldsByNameTransformerOptions> =
  () => ({
    id: DataTransformerID.filterFieldsByName,
    editor: FilterByNameTransformerEditor,
    transformation: standardTransformers.filterFieldsByNameTransformer,
    name: t('transformers.filter-by-name-transformer-editor.name.filter-fields-by-name', 'Filter fields by name'),
    description: t(
      'transformers.filter-by-name-transformer-editor.description.remove-part-query-results-regex-pattern',
      'Remove parts of the query results using a regex pattern.'
    ),
    categories: new Set([TransformerCategory.Filter]),
    help: getTransformationContent(DataTransformerID.filterFieldsByName).helperDocs,
    imageDark: darkImage,
    imageLight: lightImage,
  });
