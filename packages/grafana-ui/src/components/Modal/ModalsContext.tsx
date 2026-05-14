import { useCallback, useMemo, useState } from 'react';
import * as React from 'react';

export interface ModalsContextState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- modal slot accepts heterogeneous component types; type cannot be unified across consumers
  component: React.ComponentType<any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- modal props are heterogeneous and depend on the registered component; type cannot be unified across consumers
  props: any;
  showModal: <T>(component: React.ComponentType<T>, props: T) => void;
  hideModal: () => void;
}

export const ModalsContext = React.createContext<ModalsContextState>({
  component: null,
  props: {},
  showModal: () => {},
  hideModal: () => {},
});

interface ModalsProviderProps {
  children: React.ReactNode;
}

/**
 * @deprecated.
 * Not the real implementation used by core.
 */
export function ModalsProvider({ children }: ModalsProviderProps) {
  const [component, setComponent] = useState<ModalsContextState['component']>(null);
  const [props, setProps] = useState<ModalsContextState['props']>({});

  const showModal = useCallback(<T,>(component: React.ComponentType<T>, props: T) => {
    setComponent(() => component);
    setProps(props);
  }, []);

  const hideModal = useCallback(() => {
    setComponent(null);
    setProps({});
  }, []);

  const value = useMemo(() => ({ component, props, showModal, hideModal }), [component, props, showModal, hideModal]);

  return <ModalsContext.Provider value={value}>{children}</ModalsContext.Provider>;
}

export const ModalRoot = () => (
  <ModalsContext.Consumer>
    {({ component: Component, props }) => {
      return Component ? <Component {...props} /> : null;
    }}
  </ModalsContext.Consumer>
);

export const ModalsController = ModalsContext.Consumer;
