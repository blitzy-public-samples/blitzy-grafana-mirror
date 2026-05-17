import { css } from '@emotion/css';
import { memo, useReducer } from 'react';

import { type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import {
  Box,
  CodeEditor,
  type CodeEditorSuggestionItem,
  CodeEditorSuggestionItemKind,
  InlineFormLabel,
  LinkButton,
  type MonacoEditor,
  Segment,
  Stack,
  useStyles2,
} from '@grafana/ui';

import type InfluxDatasource from '../../../../datasource';
import { type InfluxQuery } from '../../../../types';

interface Props {
  onChange: (query: InfluxQuery) => void;
  query: InfluxQuery;
  // `datasource` is not used internally, but this component is used at some places
  // directly, where the `datasource` prop has to exist. later, when the whole
  // query-editor gets converted to react we can stop using this component directly
  // and then we can probably remove the datasource attribute.
  datasource: InfluxDatasource;
}

const samples: Array<SelectableValue<string>> = [
  { label: 'Show buckets', description: 'List the available buckets (table)', value: 'buckets()' },
  {
    label: 'Simple query',
    description: 'filter by measurement and field',
    value: `from(bucket: "db/rp")
  |> range(start: v.timeRangeStart, stop:v.timeRangeStop)
  |> filter(fn: (r) =>
    r._measurement == "example-measurement" and
    r._field == "example-field"
  )`,
  },
  {
    label: 'Grouped Query',
    description: 'Group by (min/max/sum/median)',
    value: `// v.windowPeriod is a variable referring to the current optimized window period (currently: $interval)
from(bucket: v.bucket)
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "measurement1" or r["_measurement"] =~ /^.*?regex.*$/)
  |> filter(fn: (r) => r["_field"] == "field2" or r["_field"] =~ /^.*?regex.*$/)
  |> aggregateWindow(every: v.windowPeriod, fn: mean|median|max|count|derivative|sum)
  |> yield(name: "some-name")`,
  },
  {
    label: 'Filter by value',
    description: 'Results between a min/max',
    value: `// v.bucket, v.timeRangeStart, and v.timeRange stop are all variables supported by the flux plugin and influxdb
from(bucket: v.bucket)
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_value"] >= 10 and r["_value"] <= 20)`,
  },
  {
    label: 'Schema Exploration: (measurements)',
    description: 'Get a list of measurement using flux',
    value: `import "influxdata/influxdb/v1"
v1.measurements(bucket: v.bucket)`,
  },
  {
    label: 'Schema Exploration: (fields)',
    description: 'Return every possible key in a single table',
    value: `from(bucket: v.bucket)
  |> range(start: v.timeRangeStart, stop:v.timeRangeStop)
  |> keys()
  |> keep(columns: ["_value"])
  |> group()
  |> distinct()`,
  },
  {
    label: 'Schema Exploration: (tag keys)',
    description: 'Get a list of tag keys using flux',
    value: `import "influxdata/influxdb/v1"
v1.tagKeys(bucket: v.bucket)`,
  },
  {
    label: 'Schema Exploration: (tag values)',
    description: 'Get a list of tag values using flux',
    value: `import "influxdata/influxdb/v1"
v1.tagValues(
    bucket: v.bucket,
    tag: "host",
    predicate: (r) => true,
    start: -1d
)`,
  },
];

// For some reason in angular, when this component gets re-mounted, the width
// is not set properly.  This forces the layout shortly after mount so that it
// displays OK.  Note: this is not an issue when used directly in react
const editorDidMountCallbackHack = (editor: MonacoEditor) => {
  setTimeout(() => editor.layout(), 100);
};

const FluxQueryEditorInternal = ({ query, onChange }: Props) => {
  const styles = useStyles2(getStyles);
  // useReducer-based forceUpdate replaces `this.forceUpdate()` from the
  // previous PureComponent. The reducer simply increments a counter to
  // schedule a re-render; the dispatched value is ignored.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const onFluxQueryChange = (newQuery: string) => {
    onChange({ ...query, query: newQuery });
  };

  const onSampleChange = (val: SelectableValue<string>) => {
    onChange({
      ...query,
      query: val.value!,
    });

    // Angular HACK: Since the target does not actually change!
    forceUpdate();
  };

  const getSuggestions = (): CodeEditorSuggestionItem[] => {
    const sugs: CodeEditorSuggestionItem[] = [
      {
        label: 'v.timeRangeStart',
        kind: CodeEditorSuggestionItemKind.Property,
        detail: 'The start time',
      },
      {
        label: 'v.timeRangeStop',
        kind: CodeEditorSuggestionItemKind.Property,
        detail: 'The stop time',
      },
      {
        label: 'v.windowPeriod',
        kind: CodeEditorSuggestionItemKind.Property,
        detail: 'based on max data points',
      },
      {
        label: 'v.defaultBucket',
        kind: CodeEditorSuggestionItemKind.Property,
        detail: 'bucket configured in the datsource',
      },
      {
        label: 'v.organization',
        kind: CodeEditorSuggestionItemKind.Property,
        detail: 'org configured for the datsource',
      },
    ];

    const templateSrv = getTemplateSrv();
    templateSrv.getVariables().forEach((variable) => {
      const label = '${' + variable.name + '}';
      let val = templateSrv.replace(label);
      if (val === label) {
        val = '';
      }
      sugs.push({
        label,
        kind: CodeEditorSuggestionItemKind.Text,
        detail: `(Template Variable) ${val}`,
      });
    });

    return sugs;
  };

  const helpTooltip = (
    <div>
      Type: <i>ctrl+space</i> to show template variable suggestions <br />
      Many queries can be copied from Chronograf
    </div>
  );

  return (
    <>
      <CodeEditor
        height={'100%'}
        containerStyles={styles.editorContainerStyles}
        language="sql"
        value={query.query || ''}
        onBlur={onFluxQueryChange}
        onSave={onFluxQueryChange}
        showMiniMap={false}
        showLineNumbers={true}
        getSuggestions={getSuggestions}
        onEditorDidMount={editorDidMountCallbackHack}
      />
      {/*
        The Stack below replaces the legacy `gf-form-inline` div wrapper.
        Stack omits `className` from its props (by design), so the
        marginTop styling lives on a thin `div` wrapper.
      */}
      <div className={styles.editorActions}>
        <Stack direction="row" wrap="wrap" alignItems="flex-start" gap={0.5}>
          <LinkButton
            icon="external-link-alt"
            variant="secondary"
            target="blank"
            href="https://docs.influxdata.com/influxdb/latest/query-data/get-started/"
          >
            Flux language syntax
          </LinkButton>
          <Segment options={samples} value="Sample query" onChange={onSampleChange} className={styles.segmentStyle} />
          {/* Flex spacer replacing the legacy `gf-form gf-form--grow` / `gf-form-label gf-form-label--grow` nested empty divs. */}
          <Box flex={1} />
          <InlineFormLabel width={5} tooltip={helpTooltip}>
            Help
          </InlineFormLabel>
        </Stack>
      </div>
    </>
  );
};

// React.memo preserves the shallow-prop-equality skip optimization that the
// previous `PureComponent` provided. No custom equality comparator is needed
// because the original class had no custom shouldComponentUpdate.
export const FluxQueryEditor = memo(FluxQueryEditorInternal);

const getStyles = (theme: GrafanaTheme2) => ({
  editorContainerStyles: css({
    height: '200px',
    maxWidth: '100%',
    resize: 'vertical',
    overflow: 'auto',
    backgroundColor: theme.isDark ? theme.colors.background.canvas : theme.colors.background.primary,
    paddingBottom: theme.spacing(1),
  }),
  editorActions: css({
    marginTop: theme.spacing(0.75),
  }),
  segmentStyle: css({
    marginTop: theme.spacing(-0.5),
    marginLeft: theme.spacing(0.5),
  }),
});
