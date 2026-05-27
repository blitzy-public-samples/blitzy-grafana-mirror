import { css } from '@emotion/css';
import { Fragment, memo, useCallback, type ReactNode } from 'react';

import { type AdHocVariableFilter, type DataSourceRef, type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { Segment, useStyles2 } from '@grafana/ui';

import { AdHocFilterBuilder } from './AdHocFilterBuilder';
import { REMOVE_FILTER_KEY } from './AdHocFilterKey';
import { AdHocFilterRenderer } from './AdHocFilterRenderer';
import { ConditionSegment } from './ConditionSegment';

interface Props {
  datasource: DataSourceRef | null;
  filters: AdHocVariableFilter[];
  baseFilters?: AdHocVariableFilter[];
  addFilter: (filter: AdHocVariableFilter) => void;
  removeFilter: (index: number) => void;
  changeFilter: (index: number, newFilter: AdHocVariableFilter) => void;
  disabled?: boolean;
}

/**
 * Simple filtering component that automatically uses datasource APIs to get available labels and its values, for
 * dynamic visual filtering without need for much setup. Instead of having single onChange prop this reports all the
 * change events with separate props so it is usable with AdHocPicker.
 *
 * Note: There isn't API on datasource to suggest the operators here so that is hardcoded to use prometheus style
 * operators. Also filters are assumed to be joined with `AND` operator, which is also hardcoded.
 */
export const AdHocFilter = memo((props: Props) => {
  const { datasource, filters, baseFilters, addFilter, removeFilter, changeFilter, disabled } = props;

  const styles = useStyles2(getStyles);

  const getAllFilters = useCallback(() => {
    if (baseFilters) {
      return baseFilters.concat(filters);
    }
    return filters;
  }, [baseFilters, filters]);

  const onChange = useCallback(
    (index: number, prop: string) => (key: SelectableValue<string | null>) => {
      const { value } = key;
      if (key.value === REMOVE_FILTER_KEY) {
        return removeFilter(index);
      }
      return changeFilter(index, {
        ...filters[index],
        [prop]: value,
      });
    },
    [filters, removeFilter, changeFilter]
  );

  const appendFilterToVariable = useCallback(
    (filter: AdHocVariableFilter) => {
      addFilter(filter);
    },
    [addFilter]
  );

  const renderFilterSegments = (filter: AdHocVariableFilter, index: number, isDisabled?: boolean) => (
    <Fragment key={`filter-${index}`}>
      <AdHocFilterRenderer
        disabled={isDisabled}
        datasource={datasource!}
        filter={filter}
        onKeyChange={onChange(index, 'key')}
        onOperatorChange={onChange(index, 'operator')}
        onValueChange={onChange(index, 'value')}
        allFilters={getAllFilters()}
      />
    </Fragment>
  );

  const renderFilters = (filtersList: AdHocVariableFilter[], isDisabled?: boolean) => {
    if (filtersList.length === 0 && isDisabled) {
      return <Segment disabled={isDisabled} value="No filters" options={[]} onChange={() => {}} />;
    }
    return filtersList.reduce((segments: ReactNode[], filter, index) => {
      if (segments.length > 0) {
        segments.push(<ConditionSegment label="AND" key={`condition-${index}`} />);
      }
      segments.push(renderFilterSegments(filter, index, isDisabled));
      return segments;
    }, []);
  };

  return (
    <div className={styles.gfFormInline}>
      {renderFilters(filters, disabled)}

      {!disabled && (
        <AdHocFilterBuilder
          datasource={datasource!}
          appendBefore={filters.length > 0 ? <ConditionSegment label="AND" /> : null}
          onCompleted={appendFilterToVariable}
          allFilters={getAllFilters()}
        />
      )}
    </div>
  );
});

AdHocFilter.displayName = 'AdHocFilter';

const getStyles = (theme: GrafanaTheme2) => ({
  gfFormInline: css({
    display: 'flex',
    flexFlow: 'row wrap',
    alignItems: 'center',
  }),
});
