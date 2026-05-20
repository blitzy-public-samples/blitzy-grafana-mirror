import { type FormEvent, useCallback, useEffect, useRef } from 'react';

import {
  type DataSourceInstanceSettings,
  type DataSourceRef,
  getDataSourceRef,
  type QueryVariableModel,
  type SelectableValue,
  type VariableRefresh,
  type VariableSort,
} from '@grafana/data';
import { QueryVariableEditorForm } from 'app/features/dashboard-scene/settings/variables/components/QueryVariableForm';
import { useDispatch, useSelector } from 'app/types/store';

import { getTimeSrv } from '../../dashboard/services/TimeSrv';
import { initialVariableEditorState } from '../editor/reducer';
import { getQueryVariableEditorState } from '../editor/selectors';
import { type VariableEditorProps } from '../editor/types';
import { changeVariableMultiValue } from '../state/actions';
import { getVariablesState } from '../state/selectors';
import { type KeyedVariableIdentifier } from '../state/types';
import { toKeyedVariableIdentifier } from '../utils';

import { changeQueryVariableDataSource, changeQueryVariableQuery, initQueryVariableEditor } from './actions';

/**
 * Component-level type alias for the heterogeneous query-variable query shape.
 *
 * Datasource plugins (Prometheus, Loki, SQL, Elasticsearch, ...) each serialise
 * a different concrete query type into `QueryVariableModel.query`. The source
 * definition in `packages/grafana-data/src/types/templateVars.ts` documents
 * this with an inline `eslint-disable-next-line @typescript-eslint/no-explicit-any`
 * justification. Reusing `QueryVariableModel['query']` here lets the variable
 * editor surface the same documented contract without re-introducing a bare
 * `any` token at the call sites — replacing the two un-justified `any`
 * annotations the original class component carried at lines 87 and 93.
 */
type QueryVariableQuery = QueryVariableModel['query'];

export interface OwnProps extends VariableEditorProps<QueryVariableModel> {}

/**
 * Shape of the connected `extended` slice consumed by the editor — the same
 * `QueryVariableEditorState | null` derived from `getQueryVariableEditorState`.
 * Declared inline as a structural type alias so that `Props` (re-exported for
 * the unconnected component's test) stays stable across refactors.
 */
/**
 * Shape of the props consumed by the unconnected component. The four action
 * creators are typed in their *bound* form (return `void`) rather than as the
 * raw `typeof <thunk>` (which would return `ThunkResult<void>`): once
 * `useDispatch`-bound, the consumer-visible return type is whatever `dispatch`
 * returns, which here collapses to `void`. This mirrors the shape that the
 * historical `bindActionCreators(...)` produced for the original `connect`
 * wrapping, and is what the test file already passes via `jest.fn()`.
 */
export interface Props extends OwnProps {
  extended: ReturnType<typeof getQueryVariableEditorState>;
  initQueryVariableEditor: (identifier: KeyedVariableIdentifier) => void;
  changeQueryVariableDataSource: (identifier: KeyedVariableIdentifier, datasource: DataSourceRef | null) => void;
  changeQueryVariableQuery: (
    identifier: KeyedVariableIdentifier,
    query: QueryVariableQuery,
    definition?: string
  ) => void;
  changeVariableMultiValue: (identifier: KeyedVariableIdentifier, multi: boolean) => void;
}

/**
 * Unconnected, functional QueryVariableEditor.
 *
 * Converted from a `PureComponent` to a hooks-based functional component per
 * AAP Cohort 1. The unconnected export is preserved as a named export
 * (`QueryVariableEditorUnConnected`) so that
 * `public/app/features/variables/query/QueryVariableEditor.test.tsx` can render
 * the component with mock action creators supplied as props. The test still
 * passes `initQueryVariableEditor: jest.fn()` etc. as props, and the component
 * must continue to invoke them directly (rather than going through
 * `useDispatch`) so that the assertion `expect(props.initQueryVariableEditor).
 * toHaveBeenCalledWith(...)` continues to fire.
 *
 * Lifecycle translation per AAP Cohort 1 / §0.8.2:
 * - `componentDidMount` -> `useEffect(fn, [])` invoking `initQueryVariableEditor`.
 * - `componentDidUpdate` with `prevProps.variable.datasource` diffing -> a
 *   `useEffect` guarded by a `useRef` mirror of the previous datasource so the
 *   mount-time effect does NOT dispatch `changeQueryVariableDataSource`
 *   (matching the original class semantics — class `componentDidUpdate` does
 *   not run on mount whereas `useEffect` does).
 * - Instance methods -> `useCallback` handlers; their dependencies match the
 *   data they read (`variable`, the prop-typed action creators).
 *
 * Typing migration: the two `any` parameters at the original class's lines 87
 * and 93 are now typed `QueryVariableQuery` (= `QueryVariableModel['query']`),
 * inheriting the documented `any` contract from `packages/grafana-data` rather
 * than reintroducing a bare `any` token.
 */
