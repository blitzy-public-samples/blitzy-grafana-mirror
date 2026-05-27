import { css } from '@emotion/css';
import { Fragment, useMemo } from 'react';
import Skeleton from 'react-loading-skeleton';

import { type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { type Column, InteractiveTable, ScrollContainer, Text, useStyles2 } from '@grafana/ui';
import { type SkeletonComponent, attachSkeleton } from '@grafana/ui/unstable';

import { type Settings } from './AdminSettings';

interface Props {
  settings: Settings;
}

interface SettingRow {
  key: string;
  property: string;
  value: string;
}

interface SkeletonSettingRow {
  key: string;
  propertyWidth: number;
  valueWidth: number;
}

const AdminSettingsTableComponent = ({ settings }: Props) => {
  const styles = useStyles2(getStyles);

  // Build per-section table data. Each section becomes its own InteractiveTable
  // (preserving the hierarchical settings layout while satisfying the design-system
  // table semantics requirement). Memoized so columns/data identities are stable.
  const sections = useMemo(
    () =>
      Object.entries(settings).map(([sectionName, sectionSettings]) => ({
        sectionName,
        data: Object.entries(sectionSettings).map(([property, value]) => ({
          key: `${sectionName}.${property}`,
          property,
          value,
        })),
      })),
    [settings]
  );

  const columns = useMemo<Array<Column<SettingRow>>>(
    () => [
      {
        id: 'property',
        header: t('admin.admin-settings-table.column-property', 'Property'),
        cell: ({ row: { original } }) => <span className={styles.propertyName}>{original.property}</span>,
      },
      {
        id: 'value',
        header: t('admin.admin-settings-table.column-value', 'Value'),
        cell: ({ row: { original } }) => <span className={styles.propertyValue}>{original.value}</span>,
      },
    ],
    [styles.propertyName, styles.propertyValue]
  );

  return (
    <ScrollContainer overflowY="visible" overflowX="auto" width="100%">
      <div className={styles.tableStack}>
        {sections.map(({ sectionName, data }) => (
          <Fragment key={sectionName}>
            <Text color="info" weight="bold" element="h3" variant="h5">
              {sectionName}
            </Text>
            <InteractiveTable<SettingRow> columns={columns} data={data} getRowId={(row) => row.key} />
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

  // Partition the skeleton rows into sections matching the production layout. Each
  // "section" produces a heading row (section[0]) followed by property rows whose
  // widths are deterministic per-index (driven by the module-level randomValues array
  // so the skeleton does not animate width on each re-render).
  const skeletonSections = useMemo(() => {
    type Section = { headingWidth: number; rows: SkeletonSettingRow[] };
    const result: Section[] = [];
    let currentSection: Section | null = null;

    randomValues.forEach((randomValue, index) => {
      const isSection = index === 0 || randomValue > 0.9;
      if (isSection) {
        currentSection = {
          headingWidth: getRandomInRange(40, 80, randomValue),
          rows: [],
        };
        result.push(currentSection);
      }
      if (currentSection !== null) {
        currentSection.rows.push({
          key: `skeleton-${index}`,
          propertyWidth: getRandomInRange(60, 100, randomValue),
          valueWidth: getRandomInRange(80, 320, randomValue),
        });
      }
    });

    return result;
  }, []);

  const skeletonColumns = useMemo<Array<Column<SkeletonSettingRow>>>(
    () => [
      {
        id: 'property',
        header: t('admin.admin-settings-table.column-property', 'Property'),
        cell: ({ row: { original } }) => (
          <span className={styles.propertyName}>
            <Skeleton width={original.propertyWidth} />
          </span>
        ),
      },
      {
        id: 'value',
        header: t('admin.admin-settings-table.column-value', 'Value'),
        cell: ({ row: { original } }) => (
          <span className={styles.propertyValue}>
            <Skeleton width={original.valueWidth} />
          </span>
        ),
      },
    ],
    [styles.propertyName, styles.propertyValue]
  );

  return (
    <ScrollContainer overflowY="visible" overflowX="auto" width="100%">
      <div className={styles.tableStack} {...rootProps}>
        {skeletonSections.map((section, sectionIndex) => (
          <Fragment key={`skeleton-section-${sectionIndex}`}>
            <Text color="info" weight="bold" element="h3" variant="h5">
              <Skeleton width={section.headingWidth} />
            </Text>
            <InteractiveTable<SkeletonSettingRow>
              columns={skeletonColumns}
              data={section.rows}
              getRowId={(row) => row.key}
            />
          </Fragment>
        ))}
      </div>
    </ScrollContainer>
  );
};

function getRandomInRange(min: number, max: number, randomSeed: number) {
  return randomSeed * (max - min) + min;
}

export const AdminSettingsTable = attachSkeleton(AdminSettingsTableComponent, AdminSettingsTableSkeleton);

const getStyles = (theme: GrafanaTheme2) => ({
  tableStack: css({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    width: '100%',
  }),
  propertyName: css({
    paddingLeft: theme.spacing(3.125), // 25px equivalent (8 * 3.125 = 25), preserves original `<td style={{ paddingLeft: '25px' }}>` indent
  }),
  propertyValue: css({
    whiteSpace: 'break-spaces',
  }),
});
