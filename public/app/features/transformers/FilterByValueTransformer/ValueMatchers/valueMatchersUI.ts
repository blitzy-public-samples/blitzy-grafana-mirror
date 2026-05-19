import { Registry } from '@grafana/data';

import { getBasicValueMatchersUI } from './BasicMatcherEditor';
import { getNoopValueMatchersUI } from './NoopMatcherEditor';
import { getRangeValueMatchersUI } from './RangeMatcherEditor';
import { getRegexValueMatchersUI } from './RegexMatcherEditor';
import { type ValueMatcherUIRegistryItem } from './types';

export const valueMatchersUI = new Registry<ValueMatcherUIRegistryItem<unknown>>(() => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- ValueMatcherUIProps<TOptions> is invariant in TOptions (TOptions appears in both covariant `options: TOptions` and contravariant `onChange: (options: TOptions, ...) => void` positions), so the spread of factory results (each returning Array<ValueMatcherUIRegistryItem<SpecificOptions>>) cannot be directly assigned to Array<ValueMatcherUIRegistryItem<unknown>>. The cast is sound at the registry boundary: items are stored opaquely and the sole consumer (FilterByValueFilterEditor.tsx) already treats matcher options as `unknown`.
  return [
    ...getBasicValueMatchersUI(),
    ...getNoopValueMatchersUI(),
    ...getRangeValueMatchersUI(),
    ...getRegexValueMatchersUI(),
  ] as Array<ValueMatcherUIRegistryItem<unknown>>;
});
