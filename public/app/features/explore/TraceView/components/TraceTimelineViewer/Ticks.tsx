// Copyright (c) 2017 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { css } from '@emotion/css';
import cx from 'classnames';
import { type CSSProperties } from 'react';
import * as React from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

import { autoColor } from '../Theme';
import type TNil from '../types/TNil';
import { formatDuration } from '../utils/date';

const getStyles = (theme: GrafanaTheme2) => ({
  Ticks: css({
    label: 'Ticks',
    pointerEvents: 'none',
  }),
  TicksTick: css({
    label: 'TicksTick',
    position: 'absolute',
    height: '100%',
    width: '1px',
    background: autoColor(theme, '#d8d8d8'),
    '&:last-child': {
      width: 0,
    },
    // Dynamic per-tick horizontal position consumed via CSS custom property.
    left: 'var(--ticks-tick-left)',
  }),
  TicksTickLabel: css({
    label: 'TicksTickLabel',
    left: '0.25rem',
    position: 'absolute',
    whiteSpace: 'nowrap',
  }),
  TicksTickLabelEndAnchor: css({
    label: 'TicksTickLabelEndAnchor',
    left: 'initial',
    right: '0.25rem',
  }),
});

type TicksProps = {
  endTime?: number | TNil;
  numTicks: number;
  showLabels?: boolean | TNil;
  startTime?: number | TNil;
};

// CSS custom property intersection type replaces the previous inline `style={{}}` literal
// while preserving the dynamic per-tick horizontal position per AAP Dimension 3.
type TicksTickCSSVars = CSSProperties & {
  '--ticks-tick-left'?: string;
};

export default function Ticks({ endTime = null, numTicks, showLabels = null, startTime = null }: TicksProps) {
  let labels: undefined | string[];
  if (showLabels) {
    labels = [];
    const viewingDuration = (endTime || 0) - (startTime || 0);
    for (let i = 0; i < numTicks; i++) {
      const durationAtTick = (startTime || 0) + (i / (numTicks - 1)) * viewingDuration;
      labels.push(formatDuration(durationAtTick));
    }
  }
  const styles = useStyles2(getStyles);
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < numTicks; i++) {
    const portion = i / (numTicks - 1);
    // Dynamic per-tick horizontal position passed via CSS custom property.
    const tickStyle: TicksTickCSSVars = { '--ticks-tick-left': `${portion * 100}%` };
    ticks.push(
      <div data-testid="TicksID" key={portion} className={styles.TicksTick} style={tickStyle}>
        {labels && (
          <span className={cx(styles.TicksTickLabel, { [styles.TicksTickLabelEndAnchor]: portion >= 1 })}>
            {labels[i]}
          </span>
        )}
      </div>
    );
  }
  return <div className={styles.Ticks}>{ticks}</div>;
}
