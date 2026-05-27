import { type ComponentType } from 'react';
import { connect, Provider } from 'react-redux';

import { store } from '../../store/store';

/**
 * Connects a component to the application Redux store, mirroring `react-redux`'s `connect`,
 * and forwards the singleton `store` directly as a prop on the connected component.
 *
 * The generic `P` preserves the wrapped component's prop interface for callers.
 */
export function connectWithStore<P extends object>(
  WrappedComponent: ComponentType<P>,
  ...args: unknown[]
) {
  // `connect` is heavily overloaded; runtime behavior is identical regardless of which overload
  // is selected at the call site. We cast through `unknown` to express the HOC shape against the
  // unconstrained generic `P` while preserving the original runtime semantics. The connected
  // component additionally accepts an optional `store` prop (the legacy way to inject the store).
  const ConnectedWrappedComponent = (
    connect as unknown as (
      ...a: unknown[]
    ) => (c: ComponentType<P>) => ComponentType<P & { store?: typeof store }>
  )(...args)(WrappedComponent);

  // eslint-disable-next-line react/display-name
  return (props: P) => {
    return <ConnectedWrappedComponent {...props} store={store} />;
  };
}

/**
 * Connects a component to the application Redux store under a self-contained `<Provider>` boundary.
 * Used by legacy call sites that need an isolated Redux subtree.
 *
 * The generic `P` preserves the wrapped component's prop interface for callers.
 */
export function connectWithProvider<P extends object>(
  WrappedComponent: ComponentType<P>,
  ...args: unknown[]
) {
  const ConnectedWrappedComponent = (
    connect as unknown as (
      ...a: unknown[]
    ) => (c: ComponentType<P>) => ComponentType<P & { store?: typeof store }>
  )(...args)(WrappedComponent);

  // eslint-disable-next-line react/display-name
  return (props: P) => {
    return (
      <Provider store={store}>
        <ConnectedWrappedComponent {...props} store={store} />
      </Provider>
    );
  };
}
