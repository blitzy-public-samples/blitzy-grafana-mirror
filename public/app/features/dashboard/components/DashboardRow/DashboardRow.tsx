import { css, cx } from '@emotion/css';
import { indexOf } from 'lodash';
import { useEffect, useReducer } from 'react';
import { type Unsubscribable } from 'rxjs';

import { type GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { getTemplateSrv, RefreshEvent } from '@grafana/runtime';
import { Icon, TextLink, useStyles2 } from '@grafana/ui';
import { appEvents } from 'app/core/app_events';
import { DashboardInteractions } from 'app/features/dashboard-scene/utils/interactions';
import { SHARED_DASHBOARD_QUERY } from 'app/plugins/datasource/dashboard/constants';
import grabDarkSvg from 'img/grab_dark.svg';
import grabLightSvg from 'img/grab_light.svg';

import { ShowConfirmModalEvent } from '../../../../types/events';
import { type DashboardModel } from '../../state/DashboardModel';
import { type PanelModel } from '../../state/PanelModel';
import { RowOptionsButton } from '../RowOptions/RowOptionsButton';

export interface DashboardRowProps {
  panel: PanelModel;
  dashboard: DashboardModel;
}

export function getDashboardRowWarning(panel: PanelModel, dashboard: DashboardModel) {
  const panels = !!panel.panels?.length
    ? panel.panels
    : dashboard.getRowPanels(indexOf(dashboard.panels, panel));
  const isAnyPanelUsingDashboardDS = panels.some((p) => p.datasource?.uid === SHARED_DASHBOARD_QUERY);
  if (isAnyPanelUsingDashboardDS) {
    return (
      <div>
        <p>
          <Trans i18nKey="dashboard.untheme-dashboard-row.dashboard-datasource">
            Panels in this row use the {{ SHARED_DASHBOARD_QUERY }} data source. These panels will reference the panel
            in the original row, not the ones in the repeated rows.
          </Trans>
        </p>
        <TextLink
          external
          href={
            'https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/create-dashboard/#configure-repeating-rows'
          }
        >
          <Trans i18nKey="dashboard.unthemed-dashboard-row.learn-more">Learn more</Trans>
        </TextLink>
      </div>
    );
  }

  return undefined;
}

export function DashboardRow({ panel, dashboard }: DashboardRowProps) {
  const styles = useStyles2(getStyles);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const sub: Unsubscribable = dashboard.events.subscribe(RefreshEvent, () => forceUpdate());
    return () => {
      sub.unsubscribe();
    };
  }, [dashboard.events]);

  const onToggle = () => {
    dashboard.toggleRow(panel);
  };

  const onUpdate = (title: string, repeat?: string | null) => {
    panel.setProperty('title', title);
    panel.setProperty('repeat', repeat ?? undefined);
    panel.render();
    dashboard.processRepeats();
    forceUpdate();
  };

  const onDelete = () => {
    appEvents.publish(
      new ShowConfirmModalEvent({
        title: t('dashboard.unthemed-dashboard-row.title.delete-row', 'Delete row'),
        text: 'Are you sure you want to remove this row and all its panels?',
        altActionText: 'Delete row only',
        onConfirm: () => {
          dashboard.removeRow(panel, true);
        },
        onAltAction: () => {
          dashboard.removeRow(panel, false);
        },
      })
    );
  };

  const title = getTemplateSrv().replace(panel.title, panel.scopedVars, 'text');
  const count = panel.panels ? panel.panels.length : 0;
  const panels = count === 1 ? 'panel' : 'panels';
  const canEdit = dashboard.meta.canEdit === true;
  const collapsed = panel.collapsed;

  return (
    <div
      className={cx(styles.dashboardRow, {
        [styles.dashboardRowCollapsed]: collapsed,
      })}
      data-testid="dashboard-row-container"
    >
      {/* Design system gap: this row-toggle button uses h5 typography (theme.typography.h5.fontSize, see styles.title) which is not exposed by @grafana/ui's Button size variants (only 'sm' | 'md' | 'lg'). The button is also a complex composition (Icon + dynamic title text + conditional count span) that does not map cleanly onto Button's icon/children/text prop model. Kept as raw <button> per refactor protocol (AAP §0.9.2.6, §0.4.4). */}
      <button
        aria-expanded={!collapsed}
        className={cx(styles.title, styles.pointer)}
        type="button"
        data-testid={selectors.components.DashboardRow.title(title)}
        onClick={onToggle}
      >
        <Icon name={collapsed ? 'angle-right' : 'angle-down'} />
        {title}
        <span
          className={cx(styles.count, {
            [styles.countCollapsed]: collapsed,
          })}
        >
          ({count} {panels})
        </span>
      </button>
      {canEdit && (
        <div className={styles.actions}>
          <RowOptionsButton
            title={panel.title}
            repeat={panel.repeat}
            onUpdate={onUpdate}
            warning={getDashboardRowWarning(panel, dashboard)}
          />
          {/* Design system gap: this delete button is styled by the parent .actions `button:` nested selector (see styles.actions on line 173-190) which applies coordinated transparent background, no border, and paddingLeft to all child buttons uniformly with its sibling RowOptionsButton. Replacing with @grafana/ui IconButton would cause double-styling conflicts with the parent's button: selector. Kept as raw <button> per refactor protocol (AAP §0.9.2.6, §0.4.4). */}
          <button
            type="button"
            className={styles.pointer}
            onClick={() => {
              DashboardInteractions.trackDeleteDashboardElement('row');
              onDelete();
            }}
            aria-label={t('dashboard.unthemed-dashboard-row.aria-label-delete-row', 'Delete row')}
          >
            <Icon name="trash-alt" />
          </button>
        </div>
      )}
      {collapsed === true && (
        /* disabling the a11y rules here as the button handles keyboard interactions */
        /* this is just to provide a better experience for mouse users */
        /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */
        <div
          className={cx({
            [styles.toggleTargetCollapsed]: collapsed,
          })}
          onClick={onToggle}
        >
          &nbsp;
        </div>
      )}
      {canEdit && (
        // The literal 'grid-drag-handle' className is preserved verbatim because react-grid-layout uses this exact selector internally to identify draggable row handles in the dashboard grid (see DashboardGrid's draggableHandle: '.grid-drag-handle' prop). Renaming or removing this class would break drag-to-reorder behavior. Preservation is required by AAP §0.9.2.12 minimal-change mandate.
        <div
          data-testid="dashboard-row-drag"
          className={cx(styles.dragHandle, 'grid-drag-handle', {
            [styles.dragHandleCollapsed]: collapsed,
          })}
        />
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  const dragHandle = theme.name === 'dark' ? grabDarkSvg : grabLightSvg;
  const actions = css({
    color: theme.colors.text.secondary,
    opacity: 0,
    [theme.transitions.handleMotion('no-preference', 'reduce')]: {
      transition: '200ms opacity ease-in 200ms',
    },

    button: {
      color: theme.colors.text.secondary,
      paddingLeft: theme.spacing(2),
      background: 'transparent',
      border: 'none',

      '&:hover': {
        color: theme.colors.text.maxContrast,
      },
    },
  });

  return {
    dashboardRow: css({
      display: 'flex',
      alignItems: 'center',
      height: '100%',

      '&:hover, &:focus-within': {
        [`.${actions}`]: {
          opacity: 1,
        },
      },
    }),
    dashboardRowCollapsed: css({
      background: theme.components.panel.background,
    }),
    toggleTargetCollapsed: css({
      flex: 1,
      cursor: 'pointer',
      marginRight: '15px',
    }),
    title: css({
      flexGrow: 0,
      fontSize: theme.typography.h5.fontSize,
      fontWeight: theme.typography.fontWeightMedium,
      color: theme.colors.text.primary,
      background: 'transparent',
      border: 'none',

      '.fa': {
        color: theme.colors.text.secondary,
        fontSize: theme.typography.size.xs,
        padding: theme.spacing(0, 1),
      },
    }),
    actions,
    count: css({
      paddingLeft: theme.spacing(2),
      color: theme.colors.text.secondary,
      fontStyle: 'italic',
      fontSize: theme.typography.size.sm,
      fontWeight: 'normal',
      display: 'none',
    }),
    countCollapsed: css({
      display: 'inline-block',
    }),
    pointer: css({
      cursor: 'pointer',
    }),
    dragHandle: css({
      cursor: 'move',
      width: '16px',
      height: '100%',
      background: `url("${dragHandle}") no-repeat 50% 50%`,
      backgroundSize: '8px',
      visibility: 'hidden',
      position: 'absolute',
      top: 0,
      right: 0,
    }),
    dragHandleCollapsed: css({
      visibility: 'visible',
      opacity: 1,
    }),
  };
};
