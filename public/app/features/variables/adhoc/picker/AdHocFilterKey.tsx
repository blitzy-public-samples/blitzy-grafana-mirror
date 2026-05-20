import { css } from '@emotion/css';
import { type ReactElement } from 'react';

import { type AdHocVariableFilter, type DataSourceRef, type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Icon, SegmentAsync, Stack, useStyles2 } from '@grafana/ui';

import { getDatasourceSrv } from '../../../plugins/datasource_srv';

interface Props {
  datasource: DataSourceRef;
  filterKey: string | null;
  onChange: (item: SelectableValue<string | null>) => void;
  allFilters: AdHocVariableFilter[];
  disabled?: boolean;
}

const MIN_WIDTH = 90;
export const AdHocFilterKey = ({ datasource, onChange, disabled, filterKey, allFilters }: Props) => {
  const loadKeys = () => fetchFilterKeys(datasource, filterKey, allFilters);
  const loadKeysWithRemove = () => fetchFilterKeysWithRemove(datasource, filterKey, allFilters);
  const styles = useStyles2(getStyles);

  const plusSegment: ReactElement = (
    <span
      className={styles.queryPart}
      aria-label={t('variables.ad-hoc-filter-key.plus-segment.aria-label-add-filter', 'Add Filter')}
    >
      <Icon name="plus" />
    </span>
  );

  if (filterKey === null) {
    return (
      <Stack direction="row" gap={0.5} alignItems="center" data-testid="AdHocFilterKey-add-key-wrapper">
        <SegmentAsync
          disabled={disabled}
          className={styles.querySegmentKey}
          Component={plusSegment}
          value={filterKey}
          onChange={onChange}
          loadOptions={loadKeys}
          inputMinWidth={MIN_WIDTH}
        />
      </Stack>
    );
  }

  return (
    <Stack direction="row" gap={0.5} alignItems="center" data-testid="AdHocFilterKey-key-wrapper">
      <SegmentAsync
        disabled={disabled}
        className={styles.querySegmentKey}
        value={filterKey}
        onChange={onChange}
        loadOptions={loadKeysWithRemove}
        inputMinWidth={MIN_WIDTH}
      />
    </Stack>
  );
};

export const REMOVE_FILTER_KEY = '-- remove filter --';
const REMOVE_VALUE = { label: REMOVE_FILTER_KEY, value: REMOVE_FILTER_KEY };

const fetchFilterKeys = async (
  datasource: DataSourceRef,
  currentKey: string | null,
  allFilters: AdHocVariableFilter[]
): Promise<Array<SelectableValue<string>>> => {
  const ds = await getDatasourceSrv().get(datasource);

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
  queryPart: css({
    display: 'inline-flex',
    alignItems: 'center',
    padding: theme.spacing(0.5, 1),
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.shape.radius.default,
    color: theme.colors.text.secondary,
  }),
  querySegmentKey: css({
    fontFamily: theme.typography.fontFamilyMonospace,
    color: theme.colors.primary.text,
  }),
});
