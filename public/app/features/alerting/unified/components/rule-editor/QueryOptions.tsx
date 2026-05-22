import { css } from '@emotion/css';
import { useState } from 'react';

import { type GrafanaTheme2, type RelativeTimeRange, getDefaultRelativeTimeRange } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Button, Icon, InlineField, RelativeTimeRangePicker, Toggletip, useStyles2 } from '@grafana/ui';
import { type AlertQuery } from 'app/types/unified-alerting-dto';

import { TimeRangeLabel } from '../TimeRangeLabel';

import { type AlertQueryOptions, MaxDataPointsOption, MinIntervalOption } from './QueryWrapper';

export interface QueryOptionsProps {
  query: AlertQuery;
  queryOptions: AlertQueryOptions;
  onChangeTimeRange?: (timeRange: RelativeTimeRange, index: number) => void;
  onChangeQueryOptions: (options: AlertQueryOptions, index: number) => void;
  index: number;
}

export const QueryOptions = ({
  query,
  queryOptions,
  onChangeTimeRange,
  onChangeQueryOptions,
  index,
}: QueryOptionsProps) => {
  const styles = useStyles2(getStyles);

  const [showOptions, setShowOptions] = useState(false);

  const separator = <span>, </span>;

  return (
    <>
      <Toggletip
        content={
          <div className={styles.queryOptions}>
            {onChangeTimeRange && (
              <InlineField label={t('alerting.query-options.label-time-range', 'Time Range')}>
                <RelativeTimeRangePicker
                  timeRange={query.relativeTimeRange ?? getDefaultRelativeTimeRange()}
                  onChange={(range) => onChangeTimeRange(range, index)}
                />
              </InlineField>
            )}
            <MaxDataPointsOption options={queryOptions} onChange={(options) => onChangeQueryOptions(options, index)} />
            <MinIntervalOption options={queryOptions} onChange={(options) => onChangeQueryOptions(options, index)} />
          </div>
        }
        closeButton={true}
        placement="bottom-start"
      >
        <Button
          type="button"
          fill="text"
          variant="secondary"
          size="sm"
          onClick={() => setShowOptions(!showOptions)}
        >
          <Trans i18nKey="alerting.query-options.button-options">Options</Trans>{' '}
          <Icon name={showOptions ? 'angle-right' : 'angle-down'} />
        </Button>
      </Toggletip>

      <div className={styles.staticValues}>
        <span>
          <TimeRangeLabel relativeTimeRange={query.relativeTimeRange ?? getDefaultRelativeTimeRange()} />
        </span>

        {queryOptions.maxDataPoints && (
          <>
            {separator}
            <Trans
              i18nKey="alerting.query-options.max-data-points"
              values={{ maxDataPoints: queryOptions.maxDataPoints }}
            >
              MD = {'{{maxDataPoints}}'}
            </Trans>
          </>
        )}
        {queryOptions.minInterval && (
          <>
            {separator}
            <Trans i18nKey="alerting.query-options.min-interval" values={{ minInterval: queryOptions.minInterval }}>
              Min. Interval = {'{{minInterval}}'}
            </Trans>
          </>
        )}
      </div>
    </>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  queryOptions: css({
    '> div': {
      justifyContent: 'space-between',
    },
  }),

  staticValues: css({
    color: theme.colors.text.secondary,
    marginRight: theme.spacing(1),
  }),
});
