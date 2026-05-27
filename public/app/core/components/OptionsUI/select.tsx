import { useEffect, useState } from 'react';

import { type StandardEditorProps, type SelectFieldConfigSettings, type SelectableValue } from '@grafana/data';
import { Select } from '@grafana/ui';

type Props<T> = StandardEditorProps<T, SelectFieldConfigSettings<T>>;

export function SelectValueEditor<T>({ value, onChange, item, id, context }: Props<T>) {
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

  let current = options.find((v) => v.value === value);
  if (!current && value) {
    current = {
      label: `${value}`,
      value,
    };
  }

  return (
    <Select<T>
      inputId={id}
      isLoading={isLoading}
      value={current}
      defaultValue={value}
      allowCustomValue={settings?.allowCustomValue}
      isClearable={settings?.isClearable}
      onChange={(e) => onChange(e?.value)}
      options={options}
    />
  );
}
