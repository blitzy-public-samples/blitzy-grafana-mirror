import { css, keyframes } from '@emotion/css';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  type GrafanaTheme2,
  LoadingState,
  type SelectableValue,
  type VariableHide,
  type VariableType,
  type VariableWithOptions,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { locationService } from '@grafana/runtime';
import { Button, Stack, Icon, useStyles2 } from '@grafana/ui';
import { useDispatch, useSelector } from 'app/types/store';

import { VariableHideSelect } from '../../dashboard-scene/settings/variables/components/VariableHideSelect';
import { VariableLegend } from '../../dashboard-scene/settings/variables/components/VariableLegend';
import { VariableTextAreaField } from '../../dashboard-scene/settings/variables/components/VariableTextAreaField';
import { VariableTextField } from '../../dashboard-scene/settings/variables/components/VariableTextField';
import { VariableValuesPreview } from '../../dashboard-scene/settings/variables/components/VariableValuesPreview';
import { variableAdapters } from '../adapters';
import { hasOptions } from '../guard';
import { updateOptions } from '../state/actions';
import { toKeyedAction } from '../state/keyedVariablesReducer';
import { getVariable, getVariablesState } from '../state/selectors';
import { changeVariableProp, changeVariableType, removeVariable } from '../state/sharedReducer';
import { type KeyedVariableIdentifier } from '../state/types';
import { toKeyedVariableIdentifier, toVariablePayload } from '../utils';

import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { VariableTypeSelect } from './VariableTypeSelect';
import { changeVariableName, variableEditorMount, variableEditorUnMount } from './actions';
import { type OnPropChangeArguments, VariableNameConstraints } from './types';

/**
 * Adapter that renders the legacy `VariableWithOptions` shape through the
 * design-system `VariableValuesPreview`. Kept as a colocated helper to avoid
 * broadening the API surface of the dashboard-scene preview component.
 */
function LegacyVariableValuesPreview({ variable }: { variable: VariableWithOptions }) {
  const options = variable.options.map((opt) => ({
    label: String(opt.text),
    value: Array.isArray(opt.value) ? opt.value.join(', ') : opt.value,
    properties: opt.properties,
  }));
  return <VariableValuesPreview options={options} staticOptions={[]} />;
}

export interface VariableEditorEditorProps {
  identifier: KeyedVariableIdentifier;
}

/**
 * VariableEditorEditor renders the per-variable edit form within the dashboard
 * variable editor.
 *
 * Converted from a `PureComponent` wrapped by `withTheme2(connect(...))` to a
 * hooks-based functional component per AAP Cohort 1:
 * - `withTheme2` HOC -> `useStyles2(getStyles)` (theme is consumed only by the
 *   `spin` animation style — `useStyles2` reads the theme from context).
 * - `connect` HOC -> `useSelector` / `useDispatch` from `app/types/store`.
 * - `bindActionCreators(...)` thunk wiring -> inlined `dispatch(...)` calls.
 * - `componentDidMount` (`variableEditorMount`) and `componentWillUnmount`
 *   (`variableEditorUnMount`) -> single `useEffect` with a cleanup return.
 * - Instance methods (`onNameChange`, `onTypeChange`, etc.) -> `useCallback`
 *   handlers parameterised on the stable `identifier` / `variable` / `dispatch`
 *   references; identity preservation matches the prior class-method identity.
 * - `this.setState({ showDeleteModal })` -> `useState<boolean>`.
 *
 * Public API preserved: the file continues to export a `VariableEditorEditor`
 * symbol (consumed by `VariableEditorContainer`). The raw `<form>` element is
 * intentionally retained per AAP §0.4.2 — the form has custom Redux-backed
 * submit logic (not react-hook-form), so wrapping with `<Form>` would force a
 * non-equivalent rewrite. The internal layout is already Field-based via
 * `VariableTextField` / `VariableTextAreaField` / `VariableHideSelect`.
 */
