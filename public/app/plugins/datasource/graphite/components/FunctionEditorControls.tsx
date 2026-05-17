import { css } from '@emotion/css';
import { lazy, Suspense } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Icon, Tooltip, useStyles2 } from '@grafana/ui';

import { type FuncInstance } from '../gfunc';

export interface FunctionEditorControlsProps {
  onMoveLeft: (func: FuncInstance) => void;
  onMoveRight: (func: FuncInstance) => void;
  onRemove: (func: FuncInstance) => void;
}

const FunctionDescription = lazy(async () => {
  return {
    default(props: { description?: string }) {
      return <div>{props.description}</div>;
    },
  };
});

const FunctionHelpButton = (props: { description?: string; name: string }) => {
  const styles = useStyles2(getStyles);

  if (props.description) {
    let tooltip = (
      <Suspense fallback={<span>Loading description...</span>}>
        <FunctionDescription description={props.description} />
      </Suspense>
    );
    return (
      <Tooltip content={tooltip} placement={'bottom-end'}>
        <Icon className={props.description ? undefined : styles.pointer} name="question-circle" />
      </Tooltip>
    );
  }

  return (
    <Icon
      className={styles.pointer}
      name="question-circle"
      onClick={() => {
        window.open(
          'http://graphite.readthedocs.org/en/latest/functions.html#graphite.render.functions.' + props.name,
          '_blank'
        );
      }}
    />
  );
};

export const FunctionEditorControls = (
  props: FunctionEditorControlsProps & {
    func: FuncInstance;
  }
) => {
  const { func, onMoveLeft, onMoveRight, onRemove } = props;
  const styles = useStyles2(getStyles);
  return (
    <div className={styles.controls}>
      <Icon name="arrow-left" onClick={() => onMoveLeft(func)} />
      <FunctionHelpButton name={func.def.name} description={func.def.description} />
      <Icon name="times" onClick={() => onRemove(func)} />
      <Icon name="arrow-right" onClick={() => onMoveRight(func)} />
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  controls: css({
    display: 'flex',
    width: '60px',
    justifyContent: 'space-between',
  }),
  pointer: css({
    cursor: 'pointer',
  }),
});
