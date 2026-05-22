import { css } from '@emotion/css';
import AutoSizer from 'react-virtualized-auto-sizer';

import { type GrafanaTheme2, type PanelData, type ThresholdsConfig, isTimeSeriesFrames } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { type GraphThresholdsStyleMode } from '@grafana/schema';
import { useStyles2 } from '@grafana/ui';
import { appEvents } from 'app/core/app_events';
import { GraphContainer } from 'app/features/explore/Graph/GraphContainer';

import { ExpressionResult } from '../expressions/Expression';

import { getStatusMessage } from './util';

interface Props {
  data: PanelData;
  thresholds?: ThresholdsConfig;
  thresholdsType?: GraphThresholdsStyleMode;
}

/** The VizWrapper is just a simple component that renders either a table or a graph based on the type of data we receive from "PanelData" */
export const VizWrapper = ({ data, thresholds, thresholdsType }: Props) => {
  const styles = useStyles2(getStyles);
  const isTimeSeriesData = isTimeSeriesFrames(data.series);
  const statusMessage = getStatusMessage(data);
  const thresholdsStyle = thresholdsType ? { mode: thresholdsType } : undefined;

  return (
    <div className={styles.wrapper}>
      <AutoSizer disableHeight>
        {({ width }) => (
          <VizContentSizer
            width={width}
            isTimeSeriesData={isTimeSeriesData}
            data={data}
            statusMessage={statusMessage}
            thresholds={thresholds}
            thresholdsStyle={thresholdsStyle}
            styles={styles}
          />
        )}
      </AutoSizer>
    </div>
  );
};

/**
 * Inner component that owns the parameterized `useStyles2(getSizerStyles, width)` call.
 * Extracted from the `AutoSizer` render callback so the hook is invoked inside a stable
 * component boundary (satisfies `react-hooks/rules-of-hooks`). The parameterized
 * `useStyles2` pattern avoids the inline `style={{ width }}` that this refactor replaces
 * (per AAP §0.1.2 Rule T3 — inline style migration).
 */
function VizContentSizer({
  width,
  isTimeSeriesData,
  data,
  statusMessage,
  thresholds,
  thresholdsStyle,
  styles,
}: {
  width: number;
  isTimeSeriesData: boolean;
  data: PanelData;
  statusMessage: ReturnType<typeof getStatusMessage>;
  thresholds: ThresholdsConfig | undefined;
  thresholdsStyle: { mode: GraphThresholdsStyleMode } | undefined;
  styles: ReturnType<typeof getStyles>;
}) {
  const sizerStyles = useStyles2(getSizerStyles, width);

  return (
    <div className={sizerStyles.sizer}>
      {isTimeSeriesData ? (
        <GraphContainer
          statusMessage={statusMessage}
          data={data.series}
          eventBus={appEvents}
          height={300}
          width={width}
          timeRange={data.timeRange}
          timeZone="browser"
          onChangeTime={() => {}}
          splitOpenFn={() => {}}
          loadingState={data.state}
          thresholdsConfig={thresholds}
          thresholdsStyle={thresholdsStyle}
        />
      ) : (
        <div className={styles.instantVectorResultWrapper}>
          <header className={styles.title}>
            <Trans i18nKey="alerting.viz-wrapper.table">Table</Trans>
          </header>
          <ExpressionResult series={data.series} />
        </div>
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    width: '100%',
    position: 'relative',
  }),
  instantVectorResultWrapper: css({
    border: `solid 1px ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    padding: 0,

    display: 'flex',
    flexDirection: 'column',
    flexWrap: 'nowrap',
  }),
  title: css({
    label: 'panel-title',
    padding: theme.spacing(),
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontSize: theme.typography.h6.fontSize,
    fontWeight: theme.typography.h6.fontWeight,
  }),
});

// Parameterized style creator for the dynamic AutoSizer-driven width. Replaces the
// previous inline `style={{ width }}` on the inner sizer <div>. The `_theme` parameter
// is unused but kept positional because `useStyles2` always invokes `getStyles` with
// the theme as its first argument; the `width` comes through as the additional argument.
const getSizerStyles = (_theme: GrafanaTheme2, width: number) => ({
  sizer: css({ width }),
});
