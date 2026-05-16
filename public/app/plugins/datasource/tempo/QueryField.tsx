import { css } from '@emotion/css';
import { memo, useEffect, useRef, useState } from 'react';

import { QueryWithAssistantButton } from '@grafana/assistant';
import { CoreApp, type QueryEditorProps, type SelectableValue } from '@grafana/data';
import { config, reportInteraction } from '@grafana/runtime';
import {
  Button,
  FileDropzone,
  Stack,
  InlineField,
  InlineFieldRow,
  Modal,
  RadioButtonGroup,
  useTheme2,
} from '@grafana/ui';

import TraceQLSearch from './SearchTraceQLEditor/TraceQLSearch';
import { ServiceGraphSection } from './ServiceGraphSection';
import { type TempoQueryType } from './dataquery.gen';
import { type TempoDatasource } from './datasource';
import { QueryEditor } from './traceql/QueryEditor';
import { type TempoQuery } from './types';
import { migrateFromSearchToTraceQLSearch } from './utils';

interface Props extends QueryEditorProps<TempoDatasource, TempoQuery> {
  // should template variables be added to tag options. default true
  addVariablesToOptions?: boolean;
}

// This needs to default to traceql for data sources like Splunk, where clicking on a
// data link should open the traceql tab and run a search based on the configured query.
const DEFAULT_QUERY_TYPE: TempoQueryType = 'traceql';

