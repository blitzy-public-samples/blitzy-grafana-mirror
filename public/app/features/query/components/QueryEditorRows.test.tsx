import { fireEvent, queryByLabelText, render, screen, waitFor } from '@testing-library/react';
import { type ComponentProps } from 'react';

import type { DataSourceApi } from '@grafana/data';
import type { DataSourceSrv, GetDataSourceListFilters } from '@grafana/runtime';
import { type DataSourceRef, type DataQuery } from '@grafana/schema';
import { mockDataSource } from 'app/features/alerting/unified/mocks';
import { DataSourceType } from 'app/features/alerting/unified/utils/datasource';
import createMockPanelData from 'app/plugins/datasource/azuremonitor/mocks/panelData';
import { MIXED_DATASOURCE_NAME } from 'app/plugins/datasource/mixed/MixedDataSource';

import { type QueryEditorRow } from './QueryEditorRow';
import { QueryEditorRows, type Props } from './QueryEditorRows';

// QueryEditorRows used to be a class component whose internal handlers
// (`onReplaceQuery`, `onDataSourceChange`) could be invoked directly on an
// instance constructed with `new QueryEditorRows(props)`. After the class
// → functional component conversion, those handlers are closures inside the
// component body. The handler-level tests below now render the component and
// invoke the equivalent props (`onReplace`, `onChangeDataSource`) on the
// captured child `QueryEditorRow` props — a direct one-to-one equivalent of
// the previous direct-method calls, because the original render method
// produced `onReplace={(query) => this.onReplaceQuery(query, index)}` and
// `onChangeDataSource={(settings) => this.onDataSourceChange(settings, index)}`.
//
// We replace `QueryEditorRow` with a deterministic stub that:
//   1. Captures the props each row receives so handler tests can invoke
//      `onReplace`/`onChangeDataSource` directly.
//   2. Renders the same accessible labels the existing UI tests look for
//      (`Collapse query row`, `Duplicate query`, `Remove query`).
//
// Using a stub here keeps these unit tests focused on the QueryEditorRows
// boundary (which callbacks it wires to its child rows) — the real
// QueryEditorRow has dedicated coverage in QueryEditorRow.test.tsx.
//
// Note: variable name MUST start with `mock` for jest.mock factory hoisting.
const mockCapturedQueryEditorRowProps: Array<ComponentProps<typeof QueryEditorRow>> = [];

jest.mock('./QueryEditorRow', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- props mirror QueryEditorRow's typed API; relaxed here for the stub
  const QueryEditorRowStub = (rowProps: any) => {
    mockCapturedQueryEditorRowProps.push(rowProps);
    const [expanded, setExpanded] = React.useState(true);
    return React.createElement(
      'div',
      { 'data-testid': 'query-editor-row' },
      React.createElement(
        'button',
        {
          key: 'collapse',
          type: 'button',
          'aria-label': 'Collapse query row',
          'aria-expanded': String(expanded),
          onClick: () => setExpanded((prev: boolean) => !prev),
        },
        'Collapse'
      ),
      React.createElement(
        'button',
        {
          key: 'duplicate',
          type: 'button',
          'aria-label': 'Duplicate query',
          onClick: () => {
            rowProps.onAddQuery?.(rowProps.query);
            rowProps.onQueryCopied?.();
          },
        },
        'Duplicate'
      ),
      React.createElement(
        'button',
        {
          key: 'remove',
          type: 'button',
          'aria-label': 'Remove query',
          onClick: () => {
            rowProps.onRemoveQuery?.(rowProps.query);
            rowProps.onQueryRemoved?.();
          },
        },
        'Remove'
      )
    );
  };
  return {
    QueryEditorRow: QueryEditorRowStub,
  };
});

const mockDS = mockDataSource({
  name: 'CloudManager',
  type: DataSourceType.Alertmanager,
});

const mockVariable = mockDataSource({
  name: '${dsVariable}',
  type: 'datasource',
});

