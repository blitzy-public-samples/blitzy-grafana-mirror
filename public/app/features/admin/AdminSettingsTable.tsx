import { css } from '@emotion/css';
import { Fragment } from 'react';
import Skeleton from 'react-loading-skeleton';

import { type GrafanaTheme2 } from '@grafana/data';
import { ScrollContainer, Text, useStyles2 } from '@grafana/ui';
import { type SkeletonComponent, attachSkeleton } from '@grafana/ui/unstable';

import { type Settings } from './AdminSettings';

interface Props {
  settings: Settings;
}

const AdminSettingsTableComponent = ({ settings }: Props) => {
  const styles = useStyles2(getStyles);
  return (
    <ScrollContainer overflowY="visible" overflowX="auto" width="100%">
      <div className={styles.table}>
        {Object.entries(settings).map(([sectionName, sectionSettings], i) => (
          <Fragment key={`section-${i}`}>
            <div className={styles.sectionRow}>
              <Text color="info" weight="bold">
                {sectionName}
              </Text>
            </div>
            {Object.entries(sectionSettings).map(([settingName, settingValue], j) => (
              <div key={`property-${j}`} className={styles.propertyRow}>
                <div className={styles.propertyName}>{settingName}</div>
                <div className={styles.propertyValue}>{settingValue}</div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </ScrollContainer>
  );
};

// note: don't want to put this in render function else it will get regenerated
const randomValues = new Array(50).fill(null).map(() => Math.random());

const AdminSettingsTableSkeleton: SkeletonComponent = ({ rootProps }) => {
  const styles = useStyles2(getStyles);
  return (
    <ScrollContainer overflowY="visible" overflowX="auto" width="100%">
      <div className={styles.table} {...rootProps}>
        {randomValues.map((randomValue, index) => {
          const isSection = index === 0 || randomValue > 0.9;

          return (
            <Fragment key={index}>
              {isSection && (
                <div className={styles.sectionRow}>
                  <Skeleton width={getRandomInRange(40, 80, randomValue)} />
                </div>
              )}
              <div className={styles.propertyRow}>
                <div className={styles.propertyName}>
                  <Skeleton width={getRandomInRange(60, 100, randomValue)} />
                </div>
                <div className={styles.propertyValue}>
                  <Skeleton width={getRandomInRange(80, 320, randomValue)} />
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </ScrollContainer>
  );
};

function getRandomInRange(min: number, max: number, randomSeed: number) {
  return randomSeed * (max - min) + min;
}

export const AdminSettingsTable = attachSkeleton(AdminSettingsTableComponent, AdminSettingsTableSkeleton);

const getStyles = (theme: GrafanaTheme2) => ({
  table: css({
    width: '100%',
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    overflow: 'hidden',
  }),
  sectionRow: css({
    display: 'flex',
    padding: theme.spacing(1, 1.5),
    borderBottom: `1px solid ${theme.colors.border.weak}`,
    background: theme.colors.background.secondary,
  }),
  propertyRow: css({
    display: 'flex',
    padding: theme.spacing(1, 1.5),
    borderBottom: `1px solid ${theme.colors.border.weak}`,
    '&:last-child': {
      borderBottom: 0,
    },
  }),
  propertyName: css({
    flex: '0 0 50%',
    paddingLeft: theme.spacing(3.125), // 25px equivalent (8 * 3.125 = 25)
  }),
  propertyValue: css({
    flex: '0 0 50%',
    whiteSpace: 'break-spaces',
  }),
});
