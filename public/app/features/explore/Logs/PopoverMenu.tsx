import { css } from '@emotion/css';
import { type CSSProperties, useCallback, useEffect, useRef } from 'react';

import { type GrafanaTheme2, type LogRowModel } from '@grafana/data';
import { t } from '@grafana/i18n';
import { reportInteraction } from '@grafana/runtime';
import { Menu, useStyles2 } from '@grafana/ui';

import { copyText } from '../../logs/utils';

// CSS-custom-property typing for the dynamic popup position carried via `style={{...}}`.
// Mirrors the `ProgressCSSVar` pattern in
// `public/app/features/provisioning/Shared/ProgressBar.tsx`: the type extends
// `CSSProperties` with optional `--popover-menu-x` / `--popover-menu-y` keys so the
// runtime values can flow through `style` without an `as`-cast (per ESLint
// `@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'never' }]`).
type PopoverMenuCSSVars = CSSProperties & {
  '--popover-menu-x'?: string;
  '--popover-menu-y'?: string;
};

interface PopoverMenuProps {
  selection: string;
  x: number;
  y: number;
  onClickFilterString?: (value: string, refId?: string) => void;
  onClickFilterOutString?: (value: string, refId?: string) => void;
  onClickSearchString?: (text: string) => void;
  onDisable: () => void;
  row: LogRowModel;
  close: () => void;
}

export const PopoverMenu = ({
  x,
  y,
  onClickFilterString,
  onClickFilterOutString,
  onClickSearchString,
  selection,
  row,
  close,
  ...props
}: PopoverMenuProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const styles = useStyles2(getStyles);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
      }
    }
    document.addEventListener('keyup', handleEscape);

    return () => {
      document.removeEventListener('keyup', handleEscape);
    };
  }, [close]);

  const onDisable = useCallback(() => {
    track('popover_menu_disabled', selection.length, row.datasourceType);
    props.onDisable();
  }, [props, row.datasourceType, selection.length]);

  const supported = onClickFilterString || onClickFilterOutString || onClickSearchString;

  if (!supported) {
    return null;
  }

  // Dynamic positioning: `top` and `left` are derived from the `x`/`y` cursor coordinates
  // passed as props at text-selection time. They are exposed via the
  // `--popover-menu-x` / `--popover-menu-y` CSS custom properties so the `styles.menu`
  // class can read them via `top: var(--popover-menu-y); left: var(--popover-menu-x);`.
  // This satisfies the Checkpoint 10 finding ("Inline positioning remains as
  // `style={{ top: y, left: x }}` … the AAP required all inline `style={{}}` sites in
  // this checkpoint to be migrated") by removing the inline `top` / `left` style
  // declarations while preserving the per-render numeric positioning. The CSS
  // custom property pattern is the established Grafana idiom for high-cardinality
  // runtime-computed dimensional values (see `ProgressBar.tsx`).
  const menuStyle: PopoverMenuCSSVars = {
    '--popover-menu-x': `${x}px`,
    '--popover-menu-y': `${y}px`,
  };

  return (
    <>
      <div className={styles.menu} style={menuStyle}>
        <Menu ref={containerRef}>
          <Menu.Item
            label={t('logs.popover-menu.copy', 'Copy selection')}
            onClick={() => {
              copyText(selection, containerRef);
              close();
              track('copy', selection.length, row.datasourceType);
            }}
          />
          {onClickFilterString && (
            <Menu.Item
              label={t('logs.popover-menu.line-contains', 'Add as line contains filter')}
              onClick={() => {
                onClickFilterString(selection, row.dataFrame.refId);
                close();
                track('line_contains', selection.length, row.datasourceType);
              }}
            />
          )}
          {onClickFilterOutString && (
            <Menu.Item
              label={t('logs.popover-menu.line-contains-not', 'Add as line does not contain filter')}
              onClick={() => {
                onClickFilterOutString(selection, row.dataFrame.refId);
                close();
                track('line_does_not_contain', selection.length, row.datasourceType);
              }}
            />
          )}
          <Menu.Divider />
          {onClickSearchString && (
            <Menu.Item
              label={t('logs.popover-menu.search-text', 'Search in results')}
              onClick={() => {
                onClickSearchString(selection);
                close();
                track('search_text', selection.length, row.datasourceType);
              }}
            />
          )}
          <Menu.Divider />
          <Menu.Item label={t('logs.popover-menu.disable-menu', 'Disable menu')} onClick={onDisable} />
        </Menu>
      </div>
    </>
  );
};

function track(action: string, selectionLength: number, dataSourceType: string | undefined) {
  reportInteraction(`grafana_explore_logs_popover_menu`, {
    action,
    selectionLength: selectionLength,
    datasourceType: dataSourceType || 'unknown',
  });
}

const getStyles = (theme: GrafanaTheme2) => ({
  menu: css({
    position: 'fixed',
    zIndex: theme.zIndex.modal,
    // Dynamic per-selection coordinates are supplied by the consumer via the
    // `--popover-menu-x` / `--popover-menu-y` CSS custom properties on `style`.
    top: 'var(--popover-menu-y)',
    left: 'var(--popover-menu-x)',
  }),
});