const dsSrvMock: Pick<DataSourceSrv, 'get' | 'getList' | 'getInstanceSettings'> = {
  get: jest.fn(async () => ({ getDefaultQuery: undefined }) as unknown as DataSourceApi),
  getList: jest.fn((filters?: GetDataSourceListFilters) => (filters?.variables ? [mockDS, mockVariable] : [mockDS])),
  getInstanceSettings: jest.fn(() => mockDS),
};

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: () => dsSrvMock,
}));

const props: Props = {
  queries: [
    {
      datasource: mockDS,
      refId: 'A',
    },
    {
      datasource: mockDS,
      refId: 'B',
    },
  ],
  dsSettings: mockDataSource(),
  onQueriesChange: function (queries: DataQuery[]): void {
    throw new Error('Function not implemented.');
  },
  onAddQuery: function (query: DataQuery): void {
    throw new Error('Function not implemented.');
  },
  onRunQueries: function (): void {
    throw new Error('Function not implemented.');
  },
  onUpdateDatasources: function (datasource: DataSourceRef): void {
    throw new Error('Function not implemented.');
  },
  data: createMockPanelData(),
};

describe('QueryEditorRows', () => {
  beforeEach(() => {
    mockCapturedQueryEditorRowProps.length = 0;
  });

  it('Should call onQueriesChange with skipAutoImport when replacing query', () => {
    const onQueriesChangeMock = jest.fn();
    const onUpdateDatasourcesMock = jest.fn();
    const onRunQueriesMock = jest.fn();

    const testProps = {
      ...props,
      onQueriesChange: onQueriesChangeMock,
      onUpdateDatasources: onUpdateDatasourcesMock,
      onRunQueries: onRunQueriesMock,
    };

    render(<QueryEditorRows {...testProps} />);
    const rowAProps = mockCapturedQueryEditorRowProps.find((p) => p.query.refId === 'A');
    expect(rowAProps).toBeDefined();

    const replacementQuery = {
      refId: 'A',
      datasource: { uid: 'new-datasource', type: 'prometheus' },
      expr: 'new query content',
    };

    rowAProps!.onReplace!(replacementQuery);

    expect(onQueriesChangeMock).toHaveBeenCalledWith(
      [
        { ...replacementQuery, refId: 'A' }, // preserves original refId
        props.queries[1], // second query unchanged
      ],
      { skipAutoImport: true }
    );
  });

  it('Should call onUpdateDatasources when replacing query with different datasource creates mixed scenario', () => {
    const onQueriesChangeMock = jest.fn();
    const onUpdateDatasourcesMock = jest.fn();
    const onRunQueriesMock = jest.fn();

    const testProps = {
      ...props,
      onQueriesChange: onQueriesChangeMock,
      onUpdateDatasources: onUpdateDatasourcesMock,
      dsSettings: { ...props.dsSettings, uid: 'current-datasource' },
      queries: [
        { datasource: { uid: 'current-datasource', type: 'alertmanager' }, refId: 'A' },
        { datasource: { uid: 'current-datasource', type: 'alertmanager' }, refId: 'B' },
      ],
      onRunQueries: onRunQueriesMock,
    };

    render(<QueryEditorRows {...testProps} />);
    const rowAProps = mockCapturedQueryEditorRowProps.find((p) => p.query.refId === 'A');
    expect(rowAProps).toBeDefined();

    const replacementQuery = {
      refId: 'A',
      datasource: { uid: 'different-datasource', type: 'prometheus' },
      expr: 'new query content',
    };

    rowAProps!.onReplace!(replacementQuery);

    expect(onUpdateDatasourcesMock).toHaveBeenCalledWith({
      uid: MIXED_DATASOURCE_NAME,
    });
  });

  it('Should call onUpdateDatasources when replacing query results in single different datasource', () => {
    const onQueriesChangeMock = jest.fn();
    const onUpdateDatasourcesMock = jest.fn();
    const onRunQueriesMock = jest.fn();

    const testProps = {
      ...props,
      onQueriesChange: onQueriesChangeMock,
      onUpdateDatasources: onUpdateDatasourcesMock,
      onRunQueries: onRunQueriesMock,
      dsSettings: { ...props.dsSettings, uid: 'current-datasource' },
      queries: [{ datasource: { uid: 'current-datasource', type: 'alertmanager' }, refId: 'A' }],
    };

    render(<QueryEditorRows {...testProps} />);
    const rowAProps = mockCapturedQueryEditorRowProps.find((p) => p.query.refId === 'A');
    expect(rowAProps).toBeDefined();

    const replacementQuery = {
      refId: 'A',
      datasource: { uid: 'different-datasource', type: 'prometheus' },
      expr: 'new query content',
    };

    rowAProps!.onReplace!(replacementQuery);

    expect(onUpdateDatasourcesMock).toHaveBeenCalledWith({
      uid: 'different-datasource',
    });
  });

  it('Should not call onUpdateDatasources when replacing query with same datasource', () => {
    const onQueriesChangeMock = jest.fn();
    const onUpdateDatasourcesMock = jest.fn();
    const onRunQueriesMock = jest.fn();

    const testProps = {
      ...props,
      onQueriesChange: onQueriesChangeMock,
      onUpdateDatasources: onUpdateDatasourcesMock,
      onRunQueries: onRunQueriesMock,
      dsSettings: { ...props.dsSettings, uid: 'same-datasource' },
      queries: [
        { datasource: { uid: 'same-datasource', type: 'prometheus' }, refId: 'A' },
        { datasource: { uid: 'same-datasource', type: 'prometheus' }, refId: 'B' },
      ],
    };

    render(<QueryEditorRows {...testProps} />);
    const rowAProps = mockCapturedQueryEditorRowProps.find((p) => p.query.refId === 'A');
    expect(rowAProps).toBeDefined();

    const replacementQuery = {
      refId: 'A',
      datasource: { uid: 'same-datasource', type: 'prometheus' },
      expr: 'new query content',
    };

    rowAProps!.onReplace!(replacementQuery);

    expect(onUpdateDatasourcesMock).not.toHaveBeenCalled();
  });

  it('Should call onUpdateDatasources with mixed datasource when replacing creates mixed scenario', () => {
    const onQueriesChangeMock = jest.fn();
    const onUpdateDatasourcesMock = jest.fn();
    const onRunQueriesMock = jest.fn();

    const testProps = {
      ...props,
      onQueriesChange: onQueriesChangeMock,
      onUpdateDatasources: onUpdateDatasourcesMock,
      onRunQueries: onRunQueriesMock,
      dsSettings: { ...props.dsSettings, uid: 'current-datasource' },
      queries: [
        { datasource: { uid: 'datasource-1', type: 'loki' }, refId: 'A' },
        { datasource: { uid: 'datasource-2', type: 'test-data' }, refId: 'B' },
      ],
    };

    render(<QueryEditorRows {...testProps} />);
    const rowAProps = mockCapturedQueryEditorRowProps.find((p) => p.query.refId === 'A');
    expect(rowAProps).toBeDefined();

    const replacementQuery = {
      refId: 'A',
      datasource: { uid: 'datasource-3', type: 'prometheus' },
      expr: 'new query content',
    };

    rowAProps!.onReplace!(replacementQuery);

    expect(onUpdateDatasourcesMock).toHaveBeenCalledWith({
      uid: MIXED_DATASOURCE_NAME,
    });
  });

  it('Should render queries', async () => {
    const {
      renderResult: { rerender },
    } = renderScenario();
    expect(await screen.findAllByTestId('query-editor-row')).toHaveLength(2);

    rerender(
      <QueryEditorRows
        {...props}
        queries={[
          {
            datasource: mockDS,
            refId: 'A',
          },
        ]}
      />
    );

    expect(await screen.findAllByTestId('query-editor-row')).toHaveLength(1);
  });

  it('Should be able to expand and collapse queries', async () => {
    renderScenario();
    const queryEditorRows = await screen.findAllByTestId('query-editor-row');

    for (const childQuery of queryEditorRows) {
      const toggleExpandButton = queryByLabelText(childQuery, 'Collapse query row') as HTMLElement;

      expect(toggleExpandButton).toBeInTheDocument();
      expect(toggleExpandButton.getAttribute('aria-expanded')).toBe('true');

      fireEvent.click(toggleExpandButton);

      expect(toggleExpandButton.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('Should be able to duplicate queries', async () => {
    const onAddQuery = jest.fn();
    const onQueryCopied = jest.fn();

    renderScenario({ onAddQuery, onQueryCopied });
    const queryEditorRows = await screen.findAllByTestId('query-editor-row');
    queryEditorRows.map(async (childQuery) => {
      const duplicateQueryButton = queryByLabelText(childQuery, 'Duplicate query') as HTMLElement;

      expect(duplicateQueryButton).toBeInTheDocument();

      fireEvent.click(duplicateQueryButton);
    });

    expect(onAddQuery).toHaveBeenCalledTimes(queryEditorRows.length);
    expect(onQueryCopied).toHaveBeenCalledTimes(queryEditorRows.length);
  });

  it('Should be able to delete queries', async () => {
    const onQueriesChange = jest.fn();
    const onQueryRemoved = jest.fn();
    renderScenario({ onQueriesChange, onQueryRemoved });

    const queryEditorRows = await screen.findAllByTestId('query-editor-row');
    queryEditorRows.map(async (childQuery) => {
      const deleteQueryButton = queryByLabelText(childQuery, 'Remove query') as HTMLElement;

      expect(deleteQueryButton).toBeInTheDocument();

      fireEvent.click(deleteQueryButton);
    });

    expect(onQueriesChange).toHaveBeenCalledTimes(queryEditorRows.length);
    expect(onQueryRemoved).toHaveBeenCalledTimes(queryEditorRows.length);
  });

  it('Should call getDefaultQuery when changing datasource with mixed datasource enabled', async () => {
    const onQueriesChangeMock = jest.fn();

    const mixedDsSettings = mockDataSource(
      { name: MIXED_DATASOURCE_NAME, uid: MIXED_DATASOURCE_NAME },
      { mixed: true }
    );

    const getDefaultQuery = jest.fn(() => ({ defaultFromDS: 'yes' }));
    // Mutate singleton dsSrvMock to return a datasource that has getDefaultQuery
    dsSrvMock.get = jest.fn(() => Promise.resolve({ getDefaultQuery } as unknown as DataSourceApi));
    dsSrvMock.getInstanceSettings = jest.fn(() => ({ ...mockDS, type: 'alertmanager' }));

    render(<QueryEditorRows {...props} dsSettings={mixedDsSettings} onQueriesChange={onQueriesChangeMock} />);

    const rowAProps = mockCapturedQueryEditorRowProps.find((p) => p.query.refId === 'A');
    expect(rowAProps).toBeDefined();
    expect(rowAProps!.onChangeDataSource).toBeDefined();

    // Change to a different type than existing to trigger default query path
    const newDS = mockDataSource({ uid: 'prom', name: 'Prometheus', type: 'prometheus' });
    rowAProps!.onChangeDataSource!(newDS);

    await waitFor(() => expect(onQueriesChangeMock).toHaveBeenCalled());

    const updatedQueries = onQueriesChangeMock.mock.calls[0][0] as Array<DataQuery & { defaultFromDS?: string }>;
    expect(updatedQueries[0].defaultFromDS).toBe('yes');
    expect(getDefaultQuery).toHaveBeenCalledTimes(1);
  });
});

function renderScenario(overrides?: Partial<Props>) {
  Object.assign(props, overrides);

  return {
    renderResult: render(<QueryEditorRows {...props} />),
  };
}
