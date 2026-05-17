import { css, cx } from '@emotion/css';

import { type GrafanaTheme2, type MetadataInspectorProps, rangeUtil } from '@grafana/data';
import { Text, useStyles2 } from '@grafana/ui';

import { type GraphiteDatasource } from '../datasource';
import { getRollupNotice, getRuntimeConsolidationNotice, parseSchemaRetentions } from '../meta';
import { type GraphiteOptions, type GraphiteQuery, type MetricTankSeriesMeta } from '../types';

export type Props = MetadataInspectorProps<GraphiteDatasource, GraphiteQuery, GraphiteOptions>;

export const MetricTankMetaInspector = (props: Props) => {
  const styles = useStyles2(getStyles);
  const { data } = props;

  const renderMeta = (meta: MetricTankSeriesMeta, key: string) => {
    const buckets = parseSchemaRetentions(meta['schema-retentions']);
    const rollupNotice = getRollupNotice([meta]);
    const runtimeNotice = getRuntimeConsolidationNotice([meta]);
    const normFunc = (meta['consolidator-normfetch'] ?? '').replace('Consolidator', '');

    const totalSeconds = buckets.reduce(
      (acc, bucket) => acc + (bucket.retention ? rangeUtil.intervalToSeconds(bucket.retention) : 0),
      0
    );

    return (
      <div className={styles.metaItem} key={key}>
        <div className={styles.metaItemHeader}>
          Schema: {meta['schema-name']}
          <div className={styles.smallMuted}>Series count: {meta.count}</div>
        </div>
        <div className={styles.metaItemBody}>
          <div className={styles.step}>
            <div className={styles.stepHeading}>Step 1: Fetch</div>
            <div className={styles.stepDescription}>
              First data is fetched, either from raw data archive or a rollup archive
            </div>

            {rollupNotice && <p>{rollupNotice.text}</p>}
            {!rollupNotice && <p>No rollup archive was used</p>}

            <div>
              {buckets.map((bucket, index) => {
                const bucketLength = bucket.retention ? rangeUtil.intervalToSeconds(bucket.retention) : 0;
                const lengthPercent = (bucketLength / totalSeconds) * 100;
                const isActive = index === meta['archive-read'];

                return (
                  <div key={bucket.retention} className={styles.bucket}>
                    <div className={styles.bucketInterval}>{bucket.interval}</div>
                    <div
                      className={cx(styles.bucketRetention, { [styles.bucketRetentionActive]: isActive })}
                      // Design system gap: dynamic per-render flex-grow value cannot move to getStyles factory
                      style={{ flexGrow: lengthPercent }}
                    />
                    {/* Design system gap: dynamic per-render flex-grow value cannot move to getStyles factory */}
                    <div style={{ flexGrow: 100 - lengthPercent }}>{bucket.retention}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepHeading}>Step 2: Normalization</div>
            <div className={styles.stepDescription}>
              Normalization happens when series with different intervals between points are combined.
            </div>

            {meta['aggnum-norm'] > 1 && <p>Normalization did occur using {normFunc}</p>}
            {meta['aggnum-norm'] === 1 && <p>No normalization was needed</p>}
          </div>

          <div className={styles.step}>
            <div className={styles.stepHeading}>Step 3: Runtime consolidation</div>
            <div className={styles.stepDescription}>
              If there are too many data points at this point Metrictank will consolidate them down to below max data
              points (set in queries tab).
            </div>

            {runtimeNotice && <p>{runtimeNotice.text}</p>}
            {!runtimeNotice && <p>No runtime consolidation</p>}
          </div>
        </div>
      </div>
    );
  };

  // away to dedupe them
  const seriesMetas: Record<string, MetricTankSeriesMeta> = {};

  for (const series of data) {
    const seriesMetaList: MetricTankSeriesMeta[] | undefined = series?.meta?.custom?.seriesMetaList;
    if (seriesMetaList) {
      for (const metaItem of seriesMetaList) {
        // key is to dedupe as many series will have identitical meta
        const key = `${JSON.stringify(metaItem)}`;

        if (seriesMetas[key]) {
          seriesMetas[key].count += metaItem.count;
        } else {
          seriesMetas[key] = metaItem;
        }
      }
    }
  }

  if (Object.keys(seriesMetas).length === 0) {
    return <div>No response meta data</div>;
  }

  return (
    <div>
      <Text element="h2" variant="h4">
        Metrictank Lineage
      </Text>
      {Object.keys(seriesMetas).map((key) => renderMeta(seriesMetas[key], key))}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  metaItem: css({
    background: theme.colors.background.primary,
    border: `1px solid ${theme.colors.border.weak}`,
    marginBottom: theme.spacing(2),
  }),
  metaItemHeader: css({
    background: theme.colors.background.secondary,
    padding: theme.spacing(0.5, 2),
    fontSize: theme.typography.body.fontSize,
    display: 'flex',
    justifyContent: 'space-between',
  }),
  metaItemBody: css({
    padding: theme.spacing(2),
  }),
  stepHeading: css({
    fontSize: theme.typography.body.fontSize,
  }),
  stepDescription: css({
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing(1),
  }),
  step: css({
    marginBottom: theme.spacing(3),

    '&:last-child': {
      marginBottom: 0,
    },
  }),
  bucket: css({
    display: 'flex',
    marginBottom: theme.spacing(1),
    borderRadius: theme.shape.radius.default,
  }),
  bucketInterval: css({
    flexGrow: 0,
    width: '60px',
  }),
  bucketRetention: css({
    background: `linear-gradient(0deg, ${theme.colors.primary.main}, ${theme.colors.primary.shade})`,
    textAlign: 'center',
    color: theme.colors.primary.contrastText,
    marginRight: theme.spacing(2),
    borderRadius: theme.shape.radius.default,
  }),
  bucketRetentionActive: css({
    background: `linear-gradient(0deg, ${theme.colors.success.main}, ${theme.colors.success.shade})`,
  }),
  smallMuted: css({
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
});
