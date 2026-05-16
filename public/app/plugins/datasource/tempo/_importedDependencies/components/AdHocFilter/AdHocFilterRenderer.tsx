import { css } from '@emotion/css';

import { type AdHocVariableFilter, type DataSourceRef, type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

import { AdHocFilterKey } from './AdHocFilterKey';
import { AdHocFilterValue } from './AdHocFilterValue';
import { OperatorSegment } from './OperatorSegment';

interface Props {
  datasource: DataSourceRef;
  filter: AdHocVariableFilter;
  allFilters: AdHocVariableFilter[];
  onKeyChange: (item: SelectableValue<string | null>) => void;
  onOperatorChange: (item: SelectableValue<string>) => void;
  onValueChange: (item: SelectableValue<string>) => void;
  placeHolder?: string;
  disabled?: boolean;
}

export const AdHocFilterRenderer = ({
  datasource,
  filter: { key, operator, value },
  onKeyChange,
  onOperatorChange,
  onValueChange,
  placeHolder,
  allFilters,
  disabled,
}: Props) => {
  const styles = useStyles2(getStyles);

  return (
    <>
      <AdHocFilterKey
        disabled={disabled}
        datasource={datasource}
        filterKey={key}
        onChange={onKeyChange}
        allFilters={allFilters}
      />
      <div className={styles.gfForm}>
        <OperatorSegment disabled={disabled} value={operator} onChange={onOperatorChange} />
      </div>
      <AdHocFilterValue
        disabled={disabled}
        datasource={datasource}
        filterKey={key}
        filterValue={value}
        allFilters={allFilters}
        onChange={onValueChange}
        placeHolder={placeHolder}
      />
    </>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  gfForm: css({
    display: 'flex',
    flexFlow: 'row nowrap',
    marginBottom: theme.spacing(0.5),
    paddingTop: theme.spacing(0.25),
    paddingBottom: theme.spacing(0.25),
  }),
});