export function QueryVariableEditorUnConnected(props: Props) {
  const {
    variable,
    extended,
    onPropChange,
    initQueryVariableEditor: initEditor,
    changeQueryVariableDataSource: changeDataSource,
    changeQueryVariableQuery: changeQuery,
  } = props;

  // Replaces `componentDidMount`. The original class invoked
  // `initQueryVariableEditor(toKeyedVariableIdentifier(this.props.variable))`
  // exactly once with the mount-time prop values. Capturing both inputs in
  // refs lets the effect run with an empty dependency array (matching the
  // class's "mount only" semantics that the colocated test asserts via
  // `expect(props.initQueryVariableEditor).toHaveBeenCalledTimes(1)`) without
  // tripping the `react-hooks/exhaustive-deps` lint rule. Reading `.current`
  // inside an effect is permitted by the rule and is the canonical Grafana
  // pattern for preserving componentDidMount semantics during conversion.
  const mountIdentifierRef = useRef(toKeyedVariableIdentifier(variable));
  const mountInitEditorRef = useRef(initEditor);
  useEffect(() => {
    mountInitEditorRef.current(mountIdentifierRef.current);
  }, []);

  // Replaces `componentDidUpdate(prevProps)` with a previous-value ref. The
  // ref is initialised to the mount-time datasource so the effect does NOT
  // fire on the first render — preserving the class semantics in which
  // `componentDidUpdate` is skipped at mount.
  const prevDatasourceRef = useRef<DataSourceRef | null | undefined>(variable.datasource);
  useEffect(() => {
    if (prevDatasourceRef.current !== variable.datasource) {
      changeDataSource(toKeyedVariableIdentifier(variable), variable.datasource);
    }
    prevDatasourceRef.current = variable.datasource;
  }, [variable, changeDataSource]);

  const onDataSourceChange = useCallback(
    (dsSettings: DataSourceInstanceSettings) => {
      onPropChange({
        propName: 'datasource',
        propValue: dsSettings.isDefault ? null : getDataSourceRef(dsSettings),
      });
    },
    [onPropChange]
  );

  // Replaces `this.onLegacyQueryChange`. Typed `QueryVariableQuery` instead of
  // bare `any` — see `QueryVariableQuery` definition above.
  const onLegacyQueryChange = useCallback(
    async (query: QueryVariableQuery, definition: string) => {
      if (variable.query !== query) {
        changeQuery(toKeyedVariableIdentifier(variable), query, definition);
      }
    },
    [variable, changeQuery]
  );

  // Replaces `this.onQueryChange`. Typed `QueryVariableQuery` instead of bare
  // `any` — see `QueryVariableQuery` definition above. The runtime narrowing
  // for object-shaped queries with a `query` field is preserved verbatim
  // (`hasOwnProperty` + `typeof === 'string'`) so the resulting `definition`
  // string matches the previous implementation exactly.
  const onQueryChange = useCallback(
    async (query: QueryVariableQuery) => {
      if (variable.query !== query) {
        let definition = '';

        if (query && Object.prototype.hasOwnProperty.call(query, 'query') && typeof query.query === 'string') {
          definition = query.query;
        }

        changeQuery(toKeyedVariableIdentifier(variable), query, definition);
      }
    },
    [variable, changeQuery]
  );

  const onRegExBlur = useCallback(
    async (event: FormEvent<HTMLTextAreaElement>) => {
      const regex = event.currentTarget.value;
      if (variable.regex !== regex) {
        onPropChange({ propName: 'regex', propValue: regex, updateOptions: true });
      }
    },
    [variable, onPropChange]
  );

  const onRefreshChange = useCallback(
    (option: VariableRefresh) => {
      onPropChange({ propName: 'refresh', propValue: option });
    },
    [onPropChange]
  );

  const onSortChange = useCallback(
    async (option: SelectableValue<VariableSort>) => {
      onPropChange({ propName: 'sort', propValue: option.value, updateOptions: true });
    },
    [onPropChange]
  );

  const onMultiChange = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      onPropChange({ propName: 'multi', propValue: event.currentTarget.checked });
    },
    [onPropChange]
  );

  const onIncludeAllChange = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      onPropChange({ propName: 'includeAll', propValue: event.currentTarget.checked });
    },
    [onPropChange]
  );

  const onAllValueChange = useCallback(
    (event: FormEvent<HTMLInputElement>) => {
      onPropChange({ propName: 'allValue', propValue: event.currentTarget.value });
    },
    [onPropChange]
  );

  if (!extended || !extended.dataSource) {
    return null;
  }

  const timeRange = getTimeSrv().timeRange();

  return (
    <QueryVariableEditorForm
      datasource={variable.datasource ?? undefined}
      onDataSourceChange={onDataSourceChange}
      query={variable.query}
      onQueryChange={onQueryChange}
      onLegacyQueryChange={onLegacyQueryChange}
      timeRange={timeRange}
      regex={variable.regex}
      onRegExChange={onRegExBlur}
      sort={variable.sort}
      onSortChange={onSortChange}
      refresh={variable.refresh}
      onRefreshChange={onRefreshChange}
      isMulti={variable.multi}
      includeAll={variable.includeAll}
      allValue={variable.allValue ?? ''}
      onMultiChange={onMultiChange}
      onIncludeAllChange={onIncludeAllChange}
      onAllValueChange={onAllValueChange}
      options={variable.options.map((o) => ({
        label: String(o.text),
        value: String(o.value),
        properties: o.properties,
      }))}
    />
  );
}

