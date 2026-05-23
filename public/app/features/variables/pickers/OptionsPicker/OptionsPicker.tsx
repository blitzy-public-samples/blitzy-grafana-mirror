import { css } from '@emotion/css';
import { type ComponentType, useCallback } from 'react';

import {
  LoadingState,
  type VariableOption,
  type VariableWithMultiSupport,
  type VariableWithOptions,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { ClickOutsideWrapper } from '@grafana/ui';
import { type StoreState, useDispatch, useSelector } from 'app/types/store';

import { VARIABLE_PREFIX } from '../../constants';
import { isMulti } from '../../guard';
import { getVariableQueryRunner } from '../../query/VariableQueryRunner';
import { formatVariableLabel } from '../../shared/formatVariable';
import { toKeyedAction } from '../../state/keyedVariablesReducer';
import { getVariablesState } from '../../state/selectors';
import { toKeyedVariableIdentifier } from '../../utils';
import { VariableInput } from '../shared/VariableInput';
import { VariableLink } from '../shared/VariableLink';
import { VariableOptions } from '../shared/VariableOptions';
import { type NavigationKey, type VariablePickerProps } from '../types';

import { commitChangesToVariable, filterOrSearchOptions, navigateOptions, openOptions } from './actions';
import { initialOptionPickerState, toggleAllOptions, toggleOption } from './reducer';

export const optionPickerFactory = <Model extends VariableWithOptions | VariableWithMultiSupport>(): ComponentType<
  VariablePickerProps<Model>
> => {
  interface OwnProps extends VariablePickerProps<Model> {}

  // OptionsPicker is the functional replacement for the previous class +
  // `connect` HOC pairing. It reads picker state via `useSelector` and
  // dispatches thunks/keyed actions via `useDispatch`, preserving the exact
  // public factory contract (returns `ComponentType<VariablePickerProps<Model>>`)
  // and the runtime semantics of every prior `mapDispatchToProps` slot.
  //
  // The `onVariableChange` prop is passed straight through to the
  // `openOptions` / `commitChangesToVariable` action creators. Those creators
  // declare their callback slot as `VariableChangeCallback`, a method-syntax
  // type checked bivariantly, so a `(variable: Model) => void` from the
  // parameterized factory is accepted at a `(updated: VariableWithOptions) => void`
  // slot without a type assertion. This is the contract the picker has always
  // relied on; the bivariance pattern in `actions.ts` reproduces the original
  // `(updated: any) => void` variance behavior under `strictFunctionTypes`.
  const OptionsPicker: ComponentType<VariablePickerProps<Model>> = (props: OwnProps) => {
    const { variable, readOnly, onVariableChange } = props;
    const dispatch = useDispatch();
    const picker = useSelector((state: StoreState) => {
      const { rootStateKey } = variable;
      if (!rootStateKey) {
        console.error('OptionPickerFactory: variable has no rootStateKey');
        return initialOptionPickerState;
      }
      return getVariablesState(rootStateKey, state).optionsPicker;
    });

    const onCancel = useCallback(() => {
      getVariableQueryRunner().cancelRequest(toKeyedVariableIdentifier(variable));
    }, [variable]);

    const onShowOptions = useCallback(() => {
      dispatch(openOptions(toKeyedVariableIdentifier(variable), onVariableChange));
    }, [dispatch, variable, onVariableChange]);

    const onHideOptions = useCallback(() => {
      if (!variable.rootStateKey) {
        console.error('Variable has no rootStateKey');
        return;
      }
      dispatch(commitChangesToVariable(variable.rootStateKey, onVariableChange));
    }, [dispatch, variable, onVariableChange]);

    const onToggleOption = useCallback(
      (option: VariableOption, clearOthers: boolean) => {
        const identifier = toKeyedVariableIdentifier(variable);
        dispatch(toKeyedAction(identifier.rootStateKey, toggleOption({ option, clearOthers, forceSelect: false })));
        const isMultiVariable = isMulti(variable) && variable.multi;
        if (!isMultiVariable) {
          if (!variable.rootStateKey) {
            console.error('Variable has no rootStateKey');
            return;
          }
          dispatch(commitChangesToVariable(variable.rootStateKey, onVariableChange));
        }
      },
      [dispatch, variable, onVariableChange]
    );

    const onToggleAllOptions = useCallback(() => {
      const identifier = toKeyedVariableIdentifier(variable);
      dispatch(toKeyedAction(identifier.rootStateKey, toggleAllOptions()));
    }, [dispatch, variable]);

    const onFilterOrSearchOptions = useCallback(
      (filter: string) => {
        dispatch(filterOrSearchOptions(toKeyedVariableIdentifier(variable), filter));
      },
      [dispatch, variable]
    );

    const onNavigate = useCallback(
      (key: NavigationKey, clearOthers: boolean) => {
        if (!variable.rootStateKey) {
          console.error('Variable has no rootStateKey');
          return;
        }
        dispatch(navigateOptions(variable.rootStateKey, key, clearOthers));
      },
      [dispatch, variable]
    );

    const showOptions = picker.id === variable.id;
    const styles = getStyles();

    return (
      <div className={styles.variableLinkWrapper} data-testid={selectors.components.Variables.variableLinkWrapper}>
        {showOptions ? (
          <ClickOutsideWrapper onClick={onHideOptions}>
            <VariableInput
              id={VARIABLE_PREFIX + variable.id}
              value={picker.queryValue}
              onChange={onFilterOrSearchOptions}
              onNavigate={onNavigate}
              aria-expanded={true}
              aria-controls={`options-${variable.id}`}
            />
            <VariableOptions
              values={picker.options}
              onToggle={onToggleOption}
              onToggleAll={onToggleAllOptions}
              highlightIndex={picker.highlightIndex}
              multi={picker.multi}
              selectedValues={picker.selectedValues}
              id={`options-${variable.id}`}
            />
          </ClickOutsideWrapper>
        ) : (
          <VariableLink
            id={VARIABLE_PREFIX + variable.id}
            text={formatVariableLabel(variable)}
            onClick={onShowOptions}
            loading={variable.state === LoadingState.Loading}
            onCancel={onCancel}
            disabled={readOnly}
          />
        )}
      </div>
    );
  };

  OptionsPicker.displayName = 'OptionsPicker';
  return OptionsPicker;
};

const getStyles = () => ({
  variableLinkWrapper: css({
    display: 'inline-block',
    position: 'relative',
  }),
});
