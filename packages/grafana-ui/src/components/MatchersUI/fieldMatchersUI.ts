import { Registry } from '@grafana/data';

import { getFieldNameByRegexMatcherItem } from './FieldNameByRegexMatcherEditor';
import { getFieldNameMatcherItem } from './FieldNameMatcherEditor';
import { getFieldNamesMatcherItem } from './FieldNamesMatcherEditor';
import { getFieldTypeMatcherItem } from './FieldTypeMatcherEditor';
import { getFieldValueMatcherItem } from './FieldValueMatcher';
import { getFieldsByFrameRefIdItem } from './FieldsByFrameRefIdMatcher';
import { type FieldMatcherUIRegistryItem } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry holds heterogeneous matcher options; runtime types vary per matcher and cannot be unified
export const fieldMatchersUI = new Registry<FieldMatcherUIRegistryItem<any>>(() => [
  getFieldNameMatcherItem(),
  getFieldNameByRegexMatcherItem(),
  getFieldTypeMatcherItem(),
  getFieldsByFrameRefIdItem(),
  getFieldNamesMatcherItem(),
  getFieldValueMatcherItem(),
]);
