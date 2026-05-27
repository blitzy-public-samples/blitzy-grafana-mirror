import { css, cx, keyframes } from '@emotion/css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';
import tinycolor from 'tinycolor2';

import { type LogRowModel, dateTimeFormat, type GrafanaTheme2, LogsSortOrder } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { type TimeZone } from '@grafana/schema';
import { Button, useTheme2 } from '@grafana/ui';

import { LogMessageAnsi } from '../../logs/components/LogMessageAnsi';
import { getLogRowStyles } from '../../logs/components/getLogRowStyles';
import { sortLogRows } from '../../logs/utils';
import { ElapsedTime } from '../ElapsedTime';
import { filterLogRowsByIndex } from '../state/utils';

const getStyles = (theme: GrafanaTheme2) => {
  const fade = keyframes({
    from: {
      backgroundColor: tinycolor(theme.colors.info.transparent).setAlpha(0.25).toString(),
    },
    to: {
      backgroundColor: 'transparent',
    },
  });

  return {
    logsRowsLive: css({
      label: 'logs-rows-live',
      fontFamily: theme.typography.fontFamilyMonospace,
      fontSize: theme.typography.bodySmall.fontSize,
      display: 'flex',
      flexFlow: 'column nowrap',
      height: '60vh',
      overflowY: 'scroll',
      ':first-child': {
        marginTop: 'auto !important',
      },
    }),
    logsRowFade: css({
      label: 'logs-row-fresh',
      color: theme.colors.text.primary,
      backgroundColor: tinycolor(theme.colors.info.transparent).setAlpha(0.25).toString(),
      [theme.transitions.handleMotion('no-preference', 'reduce')]: {
        animation: `${fade} 1s ease-out 1s 1 normal forwards`,
      },
    }),
    logsRowsIndicator: css({
      fontSize: theme.typography.h6.fontSize,
      paddingTop: theme.spacing(1),
      display: 'flex',
      alignItems: 'center',
    }),
    button: css({
      marginRight: theme.spacing(1),
    }),
    fullWidth: css({
      width: '100%',
    }),
  };
};

export interface Props {
  logRows?: LogRowModel[];
  timeZone: TimeZone;
  stopLive: () => void;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  clearedAtIndex: number | null;
  isPaused: boolean;
}

