import { set } from 'lodash';
import { useCallback } from 'react';
import { type FieldArrayPath, type FieldPath, type FieldValues, type UseFormReturn } from 'react-hook-form';

/**
 * Subset of the {@link UseFormReturn} surface consumed by {@link useControlledFieldArray}.
 *
 * Declared with method syntax (rather than function-property syntax) so that, under
 * `strictFunctionTypes`, a caller-supplied `UseFormReturn<SpecificForm>` is assignable
 * where this hook's `TFieldValues`-keyed methods are expected. Without this bivariant
 * relaxation, callers that pass an explicit `<R>` and let `TFieldValues` default to
 * `FieldValues` would be rejected because `watch`/`getValues`/`reset`/`setValue` in
 * `UseFormReturn` are function-property typed (strictly contravariant on parameters).
 *
 * The signatures are also broadened (e.g., `name: string`, `value: unknown`) to avoid
 * type-assertion casts at the use sites — `consistent-type-assertions: 'never'` forbids
 * `as`-style casts in this codebase. `R` here is the *item* type of the array field
 * watched by `name`; `TFieldValues` is the *whole-form* type used by `reset`/`getValues`.
 * The {@link FieldPath} import is preserved because it ships with the underlying
 * `UseFormReturn` and is part of the public path-typing vocabulary documented here —
 * `FieldArrayPath<TFieldValues>` (used on `Options.name`) is a subset of
 * `FieldPath<TFieldValues>` at runtime even though the static types are distinct.
 */
interface FormAPI<R, TFieldValues extends FieldValues> {
  watch(name: string): R[] | undefined;
  getValues(): TFieldValues;
  reset(values: TFieldValues): void;
  setValue(name: string, value: unknown): void;
}

interface Options<R, TFieldValues extends FieldValues = FieldValues> {
  name: FieldArrayPath<TFieldValues>;
  formAPI: FormAPI<ControlledField<R>, TFieldValues>;
  defaults?: R[];

  // if true, sets `__deleted: true` but does not remove item from the array in values
  softDelete?: boolean;
}

export type ControlledField<R> = R & {
  __deleted?: boolean;
};

const EMPTY_ARRAY = [] as const;
// Module-level typed empty-array constant derived from EMPTY_ARRAY via spread. The
// spread evaluates once at module load so the reference is stable across renders
// (preserving the original behavior). Typed as `never[]` so it is universally
// assignable to `Array<ControlledField<R>>` regardless of the caller-chosen `R`.
const EMPTY_FIELDS: never[] = [...EMPTY_ARRAY];

/*
 * react-hook-form's own useFieldArray is uncontrolled and super buggy.
 * this is a simple controlled version. It's dead simple and more robust at the cost of re-rendering the form
 * on every change to the sub forms in the array.
 * Warning: you'll have to take care of your own unique identiifer to use as `key` for the ReactNode array.
 * Using index will cause problems.
 */
export function useControlledFieldArray<R extends object, TFieldValues extends FieldValues = FieldValues>(
  options: Options<R, TFieldValues>
) {
  const { name, formAPI, defaults, softDelete } = options;
  const { watch, getValues, reset, setValue } = formAPI;

  const fields: Array<ControlledField<R>> = watch(name) ?? defaults ?? EMPTY_FIELDS;

  const update = useCallback(
    (updateFn: (fields: R[]) => R[]) => {
      const values = JSON.parse(JSON.stringify(getValues()));
      const newItems = updateFn(fields ?? []);
      reset(set(values, name, newItems));
    },
    [getValues, name, reset, fields]
  );

  return {
    fields,
    append: useCallback((values: R) => update((fields) => [...fields, values]), [update]),
    remove: useCallback(
      (index: number) => {
        if (softDelete) {
          setValue(`${name}.${index}.__deleted`, true);
        } else {
          update((items) => {
            const newItems = items.slice();
            newItems.splice(index, 1);
            return newItems;
          });
        }
      },
      [update, name, setValue, softDelete]
    ),
  };
}
