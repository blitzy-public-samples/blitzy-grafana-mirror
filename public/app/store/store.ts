import { type Action, type Store, type UnknownAction } from 'redux';
import { type ThunkAction } from 'redux-thunk';

import { initialKeyedVariablesState } from 'app/features/variables/state/keyedVariablesReducer';
import { type StoreState } from 'app/types/store';

export let store: Store<StoreState>;

export function setStore(newStore: Store<StoreState>) {
  store = newStore;
}

export function getState(): StoreState {
  if (!store || !store.getState) {
    return { templating: { ...initialKeyedVariablesState, lastKey: 'key' } } as StoreState; // used by tests
  }

  return store.getState();
}

/**
 * Dispatches a Redux action or thunk against the global Grafana store.
 *
 * Two overload signatures mirror the relevant call signatures of `redux-thunk`'s
 * `ThunkDispatch<StoreState, undefined, UnknownAction>`:
 *
 *   1. Passing a `ThunkAction<R, StoreState, undefined, UnknownAction>` returns the thunk's
 *      computed return value `R`. RTK Query endpoint initiators and `createAsyncThunk` results
 *      are both `ThunkAction`-shaped, so they reach this overload.
 *   2. Passing any plain Redux `Action` (including `UnknownAction`) returns the action itself,
 *      matching `Redux.Dispatch` semantics.
 *
 * The implementation signature uses `unknown` so the body type-checks against either overload.
 * At runtime, the underlying `store.dispatch` is the thunk-augmented dispatch created by
 * `configureStore` (thunk middleware is enabled), which correctly handles both forms.
 *
 * Overloads are used here instead of typing `dispatch` as `ThunkDispatch<StoreState, ...>`
 * directly because that triggers a circular type reference: `ThunkDispatch`'s evaluation pulls
 * in the full `StoreState` shape, which transitively touches `types/store.ts` which imports
 * `dispatch` back from this module. Overloaded function signatures defer that resolution.
 *
 * When the store is not yet initialized (e.g. during early module evaluation or test setup),
 * this is a no-op that returns `undefined`.
 */
export function dispatch<R>(action: ThunkAction<R, StoreState, undefined, UnknownAction>): R;
export function dispatch<A extends Action>(action: A): A;
export function dispatch(action: unknown): unknown {
  if (!store || !store.getState) {
    return;
  }

  // The runtime `store.dispatch` is the thunk-augmented dispatch from configureStore, which
  // accepts both plain actions and thunks. The cast bridges the inner store's declared
  // `Dispatch<UnknownAction>` shape (which `Store<StoreState>` reports) to our wider overloads.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return (store.dispatch as (a: unknown) => unknown)(action);
}
