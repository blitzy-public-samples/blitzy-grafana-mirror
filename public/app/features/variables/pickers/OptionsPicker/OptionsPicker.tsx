import { css } from '@emotion/css';
import * as React from 'react';
import { type ComponentType, memo, useCallback } from 'react';

import {
  LoadingState,
  type VariableOption,
  type VariableWithMultiSupport,
  type VariableWithOptions,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { ClickOutsideWrapper } from '@grafana/ui';
import { useDispatch, useSelector } from 'app/types/store';

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

/**
 * Functional implementation of the variables option picker.
 *
 * Converted from a `PureComponent` wrapped by `connect(...)` and produced inside
 * a per-call factory to a single hooks-based functional component memoised once
 * at module scope. Per AAP Cohort 1:
 * - `connect` HOC -> `useSelector` / `useDispatch` from `app/types/store`. The
 *   factory no longer instantiates a fresh `connect` per call because hooks
 *   read from React context directly.
 * - Class instance methods (`onShowOptions`, `onHideOptions`, `onToggleOption`,
 *   ...) -> `useCallback` handlers parameterised on the stable `variable` /
 *   `onVariableChange` / `dispatch` references. Identity preservation matches
 *   the prior PureComponent semantics — pass-through children (`VariableLink`,
 *   `VariableOptions`) see callbacks that are stable while their inputs are
 *   stable.
 * - `PureComponent` shallow-equality optimisation -> `React.memo`. The generic
 *   `<Model>` parameter is preserved through `memo` via the `as <Model>(...)`
 *   cast pattern, mirroring `QueryEditorRow` in
 *   `public/app/features/query/components/QueryEditorRow.tsx`.
 */
function OptionsPickerImpl<Model extends VariableWithOptions | VariableWithMultiSupport>(
  props: VariablePickerProps<Model>
): React.ReactElement | null {
  const { variable, onVariableChange, readOnly } = props;
  const dispatch = useDispatch();

  // Replaces `mapStateToProps`. When the variable has no `rootStateKey` we
  // surface the same diagnostic and fall back to the empty picker state, exactly
  // as the original class did.
  const picker = useSelector((state) => {
    const { rootStateKey } = variable;
    if (!rootStateKey) {
      console.error('OptionPickerFactory: variable has no rootStateKey');
      return initialOptionPickerState;
    }
    return getVariablesState(rootStateKey, state).optionsPicker;
  });

  // Replaces `this.onShowOptions`. `onVariableChange` is typed
  // `(variable: Model) => void` while `openOptions` accepts
  // `VariableChangeCallback = { _(updated: VariableWithOptions): void }['_']`.
  // The method-syntax bivariance pattern restores assignability at the call
  // boundary; the runtime contract guarantees the action only ever invokes the
  // callback with the picker's parameterised `Model`.
  const onShowOptions = useCallback(() => {
    dispatch(openOptions(toKeyedVariableIdentifier(variable), onVariableChange));
  }, [dispatch, variable, onVariableChange]);

  // Replaces `this.onHideOptions`. The `rootStateKey` guard preserves the
  // original log/early-return semantics for malformed variables.
  const onHideOptions = useCallback(() => {
    if (!variable.rootStateKey) {
      console.error('Variable has no rootStateKey');
      return;
    }
    dispatch(commitChangesToVariable(variable.rootStateKey, onVariableChange));
  }, [dispatch, variable, onVariableChange]);

  // Replaces `this.onToggleSingleValueVariable`. For non-multi variables, the
  // option is committed and the picker is dismissed in a single user action.
  const onToggleSingleValueVariable = useCallback(
    (option: VariableOption, clearOthers: boolean) => {
      dispatch(
        toKeyedAction(
          toKeyedVariableIdentifier(variable).rootStateKey,
          toggleOption({ option, clearOthers, forceSelect: false })
        )
      );
      if (!variable.rootStateKey) {
        console.error('Variable has no rootStateKey');
        return;
      }
      dispatch(commitChangesToVariable(variable.rootStateKey, onVariableChange));
    },
    [dispatch, variable, onVariableChange]
  );

  // Replaces `this.onToggleMultiValueVariable`. For multi variables, the option
  // is toggled and the picker stays open so the user can toggle additional
  // options before committing.
  const onToggleMultiValueVariable = useCallback(
    (option: VariableOption, clearOthers: boolean) => {
      dispatch(
        toKeyedAction(
          toKeyedVariableIdentifier(variable).rootStateKey,
          toggleOption({ option, clearOthers, forceSelect: false })
        )
      );
    },
    [dispatch, variable]
  );

  // Replaces `this.onToggleOption`. Dispatches to the multi or single value
  // toggle based on the current variable shape.
  const onToggleOption = useCallback(
    (option: VariableOption, clearOthers: boolean) => {
      const toggleFunc =
        isMulti(variable) && variable.multi ? onToggleMultiValueVariable : onToggleSingleValueVariable;
      toggleFunc(option, clearOthers);
    },
    [variable, onToggleMultiValueVariable, onToggleSingleValueVariable]
  );

  const onToggleAllOptions = useCallback(() => {
    dispatch(toKeyedAction(toKeyedVariableIdentifier(variable).rootStateKey, toggleAllOptions()));
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

  const onCancel = useCallback(() => {
    getVariableQueryRunner().cancelRequest(toKeyedVariableIdentifier(variable));
  }, [variable]);

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
}

/**
 * Memoised, generic-preserving `OptionsPicker` component.
 *
 * `React.memo`'s public signature erases generics, so the `as <Model>(...)`
 * cast is required to restore the generic parameter that callers — and the
 * `optionPickerFactory<Model>()` factory below — depend on. The pattern
 * mirrors `QueryEditorRow` in
 * `public/app/features/query/components/QueryEditorRow.tsx`.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- required to preserve the generic <Model extends VariableWithOptions | VariableWithMultiSupport> type parameter through React.memo
const OptionsPicker = memo(OptionsPickerImpl) as <
  Model extends VariableWithOptions | VariableWithMultiSupport,
>(
  props: VariablePickerProps<Model>
) => React.ReactElement | null;

// Set displayName for React DevTools (assigned via cast because the post-cast
// type intentionally hides `displayName`).
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- required because the generic-preserving cast above hides the displayName property of the underlying memo component
(OptionsPicker as React.NamedExoticComponent).displayName = 'OptionsPicker';

/**
 * Factory returning the picker component parameterised by the variable type.
 *
 * Historically the factory generated a new `connect()`-wrapped class per call.
 * After conversion to hooks the picker no longer needs per-call wiring (hooks
 * read from store context), so the factory simply returns the memoised
 * implementation re-typed to the caller's `Model`. The factory signature is
 * preserved to maintain compatibility with the existing variable adapters
 * (`createCustomVariableAdapter`, `createQueryVariableAdapter`, ...) that
 * invoke `optionPickerFactory<SpecificModel>()` at registration time.
 */
export const optionPickerFactory = <
  Model extends VariableWithOptions | VariableWithMultiSupport,
>(): ComponentType<VariablePickerProps<Model>> => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- expose the memoised, generic-preserving picker through the historical ComponentType<VariablePickerProps<Model>> factory signature
  return OptionsPicker as ComponentType<VariablePickerProps<Model>>;
};

const getStyles = () => ({
  variableLinkWrapper: css({
    display: 'inline-block',
    position: 'relative',
  }),
});
