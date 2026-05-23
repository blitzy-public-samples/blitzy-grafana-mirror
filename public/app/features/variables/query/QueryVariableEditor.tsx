import { type FormEvent, useEffect, useRef } from 'react';

import {
  type DataSourceInstanceSettings,
  getDataSourceRef,
  type DataSourceRef,
  type QueryVariableModel,
  type SelectableValue,
  type VariableRefresh,
  type VariableSort,
} from '@grafana/data';
import { QueryVariableEditorForm } from 'app/features/dashboard-scene/settings/variables/components/QueryVariableForm';
import { type StoreState, useDispatch, useSelector } from 'app/types/store';

import { getTimeSrv } from '../../dashboard/services/TimeSrv';
import { initialVariableEditorState } from '../editor/reducer';
import { getQueryVariableEditorState } from '../editor/selectors';
import { type VariableEditorProps } from '../editor/types';
import { changeVariableMultiValue } from '../state/actions';
import { getVariablesState } from '../state/selectors';
import { type KeyedVariableIdentifier } from '../state/types';
import { toKeyedVariableIdentifier } from '../utils';

import { changeQueryVariableDataSource, changeQueryVariableQuery, initQueryVariableEditor } from './actions';

interface StateProps {
  extended: ReturnType<typeof getQueryVariableEditorState>;
}

// Auto-unwrapped thunk action creator signatures matching what `connect`'s object-form
// `mapDispatchToProps` previously injected via `ConnectedProps<typeof connector>`. Each
// dispatched thunk resolves to `void`, so the bound prop signature drops the
// `ThunkResult<void>` return and exposes the call as `(...args) => void`.
interface DispatchProps {
  initQueryVariableEditor: (identifier: KeyedVariableIdentifier) => void;
  changeQueryVariableDataSource: (identifier: KeyedVariableIdentifier, name: DataSourceRef | null) => void;
  changeQueryVariableQuery: (
    identifier: KeyedVariableIdentifier,
    query: QueryVariableModel['query'],
    definition?: string
  ) => void;
  changeVariableMultiValue: (identifier: KeyedVariableIdentifier, multi: boolean) => void;
}

export interface OwnProps extends VariableEditorProps<QueryVariableModel> {}

export type Props = OwnProps & StateProps & DispatchProps;

export interface State {
  regex: string | null;
  tagsQuery: string | null;
  tagValuesQuery: string | null;
}

export const QueryVariableEditorUnConnected = (props: Props) => {
  const {
    variable,
    extended,
    onPropChange,
    initQueryVariableEditor,
    changeQueryVariableDataSource,
    changeQueryVariableQuery,
  } = props;

  // componentDidMount equivalent: dispatch init exactly once on mount.
  // Uses a ref gate so the effect remains lint-clean with exhaustive deps.
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;
    initQueryVariableEditor(toKeyedVariableIdentifier(variable));
  }, [initQueryVariableEditor, variable]);

  // componentDidUpdate equivalent: dispatch only when variable.datasource changes,
  // not on initial mount. Tracked via useRef to preserve the prevProps comparison semantic.
  const prevDataSourceRef = useRef(variable.datasource);
  useEffect(() => {
    if (prevDataSourceRef.current !== variable.datasource) {
      changeQueryVariableDataSource(toKeyedVariableIdentifier(variable), variable.datasource);
      prevDataSourceRef.current = variable.datasource;
    }
  }, [variable, changeQueryVariableDataSource]);

  const onDataSourceChange = (dsSettings: DataSourceInstanceSettings) => {
    onPropChange({
      propName: 'datasource',
      propValue: dsSettings.isDefault ? null : getDataSourceRef(dsSettings),
    });
  };

  const onLegacyQueryChange = async (query: QueryVariableModel['query'], definition: string) => {
    if (variable.query !== query) {
      changeQueryVariableQuery(toKeyedVariableIdentifier(variable), query, definition);
    }
  };

  const onQueryChange = async (query: QueryVariableModel['query']) => {
    if (variable.query !== query) {
      let definition = '';

      if (query && query.hasOwnProperty('query') && typeof query.query === 'string') {
        definition = query.query;
      }

      changeQueryVariableQuery(toKeyedVariableIdentifier(variable), query, definition);
    }
  };

  const onRegExBlur = async (event: FormEvent<HTMLTextAreaElement>) => {
    const regex = event.currentTarget.value;
    if (variable.regex !== regex) {
      onPropChange({ propName: 'regex', propValue: regex, updateOptions: true });
    }
  };

  const onRefreshChange = (option: VariableRefresh) => {
    onPropChange({ propName: 'refresh', propValue: option });
  };

  const onSortChange = async (option: SelectableValue<VariableSort>) => {
    onPropChange({ propName: 'sort', propValue: option.value, updateOptions: true });
  };

  const onMultiChange = (event: FormEvent<HTMLInputElement>) => {
    onPropChange({ propName: 'multi', propValue: event.currentTarget.checked });
  };

  const onIncludeAllChange = (event: FormEvent<HTMLInputElement>) => {
    onPropChange({ propName: 'includeAll', propValue: event.currentTarget.checked });
  };

  const onAllValueChange = (event: FormEvent<HTMLInputElement>) => {
    onPropChange({ propName: 'allValue', propValue: event.currentTarget.value });
  };

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
};

export const QueryVariableEditor = (ownProps: OwnProps) => {
  const dispatch = useDispatch();
  const extended = useSelector((state: StoreState) => {
    const { rootStateKey } = ownProps.variable;
    if (!rootStateKey) {
      console.error('QueryVariableEditor: variable has no rootStateKey');
      return getQueryVariableEditorState(initialVariableEditorState);
    }

    const { editor } = getVariablesState(rootStateKey, state);

    return getQueryVariableEditorState(editor);
  });

  return (
    <QueryVariableEditorUnConnected
      {...ownProps}
      extended={extended}
      initQueryVariableEditor={(id: KeyedVariableIdentifier) => dispatch(initQueryVariableEditor(id))}
      changeQueryVariableDataSource={(id: KeyedVariableIdentifier, name: DataSourceRef | null) =>
        dispatch(changeQueryVariableDataSource(id, name))
      }
      changeQueryVariableQuery={(
        id: KeyedVariableIdentifier,
        query: QueryVariableModel['query'],
        definition?: string
      ) => dispatch(changeQueryVariableQuery(id, query, definition))}
      changeVariableMultiValue={(id: KeyedVariableIdentifier, multi: boolean) =>
        dispatch(changeVariableMultiValue(id, multi))
      }
    />
  );
};
