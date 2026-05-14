import { css, cx } from '@emotion/css';
import classnames from 'classnames';
import { debounce } from 'lodash';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';
import { type Value } from 'slate';
import Plain from 'slate-plain-serializer';
import { Editor, type EventHook, type Plugin } from 'slate-react';

import { type GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';

import { ClearPlugin } from '../../slate-plugins/clear';
import { ClipboardPlugin } from '../../slate-plugins/clipboard';
import { IndentationPlugin } from '../../slate-plugins/indentation';
import { NewlinePlugin } from '../../slate-plugins/newline';
import { RunnerPlugin } from '../../slate-plugins/runner';
import { SelectionShortcutsPlugin } from '../../slate-plugins/selection_shortcuts';
import { SuggestionsPlugin } from '../../slate-plugins/suggestions';
import { useStyles2 } from '../../themes/ThemeContext';
import { getFocusStyles } from '../../themes/mixins';
import {
  type CompletionItemGroup,
  type SuggestionsState,
  type TypeaheadInput,
  type TypeaheadOutput,
} from '../../types/completion';
import { type Themeable2 } from '../../types/theme';
import { makeValue, SCHEMA } from '../../utils/slate';

/**
 * Public SDK type contract.
 *
 * `QueryFieldProps extends Themeable2` is preserved for backward compatibility with
 * plugin authors who declare `interface MyProps extends QueryFieldProps`. The `theme`
 * field originates from the historical class implementation that was wrapped with
 * `withTheme2(UnThemedQueryField)`; that HOC injected `theme` from React context and
 * exposed a component type of `Omit<QueryFieldProps, 'theme'>` to callers. The
 * functional rewrite below preserves the SAME public surface: `QueryFieldProps`
 * continues to extend `Themeable2`, the exported `QueryField` accepts
 * `Omit<QueryFieldProps, keyof Themeable2>` so callers still do not have to pass
 * `theme`, and styles are resolved internally via `useStyles2(getStyles)` — making
 * the component theme-aware without consuming the `theme` field on its own props.
 */
export interface QueryFieldProps extends Themeable2 {
  additionalPlugins?: Plugin[];
  ['aria-labelledby']?: string;
  cleanText?: (text: string) => string;
  disabled?: boolean;
  // We have both value and local state. This is usually an antipattern but we need to keep local state
  // for perf reasons and also have outside value in for example in Explore redux that is mutable from logs
  // creating a two way binding.
  query?: string | null;
  onRunQuery?: () => void;
  onBlur?: () => void;
  onChange?: (value: string) => void;
  onRichValueChange?: (value: Value) => void;
  onClick?: EventHook<React.MouseEvent<Element, MouseEvent>>;
  onTypeahead?: (typeahead: TypeaheadInput) => Promise<TypeaheadOutput>;
  onWillApplySuggestion?: (suggestion: string, state: SuggestionsState) => string;
  placeholder?: string;
  portalOrigin: string;
  syntax?: string;
  syntaxLoaded?: boolean;
}

/**
 * Caller-facing props for the exported `QueryField` component.
 *
 * Mirrors the historical `withTheme2(UnThemedQueryField)` output type
 * (`React.FunctionComponent<Subtract<QueryFieldProps, Themeable2>>`), so consumers
 * never have to pass `theme` directly while the publicly-exported `QueryFieldProps`
 * interface still satisfies `extends Themeable2` for type-inheritance scenarios.
 */
type QueryFieldComponentProps = Omit<QueryFieldProps, keyof Themeable2>;

export interface QueryFieldState {
  suggestions: CompletionItemGroup[];
  typeaheadContext: string | null;
  typeaheadPrefix: string;
  typeaheadText: string;
  value: Value;
}

// Module-level pure helper extracted from class instance method `this.cleanText`.
// Renamed from `cleanText` to `cleanLocalText` to avoid shadowing the `cleanText` prop
// (which has a different signature and is forwarded to SuggestionsPlugin).
function cleanLocalText(text: string): string {
  // RegExp with invisible characters we want to remove - currently only carriage return (newlines are visible)
  const newText = text.replace(/[\r]/g, '');
  return newText;
}

/**
 * Renders an editor field.
 * Pass initial value as initialQuery and listen to changes in props.onValueChanged.
 * This component can only process strings. Internally it uses Slate Value.
 * Implement props.onTypeahead to use suggestions.
 *
 * https://developers.grafana.com/ui/latest/index.html?path=/docs/inputs-deprecated-queryfield--docs
 *
 * `memo` wrap preserves the shallow-prop-equality skip behavior of the original
 * `PureComponent` baseline (see AAP §0.5.3 / §0.9.2.5 lifecycle rule: "PureComponent
 * shallow-equality optimization → wrap the functional component in React.memo only
 * when referential-equality behavior is demonstrably intentional"). QueryField is a
 * performance-sensitive query editor surface where the original `PureComponent`
 * selection was demonstrably intentional.
 *
 * @deprecated
 */
export const QueryField = memo(function QueryField(props: QueryFieldComponentProps) {
  // By default QueryField calls onChange if onBlur is not defined, this will trigger a rerender
  // And slate will claim the focus, making it impossible to leave the field.
  const {
    additionalPlugins,
    ['aria-labelledby']: ariaLabelledby,
    cleanText,
    disabled,
    onBlur = () => {},
    onChange: onChangeProp,
    onClick,
    onRichValueChange,
    onRunQuery,
    onTypeahead,
    onWillApplySuggestion,
    placeholder,
    portalOrigin,
    query,
    syntax,
    syntaxLoaded,
  } = props;

  const styles = useStyles2(getStyles);

  // Local Slate Value state. The lazy initializer mirrors the class constructor's
  // `state = { value: makeValue(props.query || '', props.syntax) }`.
  const [value, setValue] = useState<Value>(() => makeValue(query || '', syntax));

  // Refs that mirror the class component's instance fields. The class implementation
  // stored these on `this` so instance methods could read the latest values at
  // invocation time; the functional implementation uses refs for the same purpose
  // in conjunction with stable callbacks (so plugin handlers and debounced functions
  // retain referential identity across renders).
  const editorRef = useRef<Editor | null>(null);
  const lastExecutedValueRef = useRef<Value | null>(null);

  // `mounted` was set in componentDidMount/componentWillUnmount in the class
  // implementation but is not read elsewhere in this file. Preserve the pattern as
  // `mountedRef` per AAP §0.8.2 to be safe (kept in case any plugin or external
  // subscriber relies on it via an extension point).
  const mountedRef = useRef(false);

  // Mirror of `value` state for use inside stable callbacks (avoids stale closures).
  // Updated synchronously after every setValue call so subsequent reads see the new value
  // (mirrors class setState callback semantics).
  const valueRef = useRef(value);
  valueRef.current = value;

  // Mirrors of selected props for use inside stable callbacks. Mirrors class instance
  // methods that always read this.props.X at invocation time.
  const onChangePropRef = useRef(onChangeProp);
  onChangePropRef.current = onChangeProp;
  const onRunQueryRef = useRef(onRunQuery);
  onRunQueryRef.current = onRunQuery;
  const onRichValueChangeRef = useRef(onRichValueChange);
  onRichValueChangeRef.current = onRichValueChange;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const syntaxRef = useRef(syntax);
  syntaxRef.current = syntax;

  // Mount-only effect to maintain `mountedRef` semantics from the class implementation
  // (componentDidMount sets mounted=true; componentWillUnmount sets mounted=false).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Stable callback that reads latest state/prop via refs.
  // Mirrors class method `this.runOnChange`.
  const runOnChange = useCallback(() => {
    const text = Plain.serialize(valueRef.current);
    if (onChangePropRef.current) {
      onChangePropRef.current(cleanLocalText(text));
    }
  }, []);

  // Stable callback. Mirrors class method `this.runOnRunQuery`.
  const runOnRunQuery = useCallback(() => {
    if (onRunQueryRef.current) {
      onRunQueryRef.current();
      lastExecutedValueRef.current = valueRef.current;
    }
  }, []);

  // Stable callback. Mirrors class method `this.runOnChangeAndRunQuery`.
  const runOnChangeAndRunQuery = useCallback(() => {
    // onRunQuery executes query from Redux in Explore so it needs to be updated sync in case we want to run
    // the query.
    runOnChange();
    runOnRunQuery();
  }, [runOnChange, runOnRunQuery]);

  // Stable debounced runOnChange. Mirrors class instance field
  // `this.runOnChangeDebounced = debounce(this.runOnChange, 500)` initialized once in
  // the constructor. Wrapping in `useMemo` with `runOnChange` as the dep ensures
  // pending debounces are preserved across renders (because runOnChange has empty
  // deps and is itself stable).
  const runOnChangeDebounced = useMemo(() => debounce(runOnChange, 500), [runOnChange]);

  /**
   * Update local state, propagate change upstream and optionally run the query afterwards.
   */
  const onChange = useCallback(
    (newValue: Value, runQuery?: boolean) => {
      const documentChanged = newValue.document !== valueRef.current.document;
      const prevValue = valueRef.current;

      if (onRichValueChangeRef.current) {
        onRichValueChangeRef.current(newValue);
      }

      // Update local state with new value. Refs are synced immediately so that the
      // post-state-update side-effect logic below sees the new value (mirrors the
      // class setState callback semantics where `this.state.value` was updated
      // before the callback ran).
      setValue(newValue);
      valueRef.current = newValue;

      // The diff is needed because the actual value of editor have much more metadata (for example text selection)
      // that is not passed upstream so every change of editor value does not mean change of the query text.
      if (documentChanged) {
        const textChanged = Plain.serialize(prevValue) !== Plain.serialize(newValue);
        if (textChanged && runQuery) {
          runOnChangeAndRunQuery();
        }
        if (textChanged && !runQuery) {
          // Debounce change propagation by default for perf reasons.
          runOnChangeDebounced();
        }
      }
    },
    [runOnChangeAndRunQuery, runOnChangeDebounced]
  );

  // Mirror of stable `onChange` so effect callbacks can invoke the latest logic
  // without re-running when its identity changes.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /**
   * We need to handle blur events here mainly because of dashboard panels which expect to have query executed on blur.
   */
  const handleBlur = useCallback(
    (_: React.FocusEvent | undefined, editor: Editor, next: Function) => {
      if (onBlurRef.current) {
        onBlurRef.current();
      } else {
        // Run query by default on blur
        const previousValue = lastExecutedValueRef.current ? Plain.serialize(lastExecutedValueRef.current) : '';
        const currentValue = Plain.serialize(editor.value);

        if (previousValue !== currentValue) {
          runOnChangeAndRunQuery();
        }
      }
      return next();
    },
    [runOnChangeAndRunQuery]
  );

  // Plugins are configured once at mount, mirroring class-component constructor behavior.
  // Plugin callback inputs (`onTypeahead`, `cleanText`, `portalOrigin`, `onWillApplySuggestion`,
  // `additionalPlugins`) are captured at mount time -- the class implementation also did not
  // re-create plugins when those props changed, so this preserves exact behavior.
  const plugins = useMemo<Array<Plugin<Editor>>>(
    () => {
      // Base plugins
      return [
        // SuggestionsPlugin and RunnerPlugin need to be before NewlinePlugin
        // because they override Enter behavior
        SuggestionsPlugin({ onTypeahead, cleanText, portalOrigin, onWillApplySuggestion }),
        RunnerPlugin({ handler: runOnChangeAndRunQuery }),
        NewlinePlugin(),
        ClearPlugin(),
        SelectionShortcutsPlugin(),
        IndentationPlugin(),
        ClipboardPlugin(),
        ...(additionalPlugins || []),
      ].filter((p) => p);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plugins are configured once on mount to preserve class-constructor semantics; plugin inputs are captured at mount time, mirroring the original class behavior where the constructor populated `this.plugins` exactly once
    []
  );

  // Effect: handle syntaxLoaded transitioning from falsy to true. Replaces the
  // corresponding branch of the original componentDidUpdate. Tracks previous
  // syntaxLoaded via a ref to mirror class-component behavior of running this branch
  // only when the prop actually transitions, not when other props change.
  const prevSyntaxLoadedRef = useRef<boolean | undefined>(syntaxLoaded);
  useEffect(() => {
    if (!prevSyntaxLoadedRef.current && syntaxLoaded && editorRef.current) {
      // Need a bogus edit to re-render the editor after syntax has fully loaded
      const editor = editorRef.current.insertText(' ').deleteBackward(1);
      onChangeRef.current(editor.value, true);
    }
    prevSyntaxLoadedRef.current = syntaxLoaded;
  }, [syntaxLoaded]);

  // Effect: two-way binding between local state and outside `query` prop. Replaces
  // the corresponding branch of the original componentDidUpdate. The dependency array
  // `[query]` mirrors the class-component guard `if (query !== prevProps.query)`,
  // running this branch ONLY when the outside `query` prop changes, not when local
  // `value` state changes via typing. `valueRef` and `syntaxRef` are accessed via
  // refs so they don't trigger this effect to re-run -- this is essential to prevent
  // local edits from being overwritten when value changes but query stays the same.
  useEffect(() => {
    // Handle two way binging between local state and outside prop.
    // if query changed from the outside
    // and we have a version that differs
    if (query !== Plain.serialize(valueRef.current)) {
      setValue(makeValue(query || '', syntaxRef.current));
    }
  }, [query]);

  const wrapperClassName = classnames('slate-query-field__wrapper', {
    'slate-query-field__wrapper--disabled': disabled,
  });

  return (
    <div className={cx(wrapperClassName, styles.wrapper)}>
      <div className="slate-query-field" data-testid={selectors.components.QueryField.container}>
        <Editor
          ref={(editor) => {
            editorRef.current = editor;
          }}
          aria-labelledby={ariaLabelledby}
          schema={SCHEMA}
          autoCorrect={false}
          readOnly={disabled}
          onBlur={handleBlur}
          onClick={onClick}
          onChange={(change: { value: Value }) => {
            onChange(change.value, false);
          }}
          placeholder={placeholder}
          plugins={plugins}
          spellCheck={false}
          value={value}
        />
      </div>
    </div>
  );
});

// Preserve React DevTools introspection name across the `memo(...)` wrap and match
// the historical class displayName behavior (where `class UnThemedQueryField` was
// wrapped by `withTheme2()` which itself hoisted statics from the inner class).
QueryField.displayName = 'QueryField';

const getStyles = (theme: GrafanaTheme2) => {
  const focusStyles = getFocusStyles(theme);
  return {
    wrapper: css({
      '&:focus-within': focusStyles,
    }),
  };
};
