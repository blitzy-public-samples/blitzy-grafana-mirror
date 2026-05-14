import { type UseFormReturn, type FieldValues, type FieldErrors, type FieldArrayMethodProps } from 'react-hook-form';
export type { SubmitHandler as FormsOnSubmit, FieldErrors as FormFieldErrors } from 'react-hook-form';

/**
 * @deprecated use the types from react-hook-form instead
 */
export type FormAPI<T extends FieldValues> = Omit<UseFormReturn<T>, 'handleSubmit'> & {
  errors: FieldErrors<T>;
};

type FieldArrayValue = Partial<FieldValues> | Array<Partial<FieldValues>>;

/**
 * @deprecated use the types from react-hook-form instead
 */
export interface FieldArrayApi {
  // ROLLBACK (AAP §0.8.6 Step 7 LAST RESORT): `fields` holds caller-supplied values from
  // react-hook-form's useFieldArray() that vary per FieldArray usage (e.g., `{ id, firstName,
  // lastName }` in FieldArray.story.tsx, arbitrary shapes in production). Consumer code accesses
  // properties directly (e.g., `field.id`, `field.firstName`, `field.lastName` at
  // FieldArray.story.tsx:47,50,52,58,60) without narrowing because the field shape is statically
  // known at the call site. Narrowing the value type to `unknown` would require every FieldArray
  // consumer to perform a runtime type assertion or narrowing for each property access, propagating
  // churn across the whole codebase and breaking the public type contract on a @deprecated
  // interface that is preserved for back-compat only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
  fields: Array<Record<string, any>>;
  append: (value: FieldArrayValue, options?: FieldArrayMethodProps) => void;
  prepend: (value: FieldArrayValue) => void;
  remove: (index?: number | number[]) => void;
  swap: (indexA: number, indexB: number) => void;
  move: (from: number, to: number) => void;
  insert: (index: number, value: FieldArrayValue) => void;
}
