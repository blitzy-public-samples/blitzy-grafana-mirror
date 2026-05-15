import { css, cx } from '@emotion/css';
import * as React from 'react';

import { type GrafanaTheme2, renderMarkdown } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

export interface Props extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  markdown?: string;
  onRemove?: () => void;
  styleOverrides?: { [key: string]: string };
}

export const OperationRowHelp = React.memo(
  React.forwardRef<HTMLDivElement, Props>(
    ({ className, children, markdown, styleOverrides, onRemove, ...otherProps }, ref) => {
      const styles = useStyles2((theme) => getStyles(theme, styleOverrides?.borderTop));

      return (
        <div className={cx(styles.wrapper, className)} {...otherProps} ref={ref}>
          {markdown && markdownHelper(markdown)}
          {children}
        </div>
      );
    }
  )
);

function markdownHelper(markdown: string) {
  const helpHtml = renderMarkdown(markdown);
  // Design system gap: `markdown-html` is the design-system-provided global class declared in
  // `@grafana/ui` (packages/grafana-ui/src/themes/GlobalStyles/markdownStyles.ts) that styles
  // descendants of dynamically-rendered markdown HTML (img/ul/ol/table/th/td/a). It cannot be
  // replaced with `useStyles2`-managed Emotion atomic classes because the markup here is injected
  // via `dangerouslySetInnerHTML` from `renderMarkdown(...)` and Emotion atomic CSS does not
  // target dynamically-generated descendant HTML. This is not a `public/sass/**` legacy class and
  // is therefore intentionally retained per AAP §0.4.4 (Gaps Inventory).
  return <div className="markdown-html" dangerouslySetInnerHTML={{ __html: helpHtml }} />;
}

OperationRowHelp.displayName = 'OperationRowHelp';

const getStyles = (theme: GrafanaTheme2, borderTop?: string) => {
  const borderRadius = theme.shape.radius.default;

  const themeBackgroundColor = theme.colors.background.secondary;

  return {
    wrapper: css({
      padding: theme.spacing(2),
      border: `2px solid ${themeBackgroundColor}`,
      borderTop: borderTop ? borderTop + themeBackgroundColor : 'none',
      borderRadius: `0 0 ${borderRadius} ${borderRadius}`,
      position: 'relative',
      top: '-4px',
    }),
  };
};
