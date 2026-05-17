import type { JSX } from 'react';

import { Alert, type Column, InteractiveTable } from '@grafana/ui';

type Props = {
  onDismiss: () => void;
};

type MappingExample = {
  id: string;
  graphite: string;
  loki: string;
  /** Substrings within the Graphite query to highlight via <u>...</u>. Empty array = no highlights. */
  graphiteHighlight?: string[];
  /** Substrings within the Loki query to highlight via <u>...</u>. */
  lokiHighlight?: string[];
};

const mappingExamples: MappingExample[] = [
  {
    id: 'cluster-server',
    graphite: 'alias(servers.west.001.cpu,1,2)',
    loki: '{cluster="west", server="001"}',
    graphiteHighlight: ['west', '001'],
    lokiHighlight: ['west', '001'],
  },
  {
    id: 'glob-server',
    graphite: 'alias(servers.*.{001,002}.*,1,2)',
    loki: '{server=~"(001|002)"}',
    graphiteHighlight: ['{001,002}'],
    lokiHighlight: ['(001|002)'],
  },
  {
    id: 'tags',
    graphite: "interpolate(seriesByTag('foo=bar', 'server=002'), inf))",
    loki: '{foo="bar", server="002"}',
  },
];

/**
 * Renders a string as a <code> block, wrapping each occurrence of any string
 * in `highlights` with a <u>...</u> element to preserve the underline emphasis
 * used in the original static documentation table.
 */
function renderHighlightedCode(text: string, highlights: string[] = []): JSX.Element {
  if (highlights.length === 0) {
    return <code>{text}</code>;
  }

  // Split text into parts; each highlight string is replaced with an underlined node.
  let parts: Array<{ value: string; highlighted: boolean }> = [{ value: text, highlighted: false }];
  for (const highlight of highlights) {
    const newParts: Array<{ value: string; highlighted: boolean }> = [];
    for (const part of parts) {
      if (part.highlighted) {
        newParts.push(part);
        continue;
      }
      const idx = part.value.indexOf(highlight);
      if (idx === -1) {
        newParts.push(part);
        continue;
      }
      if (idx > 0) {
        newParts.push({ value: part.value.slice(0, idx), highlighted: false });
      }
      newParts.push({ value: highlight, highlighted: true });
      const after = part.value.slice(idx + highlight.length);
      if (after) {
        newParts.push({ value: after, highlighted: false });
      }
    }
    parts = newParts;
  }

  return (
    <code>
      {parts.map((part, index) =>
        part.highlighted ? <u key={index}>{part.value}</u> : <span key={index}>{part.value}</span>
      )}
    </code>
  );
}

const mappingExampleColumns: Array<Column<MappingExample>> = [
  {
    id: 'graphite',
    header: 'Graphite query',
    cell: ({ row }) => renderHighlightedCode(row.original.graphite, row.original.graphiteHighlight),
  },
  {
    id: 'loki',
    header: 'Mapped to Loki query',
    cell: ({ row }) => renderHighlightedCode(row.original.loki, row.original.lokiHighlight),
  },
];

export default function MappingsHelp(props: Props): JSX.Element {
  return (
    <Alert severity="info" title="How to map Graphite metrics to labels?" onRemove={props.onDismiss}>
      <p>Mappings are currently supported only between Graphite and Loki queries.</p>
      <p>
        When you switch your data source from Graphite to Loki, your queries are mapped according to the mappings
        defined in the example below. To define a mapping, write the full path of the metric and replace nodes you want
        to map to label with the label name in parentheses. The value of the label is extracted from your Graphite query
        when you switch data sources.
      </p>
      <p>
        All tags are automatically mapped to labels regardless of the mapping configuration. Graphite matching patterns
        (using &#123;&#125;) are converted to Loki&apos;s regular expressions matching patterns. When you use functions
        in your queries, the metrics, and tags are extracted to match them with defined mappings.
      </p>
      <p>
        Example: for a mapping = <code>servers.(cluster).(server).*</code>:
      </p>
      <InteractiveTable columns={mappingExampleColumns} data={mappingExamples} getRowId={(row) => row.id} />
    </Alert>
  );
}
