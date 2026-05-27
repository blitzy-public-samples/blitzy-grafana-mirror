import { css, cx } from '@emotion/css';
import { isEqual } from 'lodash';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import * as React from 'react';

import {
  CoreApp,
  type DataFrame,
  type Field,
  type GrafanaTheme2,
  type IconName,
  type LinkModel,
  type LogLabelStatsModel,
  type LogRowModel,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { reportInteraction } from '@grafana/runtime';
import {
  ClipboardButton,
  DataLinkButton,
  IconButton,
  type PopoverContent,
  Tooltip,
  useStyles2,
  useTheme2,
} from '@grafana/ui';

import { logRowToSingleRowDataFrame } from '../logsModel';
import { getLabelTypeFromRow } from '../utils';

import { LogLabelStats } from './LogLabelStats';
import { getLogRowStyles } from './getLogRowStyles';

interface LinkModelWithIcon extends LinkModel<Field> {
  icon?: IconName;
}

export interface Props {
  parsedValues: string[];
  parsedKeys: string[];
  disableActions: boolean;
  wrapLogMessage?: boolean;
  isLabel?: boolean;
  onClickFilterLabel?: (key: string, value: string, frame?: DataFrame) => void;
  onClickFilterOutLabel?: (key: string, value: string, frame?: DataFrame) => void;
  links?: LinkModelWithIcon[];
  getStats: () => LogLabelStatsModel[] | null;
  displayedFields?: string[];
  onClickShowField?: (key: string) => void;
  onClickHideField?: (key: string) => void;
  row: LogRowModel;
  app?: CoreApp;
  isFilterLabelActive?: (key: string, value: string, refId?: string) => Promise<boolean>;
  onPinLine?: (row: LogRowModel, allowUnPin?: boolean) => void;
  pinLineButtonTooltipTitle?: PopoverContent;
}

export const LogDetailsRow = memo((props: Props) => {
  const {
    parsedKeys,
    parsedValues,
    isLabel,
    links,
    displayedFields,
    wrapLogMessage,
    onClickFilterLabel,
    onClickFilterOutLabel,
    onClickShowField,
    onClickHideField,
    isFilterLabelActive: isFilterLabelActiveProp,
    disableActions,
    row,
    app,
    onPinLine,
    pinLineButtonTooltipTitle,
    getStats,
  } = props;

  // useTheme2() replaces the Themeable2 prop previously injected by withTheme2(UnThemedLogDetailsRow).
  const theme = useTheme2();
  // useStyles2(getStyles) replaces the previous memoizeOne-wrapped getStyles(theme) call site.
  const styles = useStyles2(getStyles);
  // Memoize getLogRowStyles(theme) to preserve referential stability across renders when theme is stable.
  const rowStyles = useMemo(() => getLogRowStyles(theme), [theme]);

  const [showFieldsStats, setShowFieldsStats] = useState(false);
  const [fieldCount, setFieldCount] = useState(0);
  const [fieldStats, setFieldStats] = useState<LogLabelStatsModel[] | null>(null);

  // Equivalent to the class's updateStats method. Preserves the isEqual-guarded
  // setState pattern so referential equality is maintained when stats are unchanged
  // (prevents needless re-renders of <LogLabelStats /> downstream).
  const updateStats = useCallback(() => {
    const newFieldStats = getStats();
    const newFieldCount = newFieldStats ? newFieldStats.reduce((sum, stat) => sum + stat.count, 0) : 0;
    setFieldStats((prev) => (!isEqual(prev, newFieldStats) ? newFieldStats : prev));
    setFieldCount((prev) => (newFieldCount !== prev ? newFieldCount : prev));
  }, [getStats]);

  // Equivalent to the class's componentDidUpdate(): when showFieldsStats is true, re-poll
  // the stats. Explicit dependency list ([showFieldsStats, updateStats]) satisfies the
  // react-hooks/exhaustive-deps rule while preserving the original behavior of
  // re-running updateStats on every relevant change.
  useEffect(() => {
    if (showFieldsStats) {
      updateStats();
    }
  }, [showFieldsStats, updateStats]);

  const showField = useCallback(() => {
    if (onClickShowField) {
      onClickShowField(parsedKeys[0]);
    }

    reportInteraction('grafana_explore_logs_log_details_replace_line_clicked', {
      datasourceType: row.datasourceType,
      logRowUid: row.uid,
      type: 'enable',
    });
  }, [onClickShowField, parsedKeys, row.datasourceType, row.uid]);

  const hideField = useCallback(() => {
    if (onClickHideField) {
      onClickHideField(parsedKeys[0]);
    }

    reportInteraction('grafana_explore_logs_log_details_replace_line_clicked', {
      datasourceType: row.datasourceType,
      logRowUid: row.uid,
      type: 'disable',
    });
  }, [onClickHideField, parsedKeys, row.datasourceType, row.uid]);

  const isFilterLabelActive = useCallback(async () => {
    if (isFilterLabelActiveProp) {
      return await isFilterLabelActiveProp(parsedKeys[0], parsedValues[0], row.dataFrame?.refId);
    }
    return false;
  }, [isFilterLabelActiveProp, parsedKeys, parsedValues, row.dataFrame?.refId]);

  const filterLabel = useCallback(() => {
    if (onClickFilterLabel) {
      onClickFilterLabel(parsedKeys[0], parsedValues[0], logRowToSingleRowDataFrame(row) || undefined);
    }

    reportInteraction('grafana_explore_logs_log_details_filter_clicked', {
      datasourceType: row.datasourceType,
      filterType: 'include',
      logRowUid: row.uid,
    });
  }, [onClickFilterLabel, parsedKeys, parsedValues, row]);

  const filterOutLabel = useCallback(() => {
    if (onClickFilterOutLabel) {
      onClickFilterOutLabel(parsedKeys[0], parsedValues[0], logRowToSingleRowDataFrame(row) || undefined);
    }

    reportInteraction('grafana_explore_logs_log_details_filter_clicked', {
      datasourceType: row.datasourceType,
      filterType: 'exclude',
      logRowUid: row.uid,
    });
  }, [onClickFilterOutLabel, parsedKeys, parsedValues, row]);

  const showStats = useCallback(() => {
    if (!showFieldsStats) {
      updateStats();
    }
    setShowFieldsStats((prev) => !prev);

    reportInteraction('grafana_explore_logs_log_details_stats_clicked', {
      dataSourceType: row.datasourceType,
      fieldType: isLabel ? 'label' : 'detectedField',
      type: showFieldsStats ? 'close' : 'open',
      logRowUid: row.uid,
      app,
    });
  }, [showFieldsStats, updateStats, isLabel, row.datasourceType, row.uid, app]);

  const generateClipboardButton = (val: string) => (
    <div className={`log-details-value-copy ${styles.copyButton}`}>
      <ClipboardButton
        getText={() => val}
        aria-label={t('logs.un-themed-log-details-row.title-copy-value-to-clipboard', 'Copy value to clipboard')}
        fill="text"
        variant="secondary"
        icon="copy"
        size="md"
      />
    </div>
  );

  const generateMultiVal = (value: string[], showCopy?: boolean) => (
    // Design system gap: This nested <table> displays multi-value parsed values inside a <td>
    // cell of the parent <tr>. InteractiveTable from @grafana/ui does not support nested
    // rendering inside table cells. Kept as raw HTML per refactor protocol (AAP §0.4.4, §0.9.2.6).
    <table>
      <tbody>
        {value?.map((val, i) => {
          return (
            <tr key={`${val}-${i}`}>
              <td>
                {val}
                {showCopy && val !== '' && generateClipboardButton(val)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const singleKey = parsedKeys == null ? false : parsedKeys.length === 1;
  const singleVal = parsedValues == null ? false : parsedValues.length === 1;
  const hasFilteringFunctionality = !disableActions && onClickFilterLabel && onClickFilterOutLabel;
  const refIdTooltip = app === CoreApp.Explore && row.dataFrame?.refId ? ` in query ${row.dataFrame?.refId}` : '';
  const labelType = singleKey ? getLabelTypeFromRow(parsedKeys[0], row) : null;

  const isMultiParsedValueWithNoContent =
    !singleVal && parsedValues != null && !parsedValues.every((val) => val === '');

  const toggleFieldButton =
    displayedFields && parsedKeys != null && displayedFields.includes(parsedKeys[0]) ? (
      <IconButton
        variant="primary"
        tooltip={t('logs.un-themed-log-details-row.toggle-field-button.tooltip-hide-this-field', 'Hide this field')}
        name="eye"
        onClick={hideField}
      />
    ) : (
      <IconButton
        tooltip={t(
          'logs.un-themed-log-details-row.toggle-field-button.tooltip-field-instead-message',
          'Show this field instead of the message'
        )}
        name="eye"
        onClick={showField}
      />
    );

  return (
    <>
      <tr className={rowStyles.logDetailsValue}>
        <td className={rowStyles.logsDetailsIcon}>
          <div className={styles.buttonRow}>
            {hasFilteringFunctionality && (
              <>
                <AsyncIconButton
                  name="search-plus"
                  onClick={filterLabel}
                  // We purposely want to pass a new function on every render to allow the active state to be updated when log details remains open between updates.
                  isActive={() => isFilterLabelActive()}
                  tooltipSuffix={refIdTooltip}
                />
                <IconButton
                  name="search-minus"
                  tooltip={
                    app === CoreApp.Explore && row.dataFrame?.refId
                      ? t('logs.un-themed-log-details-row.filter-out-query', 'Filter out value in query {{query}}', {
                          query: row.dataFrame?.refId,
                        })
                      : t('logs.un-themed-log-details-row.filter-out', 'Filter out value')
                  }
                  onClick={filterOutLabel}
                />
              </>
            )}
            {!disableActions && displayedFields && toggleFieldButton}
            {!disableActions && (
              <IconButton
                variant={showFieldsStats ? 'primary' : 'secondary'}
                name="signal"
                tooltip={t('logs.un-themed-log-details-row.tooltip-adhoc-statistics', 'Ad-hoc statistics')}
                className={styles.statsButton}
                disabled={!singleKey}
                onClick={showStats}
              />
            )}
          </div>
        </td>

        <td>{labelType && <LabelTypeBadge type={labelType} styles={styles} />}</td>
        {/* Key - value columns */}
        <td className={rowStyles.logDetailsLabel}>{singleKey ? parsedKeys[0] : generateMultiVal(parsedKeys)}</td>
        <td className={cx(styles.wordBreakAll, wrapLogMessage && styles.wrapLine)}>
          <div className={styles.logDetailsValue}>
            {singleVal ? parsedValues[0] : generateMultiVal(parsedValues, true)}
            {singleVal && generateClipboardButton(parsedValues[0])}
            <div className={cx((singleVal || isMultiParsedValueWithNoContent) && styles.adjoiningLinkButton)}>
              {links?.map((link, i) => {
                if (link.onClick && onPinLine) {
                  const originalOnClick = link.onClick;
                  link.onClick = (e, origin) => {
                    // Pin the line
                    onPinLine(row, false);

                    // Execute the link onClick function
                    originalOnClick(e, origin);
                  };
                }
                return (
                  <span key={`${link.title}-${i}`}>
                    <DataLinkButton
                      buttonProps={{
                        // Show tooltip message if max number of pinned lines has been reached
                        tooltip:
                          typeof pinLineButtonTooltipTitle === 'object' && link.onClick
                            ? pinLineButtonTooltipTitle
                            : undefined,
                        variant: 'secondary',
                        fill: 'outline',
                        ...(link.icon && { icon: link.icon }),
                      }}
                      link={link}
                    />
                  </span>
                );
              })}
            </div>
          </div>
        </td>
      </tr>
      {showFieldsStats && singleKey && singleVal && (
        <tr>
          <td colSpan={2}>
            <IconButton
              variant={showFieldsStats ? 'primary' : 'secondary'}
              name="signal"
              tooltip={t('logs.un-themed-log-details-row.tooltip-hide-adhoc-statistics', 'Hide ad-hoc statistics')}
              onClick={showStats}
            />
          </td>
          <td colSpan={2}>
            <div className={styles.logDetailsStats}>
              <LogLabelStats
                stats={fieldStats!}
                label={parsedKeys[0]}
                value={parsedValues[0]}
                rowCount={fieldCount}
                isLabel={isLabel}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

LogDetailsRow.displayName = 'LogDetailsRow';

function LabelTypeBadge({ type, styles }: { type: string; styles: ReturnType<typeof getStyles> }) {
  return (
    <Tooltip content={type}>
      <div className={styles.labelType}>
        <span>{type.substring(0, 1)}</span>
      </div>
    </Tooltip>
  );
}

interface AsyncIconButtonProps extends Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  name: IconName;
  isActive(): Promise<boolean>;
  tooltipSuffix: string;
}

const AsyncIconButton = ({ isActive, tooltipSuffix, ...rest }: AsyncIconButtonProps) => {
  const [active, setActive] = useState(false);
  const tooltip = active ? 'Remove filter' : 'Filter for value';

  useEffect(() => {
    isActive().then(setActive);
  }, [isActive]);

  return <IconButton {...rest} variant={active ? 'primary' : undefined} tooltip={tooltip + tooltipSuffix} />;
};

// Moved to file tail per Grafana's canonical Emotion pattern (AAP §0.5.3).
// memoizeOne wrapper removed — useStyles2(getStyles) already memoizes the result.
const getStyles = (theme: GrafanaTheme2) => ({
  labelType: css({
    border: `solid 1px ${theme.colors.text.secondary}`,
    color: theme.colors.text.secondary,
    borderRadius: theme.shape.radius.circle,
    fontSize: theme.spacing(1),
    lineHeight: theme.spacing(1.25),
    height: theme.spacing(1.5),
    width: theme.spacing(1.5),
    display: 'flex',
    justifyContent: 'center',
    verticalAlign: 'middle',
    marginLeft: theme.spacing(1),
  }),
  wordBreakAll: css({
    label: 'wordBreakAll',
    wordBreak: 'break-all',
  }),
  copyButton: css({
    '& > button': {
      gap: 0,
      color: theme.colors.text.secondary,
      padding: 0,
      justifyContent: 'center',
      borderRadius: theme.shape.radius.circle,
      height: theme.spacing(theme.components.height.sm),
      width: theme.spacing(theme.components.height.sm),
      svg: {
        margin: 0,
      },

      'span > div': {
        top: '-5px',
        '& button': {
          color: theme.colors.success.main,
        },
      },
    },
  }),
  adjoiningLinkButton: css({
    marginLeft: theme.spacing(1),
  }),
  wrapLine: css({
    label: 'wrapLine',
    whiteSpace: 'pre-wrap',
  }),
  logDetailsStats: css({
    padding: `0 ${theme.spacing(1)}`,
  }),
  logDetailsValue: css({
    display: 'flex',
    alignItems: 'center',
    lineHeight: '22px',

    '.log-details-value-copy': {
      visibility: 'hidden',
    },
    '&:hover': {
      '.log-details-value-copy': {
        visibility: 'visible',
      },
    },
  }),
  buttonRow: css({
    display: 'flex',
    flexDirection: 'row',
    gap: theme.spacing(0.5),
    marginLeft: theme.spacing(0.5),
  }),
  // Legacy className="stats-button" migration (AAP Cohort 6). Verified via grep that .stats-button
  // is not defined in public/sass/**, not referenced by test/e2e selectors, and only used at this
  // single call site. A label-only Emotion declaration preserves a stable, identifiable class name
  // for future test/selector use while satisfying the legacy-className → useStyles2 migration.
  statsButton: css({
    label: 'statsButton',
  }),
});
