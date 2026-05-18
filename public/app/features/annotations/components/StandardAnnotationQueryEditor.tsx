import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactElement } from 'react';
import { lastValueFrom } from 'rxjs';

import {
  type AnnotationEventMappings,
  type AnnotationQuery,
  type DataSourceApi,
  type DataSourceInstanceSettings,
  DataSourcePluginContextProvider,
  LoadingState,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { type DataQuery } from '@grafana/schema';
import { Alert, type AlertVariant, Button, Space, Spinner } from '@grafana/ui';
import { getDashboardSrv } from 'app/features/dashboard/services/DashboardSrv';
import { getTimeSrv } from 'app/features/dashboard/services/TimeSrv';
import { PanelModel } from 'app/features/dashboard/state/PanelModel';

import { executeAnnotationQuery } from '../executeAnnotationQuery';
import { shouldUseLegacyRunner, shouldUseMappingUI, standardAnnotationSupport } from '../standardAnnotationSupport';
import { type AnnotationQueryResponse } from '../types';
import { updateAnnotationFromSavedQuery } from '../utils/savedQueryUtils';

import { AnnotationQueryEditorActionsWrapper } from './AnnotationQueryEditorActionsWrapper';
import { AnnotationFieldMapper } from './AnnotationResultMapper';

export interface Props {
  datasource: DataSourceApi;
  datasourceInstanceSettings: DataSourceInstanceSettings;
  annotation: AnnotationQuery<DataQuery>;
  onChange: (annotation: AnnotationQuery<DataQuery>) => void;
  disableSavedQueries?: boolean;
}

export interface StandardAnnotationQueryEditorHandle {
  onQueryReplace: (replacedQuery: DataQuery) => Promise<void>;
}

const StandardAnnotationQueryEditor = forwardRef<StandardAnnotationQueryEditorHandle, Props>(
  function StandardAnnotationQueryEditor(props, ref) {
    const { datasource, datasourceInstanceSettings, annotation, onChange, disableSavedQueries } = props;

    const [running, setRunning] = useState<boolean>(false);
    const [response, setResponse] = useState<AnnotationQueryResponse | undefined>(undefined);
    // One-shot flag used to short-circuit the next verifyDataSource call after onQueryReplace.
    // Stored in a ref because mutating it must not trigger a re-render and it is never read during render.
    const skipNextVerificationRef = useRef<boolean>(false);
    // Tracks whether the unified lifecycle effect has run at least once, so we can faithfully reproduce the
    // original componentDidMount (unconditional) vs componentDidUpdate (guarded by !shouldUseLegacyRunner) split.
    const hasMountedRef = useRef<boolean>(false);

    const onRunQuery = useCallback(async () => {
      if (shouldUseLegacyRunner(datasource)) {
        // In the new UI the running of query is done so the data can be mapped. In the legacy annotations this does
        // not exist as the annotationQuery already returns annotation events which cannot be mapped. This means that
        // right now running a query for data source with legacy runner does not make much sense.
        return;
      }

      const dashboard = getDashboardSrv().getCurrent();
      if (!dashboard) {
        return;
      }

      setRunning(true);
      const newResponse = await lastValueFrom(
        executeAnnotationQuery(
          {
            range: getTimeSrv().timeRange(),
            panel: new PanelModel({}),
            dashboard,
          },
          datasource,
          annotation
        )
      );
      setRunning(false);
      setResponse(newResponse);
    }, [datasource, annotation]);

    /**
     * verifyDataSource() prepares the annotation and provides immediate query feedback:
     * 1. Applies datasource-specific preparation (e.g., Prometheus moves expr to target field)
     * 2. Updates annotation if preparation made changes
     * 3. Runs query to show immediate results in the UI
     */
    const verifyDataSource = useCallback(() => {
      // Skip verification if we just did a saved query replacement to avoid double preparation
      if (skipNextVerificationRef.current) {
        skipNextVerificationRef.current = false;
        onRunQuery();
        return;
      }

      // Always run prepareAnnotation to ensure proper query structure
      // This is essential for datasources like Prometheus that need to format queries correctly
      const processor = {
        ...standardAnnotationSupport,
        ...datasource.annotations,
      };

      const fixed = processor.prepareAnnotation!(annotation);
      // if datasource prepared annotation returns a different annotation(e.g., prometheus before had expr in the root level now it's saved in 'target'), update the annotation with that one
      if (fixed !== annotation) {
        onChange(fixed);
      } else {
        onRunQuery();
      }
    }, [datasource, annotation, onChange, onRunQuery]);

    const onQueryChange = useCallback(
      (target: DataQuery) => {
        // if dealing with v2 dashboards
        if (annotation.query && annotation.query.spec) {
          target = {
            ...annotation.query.spec,
            ...target,
          };
        }
        //target property is what ds query editor are using, but for v2 we also need to keep query in sync
        onChange({
          ...annotation,
          // the query editor uses target, but the annotation in v2 uses query
          // therefore we need to keep the target and query in sync
          target,
          ...(annotation.query && {
            query: {
              kind: annotation.query.kind,
              spec: { ...target },
            },
          }),
          // Keep legacyOptions from the original annotation if they exist
          ...(annotation.legacyOptions ? { legacyOptions: annotation.legacyOptions } : {}),
        });
      },
      [annotation, onChange]
    );

    const onMappingChange = useCallback(
      (mappings?: AnnotationEventMappings) => {
        onChange({
          ...annotation,
          mappings,
        });
      },
      [annotation, onChange]
    );

    const onAnnotationChange = useCallback(
      (newAnnotation: AnnotationQuery) => {
        // Also preserve any legacyOptions field that might exist when migrating from V2 to V1
        onChange({
          ...newAnnotation,
          // Keep legacyOptions from the original annotation if they exist
          ...(annotation.legacyOptions ? { legacyOptions: annotation.legacyOptions } : {}),
        });
      },
      [annotation, onChange]
    );

    const onQueryReplace = useCallback(
      async (replacedQuery: DataQuery) => {
        try {
          // Use new async updateAnnotationFromSavedQuery that returns properly prepared annotation
          const preparedAnnotation = await updateAnnotationFromSavedQuery(annotation, replacedQuery);
          // Set flag to skip next verification since updateAnnotationFromSavedQuery already prepared the annotation
          skipNextVerificationRef.current = true;
          onChange(preparedAnnotation);
        } catch (error) {
          console.error('Failed to replace annotation query:', error);
          // On error, reset the replacing state but don't change the annotation
        }
      },
      [annotation, onChange]
    );

    const getStatusSeverity = (resp: AnnotationQueryResponse): AlertVariant => {
      const { events, panelData } = resp;

      if (panelData?.errors || panelData?.error) {
        return 'error';
      }

      if (!events?.length) {
        return 'warning';
      }

      return 'success';
    };

    const renderStatusText = (resp: AnnotationQueryResponse, isRunning: boolean | undefined): ReactElement => {
      const { events, panelData } = resp;

      if (isRunning || resp?.panelData?.state === LoadingState.Loading || !resp) {
        return <p>{'loading...'}</p>;
      }

      if (panelData?.errors) {
        return (
          <>
            {panelData.errors.map((e, i) => (
              <p key={i}>{e.message}</p>
            ))}
          </>
        );
      }
      if (panelData?.error) {
        return <p>{panelData.error.message ?? 'There was an error fetching data'}</p>;
      }

      if (!events?.length) {
        return (
          <p>
            <Trans i18nKey="annotations.standard-annotation-query-editor.no-events-found">No events found</Trans>
          </p>
        );
      }

      const frame = panelData?.series?.[0] ?? panelData?.annotations?.[0];
      const numEvents = events.length;
      const numFields = frame?.fields.length;
      return (
        <p>
          <Trans i18nKey="annotations.standard-annotation-query-editor.events-found">
            {{ numEvents }} events (from {{ numFields }} fields)
          </Trans>
        </p>
      );
    };

    const renderStatus = () => {
      if (!response) {
        return null;
      }

      return (
        <>
          <Space v={2} />
          <div>
            {running ? (
              <Spinner />
            ) : (
              <Button
                data-testid={selectors.components.Annotations.editor.testButton}
                variant="secondary"
                size="xs"
                onClick={onRunQuery}
              >
                <Trans i18nKey="annotations.standard-annotation-query-editor.test-annotation-query">
                  Test annotation query
                </Trans>
              </Button>
            )}
          </div>
          <Space v={2} layout="block" />
          <Alert
            data-testid={selectors.components.Annotations.editor.resultContainer}
            severity={getStatusSeverity(response)}
            title={t('annotations.standard-annotation-query-editor.title-query-result', 'Query result')}
          >
            {renderStatusText(response, running)}
          </Alert>
        </>
      );
    };

    useEffect(() => {
      if (!hasMountedRef.current) {
        // Initial mount — equivalent to componentDidMount; runs unconditionally.
        hasMountedRef.current = true;
        verifyDataSource();
      } else if (!shouldUseLegacyRunner(datasource)) {
        // Subsequent annotation change — equivalent to componentDidUpdate guarded by !shouldUseLegacyRunner(datasource).
        verifyDataSource();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Mirrors original componentDidUpdate behavior: only annotation prop changes trigger this effect; datasource and verifyDataSource are intentionally read at fire time.
    }, [annotation]);

    useImperativeHandle(ref, () => ({ onQueryReplace }), [onQueryReplace]);

    // Find the annotation runner
    let QueryEditor = datasource.annotations?.QueryEditor || datasource.components?.QueryEditor;
    if (!QueryEditor) {
      return (
        <div>
          <Trans i18nKey="annotations.standard-annotation-query-editor.no-query-editor">
            Annotations are not supported. This datasource needs to export a QueryEditor
          </Trans>
        </div>
      );
    }

    // For v2 dashboards, target is not available, only query
    let target = annotation.target;

    // For v2 dashboards, use query.spec
    if (annotation.query && annotation.query.spec) {
      target = {
        ...annotation.query.spec,
      };
    }

    let query = {
      ...datasource.annotations?.getDefaultQuery?.(),
      ...(target ?? { refId: 'Anno' }),
    };

    // Create annotation object that respects annotations API
    let editorAnnotation = annotation;

    // For v2 dashboards: propagate legacyOptions to root level for datasource compatibility
    if (annotation.query && annotation.legacyOptions) {
      editorAnnotation = { ...annotation.legacyOptions, ...annotation };
    }

    return (
      <>
        <DataSourcePluginContextProvider instanceSettings={datasourceInstanceSettings}>
          <AnnotationQueryEditorActionsWrapper
            disableSavedQueries={disableSavedQueries}
            annotation={annotation}
            datasource={datasource}
            onQueryReplace={onQueryReplace}
          >
            <QueryEditor
              key={datasource?.name}
              query={query}
              datasource={datasource}
              onChange={onQueryChange}
              onRunQuery={onRunQuery}
              data={response?.panelData}
              range={getTimeSrv().timeRange()}
              annotation={editorAnnotation}
              onAnnotationChange={onAnnotationChange}
            />
          </AnnotationQueryEditorActionsWrapper>
        </DataSourcePluginContextProvider>
        {shouldUseMappingUI(datasource) && (
          <>
            {renderStatus()}
            <AnnotationFieldMapper response={response} mappings={annotation.mappings} change={onMappingChange} />
          </>
        )}
      </>
    );
  }
);

export default StandardAnnotationQueryEditor;
