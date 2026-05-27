import { useMemo } from 'react';

import { type SQLQuery, SqlQueryEditorLazy, applyQueryDefaults } from '@grafana/sql';
import { InlineFormLabel, LinkButton, Stack, Space } from '@grafana/ui';

import type InfluxDatasource from '../../../../datasource';
import { FlightSQLDatasource } from '../../../../fsql/datasource.flightsql';
import { type InfluxQuery } from '../../../../types';

interface Props {
  onChange: (query: InfluxQuery) => void;
  onRunQuery: () => void;
  query: InfluxQuery;
  datasource: InfluxDatasource;
}

const transformQuery = (query: InfluxQuery & SQLQuery): SQLQuery => {
  const defaultQuery = applyQueryDefaults(query);
  return {
    ...defaultQuery,
    dataset: 'iox',
    sql: {
      ...defaultQuery.sql,
      limit: undefined,
    },
  };
};

export const FSQLEditor = ({ query, onChange, onRunQuery, datasource }: Props) => {
  const flightSqlDatasource = useMemo(() => {
    return new FlightSQLDatasource(
      {
        url: datasource.urls[0],
        access: datasource.access,

        jsonData: {
          // TODO Clean this
          allowCleartextPasswords: false,
          tlsAuth: false,
          tlsAuthWithCACert: false,
          tlsSkipVerify: false,
          maxIdleConns: 1,
          maxOpenConns: 1,
          maxIdleConnsAuto: true,
          connMaxLifetime: 1,
          timezone: '',
          user: '',
          database: '',
          url: datasource.urls[0],
          timeInterval: '',
        },
        meta: datasource.meta,
        name: datasource.name,
        readOnly: false,
        type: datasource.type,
        uid: datasource.uid,
      },
      datasource.templateSrv
    );
  }, [datasource]);

  const onRunSQLQuery = () => {
    return onRunQuery();
  };

  const onSQLChange = (query: SQLQuery) => {
    // query => rawSql for now
    onChange({ ...query });
  };

  const helpTooltip = (
    <div>
      Type: <i>ctrl+space</i> to show template variable suggestions <br />
      Many queries can be copied from Chronograf
    </div>
  );

  return (
    <>
      <SqlQueryEditorLazy
        datasource={flightSqlDatasource}
        query={transformQuery(query)}
        onRunQuery={onRunSQLQuery}
        onChange={onSQLChange}
        queryHeaderProps={{ dialect: 'influx' }}
      />
      <Space v={0.5} />
      <Stack flex={1} gap={4} justifyContent="space-between">
        <LinkButton
          icon="external-link-alt"
          variant="secondary"
          target="blank"
          href="https://docs.influxdata.com/influxdb/cloud-serverless/query-data/sql/"
        >
          SQL language syntax
        </LinkButton>

        <InlineFormLabel width={5} tooltip={helpTooltip}>
          Help
        </InlineFormLabel>
      </Stack>
    </>
  );
};
