import { css } from '@emotion/css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Subscription } from 'rxjs';

import { LoadingState, type PanelData } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { config, type FetchError, type FetchResponse } from '@grafana/runtime';
import { Button, ClipboardButton, JSONFormatter, LoadingPlaceholder, Space, Stack } from '@grafana/ui';
import { backendSrv } from 'app/core/services/backend_srv';

import { getPanelInspectorStyles2 } from './styles';

interface ExecutedQueryInfo {
  refId: string;
  query: string;
  frames: number;
  rows: number;
}

interface Props {
  instanceId?: string; // Must match the prefix of the requestId of the query being inspected. For updating only one instance of the inspector in case of multiple instances, ie Explore split view
  data: PanelData;
  onRefreshQuery: () => void;
}

// Type guard: narrows `unknown` to a string-keyed mutable object record. Used inside
// `onDataSourceResponse` to allow deletion of nested properties without resorting to an
// `as Record<string, unknown>` cast (which is prohibited by `@typescript-eslint/consistent-type-assertions`
// configured with `assertionStyle: 'never'` in `eslint.config.js`).
const isMutableObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

// TODO(modernization): the original class component had `isMocking`/`mockedResponse` state fields
// and an `onToggleMocking` handler that were never wired up to any UI; they were removed during
// the class→functional conversion to satisfy `noUnusedLocals: true` in tsconfig.
export const QueryInspector = ({ instanceId, data, onRefreshQuery }: Props) => {
  const [allNodesExpanded, setAllNodesExpanded] = useState<boolean | null>(null);
  const [response, setResponse] = useState<{}>({});
  const [executedQueries, setExecutedQueries] = useState<ExecutedQueryInfo[]>([]);

  // Instance variable replacement: holds the last formatted JSON object provided by `JSONFormatter`
  // via its `onDidRender` callback. Read by `getTextForClipboard` for the clipboard copy action.
  const formattedJsonRef = useRef<{} | undefined>(undefined);

  const onDataSourceResponse = useCallback((rawResponse: FetchResponse | FetchError) => {
    // ignore silent requests; both FetchResponse and FetchError carry a `config: BackendSrvRequest`
    if (rawResponse.config?.hideFromInspector) {
      return;
    }

    // Clone for mutation; the response shape varies between FetchResponse and FetchError and is
    // dynamically processed below. Typing as Record<string, unknown> preserves the original
    // dynamic-property-mutation behavior without resorting to `any`.
    const cloned: Record<string, unknown> = { ...rawResponse };

    if (cloned.headers) {
      delete cloned.headers;
    }

    if (isMutableObject(cloned.config)) {
      // Local reference captures the type-guarded narrowing (Record<string, unknown>) so that
      // subsequent property deletions are well-typed. The reference also remains valid after
      // `delete cloned.config` because object references in JavaScript are independent of the
      // property slot that held them.
      const request = cloned.config;
      cloned.request = request;

      delete cloned.config;
      delete request.transformRequest;
      delete request.transformResponse;
      delete request.paramSerializer;
      delete request.jsonpCallbackParam;
      delete request.headers;
      delete request.requestId;
      delete request.inspect;
      delete request.retry;
      delete request.timeout;
    }

    if (cloned.data) {
      cloned.response = cloned.data;

      delete cloned.config;
      delete cloned.data;
      delete cloned.status;
      delete cloned.statusText;
      delete cloned.ok;
      delete cloned.url;
      delete cloned.redirected;
      delete cloned.type;
      delete cloned.$$config;
    }

    setResponse(cloned);
  }, []);

  // Subscribe to the inspector stream on mount and tear down on unmount; replaces
  // componentDidMount + componentWillUnmount per AAP §0.8.4 subscription lifecycle pattern.
  useEffect(() => {
    const subs = new Subscription();
    subs.add(
      backendSrv.getInspectorStream().subscribe({
        next: (streamResponse) => {
          let update = true;
          if (instanceId && streamResponse?.requestId) {
            update = streamResponse.requestId.startsWith(instanceId);
          }
          if (update) {
            onDataSourceResponse(streamResponse.response);
          }
        },
      })
    );
    return () => subs.unsubscribe();
  }, [instanceId, onDataSourceResponse]);

  // Find the list of executed queries; replaces componentDidUpdate(oldProps) gated on
  // `props.data !== oldProps.data`. The functional `useEffect(fn, [data])` also runs on initial
  // mount, which is a benign no-op when `data.series` is empty (executedQueries → []).
  useEffect(() => {
    const frames = data.series;
    const queries: ExecutedQueryInfo[] = [];

    if (frames?.length) {
      let last: ExecutedQueryInfo | undefined = undefined;

      frames.forEach((frame) => {
        const query = frame.meta?.executedQueryString;

        if (query) {
          const refId = frame.refId || '?';

          if (last?.refId === refId) {
            last.frames++;
            last.rows += frame.length;
          } else {
            last = {
              refId,
              frames: 0,
              rows: frame.length,
              query,
            };
            queries.push(last);
          }
        }
      });
    }

    setExecutedQueries(queries);
  }, [data]);

  // `JSONFormatter` is `memo`-wrapped, so a stable callback identity prevents unnecessary
  // re-renders. The ref-write has no reactive dependencies.
  const setFormattedJson = useCallback((formattedJson: {}) => {
    formattedJsonRef.current = formattedJson;
  }, []);

  // `ClipboardButton.getText` is read at copy time only; identity stability avoids re-rendering
  // the button on each parent render.
  const getTextForClipboard = useCallback(() => {
    return JSON.stringify(formattedJsonRef.current, null, 2);
  }, []);

  const onToggleExpand = () => {
    setAllNodesExpanded((prev) => !prev);
  };

  const getNrOfOpenNodes = () => {
    if (allNodesExpanded === null) {
      return 3; // 3 is default, ie when state is null
    } else if (allNodesExpanded) {
      return 20;
    }
    return 1;
  };

  const renderExecutedQueries = (queries: ExecutedQueryInfo[]) => {
    if (!queries.length) {
      return null;
    }

    const styles = {
      refId: css({
        fontWeight: config.theme.typography.weight.semibold,
        color: config.theme.colors.textBlue,
        marginRight: '8px',
      }),
    };

    return (
      <div>
        {queries.map((info) => {
          return (
            <Stack key={info.refId} gap={1} direction="column">
              <div>
                <span className={styles.refId}>{info.refId}:</span>
                {info.frames > 1 && (
                  <span>
                    <Trans i18nKey="inspector.query-inspector.count-frames" count={info.frames}>
                      {'{{count}}'} frames,{' '}
                    </Trans>
                  </span>
                )}
                <span>
                  <Trans i18nKey="inspector.query-inspector.count-rows" count={info.rows}>
                    {'{{count}}'} rows
                  </Trans>
                </span>
              </div>
              <pre>{info.query}</pre>
            </Stack>
          );
        })}
      </div>
    );
  };

  const openNodes = getNrOfOpenNodes();
  const styles = getPanelInspectorStyles2(config.theme2);
  const haveData = Object.keys(response).length > 0;
  const isLoading = data.state === LoadingState.Loading;

  return (
    <div className={styles.wrap}>
      <div aria-label={selectors.components.PanelInspector.Query.content}>
        <h3 className={styles.heading}>
          <Trans i18nKey="inspector.query-inspector.query-inspector">Query inspector</Trans>
        </h3>
        <p className="small muted">
          <Trans i18nKey="inspector.query.description">
            Query inspector allows you to view raw request and response. To collect this data Grafana needs to issue a
            new query. Click refresh button below to trigger a new query.
          </Trans>
        </p>
      </div>
      {renderExecutedQueries(executedQueries)}
      <Stack direction={'row'} gap={2} justifyContent={'flex-start'} wrap>
        <Button
          icon="sync"
          onClick={onRefreshQuery}
          aria-label={selectors.components.PanelInspector.Query.refreshButton}
        >
          <Trans i18nKey="inspector.query.refresh">Refresh</Trans>
        </Button>

        {haveData && allNodesExpanded && (
          <Button icon="minus" variant="secondary" onClick={onToggleExpand}>
            <Trans i18nKey="inspector.query.collapse-all">Collapse all</Trans>
          </Button>
        )}
        {haveData && !allNodesExpanded && (
          <Button icon="plus" variant="secondary" onClick={onToggleExpand}>
            <Trans i18nKey="inspector.query.expand-all">Expand all</Trans>
          </Button>
        )}

        {haveData && (
          <ClipboardButton getText={getTextForClipboard} icon="copy" variant="secondary">
            <Trans i18nKey="inspector.query.copy-to-clipboard">Copy to clipboard</Trans>
          </ClipboardButton>
        )}
      </Stack>
      <Space v={2} />
      <div className={styles.content}>
        {isLoading && (
          <LoadingPlaceholder
            text={t('inspector.query-inspector.text-loading-query-inspector', 'Loading query inspector...')}
          />
        )}
        {!isLoading && haveData && (
          <JSONFormatter json={response} open={openNodes} onDidRender={setFormattedJson} />
        )}
        {!isLoading && !haveData && (
          <p className="muted">
            <Trans i18nKey="inspector.query.no-data">No request and response collected yet. Hit refresh button</Trans>
          </p>
        )}
      </div>
    </div>
  );
};
