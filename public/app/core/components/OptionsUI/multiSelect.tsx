import { useEffect, useState } from 'react';

import { type StandardEditorProps, type SelectFieldConfigSettings, type SelectableValue } from '@grafana/data';
import { MultiSelect } from '@grafana/ui';

type Props<T> = StandardEditorProps<T[], SelectFieldConfigSettings<T>>;

/**
 * MultiSelect for options UI
 */
export function MultiSelectValueEditor<T>({ value, onChange, item, id, context }: Props<T>) {
  const [isLoading, setIsLoading] = useState(true);
  const [options, setOptions] = useState<Array<SelectableValue<T>>>([]);

  const settings = item?.settings;
  const contextData = context?.data;

  useEffect(() => {
    let cancelled = false;
    const updateOptions = async () => {
      let nextOptions: Array<SelectableValue<T>> = settings?.options || [];
      if (settings?.getOptions) {
        nextOptions = await settings.getOptions(context);
      }
      if (!cancelled) {
        setOptions((prev) => (prev !== nextOptions ? nextOptions : prev));
        setIsLoading(false);
      }
    };
    updateOptions();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, contextData]);

  return (
    <MultiSelect<T>
      inputId={id}
      isLoading={isLoading}
      value={value}
      defaultValue={value}
      allowCustomValue={settings?.allowCustomValue}
      onChange={(e) => {
        onChange(e.map((v) => v.value).flatMap((v) => (v !== undefined ? [v] : [])));
      }}
      options={options}
    />
  );
}
