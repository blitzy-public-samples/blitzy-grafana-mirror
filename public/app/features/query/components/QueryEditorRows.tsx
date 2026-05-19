import { DragDropContext, type DragStart, Droppable, type DropResult } from '@hello-pangea/dnd';
import { memo, useCallback, type ReactNode } from 'react';

import {
  CoreApp,
  type DataQuery,
  type DataSourceInstanceSettings,
  type EventBusExtended,
  type HistoryItem,
  type PanelData,
  getDataSourceRef,
  isSystemOverrideWithRef,
} from '@grafana/data';
import { getDataSourceSrv, reportInteraction } from '@grafana/runtime';
import { type SceneObjectRef, type VizPanel } from '@grafana/scenes';
import { type DataSourceRef } from '@grafana/schema';
import { getTimeSrv } from 'app/features/dashboard/services/TimeSrv';
import { MIXED_DATASOURCE_NAME } from 'app/plugins/datasource/mixed/MixedDataSource';

import { QueryEditorRow } from './QueryEditorRow';

export interface Props {
  // The query configuration
  queries: DataQuery[];
  dsSettings: DataSourceInstanceSettings;

  // Query editing
  onQueriesChange: (queries: DataQuery[], options?: { skipAutoImport?: boolean }) => void;
  onAddQuery: (query: DataQuery) => void;
  onRunQueries: () => void;

  // Query Response Data
  data: PanelData;

  // Misc
  app?: CoreApp;
  history?: Array<HistoryItem<DataQuery>>;
  eventBus?: EventBusExtended;
  onQueryCopied?: () => void;
  onQueryRemoved?: () => void;
  onQueryToggled?: (queryStatus?: boolean | undefined) => void;
  onQueryOpenChanged?: (status?: boolean | undefined) => void;
  onUpdateDatasources?: (datasource: DataSourceRef) => void;
  onQueryReplacedFromLibrary?: () => void;
  queryRowWrapper?: (children: ReactNode, refId: string) => ReactNode;
  queryLibraryRef?: string;
  onCancelQueryLibraryEdit?: () => void;
  isOpen?: boolean;
  panelRef?: SceneObjectRef<VizPanel>;
}

