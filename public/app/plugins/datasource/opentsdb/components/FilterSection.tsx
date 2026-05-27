import { css, cx } from '@emotion/css';
import debounce from 'debounce-promise';
import { size } from 'lodash';
import { useCallback, useState } from 'react';

import { type GrafanaTheme2, type SelectableValue, toOption } from '@grafana/data';
import {
  AsyncSelect,
  Button,
  Icon,
  IconButton,
  InlineFormLabel,
  InlineLabel,
  InlineSwitch,
  Select,
  Stack,
  useStyles2,
} from '@grafana/ui';

import { type OpenTsdbFilter, type OpenTsdbQuery } from '../types';

export interface FilterSectionProps {
  query: OpenTsdbQuery;
  onChange: (query: OpenTsdbQuery) => void;
  onRunQuery: () => void;
  suggestTagKeys: (query: OpenTsdbQuery) => Promise<string[]>;
  filterTypes: string[];
  suggestTagValues: (value: string) => Promise<SelectableValue[]>;
}

export function FilterSection({
  query,
  onChange,
  onRunQuery,
  suggestTagKeys,
  filterTypes,
  suggestTagValues,
}: FilterSectionProps) {
  const [tagKeys, updTagKeys] = useState<Array<SelectableValue<string>>>();
  const [keyIsLoading, updKeyIsLoading] = useState<boolean>();

  const [addFilterMode, updAddFilterMode] = useState<boolean>(false);

  const [curFilterType, updCurFilterType] = useState<string>('iliteral_or');
  const [curFilterKey, updCurFilterKey] = useState<string>('');
  const [curFilterValue, updCurFilterValue] = useState<string>('');
  const [curFilterGroupBy, updCurFilterGroupBy] = useState<boolean>(false);

  const [errors, setErrors] = useState<string>('');

  const styles = useStyles2(getStyles);

  const filterTypesOptions = filterTypes.map((value: string) => toOption(value));

  function changeAddFilterMode() {
    updAddFilterMode(!addFilterMode);
  }

  function addFilter() {
    if (query.tags && size(query.tags) > 0) {
      const err = 'Please remove tags to use filters, tags and filters are mutually exclusive.';
      setErrors(err);
      return;
    }

    if (!addFilterMode) {
      updAddFilterMode(true);
      return;
    }

    // Add the filter to the query
    const currentFilter = {
      type: curFilterType,
      tagk: curFilterKey,
      filter: curFilterValue,
      groupBy: curFilterGroupBy,
    };

    // filters may be undefined
    query.filters = query.filters ? query.filters.concat([currentFilter]) : [currentFilter];

    // reset the inputs
    updCurFilterType('literal_or');
    updCurFilterKey('');
    updCurFilterValue('');
    updCurFilterGroupBy(false);

    // fire the query
    onChange(query);
    onRunQuery();

    // close the filter ditor
    changeAddFilterMode();
  }

  function removeFilter(index: number) {
    query.filters?.splice(index, 1);
    // fire the query
    onChange(query);
    onRunQuery();
  }

  function editFilter(fil: OpenTsdbFilter, idx: number) {
    removeFilter(idx);
    updCurFilterKey(fil.tagk);
    updCurFilterValue(fil.filter);
    updCurFilterType(fil.type);
    updCurFilterGroupBy(fil.groupBy);
    addFilter();
  }

  // We are matching words split with space
  const splitSeparator = ' ';
  const customFilterOption = useCallback((option: SelectableValue<string>, searchQuery: string) => {
    const label = option.value ?? '';

    const searchWords = searchQuery.split(splitSeparator);
    return searchWords.reduce((acc, cur) => acc && label.toLowerCase().includes(cur.toLowerCase()), true);
  }, []);

  const tagValueSearch = debounce((query: string) => suggestTagValues(query), 350);

  return (
    <Stack gap={0} data-testid={testIds.section}>
      <InlineFormLabel
        className={styles.queryKeyword}
        width={8}
        tooltip={<div>Filters does not work with tags, either of the two will work but not both.</div>}
      >
        Filters
      </InlineFormLabel>
      {query.filters &&
        query.filters.map((fil: OpenTsdbFilter, idx: number) => {
          return (
            <InlineFormLabel key={idx} width="auto" data-testid={testIds.list + idx}>
              {fil.tagk} = {fil.type}({fil.filter}), groupBy = {'' + fil.groupBy}
              <IconButton name="pen" aria-label="Edit filter" onClick={() => editFilter(fil, idx)} />
              <IconButton
                name="times"
                aria-label="Remove filter"
                onClick={() => removeFilter(idx)}
                data-testid={testIds.remove}
              />
            </InlineFormLabel>
          );
        })}
      {!addFilterMode && (
        <InlineFormLabel width={2}>
          <IconButton name="plus" aria-label="Add filter" onClick={changeAddFilterMode} />
        </InlineFormLabel>
      )}
      {addFilterMode && (
        <Stack gap={0.5} alignItems="center">
          <Stack gap={0}>
            <Select
              inputId="opentsdb-suggested-tagk-select"
              value={curFilterKey ? toOption(curFilterKey) : undefined}
              placeholder="key"
              allowCustomValue
              filterOption={customFilterOption}
              onOpenMenu={async () => {
                updKeyIsLoading(true);
                const tKs = await suggestTagKeys(query);
                const tKsOptions = tKs.map((value: string) => toOption(value));
                updTagKeys(tKsOptions);
                updKeyIsLoading(false);
              }}
              isLoading={keyIsLoading}
              options={tagKeys}
              onChange={({ value }) => {
                if (value) {
                  updCurFilterKey(value);
                }
              }}
            />
          </Stack>

          <Stack gap={0}>
            <InlineLabel className={cx(styles.width4, styles.queryKeyword)}>Type</InlineLabel>
            <Select
              inputId="opentsdb-aggregator-select"
              value={curFilterType ? toOption(curFilterType) : undefined}
              options={filterTypesOptions}
              onChange={({ value }) => {
                if (value) {
                  updCurFilterType(value);
                }
              }}
            />
          </Stack>

          <Stack gap={0}>
            <AsyncSelect
              inputId="opentsdb-suggested-tagv-select"
              value={curFilterValue ? toOption(curFilterValue) : undefined}
              placeholder="filter"
              allowCustomValue
              loadOptions={tagValueSearch}
              defaultOptions={[]}
              onChange={({ value }) => {
                if (value) {
                  updCurFilterValue(value);
                }
              }}
            />
          </Stack>

          <InlineFormLabel width={5} className={styles.queryKeyword}>
            Group by
          </InlineFormLabel>
          <InlineSwitch
            value={curFilterGroupBy}
            onChange={() => {
              // DO NOT RUN THE QUERY HERE
              // OLD FUNCTIONALITY RAN THE QUERY
              updCurFilterGroupBy(!curFilterGroupBy);
            }}
          />
          <Stack gap={0}>
            {errors && (
              <InlineLabel title={errors} data-testid={testIds.error}>
                <Icon name={'exclamation-triangle'} color={'rgb(229, 189, 28)'} />
              </InlineLabel>
            )}
            <InlineFormLabel width={5.5}>
              <Button variant="secondary" size="sm" onClick={addFilter}>
                add filter
              </Button>
              <IconButton name="times" aria-label="Cancel adding filter" onClick={changeAddFilterMode} />
            </InlineFormLabel>
          </Stack>
        </Stack>
      )}
      <Stack gap={0} grow={1}>
        <InlineLabel> </InlineLabel>
      </Stack>
    </Stack>
  );
}

export const testIds = {
  section: 'opentsdb-filter',
  list: 'opentsdb-filter-list',
  error: 'opentsdb-filter-error',
  remove: 'opentsdb-filter-remove',
};

const getStyles = (theme: GrafanaTheme2) => ({
  queryKeyword: css({
    color: theme.colors.primary.text,
  }),
  width4: css({
    width: `${theme.spacing(8)} !important`,
  }),
});
