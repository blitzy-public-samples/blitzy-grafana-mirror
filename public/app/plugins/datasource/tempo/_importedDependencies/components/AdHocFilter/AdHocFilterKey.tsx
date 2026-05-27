import { css } from '@emotion/css';
import { type ReactElement } from 'react';

import { type AdHocVariableFilter, type DataSourceRef, type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { Icon, SegmentAsync, useStyles2 } from '@grafana/ui';

interface Props {
  datasource: DataSourceRef;
  filterKey: string | null;
  onChange: (item: SelectableValue<string | null>) => void;
  allFilters: AdHocVariableFilter[];
  disabled?: boolean;
}

const MIN_WIDTH = 90;
export const AdHocFilterKey = ({ datasource, onChange, disabled, filterKey, allFilters }: Props) => {
  const styles = useStyles2(getStyles);

  const plusSegment: ReactElement = (
    <span className={styles.gfFormLabelQueryPart} aria-label="Add Filter">
      <Icon name="plus" />
    </span>
  );

  const loadKeys = () => fetchFilterKeys(datasource, filterKey, allFilters);
  const loadKeysWithRemove = () => fetchFilterKeysWithRemove(datasource, filterKey, allFilters);

  if (filterKey === null) {
    return (
      <div className={styles.gfForm} data-testid="AdHocFilterKey-add-key-wrapper">
        <SegmentAsync
          disabled={disabled}
          className={styles.querySegmentKey}
          Component={plusSegment}
          value={filterKey}
          onChange={onChange}
          loadOptions={loadKeys}
          inputMinWidth={MIN_WIDTH}
        />
      </div>
    );
  }

  return (
    <div className={styles.gfForm} data-testid="AdHocFilterKey-key-wrapper">
      <SegmentAsync
        disabled={disabled}
        className={styles.querySegmentKey}
        value={filterKey}
        onChange={onChange}
        loadOptions={loadKeysWithRemove}
        inputMinWidth={MIN_WIDTH}
      />
    </div>
  );
};

export const REMOVE_FILTER_KEY = '-- remove filter --';
const REMOVE_VALUE = { label: REMOVE_FILTER_KEY, value: REMOVE_FILTER_KEY };

const fetchFilterKeys = async (
  datasource: DataSourceRef,
  currentKey: string | null,
  allFilters: AdHocVariableFilter[]
): Promise<Array<SelectableValue<string>>> => {
  const ds = await getDataSourceSrv().get(datasource);

  if (!ds || !ds.getTagKeys) {
    return [];
  }

  const otherFilters = allFilters.filter((f) => f.key !== currentKey);
  const response = await ds.getTagKeys({ filters: otherFilters });
  const metrics = Array.isArray(response) ? response : response.data;
  return metrics.map((m) => ({ label: m.text, value: m.text }));
};

const fetchFilterKeysWithRemove = async (
  datasource: DataSourceRef,
  currentKey: string | null,
  allFilters: AdHocVariableFilter[]
): Promise<Array<SelectableValue<string>>> => {
  const keys = await fetchFilterKeys(datasource, currentKey, allFilters);
  return [REMOVE_VALUE, ...keys];
};

const getStyles = (theme: GrafanaTheme2) => ({
  gfForm: css({
    display: 'flex',
    flexFlow: 'row nowrap',
    marginBottom: theme.spacing(0.5),
    paddingTop: theme.spacing(0.25),
    paddingBottom: theme.spacing(0.25),
  }),
  querySegmentKey: css({
    backgroundColor: theme.colors.primary.transparent,
    color: theme.colors.primary.text,
  }),
  gfFormLabelQueryPart: css({
    display: 'inline-flex',
    alignItems: 'center',
    padding: theme.spacing(0.5, 1),
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
    fontSize: theme.typography.bodySmall.fontSize,
    lineHeight: theme.typography.bodySmall.lineHeight,
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.background.secondary}`,
  }),
});