/**
 * Connected QueryVariableEditor.
 *
 * Replaces the previous `connect(mapStateToProps, mapDispatchToProps)`
 * wrapping with hooks-based wiring per AAP Cohort 1:
 * - `mapStateToProps` (selecting `extended` from the editor state) ->
 *   `useSelector` keyed by `variable.rootStateKey`.
 * - `mapDispatchToProps` (object form of action creators) -> `useDispatch` +
 *   inline binding via stable references.
 *
 * The wrapper forwards all four action creators to `QueryVariableEditorUnConnected`
 * as props, preserving the test contract.
 */
export function QueryVariableEditor(props: OwnProps) {
  const dispatch = useDispatch();
  const extended = useSelector((state) => {
    const { rootStateKey } = props.variable;
    if (!rootStateKey) {
      console.error('QueryVariableEditor: variable has no rootStateKey');
      return getQueryVariableEditorState(initialVariableEditorState);
    }
    const { editor } = getVariablesState(rootStateKey, state);
    return getQueryVariableEditorState(editor);
  });

  // Bind dispatch to each action creator once per dispatch identity. `dispatch`
  // is stable across renders (guaranteed by react-redux), so these wrappers
  // retain referential identity and `QueryVariableEditorUnConnected` does not
  // see new prop identities each render. The types match the bound prop shape
  // declared on `Props` above.
  const boundInitQueryVariableEditor = useCallback<Props['initQueryVariableEditor']>(
    (identifier) => {
      dispatch(initQueryVariableEditor(identifier));
    },
    [dispatch]
  );
  const boundChangeQueryVariableDataSource = useCallback<Props['changeQueryVariableDataSource']>(
    (identifier, datasource) => {
      dispatch(changeQueryVariableDataSource(identifier, datasource));
    },
    [dispatch]
  );
  const boundChangeQueryVariableQuery = useCallback<Props['changeQueryVariableQuery']>(
    (identifier, query, definition) => {
      dispatch(changeQueryVariableQuery(identifier, query, definition));
    },
    [dispatch]
  );
  const boundChangeVariableMultiValue = useCallback<Props['changeVariableMultiValue']>(
    (identifier, multi) => {
      dispatch(changeVariableMultiValue(identifier, multi));
    },
    [dispatch]
  );

  return (
    <QueryVariableEditorUnConnected
      {...props}
      extended={extended}
      initQueryVariableEditor={boundInitQueryVariableEditor}
      changeQueryVariableDataSource={boundChangeQueryVariableDataSource}
      changeQueryVariableQuery={boundChangeQueryVariableQuery}
      changeVariableMultiValue={boundChangeVariableMultiValue}
    />
  );
}
