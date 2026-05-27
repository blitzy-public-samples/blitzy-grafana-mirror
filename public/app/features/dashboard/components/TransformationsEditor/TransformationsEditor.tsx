import { css } from '@emotion/css';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type Unsubscribable } from 'rxjs';

import {
  type DataFrame,
  type DataQueryRequest,
  type DataTransformerConfig,
  type GrafanaTheme2,
  type PanelData,
  type SelectableValue,
  standardTransformersRegistry,
  type TransformerCategory,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { reportInteraction } from '@grafana/runtime';
import { Button, ButtonGroup, ConfirmModal, Container, IconButton, ScrollContainer, useStyles2 } from '@grafana/ui';
import { EmptyTransformationsMessage } from 'app/features/dashboard-scene/panel-edit/PanelDataPane/EmptyTransformationsMessage';

import { type PanelModel } from '../../state/PanelModel';
import { PanelNotSupported } from '../PanelEditor/PanelNotSupported';

import { TransformationOperationRows } from './TransformationOperationRows';
import { TransformationPickerNg } from './TransformationPickerNg';
import { type TransformationsEditorTransformation } from './types';

interface TransformationsEditorProps {
  panel: PanelModel;
}

export const VIEW_ALL_VALUE = 'viewAll';
export type viewAllType = 'viewAll';
export type FilterCategory = TransformerCategory | viewAllType;

export interface TransformationData {
  request?: DataQueryRequest;
  series: DataFrame[];
  annotations?: DataFrame[];
}

// Transformation UIDs are stored in a name-X form. name is NOT unique hence we need to parse the IDs and increase X
// for transformations with the same name
const buildTransformationIds = (transformations: DataTransformerConfig[]): string[] => {
  const transformationCounters: Record<string, number> = {};
  const transformationIds: string[] = [];

  for (let i = 0; i < transformations.length; i++) {
    const transformation = transformations[i];
    if (transformationCounters[transformation.id] === undefined) {
      transformationCounters[transformation.id] = 0;
    } else {
      transformationCounters[transformation.id] += 1;
    }
    transformationIds.push(`${transformations[i].id}-${transformationCounters[transformations[i].id]}`);
  }
  return transformationIds;
};

export const TransformationsEditor = memo(({ panel }: TransformationsEditorProps) => {
  const styles = useStyles2(getStyles);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lazy initializer mirrors the original constructor: builds IDs once at mount.
  const [transformations, setTransformations] = useState<TransformationsEditorTransformation[]>(() => {
    const initial = panel.transformations || [];
    const ids = buildTransformationIds(initial);
    return initial.map((t, i) => ({ transformation: t, id: ids[i] }));
  });

  const [data, setData] = useState<TransformationData>({ series: [] });
  const [search, setSearch] = useState<string>('');
  const [showPicker, setShowPicker] = useState<boolean | undefined>(undefined);
  const [scrollTop, setScrollTop] = useState<number | undefined>(undefined);
  const [showRemoveAllModal, setShowRemoveAllModal] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory | undefined>(VIEW_ALL_VALUE);
  const [showIllustrations, setShowIllustrations] = useState<boolean | undefined>(true);

  // Subscribe to the panel's query runner data stream on mount; unsubscribe on unmount.
  // Equivalent to the original componentDidMount + componentWillUnmount pair.
  useEffect(() => {
    const subscription: Unsubscribable = panel
      .getQueryRunner()
      .getData({ withTransforms: false, withFieldConfig: false })
      .subscribe({
        next: (panelData: PanelData) => setData(panelData),
      });
    return () => {
      subscription.unsubscribe();
    };
  }, [panel]);

  // Replicate componentDidUpdate behavior for the derived `currentShowPicker` transition.
  // componentDidUpdate doesn't fire on initial mount; we replicate that by gating on
  // `prevShowPickerRef.current !== undefined`.
  const prevShowPickerRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const currentHasTransforms = transformations.length > 0;
    const currentShowPicker = !currentHasTransforms || showPicker;
    if (prevShowPickerRef.current !== undefined && prevShowPickerRef.current !== currentShowPicker) {
      // kindOfZero will be a random number between 0 and 0.5. It will be rounded to 0 by the scrollable component.
      // We cannot always use 0 as it will not trigger a rerender of the scrollable component consistently
      // due to React changes detection algo.
      const kindOfZero = Math.random() / 2;

      setScrollTop(currentShowPicker ? kindOfZero : Number.MAX_SAFE_INTEGER);
    }
    prevShowPickerRef.current = currentShowPicker;
  }, [transformations.length, showPicker]);

  // Apply scrollTop to the scroll container when scrollTop changes (post-mount).
  // Initial scrollTop is `undefined`; the conditional guard keeps the initial-mount run a no-op,
  // matching the class's componentDidUpdate (which does not fire on initial mount).
  useEffect(() => {
    if (scrollTop !== undefined) {
      scrollRef.current?.scrollTo({ top: scrollTop });
    }
  }, [scrollTop]);

  const onChange = useCallback(
    (newTransformations: TransformationsEditorTransformation[]) => {
      setTransformations(newTransformations);
      panel.setTransformations(newTransformations.map((t) => t.transformation));
    },
    [panel]
  );

  const getTransformationNextId = useCallback(
    (name: string) => {
      let nextId = 0;
      const existingIds = transformations.filter((t) => t.id.startsWith(name)).map((t) => t.id);

      if (existingIds.length !== 0) {
        nextId = Math.max(...existingIds.map((i) => parseInt(i.match(/\d+/)![0], 10))) + 1;
      }

      return `${name}-${nextId}`;
    },
    [transformations]
  );

  const onTransformationAdd = useCallback(
    (selectable: SelectableValue<string>) => {
      const eventName = 'transformations_redesign_panel_editor_tabs_transformations_management';

      reportInteraction(eventName, {
        action: 'add',
        transformationId: selectable.value,
      });

      const nextId = getTransformationNextId(selectable.value!);
      setSearch('');
      setShowPicker(false);
      onChange([
        ...transformations,
        {
          id: nextId,
          transformation: {
            id: selectable.value as string,
            options: {},
          },
        },
      ]);
    },
    [getTransformationNextId, onChange, transformations]
  );

  const onTransformationChange = useCallback(
    (idx: number, dataConfig: DataTransformerConfig) => {
      const next = Array.from(transformations);
      const eventName = 'transformations_redesign_panel_editor_tabs_transformations_management';

      reportInteraction(eventName, {
        action: 'change',
        transformationId: next[idx].transformation.id,
      });
      next[idx].transformation = dataConfig;
      onChange(next);
    },
    [onChange, transformations]
  );

  const onTransformationRemove = useCallback(
    (idx: number) => {
      const next = Array.from(transformations);
      const eventName = 'transformations_redesign_panel_editor_tabs_transformations_management';

      reportInteraction(eventName, {
        action: 'remove',
        transformationId: next[idx].transformation.id,
      });
      next.splice(idx, 1);
      onChange(next);
    },
    [onChange, transformations]
  );

  const onTransformationRemoveAll = useCallback(() => {
    onChange([]);
    setShowRemoveAllModal(false);
  }, [onChange]);

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result || !result.destination) {
        return;
      }

      const startIndex = result.source.index;
      const endIndex = result.destination.index;
      if (startIndex === endIndex) {
        return;
      }
      const update = Array.from(transformations);
      const [removed] = update.splice(startIndex, 1);
      update.splice(endIndex, 0, removed);
      onChange(update);
    },
    [onChange, transformations]
  );

  const onSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);

  const onSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        if (search) {
          const lower = search.toLowerCase();
          const filtered = standardTransformersRegistry.list().filter((t) => {
            const txt = (t.name + t.description).toLowerCase();
            return txt.indexOf(lower) >= 0;
          });
          if (filtered.length > 0) {
            onTransformationAdd({ value: filtered[0].id });
          }
        }
      } else if (event.keyCode === 27) {
        // Escape key
        setSearch('');
        setShowPicker(false);
        event.stopPropagation(); // don't exit the editor
      }
    },
    [search, onTransformationAdd]
  );

  const renderEmptyMessage = () => {
    return (
      <EmptyTransformationsMessage
        onShowPicker={() => {
          setShowPicker(true);
        }}
        data={data.series}
      />
    );
  };

  const renderTransformationEditors = () => {
    return (
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="transformations-list" direction="vertical">
          {(provided) => {
            return (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                <TransformationOperationRows
                  configs={transformations}
                  data={data}
                  onRemove={onTransformationRemove}
                  onChange={onTransformationChange}
                />
                {provided.placeholder}
              </div>
            );
          }}
        </Droppable>
      </DragDropContext>
    );
  };

  const renderTransformsPicker = () => {
    const noTransforms = !transformations?.length;
    const hasTransforms = transformations.length > 0;
    let suffix: ReactNode = null;
    let xforms = standardTransformersRegistry.list().sort((a, b) => (a.name > b.name ? 1 : b.name > a.name ? -1 : 0));

    if (selectedFilter !== VIEW_ALL_VALUE) {
      xforms = xforms.filter(
        (t) => t.categories && selectedFilter && t.categories.has(selectedFilter as TransformerCategory)
      );
    }

    if (search) {
      const lower = search.toLowerCase();
      const filtered = xforms.filter((t) => {
        const txt = (t.name + t.description).toLowerCase();
        return txt.indexOf(lower) >= 0;
      });

      suffix = (
        <>
          {filtered.length} / {xforms.length} &nbsp;&nbsp;
          <IconButton
            name="times"
            onClick={() => {
              setSearch('');
            }}
            tooltip={t('dashboard.un-themed-transformations-editor.tooltip-clear-search', 'Clear search')}
          />
        </>
      );

      xforms = filtered;
    }

    if (!suffix && showPicker && !noTransforms) {
      suffix = (
        <IconButton
          name="times"
          onClick={() => {
            setShowPicker(false);
          }}
          tooltip={t('dashboard.un-themed-transformations-editor.tooltip-close-picker', 'Close picker')}
        />
      );
    }

    const picker = (
      <TransformationPickerNg
        noTransforms={noTransforms}
        search={search}
        suffix={suffix}
        xforms={xforms}
        onClose={() => setShowPicker(false)}
        onSelectedFilterChange={(filter) => setSelectedFilter(filter)}
        onShowIllustrationsChange={(value) => setShowIllustrations(value)}
        onSearchChange={onSearchChange}
        onSearchKeyDown={onSearchKeyDown}
        onTransformationAdd={onTransformationAdd}
        data={data.series}
        selectedFilter={selectedFilter}
        showIllustrations={showIllustrations}
      />
    );

    const deleteAll = (
      <>
        <Button
          icon="times"
          variant="secondary"
          onClick={() => setShowRemoveAllModal(true)}
          className={styles.deleteAllButton}
        >
          <Trans i18nKey="dashboard.un-themed-transformations-editor.delete-all-transformations">
            Delete all transformations
          </Trans>
        </Button>
        <ConfirmModal
          isOpen={Boolean(showRemoveAllModal)}
          title={t(
            'dashboard.un-themed-transformations-editor.title-delete-all-transformations',
            'Delete all transformations?'
          )}
          body={t(
            'dashboard.un-theme-transformations-editor.body-delete-all-transformations',
            'By deleting all transformations, you will go back to the main selection screen.'
          )}
          confirmText={t('dashboard.un-themed-transformations-editor.confirmText-delete-all', 'Delete all')}
          onConfirm={() => onTransformationRemoveAll()}
          onDismiss={() => setShowRemoveAllModal(false)}
        />
      </>
    );

    const actions = (
      <ButtonGroup>
        <Button
          icon="plus"
          variant="secondary"
          onClick={() => {
            setShowPicker(true);
          }}
          data-testid={selectors.components.Transforms.addTransformationButton}
        >
          <Trans i18nKey="dashboard.un-themed-transformations-editor.actions.add-another-transformation">
            Add another transformation
          </Trans>
        </Button>
        {deleteAll}
      </ButtonGroup>
    );

    return (
      <>
        {showPicker && picker}
        {hasTransforms && actions}
      </>
    );
  };

  const { alert } = panel;
  const hasTransforms = transformations.length > 0;

  // If there are any alerts then
  // we can't use transformations
  if (alert) {
    const message = hasTransforms
      ? "Transformations can't be used on a panel with alerts"
      : "Transformations can't be used on a panel with existing alerts";
    return <PanelNotSupported message={message} />;
  }

  return (
    <ScrollContainer ref={scrollRef} minHeight="100%">
      <Container padding="lg">
        <div data-testid={selectors.components.TransformTab.content}>
          {!hasTransforms && renderEmptyMessage()}
          {hasTransforms && renderTransformationEditors()}
          {renderTransformsPicker()}
        </div>
      </Container>
    </ScrollContainer>
  );
});

TransformationsEditor.displayName = 'TransformationsEditor';

const getStyles = (theme: GrafanaTheme2) => ({
  deleteAllButton: css({
    marginLeft: theme.spacing(2),
  }),
});
