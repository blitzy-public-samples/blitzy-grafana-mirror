import { isString, isUndefined } from 'lodash';

import { type Field, FieldType } from '@grafana/data';

export function convertToType(value: unknown, field: Field) {
  switch (field.type) {
    case FieldType.boolean:
      if (isUndefined(value)) {
        return false;
      }
      return convertToBool(value);

    case FieldType.number:
      if (isNaN(Number(value))) {
        return 0;
      }
      return parseFloat(String(value));

    case FieldType.string:
      if (!value) {
        return '';
      }
      return String(value);

    default:
      return value;
  }
}

const convertToBool = (value: unknown): boolean => {
  if (isString(value)) {
    return !(value[0] === 'F' || value[0] === 'f' || value[0] === '0');
  }
  return !!value;
};
