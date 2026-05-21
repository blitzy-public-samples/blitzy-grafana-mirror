import { css } from '@emotion/css';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { type DashboardLink } from '@grafana/schema';
import { Button, DeleteButton, EmptyState, Icon, IconButton, Stack, TagList, TextLink, useStyles2 } from '@grafana/ui';

interface DashboardLinkListProps {
  links: DashboardLink[];
  onNew: () => void;
  onEdit: (idx: number) => void;
  onDuplicate: (link: DashboardLink) => void;
  onDelete: (idx: number) => void;
  onOrderChange: (idx: number, direction: number) => void;
}

export function DashboardLinkList({
  links,
  onNew,
  onOrderChange,
  onEdit,
  onDuplicate,
  onDelete,
}: DashboardLinkListProps) {
  const styles = useStyles2(getStyles);
  const isEmptyList = links.length === 0;

  if (isEmptyList) {
    return (
      <Stack direction="column">
        <EmptyState
          variant="call-to-action"
          button={
            <Button onClick={onNew} size="lg">
              <Trans i18nKey="dashboard-links.empty-state.button-title">Add dashboard link</Trans>
            </Button>
          }
          message={t('dashboard-links.empty-state.title', 'There are no dashboard links added yet')}
        >
          <Trans i18nKey="dashboard-links.empty-state.info-box-content">
            Dashboard links allow you to place links to other dashboards and web sites directly below the dashboard
            header.{' '}
            <TextLink
              external
              href="https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/manage-dashboard-links/"
            >
              Learn more
            </TextLink>
          </Trans>
        </EmptyState>
      </Stack>
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, idx: number) {
    if (e.target === e.currentTarget && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      onEdit(idx);
    }
  }

  return (
    <>
      {/* Design system gap: InteractiveTable does not support row-level keyboard activation
       * (tabIndex={0} + onKeyDown for Space/Enter to invoke onEdit), focus management on
       * <tr> elements, or the ARIA grid pattern used here (role="grid"/role="gridcell").
       * Kept as raw <table> per AAP §0.4.4 Gaps Inventory. The legacy
       * 'filter-table' / 'filter-table--hover' Sass classes have been replaced with a
       * local theme-aware Emotion style block (see getStyles.table) which reproduces
       * the same zebra striping, hover, padding and lineHeight using theme tokens per
       * AAP §0.4.3.
       */}
      <table role="grid" className={styles.table}>
        <thead>
          <tr>
            <th>
              <Trans i18nKey="dashboard-scene.dashboard-link-list.type">Type</Trans>
            </th>
            <th>
              <Trans i18nKey="dashboard-scene.dashboard-link-list.info">Info</Trans>
            </th>
            <th colSpan={3} />
          </tr>
        </thead>
        <tbody>
          {links.map((link, idx) => (
            <tr key={`${link.title}-${idx}`} onKeyDown={(e) => handleKeyDown(e, idx)} tabIndex={0}>
              <td role="gridcell" className={styles.pointer} onClick={() => onEdit(idx)}>
                <Icon name="external-link-alt" /> &nbsp; {link.type}
              </td>
              <td role="gridcell" className={styles.pointer} onClick={() => onEdit(idx)}>
                <Stack>
                  {link.title && <span className={styles.titleWrapper}>{link.title}</span>}
                  {link.type === 'link' && <span className={styles.urlWrapper}>{link.url}</span>}
                  {link.type === 'dashboards' && <TagList tags={link.tags ?? []} />}
                </Stack>
              </td>
              <td className={styles.actionCell} role="gridcell">
                {idx !== 0 && (
                  <IconButton
                    name="arrow-up"
                    onClick={() => onOrderChange(idx, -1)}
                    tooltip={t('dashboard-scene.dashboard-link-list.tooltip-move-link-up', 'Move link up')}
                  />
                )}
              </td>
              <td className={styles.actionCell} role="gridcell">
                {links.length > 1 && idx !== links.length - 1 ? (
                  <IconButton
                    name="arrow-down"
                    onClick={() => onOrderChange(idx, 1)}
                    tooltip={t('dashboard-scene.dashboard-link-list.tooltip-move-link-down', 'Move link down')}
                  />
                ) : null}
              </td>
              <td className={styles.actionCell} role="gridcell">
                <IconButton
                  name="copy"
                  onClick={() => onDuplicate(link)}
                  tooltip={t('dashboard-scene.dashboard-link-list.tooltip-copy-link', 'Copy link')}
                />
              </td>
              <td className={styles.actionCell} role="gridcell">
                <DeleteButton
                  aria-label={t(
                    'dashboard-scene.dashboard-link-list.delete-aria-label',
                    'Delete link with title "{{title}}"',
                    { title: link.title }
                  )}
                  size="sm"
                  onConfirm={() => onDelete(idx)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button className={styles.newLinkButton} icon="plus" onClick={onNew}>
        <Trans i18nKey="dashboard-scene.dashboard-link-list.new-link">New link</Trans>
      </Button>
    </>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  titleWrapper: css({
    width: '20vw',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  }),
  urlWrapper: css({
    width: '40vw',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  }),
  newLinkButton: css({
    marginTop: theme.spacing(3),
  }),
  pointer: css({
    cursor: 'pointer',
  }),
  actionCell: css({
    width: '1%',
  }),
  // Theme-aware replacement of the legacy 'filter-table' / 'filter-table--hover' Sass
  // classes (see packages/grafana-ui/src/themes/GlobalStyles/filterTable.ts). Reproduces
  // the same width, border-collapse, zebra striping, hover treatment, padding,
  // lineHeight and whiteSpace using GrafanaTheme2 tokens per AAP §0.4.3.
  table: css({
    width: '100%',
    borderCollapse: 'separate',
    '& *': {
      boxSizing: 'border-box',
    },
    'tbody tr:nth-of-type(odd)': {
      background: theme.colors.emphasize(theme.colors.background.primary, 0.02),
    },
    'tbody tr:hover': {
      background: theme.colors.emphasize(theme.colors.background.primary, 0.05),
    },
    th: {
      width: 'auto',
      padding: theme.spacing(0.5, 1),
      textAlign: 'left',
      lineHeight: '30px',
      height: '30px',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: theme.spacing(0.5, 1),
      lineHeight: '30px',
      height: '30px',
      whiteSpace: 'nowrap',
    },
  }),
});