export function VariableEditorEditor({ identifier }: VariableEditorEditorProps) {
  const dispatch = useDispatch();

  // Replaces `mapStateToProps` — selectors are evaluated against the keyed
  // templating slice scoped to this dashboard's `rootStateKey`.
  const editor = useSelector((state) => getVariablesState(identifier.rootStateKey, state).editor);
  const variable = useSelector((state) => getVariable(identifier, state));

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const styles = useStyles2(getStyles);

  // Replaces `componentDidMount` + `componentWillUnmount`. The mount thunk
  // captures the initial editor state for this variable; the unmount thunk
  // clears it. Dependency list is stable across the editor's lifetime — the
  // identifier and dispatch references do not change while the editor is open.
  useEffect(() => {
    dispatch(variableEditorMount(identifier));
    return () => {
      dispatch(variableEditorUnMount(identifier));
    };
  }, [dispatch, identifier]);

  // Replaces the original `this.onNameChange` instance method. Identifier and
  // dispatch are stable for the editor's lifetime; the resulting callback
  // identity is preserved across renders, matching the class instance-method
  // identity it replaces.
  const onNameChange = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      event.preventDefault();
      dispatch(changeVariableName(identifier, event.currentTarget.value));
    },
    [dispatch, identifier]
  );

  const onTypeChange = useCallback(
    (option: SelectableValue<VariableType>) => {
      if (!option.value) {
        return;
      }
      dispatch(
        toKeyedAction(
          identifier.rootStateKey,
          changeVariableType(toVariablePayload(identifier, { newType: option.value }))
        )
      );
    },
    [dispatch, identifier]
  );

  const onLabelChange = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      event.preventDefault();
      dispatch(
        toKeyedAction(
          identifier.rootStateKey,
          changeVariableProp(toVariablePayload(identifier, { propName: 'label', propValue: event.currentTarget.value }))
        )
      );
    },
    [dispatch, identifier]
  );

  const onDescriptionChange = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      dispatch(
        toKeyedAction(
          identifier.rootStateKey,
          changeVariableProp(
            toVariablePayload(identifier, { propName: 'description', propValue: event.currentTarget.value })
          )
        )
      );
    },
    [dispatch, identifier]
  );

  const onHideChange = useCallback(
    (option: VariableHide) => {
      dispatch(
        toKeyedAction(
          identifier.rootStateKey,
          changeVariableProp(toVariablePayload(identifier, { propName: 'hide', propValue: option }))
        )
      );
    },
    [dispatch, identifier]
  );

  // `variable` is in the dependency list because `updateOptions` is dispatched
  // against the *current* keyed variable identifier — preserving the original
  // class behaviour where `this.props.variable` was always the up-to-date
  // selector result at the moment of dispatch.
  const onPropChanged = useCallback(
    ({ propName, propValue, updateOptions: shouldUpdateOptions = false }: OnPropChangeArguments) => {
      dispatch(
        toKeyedAction(
          identifier.rootStateKey,
          changeVariableProp(toVariablePayload(identifier, { propName, propValue }))
        )
      );

      if (shouldUpdateOptions) {
        dispatch(updateOptions(toKeyedVariableIdentifier(variable)));
      }
    },
    [dispatch, identifier, variable]
  );

  const onHandleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editor.isValid) {
        return;
      }
      dispatch(updateOptions(toKeyedVariableIdentifier(variable)));
    },
    [dispatch, editor.isValid, variable]
  );

  const onModalOpen = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const onModalClose = useCallback(() => {
    setShowDeleteModal(false);
  }, []);

  const onDelete = useCallback(() => {
    dispatch(
      toKeyedAction(identifier.rootStateKey, removeVariable(toVariablePayload(identifier, { reIndex: true })))
    );
    setShowDeleteModal(false);
    locationService.partial({ editIndex: null });
  }, [dispatch, identifier]);

  const onApply = useCallback(() => {
    locationService.partial({ editIndex: null });
  }, []);

  // `prefersReducedMotion` is evaluated on every render in the original class
  // implementation; preserved as-is via `useMemo` with an empty deps array so
  // that the media-query check runs once per editor mount. (The legacy class
  // also did not subscribe to media-query changes, so this matches behaviour.)
  const prefersReducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const EditorToRender = variableAdapters.get(variable.type).editor;
  if (!EditorToRender) {
    return null;
  }
  const loading = variable.state === LoadingState.Loading;

  return (
    <>
      {/*
        Design system gap: this form has custom Redux-backed submit logic and
        does not use react-hook-form, so `@grafana/ui`'s `<Form>` render-prop
        wrapper is not a behaviour-preserving replacement. Per AAP §0.4.2 the
        raw `<form>` element is retained; the internal layout is already
        Field-based via VariableTextField / VariableTextAreaField /
        VariableHideSelect.
      */}
      <form
        aria-label={t(
          'variables.variable-editor-editor-un-connected.aria-label-variable-editor-form',
          'Variable editor Form'
        )}
        onSubmit={onHandleSubmit}
      >
        <VariableTypeSelect onChange={onTypeChange} type={variable.type} />

        <VariableLegend>
          <Trans i18nKey="variables.variable-editor-editor-un-connected.general">General</Trans>
        </VariableLegend>
        <VariableTextField
          value={editor.name}
          onChange={onNameChange}
          name={t('variables.variable-editor-editor-un-connected.name-name', 'Name')}
          placeholder={t('variables.variable-editor-editor-un-connected.placeholder-variable-name', 'Variable name')}
          description={t(
            'variables.variable-editor-editor-un-connected.description-template-variable-characters',
            'The name of the template variable. (Max. 50 characters)'
          )}
          invalid={!!editor.errors.name}
          error={editor.errors.name}
          testId={selectors.pages.Dashboard.Settings.Variables.Edit.General.generalNameInputV2}
          maxLength={VariableNameConstraints.MaxSize}
          required
        />

        <VariableTextField
          name={t('variables.variable-editor-editor-un-connected.name-label', 'Label')}
          description={t(
            'variables.variable-editor-editor-un-connected.description-optional-display-name',
            'Optional display name'
          )}
          value={variable.label ?? ''}
          placeholder={t('variables.variable-editor-editor-un-connected.placeholder-label-name', 'Label name')}
          onChange={onLabelChange}
          testId={selectors.pages.Dashboard.Settings.Variables.Edit.General.generalLabelInputV2}
        />
        <VariableTextAreaField
          name={t('variables.variable-editor-un-connected.name-description', 'Description')}
          value={variable.description ?? ''}
          placeholder={t(
            'variables.variable-editor-editor-un-connected.placeholder-descriptive-text',
            'Descriptive text'
          )}
          onChange={onDescriptionChange}
          width={52}
        />
        <VariableHideSelect onChange={onHideChange} hide={variable.hide} type={variable.type} />

        {EditorToRender && <EditorToRender variable={variable} onPropChange={onPropChanged} />}

        {hasOptions(variable) ? <LegacyVariableValuesPreview variable={variable} /> : null}

        <div className={styles.buttonRow}>
          <Stack gap={2} height="inherit">
            <Button variant="destructive" fill="outline" onClick={onModalOpen}>
              <Trans i18nKey="variables.variable-editor-editor-un-connected.delete">Delete</Trans>
            </Button>
            <Button
              type="submit"
              data-testid={selectors.pages.Dashboard.Settings.Variables.Edit.General.submitButton}
              disabled={loading}
              variant="secondary"
            >
              <Trans i18nKey="variables.variable-editor-editor-un-connected.run-query">Run query</Trans>
              {loading && (
                <Icon
                  className={`${styles.spin} ${styles.spinIcon}`}
                  name={prefersReducedMotion ? 'hourglass' : 'sync'}
                  size="sm"
                />
              )}
            </Button>
            <Button
              variant="primary"
              onClick={onApply}
              data-testid={selectors.pages.Dashboard.Settings.Variables.Edit.General.applyButton}
            >
              <Trans i18nKey="variables.variable-editor-editor-un-connected.apply">Apply</Trans>
            </Button>
          </Stack>
        </div>
      </form>
      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        varName={editor.name}
        onConfirm={onDelete}
        onDismiss={onModalClose}
      />
    </>
  );
}

const spin = keyframes({
  '0%': {
    transform: 'rotate(0deg) scaleX(-1)', // scaleX flips the `sync` icon so arrows point the correct way
  },
  '100%': {
    transform: 'rotate(359deg) scaleX(-1)',
  },
});

const getStyles = (theme: GrafanaTheme2) => ({
  // Replaces the previous inline `style={{ marginTop: '16px' }}`. `theme.spacing(2)`
  // is the design-system equivalent of the historical 16px value.
  buttonRow: css({
    marginTop: theme.spacing(2),
  }),
  spin: css({
    [theme.transitions.handleMotion('no-preference')]: {
      animation: `${spin} 3s linear infinite`,
    },
  }),
  // Replaces the previous inline `style={{ marginLeft: '2px' }}` on the spinner
  // icon. `theme.spacing(0.25)` matches the historical 2px nudge that visually
  // separates the spinner from the button label.
  spinIcon: css({
    marginLeft: theme.spacing(0.25),
  }),
});
