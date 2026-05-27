/* eslint-disable no-restricted-imports */
import {
  addListener as addListenerUntyped,
  type AsyncThunk,
  type AsyncThunkOptions,
  type AsyncThunkPayloadCreator,
  createAsyncThunk as createAsyncThunkUntyped,
  type TypedAddListener,
} from '@reduxjs/toolkit';
import {
  useSelector as useSelectorUntyped,
  type TypedUseSelectorHook,
  useDispatch as useDispatchUntyped,
} from 'react-redux';
import { type UnknownAction } from 'redux';
import { type ThunkAction, type ThunkDispatch as GenericThunkDispatch } from 'redux-thunk';

import type { createRootReducer } from 'app/core/reducers/root';
import { type AppDispatch, type RootState } from 'app/store/configureStore';
import { dispatch as storeDispatch } from 'app/store/store';

export type StoreState = ReturnType<ReturnType<typeof createRootReducer>>;

/*
 * Utility type to get strongly types thunks.
 *
 * The basic-action parameter is `UnknownAction` (rather than the base `Action`) to align with the
 * Redux Toolkit ecosystem: `configureStore`'s default middleware, RTK Query endpoint thunks, and
 * the listener middleware all parameterize on `UnknownAction`. This ensures `ThunkResult<R>` is
 * dispatchable through `AppDispatch` and that nested `dispatch` calls inside thunks can dispatch
 * any RTK-produced action.
 */
export type ThunkResult<R> = ThunkAction<R, StoreState, undefined, UnknownAction>;

export type ThunkDispatch = GenericThunkDispatch<StoreState, undefined, UnknownAction>;

// Typed useDispatch & useSelector hooks
export const useDispatch: () => AppDispatch = useDispatchUntyped;
export const useSelector: TypedUseSelectorHook<RootState> = useSelectorUntyped;

type DefaultThunkApiConfig = { dispatch: AppDispatch; state: StoreState };
export const createAsyncThunk = <Returned, ThunkArg = void, ThunkApiConfig extends {} = DefaultThunkApiConfig>(
  typePrefix: string,
  payloadCreator: AsyncThunkPayloadCreator<Returned, ThunkArg, ThunkApiConfig>,
  options?: AsyncThunkOptions<ThunkArg, ThunkApiConfig>
): AsyncThunk<Returned, ThunkArg, ThunkApiConfig> =>
  createAsyncThunkUntyped<Returned, ThunkArg, ThunkApiConfig>(typePrefix, payloadCreator, options);

export const addListener = addListenerUntyped as TypedAddListener<RootState, AppDispatch>;
export const dispatch: AppDispatch = storeDispatch;
