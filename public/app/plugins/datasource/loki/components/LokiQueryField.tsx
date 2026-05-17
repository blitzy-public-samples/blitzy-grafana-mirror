import { css } from '@emotion/css';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { type GrafanaTheme2, type QueryEditorProps } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

import { type LokiDatasource } from '../datasource';
import { shouldRefreshLabels } from '../languageUtils';
import { type LokiQuery, type LokiOptions } from '../types';

import { MonacoQueryFieldWrapper } from './monaco-query-field/MonacoQueryFieldWrapper';

export interface LokiQueryFieldProps extends QueryEditorProps<LokiDatasource, LokiQuery, LokiOptions> {
  ExtraFieldElement?: ReactNode;
  placeholder?: string;
  'data-testid'?: string;
}

export const LokiQueryField = (props: LokiQueryFieldProps) => {
  const { ExtraFieldElement, query, datasource, history, onRunQuery, range, onChange } = props;
  const placeholder = props.placeholder ?? 'Enter a Loki query (run with Shift+Enter)';
  const styles = useStyles2(getStyles);

  // Preserve the original componentDidMount side-effect of setting `labelsLoaded` to true after
  // languageProvider.start(range) resolves. The value was never read by the original class's render
  // method, so we destructure only the setter to avoid an unused-variable lint violation while
  // still honoring the MINIMAL CHANGE MANDATE (preserve the state write).
  const [, setLabelsLoaded] = useState(false);

  // Capture the initial range so the mount-only effect runs exactly once,
  // matching the original componentDidMount semantics (it used the initial props.range).
  const initialRangeRef = useRef(range);
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      await datasource.languageProvider.start(initialRangeRef.current);
      if (isMounted) {
        setLabelsLoaded(true);
      }
    };
    void init();
    return () => {
      isMounted = false;
    };
    // The original componentDidMount only ran once on mount with the initial datasource and range.
    // We only re-run the effect if the datasource identity changes (which would be a semantic remount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasource]);

  // componentDidUpdate equivalent: refresh labels when range changes meaningfully.
  // Use a ref to track the previous range so we can compare on every render except the first.
  const prevRangeRef = useRef(range);
  useEffect(() => {
    const refreshLabels = shouldRefreshLabels(range, prevRangeRef.current);
    // We want to refresh labels when range changes (we round up intervals to a minute)
    if (refreshLabels) {
      datasource.languageProvider.fetchLabels({ timeRange: range });
    }
    prevRangeRef.current = range;
  }, [range, datasource]);

  const onChangeQuery = useCallback(
    (value: string, override?: boolean) => {
      // Send text change to parent
      if (onChange) {
        const nextQuery = { ...query, expr: value };
        onChange(nextQuery);

        if (override && onRunQuery) {
          onRunQuery();
        }
      }
    },
    [query, onChange, onRunQuery]
  );

  return (
    <>
      <div className={styles.queryFieldRow} data-testid={props['data-testid']}>
        <div className={styles.queryFieldGrow}>
          <MonacoQueryFieldWrapper
            datasource={datasource}
            history={history ?? []}
            onChange={onChangeQuery}
            onRunQuery={onRunQuery}
            initialValue={query.expr ?? ''}
            placeholder={placeholder}
            timeRange={range}
          />
        </div>
      </div>
      {ExtraFieldElement}
    </>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  // Replaces 'gf-form-inline gf-form-inline--xs-view-flex-column flex-grow-1'.
  // gf-form-inline = display: flex with row direction; gf-form-inline--xs-view-flex-column switches
  // to a column layout at the small breakpoint; flex-grow-1 sets flex-grow: 1.
  queryFieldRow: css({
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignContent: 'flex-start',
    flexGrow: 1,
    [theme.breakpoints.down('sm')]: {
      flexDirection: 'column',
    },
  }),
  // Replaces 'gf-form--grow flex-shrink-1 min-width-15'.
  // gf-form--grow sets flex-grow: 1; flex-shrink-1 sets flex-shrink: 1;
  // min-width-15 sets min-width: 240px (= theme.spacing(30) since theme.spacing(1) = 8px).
  queryFieldGrow: css({
    flexGrow: 1,
    flexShrink: 1,
    minWidth: theme.spacing(30),
  }),
});
