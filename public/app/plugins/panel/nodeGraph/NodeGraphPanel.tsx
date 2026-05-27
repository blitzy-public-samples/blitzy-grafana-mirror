import { css } from '@emotion/css';
import memoizeOne from 'memoize-one';
import { useId } from 'react';

import { type GrafanaTheme2, type PanelProps } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { useStyles2 } from '@grafana/ui';

import { useLinks } from '../../../features/explore/utils/links';

import { NodeGraph } from './NodeGraph';
import { type Options as NodeGraphOptions } from './panelcfg.gen';
import { getNodeGraphDataFrames } from './utils';

export const NodeGraphPanel = ({ width, height, data, options }: PanelProps<NodeGraphOptions>) => {
  const getLinks = useLinks(data.timeRange);
  const panelId = useId();
  const styles = useStyles2(getStyles);

  if (!data || !data.series.length) {
    return (
      <div className={styles.panelEmpty}>
        <p>
          <Trans i18nKey="nodeGraph.node-graph-panel.no-data-found-in-response">No data found in response</Trans>
        </p>
      </div>
    );
  }

  const memoizedGetNodeGraphDataFrames = memoizeOne(getNodeGraphDataFrames);
  return (
    // Design system gap: width and height are runtime-computed pixel values from PanelProps;
    // Box's width/height props use theme.spacing tokens, so they cannot represent raw pixels.
    <div style={{ width, height }}>
      <NodeGraph
        dataFrames={memoizedGetNodeGraphDataFrames(data.series, options)}
        getLinks={getLinks}
        panelId={panelId}
        zoomMode={options.zoomMode}
        layoutAlgorithm={options.layoutAlgorithm}
      />
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  panelEmpty: css({
    display: 'flex',
    alignItems: 'center',
    height: '100%',
    width: '100%',
    '& p': {
      textAlign: 'center',
      color: theme.colors.text.secondary,
      fontSize: theme.typography.h4.fontSize,
      width: '100%',
    },
  }),
});
