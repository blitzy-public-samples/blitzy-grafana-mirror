import { css } from '@emotion/css';
import { useRef, useEffect } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { useStyles2 } from '@grafana/ui';

interface ProgressBarProps {
  progress?: number;
  topBottomSpacing?: number;
}
const ProgressBar = ({ progress, topBottomSpacing }: ProgressBarProps) => {
  const styles = useStyles2(getStyles, topBottomSpacing);
  const previousProgress = useRef(0);
  const shouldAnimate = progress !== undefined && progress > previousProgress.current;

  useEffect(() => {
    if (progress !== undefined) {
      previousProgress.current = progress;
    }
  }, [progress]);

  if (progress === undefined) {
    return null;
  }

  return (
    <div
      className={styles.container}
      aria-label={t('provisioning.shared.progress-bar.aria-label', 'Progress Bar')}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/*
        Dynamic style — `width` is computed at render time from the `progress` prop (0–100). Per
        AAP §0.5.3, `useStyles2` is the prescribed migration target for static inline styles, but
        runtime-variable values like this cannot be expressed as a single Emotion class without
        generating a unique class per render. The static portion (`height`, `background`,
        `transition`) is already in getStyles via styles.filler / styles.fillerAnimated; only the
        runtime-variable `width` remains as inline style.
      */}
      <div className={shouldAnimate ? styles.fillerAnimated : styles.filler} style={{ width: `${progress}%` }} />
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2, topBottomSpacing = 2) => ({
  container: css({
    height: '10px',
    width: '400px',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.pill,
    overflow: 'hidden',
    margin: theme.spacing(topBottomSpacing, 0),
  }),
  filler: css({
    height: '100%',
    background: theme.colors.success.text,
  }),
  fillerAnimated: css({
    height: '100%',
    background: theme.colors.success.text,
    [theme.transitions.handleMotion('no-preference', 'reduce')]: {
      transition: 'width 0.5s ease-in-out',
    },
  }),
});

export default ProgressBar;
