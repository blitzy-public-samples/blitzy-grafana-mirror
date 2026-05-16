import { css } from '@emotion/css';
import type Map from 'ol/Map';
import { type Coordinate } from 'ol/coordinate';
import { transform } from 'ol/proj';
import { memo, useEffect, useState } from 'react';
import tinycolor from 'tinycolor2';

import { type GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans } from '@grafana/i18n';
import { Stack, Text, useStyles2 } from '@grafana/ui';

interface Props {
  map: Map;
}

interface State {
  zoom?: number;
  center: Coordinate;
}

export const DebugOverlay = memo(function DebugOverlay(props: Props) {
  const style = useStyles2(getStyles);
  const [state, setState] = useState<State>({ zoom: 0, center: [0, 0] });

  useEffect(() => {
    const updateViewState = () => {
      const view = props.map.getView();
      setState({
        zoom: view.getZoom(),
        center: transform(view.getCenter()!, view.getProjection(), 'EPSG:4326'),
      });
    };

    props.map.on('moveend', updateViewState);
    updateViewState();
    // TODO(modernization): consider adding props.map.un('moveend', updateViewState) cleanup
    // (the original class did not perform this cleanup either; preserving exact behavior per
    // AAP §0.9.2.12 minimal-change mandate)
  }, [props.map]);

  const { zoom, center } = state;

  return (
    <div className={style.infoWrap} data-testid={selectors.components.DebugOverlay.wrapper}>
      <Stack direction="column" gap={0.5}>
        <Stack direction="row" gap={1}>
          <Text weight="bold">
            <Trans i18nKey="geomap.debug-overlay.zoom">Zoom:</Trans>
          </Text>
          <Text>{zoom?.toFixed(1) ?? ''}</Text>
        </Stack>
        <Stack direction="row" gap={1}>
          <Text weight="bold">
            <Trans i18nKey="geomap.debug-overlay.center">Center:</Trans>
          </Text>
          <Text>
            {center[0].toFixed(5)}, {center[1].toFixed(5)}
          </Text>
        </Stack>
      </Stack>
    </div>
  );
});

DebugOverlay.displayName = 'DebugOverlay';

const getStyles = (theme: GrafanaTheme2) => ({
  infoWrap: css({
    color: theme.colors.text.primary,
    background: tinycolor(theme.components.panel.background).setAlpha(0.7).toString(),
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(1),
  }),
});
