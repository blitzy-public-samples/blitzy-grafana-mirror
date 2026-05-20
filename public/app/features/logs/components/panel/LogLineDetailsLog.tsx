import { css } from '@emotion/css';
import { memo, useMemo } from 'react';

import { useStyles2 } from '@grafana/ui';

import { LogMessageAnsi } from '../LogMessageAnsi';

import { HighlightedLogRenderer } from './HighlightedLogRenderer';
import { getStyles } from './LogLine';
import { useLogListContext } from './LogListContext';
import { type LogListModel } from './processing';

interface Props {
  log: LogListModel;
  syntaxHighlighting: boolean;
}

export const LogLineDetailsLog = memo(({ log: originalLog, syntaxHighlighting }: Props) => {
  const { fontSize } = useLogListContext();
  const logStyles = useStyles2(getStyles);
  const log = useMemo(() => {
    const log = originalLog.clone();
    return log;
  }, [originalLog]);

  return (
    <div className={styles.logLineWrapper}>
      <div className={`${logStyles.logLine} ${fontSize === 'small' ? logStyles.fontSizeSmall : ''} ${styles.noHover}`}>
        <div className={logStyles.wrappedLogLine}>
          {log.hasAnsi ? (
            // Semantic classnames retained: 'field', 'no-highlighting', 'log-syntax-highlight' are
            // consumed by (a) nested CSS selectors '& .field' in styled wrappers in sibling files
            // (LogLine.tsx, LogList.tsx) and (b) test queries via container.querySelectorAll('.field')
            // in LogLine.test.tsx and LogList.test.tsx. They are NOT pre-design-system styling
            // classes from public/sass/_grafana.scss. Kept as raw classnames per refactor protocol
            // (AAP §0.4.4, §0.9.2.6).
            <span className="field no-highlighting">
              <LogMessageAnsi value={log.body} />
            </span>
          ) : (
            <>
              {!syntaxHighlighting && <div className="field no-highlighting">{log.body}</div>}
              {syntaxHighlighting && (
                <div className="field log-syntax-highlight">
                  {<HighlightedLogRenderer tokens={log.highlightedBodyTokens} />}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

LogLineDetailsLog.displayName = 'LogLineDetailsLog';

const styles = {
  logLineWrapper: css({
    maxHeight: '50vh',
    overflow: 'auto',
  }),
  noHover: css({
    // Disable hover style
    pointerEvents: 'none',
  }),
};
