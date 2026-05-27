import { useAsync } from 'react-use';

// Allows simple dynamic imports in the components
export const useAsyncDependency = <T = unknown>(importStatement: Promise<T>) => {
  const state = useAsync(async () => {
    return await importStatement;
  });

  return {
    ...state,
    // The assertion is required because react-use's AsyncState<T> is a discriminated
    // union where value is typed as `T | undefined`. Spreading the state into a new
    // object loses the discriminant flow narrowing, so without this cast, consumers
    // that guard with `loading`/`error` checks before accessing `dependency` properties
    // would be forced to add new nullability handling — a behavioral contract change.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    dependency: state.value as T,
  };
};