export const QueryEditorRows = memo((props: Props): ReactNode => {
  const {
    dsSettings,
    data,
    queries,
    app,
    history,
    eventBus,
    onAddQuery,
    onRunQueries,
    onQueryCopied,
    onQueryRemoved,
    onQueryToggled,
    onQueryOpenChanged,
    onQueryReplacedFromLibrary,
    queryRowWrapper,
    queryLibraryRef,
    onCancelQueryLibraryEdit,
    isOpen,
  } = props;

  const onRemoveQuery = useCallback(
    (query: DataQuery) => {
      props.onQueriesChange(props.queries.filter((item) => item !== query));
    },
    [props]
  );

  const onChangeQuery = (query: DataQuery, index: number) => {
    const { queries, onQueriesChange } = props;

    // update query in array
    onQueriesChange(
      queries.map((item, itemIndex) => {
        if (itemIndex === index) {
          return query;
        }
        return item;
      })
    );

    if (props.panelRef) {
      const panel = props.panelRef.resolve();
      const hideSeriesOverrideIndex = panel.state.fieldConfig.overrides.findIndex(
        isSystemOverrideWithRef('hideSeriesFrom')
      );

      if (hideSeriesOverrideIndex !== -1) {
        const newOverrides = [...panel.state.fieldConfig.overrides];
        newOverrides.splice(hideSeriesOverrideIndex, 1);

        panel.setState({ fieldConfig: { ...panel.state.fieldConfig, overrides: newOverrides } });
      }
    }
  };

  const onReplaceQuery = (query: DataQuery, index: number) => {
    const { queries, onQueriesChange, onUpdateDatasources, dsSettings, onRunQueries } = props;

    // Replace old query with new query, preserving the original refId
    const newQueries = queries.map((item, itemIndex) => {
      if (itemIndex === index) {
        return { ...query, refId: item.refId };
      }
      return item;
    });
    onQueriesChange(newQueries, { skipAutoImport: true });

    // Update datasources based on the new query set
    if (query.datasource?.uid) {
      const uniqueDatasources = new Set(newQueries.map((q) => q.datasource?.uid));
      const isMixed = uniqueDatasources.size > 1;
      const newDatasourceRef = {
        uid: isMixed ? MIXED_DATASOURCE_NAME : query.datasource.uid,
      };
      const shouldChangeDatasource = dsSettings.uid !== newDatasourceRef.uid;
      if (shouldChangeDatasource) {
        onUpdateDatasources?.(newDatasourceRef);
      }
    }

    onRunQueries();
  };

  const onDataSourceChange = (dataSource: DataSourceInstanceSettings, index: number) => {
    const { queries, onQueriesChange } = props;

    Promise.all(
      queries.map(async (item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const dataSourceRef = getDataSourceRef(dataSource);

        if (item.datasource) {
          const previous = getDataSourceSrv().getInstanceSettings(item.datasource);

          if (previous?.type === dataSource.type) {
            return {
              ...item,
              datasource: dataSourceRef,
            };
          }
        }

        const ds = await getDataSourceSrv().get(dataSourceRef);

        return { ...ds.getDefaultQuery?.(CoreApp.PanelEditor), ...item, datasource: dataSourceRef };
      })
    ).then(
      (values) => onQueriesChange(values),
      () => {
        throw new Error(`Failed to get datasource ${dataSource.name ?? dataSource.uid}`);
      }
    );
  };

  const onDragStart = useCallback(
    (result: DragStart) => {
      const { queries, dsSettings } = props;

      reportInteraction('query_row_reorder_started', {
        startIndex: result.source.index,
        numberOfQueries: queries.length,
        datasourceType: dsSettings.type,
      });
    },
    [props]
  );

  const onDragEnd = useCallback(
    (result: DropResult) => {
      const { queries, onQueriesChange, dsSettings } = props;

      if (!result || !result.destination) {
        return;
      }

      const startIndex = result.source.index;
      const endIndex = result.destination.index;
      if (startIndex === endIndex) {
        reportInteraction('query_row_reorder_canceled', {
          startIndex,
          endIndex,
          numberOfQueries: queries.length,
          datasourceType: dsSettings.type,
        });
        return;
      }

      const update = Array.from(queries);
      const [removed] = update.splice(startIndex, 1);
      update.splice(endIndex, 0, removed);
      onQueriesChange(update);

      reportInteraction('query_row_reorder_ended', {
        startIndex,
        endIndex,
        numberOfQueries: queries.length,
        datasourceType: dsSettings.type,
      });
    },
    [props]
  );

  return (
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <Droppable droppableId="transformations-list" direction="vertical">
        {(provided) => {
          return (
            <div data-testid="query-editor-rows" ref={provided.innerRef} {...provided.droppableProps}>
              {queries.map((query, index) => {
                const dataSourceSettings = getDataSourceSettings(query, dsSettings);
                const onChangeDataSourceSettings = dsSettings.meta.mixed
                  ? (settings: DataSourceInstanceSettings) => onDataSourceChange(settings, index)
                  : undefined;

                const queryEditorRow = (
                  <QueryEditorRow
                    id={query.refId}
                    index={index}
                    key={query.refId}
                    data={data}
                    query={query}
                    dataSource={dataSourceSettings}
                    onChangeDataSource={onChangeDataSourceSettings}
                    onChange={(query) => onChangeQuery(query, index)}
                    onReplace={(query) => onReplaceQuery(query, index)}
                    onRemoveQuery={onRemoveQuery}
                    onAddQuery={onAddQuery}
                    onRunQuery={onRunQueries}
                    onQueryCopied={onQueryCopied}
                    onQueryRemoved={onQueryRemoved}
                    onQueryToggled={onQueryToggled}
                    onQueryOpenChanged={onQueryOpenChanged}
                    onQueryReplacedFromLibrary={onQueryReplacedFromLibrary}
                    queries={queries}
                    app={app}
                    range={getTimeSrv().timeRange()}
                    history={history}
                    eventBus={eventBus}
                    queryLibraryRef={queryLibraryRef}
                    onCancelQueryLibraryEdit={onCancelQueryLibraryEdit}
                    isOpen={isOpen}
                  />
                );

                return queryRowWrapper ? queryRowWrapper(queryEditorRow, query.refId) : queryEditorRow;
              })}
              {provided.placeholder}
            </div>
          );
        }}
      </Droppable>
    </DragDropContext>
  );
});

QueryEditorRows.displayName = 'QueryEditorRows';

const getDataSourceSettings = (
  query: DataQuery,
  groupSettings: DataSourceInstanceSettings
): DataSourceInstanceSettings => {
  if (!query.datasource) {
    return groupSettings;
  }
  const querySettings = getDataSourceSrv().getInstanceSettings(query.datasource);
  return querySettings || groupSettings;
};