// `memo` preserves the shallow-prop-equality re-render skip semantics of the original
// `PureComponent` so that the functional rewrite remains behavior-equivalent for callers
// that rely on referentially stable props to avoid unnecessary re-renders.
const TempoQueryField = memo(function TempoQueryField(props: Props) {
  const theme = useTheme2();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  // Mirrors the class component's `_isMounted` instance flag. The original code used this
  // to bail out of post-await state updates when the component unmounted during the
  // `getNativeHistograms` await. Initializing to `true` (and flipping to `false` only in
  // the unmount cleanup below) preserves the original semantics exactly.
  const isMountedRef = useRef(true);

  // Set the default query type when the component mounts.
  // Also do this if queryType is 'clear' (which is the case when the user changes the query type)
  // otherwise if the user changes the query type and refreshes the page, no query type will be selected
  // which is inconsistent with how the UI was originally when they selected the Tempo data source.
  useEffect(() => {
    isMountedRef.current = true;

    const initialize = async () => {
      if (!props.query.queryType || props.query.queryType === 'clear') {
        props.onChange({
          ...props.query,
          queryType: DEFAULT_QUERY_TYPE,
        });
      }
      // TODO: Remove this automatic check for native histograms once Tempo only supports native histograms https://github.com/grafana/grafana/issues/109708
      // indentify the service map can use native histograms
      const timeRange = props.range;
      const nativeHistograms = await props.datasource.getNativeHistograms(timeRange);

      // Only update if component is still mounted
      if (!isMountedRef.current) {
        return;
      }

      props.onChange({
        ...props.query,
        serviceMapUseNativeHistograms: nativeHistograms,
      });
      // Migrate to native histograms
      // this will ensure that on navigating to the query option service map from a url,
      // the service map will be rendered with the native histograms when
      // querytype is serviceMap
      // the serviceMapUseNativeHistograms is undefined
      // and nativeHistograms is true
      if (
        props.query.queryType === 'serviceMap' &&
        props.query.serviceMapUseNativeHistograms === undefined &&
        // switch from tempo with native histograms to tempo without native histograms
        props.query.serviceMapUseNativeHistograms !== nativeHistograms &&
        nativeHistograms
      ) {
        props.onRunQuery();
      }
    };
    initialize();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Mirrors original componentDidMount semantics: runs once on mount only. The original class lifecycle did not re-run when props changed; preserving that exact behavior is required by AAP §0.9.2.3 (behavior preservation).
  }, []);

  // Plain arrow function (not `useCallback`) per AAP §0.5.3: wrap callbacks in `useCallback`
  // only when referential identity matters to a memoized child. The downstream consumers
  // (`TraceQLSearch`, `QueryEditor`) do not rely on referential identity of this handler
  // to skip re-renders, so a stable identity here adds no behavioral value.
  const onClearResults = () => {
    // Run clear query to clear results
    const { onChange, query, onRunQuery } = props;
    onChange({
      ...query,
      queryType: 'clear',
    });
    onRunQuery();
  };

  const { query, onChange, datasource, app } = props;
  const isAlerting = app === CoreApp.UnifiedAlerting;

  const graphDatasourceUid = datasource.serviceMap?.datasourceUid;

  let queryTypeOptions: Array<SelectableValue<TempoQueryType>> = [
    { value: 'traceqlSearch', label: 'Search' },
    { value: 'traceql', label: 'TraceQL' },
    { value: 'serviceMap', label: 'Service Graph' },
  ];

  // Migrate user to new query type if they are using the old search query type
  if (
    query.spanName ||
    query.serviceName ||
    query.search ||
    query.maxDuration ||
    query.minDuration ||
    query.queryType === 'nativeSearch'
  ) {
    onChange(migrateFromSearchToTraceQLSearch(query));
  }

  // only show query with assistant button if:
  // feature toggle is enabled
  // app is Explore, Dashboard, or PanelEditor
  const showAssistant =
    config.featureToggles.queryWithAssistant &&
    (app === CoreApp.Explore || app === CoreApp.Dashboard || app === CoreApp.PanelEditor);
  return (
    <>
      <Modal
        title={'Upload trace'}
        isOpen={uploadModalOpen}
        onDismiss={() => setUploadModalOpen(false)}
      >
        <div className={css({ padding: theme.spacing(2) })}>
          <FileDropzone
            options={{ multiple: false }}
            onLoad={(result) => {
              if (typeof result !== 'string' && result !== null) {
                throw Error(`Unexpected result type: ${typeof result}`);
              }
              props.datasource.uploadedJson = result;
              onChange({
                ...query,
                queryType: 'upload',
              });
              setUploadModalOpen(false);
              props.onRunQuery();
            }}
          />
        </div>
      </Modal>
      {!isAlerting && showAssistant && (
        <InlineFieldRow className={css({ marginBottom: theme.spacing(1) })}>
          <QueryWithAssistantButton
            currentQuery={query}
            queries={[query]}
            dataSourceInstanceSettings={datasource.instanceSettings}
            datasourceApi={null}
            app={app}
          />
        </InlineFieldRow>
      )}
      {!isAlerting && (
        <InlineFieldRow>
          <InlineField label="Query type" grow={true}>
            <Stack gap={1} alignItems="center" justifyContent="space-between">
              <RadioButtonGroup<TempoQueryType>
                options={queryTypeOptions}
                value={query.queryType}
                onChange={(v) => {
                  reportInteraction('grafana_traces_query_type_changed', {
                    datasourceType: 'tempo',
                    app: app ?? '',
                    grafana_version: config.buildInfo.version,
                    newQueryType: v,
                    previousQueryType: query.queryType ?? '',
                  });

                  onClearResults();
                  onChange({
                    ...query,
                    queryType: v,
                  });
                }}
                size="md"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setUploadModalOpen(true);
                }}
              >
                Import trace
              </Button>
            </Stack>
          </InlineField>
        </InlineFieldRow>
      )}
      {query.queryType === 'traceqlSearch' && (
        <TraceQLSearch
          datasource={props.datasource}
          query={query}
          onChange={onChange}
          onBlur={props.onBlur}
          app={app}
          onClearResults={onClearResults}
          addVariablesToOptions={props.addVariablesToOptions}
          range={props.range}
        />
      )}
      {query.queryType === 'serviceMap' && (
        <ServiceGraphSection graphDatasourceUid={graphDatasourceUid} query={query} onChange={onChange} />
      )}
      {query.queryType === 'traceql' && (
        <QueryEditor
          datasource={props.datasource}
          query={query}
          onRunQuery={props.onRunQuery}
          onChange={onChange}
          app={app}
          onClearResults={onClearResults}
          range={props.range}
        />
      )}
    </>
  );
});

TempoQueryField.displayName = 'TempoQueryField';

export default TempoQueryField;
