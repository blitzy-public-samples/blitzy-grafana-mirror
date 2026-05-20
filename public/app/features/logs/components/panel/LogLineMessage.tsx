import { type CSSProperties, type ReactNode } from 'react';

import { Button } from '@grafana/ui';

import { type LogLineStyles } from './LogLine';

interface Props {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  styles: LogLineStyles;
}

export const LogLineMessage = ({ children, onClick, style, styles }: Props) => {
  return (
    <div style={style} className={`${styles.logLine} ${styles.logLineMessage}`}>
      {onClick ? (
        <Button variant="secondary" fill="text" size="sm" className={styles.loadMoreButton} onClick={onClick}>
          {children}
        </Button>
      ) : (
        children
      )}
    </div>
  );
};
