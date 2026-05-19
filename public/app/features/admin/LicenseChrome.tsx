import { css, cx } from '@emotion/css';
import { useMemo } from 'react';
import * as React from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2, useTheme2 } from '@grafana/ui';
import grafanaIconSvg from 'img/grafana_icon.svg';
import headerDarkSvg from 'img/licensing/header_dark.svg';
import headerLightSvg from 'img/licensing/header_light.svg';

const getStyles = (theme: GrafanaTheme2) => {
  const backgroundUrl = theme.isDark ? headerDarkSvg : headerLightSvg;
  const footerBg = theme.isDark ? theme.v1.palette.dark9 : theme.v1.palette.gray6;

  return {
    container: css({
      padding: theme.spacing(4),
      background: theme.components.panel.background,
    }),
    footer: css({
      textAlign: 'center',
      padding: theme.spacing(2),
      background: footerBg,
      borderRadius: theme.shape.radius.lg,
    }),
    header: css({
      height: '137px',
      padding: theme.spacing(4, 0, 0, 4),
      position: 'relative',
      background: `url('${backgroundUrl}') right`,
      borderRadius: theme.shape.radius.lg,
    }),
    title: css({
      fontWeight: theme.typography.fontWeightMedium,
      fontSize: theme.typography.h2.fontSize,
      lineHeight: theme.typography.h2.lineHeight,
    }),
    iconCircle: css({
      // Custom drop shadow specific to the Grafana Enterprise hero card;
      // no @grafana/ui theme.shadows token matches this exact specification.
      boxShadow: '0px 0px 24px rgba(24, 58, 110, 0.45)',
      // Brand color for Grafana Enterprise hero card; no @grafana/ui
      // theme.colors token matches this brand-specific dark blue.
      background: '#0A1C36',
      position: 'absolute',
      top: theme.spacing(2.375),
      right: '5%',
    }),
    grafanaIcon: css({
      position: 'absolute',
      left: theme.spacing(2.875),
      top: theme.spacing(2.5),
    }),
  };
};

interface Props {
  header: string;
  subheader?: string;
  editionNotice?: string;
  children?: React.ReactNode;
}

export function LicenseChrome({ header, editionNotice, subheader, children }: Props) {
  const styles = useStyles2(getStyles);

  return (
    <>
      <div className={styles.header}>
        <h2 className={styles.title}>{header}</h2>
        {subheader && <h3>{subheader}</h3>}

        <Circle size="128px" className={styles.iconCircle}>
          <img src={grafanaIconSvg} alt="Grafana" width="80px" className={styles.grafanaIcon} />
        </Circle>
      </div>

      <div className={styles.container}>{children}</div>

      {editionNotice && <div className={styles.footer}>{editionNotice}</div>}
    </>
  );
}

interface CircleProps {
  size: string;
  className?: string;
}

export const Circle = ({ size, className, children }: React.PropsWithChildren<CircleProps>) => {
  const theme = useTheme2();
  // Generate a class name for the runtime-dynamic size at the component boundary.
  // useMemo ensures the css() invocation only runs when size or the relevant theme
  // token changes, which eliminates the previous inline style={{ width, height, ... }} usage
  // while preserving the original positioning semantics.
  const dynamicCircle = useMemo(
    () =>
      css({
        width: size,
        height: size,
        position: 'absolute',
        bottom: 0,
        right: 0,
        borderRadius: theme.shape.radius.circle,
      }),
    [size, theme.shape.radius.circle]
  );
  return <div className={cx(dynamicCircle, className)}>{children}</div>;
};
