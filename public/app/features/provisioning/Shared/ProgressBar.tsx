import { css } from '@emotion/css';
import { type CSSProperties, useEffect, useRef } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { useStyles2 } from '@grafana/ui';

interface ProgressBarProps {
  progress?: number;
  topBottomSpacing?: number;
}

/*
 * The filler's `width` is delivered via the `--progress` CSS custom property
 * (set inline on the element's `style` prop). This keeps the Emotion-generated
 * filler classes stable: a single bounded set of two classes is generated for
 * the lifetime of the page regardless of progress value, instead of a fresh
 * class for every distinct progress percentage observed during sync. See the
 * AAP §0.8.10/§0.8.9 guidance on bounded Emotion class generation for
 * high-cardinality dynamic style values.
 */
type ProgressCSSVar = CSSProperties & { '--progress'?: string };

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

  const fillerStyle: ProgressCSSVar = { '--progress': `${progress}%` };

  return (
    <div
      className={styles.container}
      aria-label={t('provisioning.shared.progress-bar.aria-label', 'Progress Bar')}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={shouldAnimate ? styles.fillerAnimated : styles.filler} style={fillerStyle} />
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
    width: 'var(--progress, 0%)',
  }),
  fillerAnimated: css({
    height: '100%',
    background: theme.colors.success.text,
    width: 'var(--progress, 0%)',
    [theme.transitions.handleMotion('no-preference', 'reduce')]: {
      transition: 'width 0.5s ease-in-out',
    },
  }),
});

export default ProgressBar;