const LiveLogs = (props: Props) => {
  const { logRows, timeZone, stopLive, onPause, onResume, onClear, clearedAtIndex, isPaused } = props;
  const theme = useTheme2();
  const styles = getStyles(theme);
  const { logsRow, logsRowLocalTime, logsRowMessage } = getLogRowStyles(theme);

  // Ref to the tbody scroll container — used for scrollTo / scrollHeight measurements.
  // Replaces the original `private scrollContainerRef = React.createRef<HTMLTableSectionElement>();`.
  const scrollContainerRef = useRef<HTMLTableSectionElement>(null);

  // Internal state representing the buffered rows to render. Replaces the original
  // `this.state.logRowsToRender`. Initial value matches the class constructor: `props.logRows`.
  const [logRowsToRender, setLogRowsToRender] = useState<LogRowModel[] | undefined>(logRows);

  // Translate `static getDerivedStateFromProps(nextProps, state)` into a useEffect that mirrors
  // the original three-branch logic. Per AAP §0.8.2 Subtlety 7, when the derivation reads the
  // previous state (the `filterLogRowsByIndex(clearedAtIndex, state.logRowsToRender)` branch
  // operates on the *prior* derived value, not on props), the correct hook translation is a
  // useEffect that uses the functional updater form of setState to access the prev value safely.
  //
  // Branch parity with the original:
  //   1. isPaused && clearedAtIndex → setLogRowsToRender(prev => filterLogRowsByIndex(...))
  //   2. isPaused                   → no-op (preserves the existing buffered rows)
  //   3. !isPaused                  → setLogRowsToRender(logRows)
  useEffect(() => {
    if (isPaused && clearedAtIndex) {
      setLogRowsToRender((prev) => filterLogRowsByIndex(clearedAtIndex, prev));
      return;
    }

    if (isPaused) {
      // We keep any background subscriptions running and keep updating our state, but we do not
      // show the updates, this allows us start again showing correct result after resuming
      // without creating a gap in the log results.
      return;
    }

    // Not paused: sync the buffered rows to the latest logRows prop.
    setLogRowsToRender(logRows);
  }, [isPaused, clearedAtIndex, logRows]);

  /**
   * Handle pausing when user scrolls up so that we stop resetting his position to the bottom when new row arrives.
   * We do not need to throttle it here much, adding new rows should be throttled/buffered itself in the query epics
   * and after you pause we remove the handler and add it after you manually resume, so this should not be fired often.
   */
  const onScroll = useCallback(
    (event: React.SyntheticEvent) => {
      const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      if (distanceFromBottom >= 5 && !isPaused) {
        onPause();
      }
    },
    [isPaused, onPause]
  );

  // A perf optimisation here. Show just 100 rows when streaming and full length when the streaming is paused.
  // Memoized because the value is consumed twice in the JSX below (once for the rows map, once for
  // the "last line received" indicator length check). useMemo avoids the double computation.
  const rowsToRender = useMemo(() => {
    let rows = logRowsToRender ?? [];
    if (!isPaused) {
      rows = sortLogRows(rows, LogsSortOrder.Ascending).slice(-100);
    }
    return rows;
  }, [logRowsToRender, isPaused]);

  return (
    <div>
      {/*
        Design system gap: this <table> is a streaming-feed scroll container with custom
        auto-scroll-to-bottom behavior driven by a tbody ref (scrollContainerRef) and a sentinel-row
        ref-callback that fires on every new row mount. @grafana/ui's InteractiveTable / Table do
        not expose internal tbody refs, scroll-position APIs, or auto-scroll-to-bottom semantics.
        Replacing with InteractiveTable would break the live-tail UX and the existing tests
        (which query by getByRole('cell', ...) relying on native <td> ARIA roles). Per AAP §0.4.4
        Gaps Inventory and §0.9.2.6 Design System Replacement Rules, the raw <table> is preserved
        and flagged.
      */}
      <table className={styles.fullWidth}>
        <tbody onScroll={isPaused ? undefined : onScroll} className={styles.logsRowsLive} ref={scrollContainerRef}>
          {rowsToRender.map((row: LogRowModel) => {
            return (
              <tr className={cx(logsRow, styles.logsRowFade)} key={row.uid}>
                <td className={logsRowLocalTime}>{dateTimeFormat(row.timeEpochMs, { timeZone })}</td>
                <td className={logsRowMessage}>{row.hasAnsi ? <LogMessageAnsi value={row.raw} /> : row.entry}</td>
              </tr>
            );
          })}
          <tr
            ref={(element) => {
              // This is triggered on every update so on every new row. It keeps the view scrolled at the bottom by
              // default.
              // As scrollTo is not implemented in JSDOM it needs to be part of the condition
              if (element && scrollContainerRef.current?.scrollTo && !isPaused) {
                scrollContainerRef.current?.scrollTo(0, scrollContainerRef.current.scrollHeight);
              }
            }}
          />
        </tbody>
      </table>
      <div className={styles.logsRowsIndicator}>
        <Button
          icon={isPaused ? 'play' : 'pause'}
          variant="secondary"
          onClick={isPaused ? onResume : onPause}
          className={styles.button}
        >
          {isPaused ? t('explore.live-logs.resume', 'Resume') : t('explore.live-logs.pause', 'Pause')}
        </Button>
        <Button icon="trash-alt" variant="secondary" onClick={onClear} className={styles.button}>
          <Trans i18nKey="explore.live-logs.clear-logs">Clear logs</Trans>
        </Button>
        <Button icon="square-shape" variant="secondary" onClick={stopLive} className={styles.button}>
          <Trans i18nKey="explore.live-logs.exit-live-mode">Exit live mode</Trans>
        </Button>
        {isPaused ||
          (rowsToRender.length > 0 && (
            <span>
              <Trans
                i18nKey="explore.live-logs.last-line-received"
                components={{ elapsedTime: <ElapsedTime resetKey={logRows} humanize={true} /> }}
              >
                Last line received: {'<elapsedTime />'} ago
              </Trans>
            </span>
          ))}
      </div>
    </div>
  );
};

// Wrap the functional component in `React.memo` to preserve the original `PureComponent`
// shallow-equality semantics. The class form was `class LiveLogs extends PureComponent<Props>`,
// which short-circuited re-renders when all `Props` keys shallow-equaled the previous render's
// props. Live log tailing is a high-frequency render path (new rows arrive continuously), and
// dropping shallow-equality memoization without a replacement would cause avoidable re-renders
// of the entire log feed on every parent update — per Checkpoint 10 review finding ("Source
// class was a `PureComponent`, but the functional conversion is exported as a plain function
// without `React.memo` … Live log streaming can re-render frequently"). React.memo's default
// shallow-prop comparator matches `PureComponent`'s `shouldComponentUpdate` semantics exactly.
export const LiveLogsWithTheme = React.memo(LiveLogs);
