import { css, cx } from '@emotion/css';
import WKT from 'ol/format/WKT';
import { Geometry } from 'ol/geom';
import type { JSX } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';

import { useStyles2 } from '../../../themes/ThemeContext';
import { type TableCellProps } from '../types';

export function GeoCell(props: TableCellProps): JSX.Element {
  const { cell, tableStyles, cellProps } = props;
  const styles = useStyles2(getStyles);

  let disp = '';

  if (cell.value instanceof Geometry) {
    disp = new WKT().writeGeometry(cell.value, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    });
  } else if (cell.value != null) {
    disp = `${cell.value}`;
  }

  return (
    <div {...cellProps} className={tableStyles.cellContainer}>
      <div className={cx(tableStyles.cellText, styles.monospace)}>{disp}</div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  monospace: css({
    fontFamily: theme.typography.fontFamilyMonospace,
  }),
});
