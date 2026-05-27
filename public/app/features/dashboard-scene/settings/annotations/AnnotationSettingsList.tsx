import { css } from '@emotion/css';
import { useEffect, useMemo, useRef } from 'react';

import { type AnnotationQuery, type GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { getDataSourceSrv } from '@grafana/runtime';
import {
  Button,
  type Column,
  DeleteButton,
  EmptyState,
  IconButton,
  InteractiveTable,
  Stack,
  Text,
  TextLink,
  useStyles2,
} from '@grafana/ui';
import { ListNewButton } from 'app/features/dashboard/components/DashboardSettings/ListNewButton';

import { MoveDirection } from '../AnnotationsEditView';

type Props = {
  annotations: AnnotationQuery[];
  onNew: () => void;
  onEdit: (idx: number) => void;
  onMove: (idx: number, dir: MoveDirection) => void;
  onDelete: (idx: number) => void;
};

export const BUTTON_TITLE = 'Add annotation query';

// Top-level helper kept outside the component to avoid stale closures and to
// keep the cell renderers inside the memoized `columns` array referentially stable.
// Note: <Text> does not support `element="em"` (only h1-h6, span, p, li), so we
// preserve the original semantic of `<em className="muted">` (italic + muted color)
// via the design-system equivalent `<Text italic color="secondary">`.
const getAnnotationName = (anno: AnnotationQuery) => {
  if (anno.enable === false) {
    return (
      <Text italic color="secondary">
        <Trans i18nKey="dashboard-scene.annotation-settings-list.disabled" values={{ annoName: anno.name }}>
          (Disabled) {'{{annoName}}'}
        </Trans>
      </Text>
    );
  }

  if (anno.builtIn) {
    return (
      <Text italic color="secondary">
        <Trans i18nKey="dashboard-scene.annotation-settings-list.built-in" values={{ annoName: anno.name }}>
          {'{{annoName}}'} (Built-in)
        </Trans>
      </Text>
    );
  }

  return <>{anno.name}</>;
};

// Preserves the previous key strategy `${annotation.name}-${idx}` from the
// `annotations.map((annotation, idx) => <tr key={...}>)` pattern used by the
// raw <table> rendering. Declared outside the component so it has a stable
// identity across renders (InteractiveTable does not require getRowId to be
// memoized; only `columns` and `data` per its JSDoc).
const getRowId = (row: AnnotationQuery, idx: number) => `${row.name}-${idx}`;

export const AnnotationSettingsList = ({ annotations, onNew, onEdit, onMove, onDelete }: Props) => {
  const styles = useStyles2(getStyles);
  const dataSourceSrv = getDataSourceSrv();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const showEmptyListCTA = annotations.length === 0 || (annotations.length === 1 && annotations[0].builtIn);

  // Re-attach the legacy data-testid to InteractiveTable's <tbody> so existing
  // tests querying the list via getByTestId(selectors.pages.Dashboard.Settings.Annotations.List.annotations)
  // continue to find the tbody (whose children are the rendered row <tr>s).
  // InteractiveTable does not expose a prop for setting `data-testid` on its
  // internal tbody, so we re-attach it after each commit via the wrapper ref.
  useEffect(() => {
    const tbody = tableContainerRef.current?.querySelector('tbody');
    tbody?.setAttribute('data-testid', selectors.pages.Dashboard.Settings.Annotations.List.annotations);
  });

  const columns = useMemo<Array<Column<AnnotationQuery>>>(
    () => [
      {
        id: 'name',
        header: t('dashboard-scene.annotation-settings-list.query-name', 'Query name'),
        cell: ({ row: { original, index } }) => (
          // Clickable gridcell wrapper preserves the original `<td role="gridcell" onClick>`
          // semantics so that `getAllByRole('gridcell')` and `user.click(gridCells[0])`
          // continue to behave identically. tabIndex + onKeyDown improve keyboard a11y
          // beyond the original (which relied on the inner Button to bubble Enter clicks).
          <div
            role="gridcell"
            tabIndex={0}
            className={styles.pointer}
            onClick={() => onEdit(index)}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onEdit(index);
              }
            }}
          >
            <Button size="sm" fill="text" variant="secondary">
              {getAnnotationName(original)}
            </Button>
          </div>
        ),
      },
      {
        id: 'datasource',
        header: t('dashboard-scene.annotation-settings-list.data-source', 'Data source'),
        cell: ({ row: { original, index } }) => (
          <div
            role="gridcell"
            tabIndex={0}
            className={styles.pointer}
            onClick={() => onEdit(index)}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onEdit(index);
              }
            }}
          >
            {dataSourceSrv.getInstanceSettings(original.datasource)?.name || original.datasource?.uid}
          </div>
        ),
      },
      {
        id: 'moveUp',
        header: '',
        disableGrow: true,
        cell: ({ row: { index } }) => (
          <div role="gridcell">
            {index !== 0 && (
              <IconButton
                name="arrow-up"
                onClick={() => onMove(index, MoveDirection.UP)}
                tooltip={t('dashboard-scene.annotation-settings-list.tooltip-move-up', 'Move up')}
              />
            )}
          </div>
        ),
      },
      {
        id: 'moveDown',
        header: '',
        disableGrow: true,
        cell: ({ row: { index } }) => (
          <div role="gridcell">
            {annotations.length > 1 && index !== annotations.length - 1 ? (
              <IconButton
                name="arrow-down"
                onClick={() => onMove(index, MoveDirection.DOWN)}
                tooltip={t('dashboard-scene.annotation-settings-list.tooltip-move-down', 'Move down')}
              />
            ) : null}
          </div>
        ),
      },
      {
        id: 'delete',
        header: '',
        disableGrow: true,
        cell: ({ row: { original, index } }) => (
          <div role="gridcell">
            {!original.builtIn && (
              <DeleteButton
                size="sm"
                onConfirm={() => onDelete(index)}
                aria-label={t(
                  'dashboard-scene.annotation-settings-list.delete-aria-label',
                  'Delete query with title "{{title}}"',
                  { title: original.name }
                )}
              />
            )}
          </div>
        ),
      },
    ],
    [annotations, dataSourceSrv, onDelete, onEdit, onMove, styles.pointer]
  );

  return (
    <Stack direction="column">
      {annotations.length > 0 && (
        <div ref={tableContainerRef}>
          <InteractiveTable columns={columns} data={annotations} getRowId={getRowId} />
        </div>
      )}
      {showEmptyListCTA && (
        <Stack direction="column">
          <EmptyState
            variant="call-to-action"
            button={
              <Button
                data-testid={selectors.components.CallToActionCard.buttonV2('Add annotation query')}
                icon="comment-alt"
                onClick={onNew}
                size="lg"
              >
                <Trans i18nKey="annotations.empty-state.button-title">Add annotation query</Trans>
              </Button>
            }
            message={t('annotations.empty-state.title', 'There are no custom annotation queries added yet')}
          >
            <Trans i18nKey="annotations.empty-state.info-box-content">
              <p>
                Annotations provide a way to integrate event data into your graphs. They are visualized as vertical
                lines and icons on all graph panels. When you hover over an annotation icon you can get event text &amp;
                tags for the event. You can add annotation events directly from grafana by holding CTRL or CMD + click
                on graph (or drag region). These will be stored in Grafana&apos;s annotation database.
              </p>
            </Trans>
            <Trans i18nKey="annotations.empty-state.info-box-content-2">
              Checkout the{' '}
              <TextLink external href="http://docs.grafana.org/reference/annotations/">
                Annotations documentation
              </TextLink>{' '}
              for more information.
            </Trans>
          </EmptyState>
        </Stack>
      )}
      {!showEmptyListCTA && (
        <ListNewButton
          data-testid={selectors.pages.Dashboard.Settings.Annotations.List.addAnnotationCTAV2}
          onClick={onNew}
        >
          <Trans i18nKey="dashboard-scene.annotation-settings-list.new-query">New query</Trans>
        </ListNewButton>
      )}
    </Stack>
  );
};

// Theme-aware Emotion replacement for the legacy `className="pointer"` string
// (previously sourced from `public/sass/_grafana.scss`). The `theme` parameter
// is retained for the canonical `useStyles2(getStyles)` signature even though
// the single style does not currently consume theme tokens.
const getStyles = (theme: GrafanaTheme2) => ({
  pointer: css({
    cursor: 'pointer',
  }),
});
