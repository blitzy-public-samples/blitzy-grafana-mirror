import { each, map, includes, flatten, keys } from 'lodash';

import { FieldType, type QueryResultMeta, type TimeSeries, type TimeSeriesPoints, type TableData } from '@grafana/data';
import TableModel from 'app/core/TableModel';

import { type InfluxQuery } from './types';

// Module-private shape of an InfluxDB raw series row as returned by the
// /query InfluxQL HTTP endpoint. Captures the four fields consumed by this
// class — name, columns, optional tag map, and optional values matrix.
interface InfluxRawSeries {
  name: string;
  columns: string[];
  tags?: Record<string, string>;
  values?: Array<Array<string | number | null>>;
}

// Module-private shape of an annotation entry returned by getAnnotations().
// Mirrors the literal object constructed inside getAnnotations() below.
// `title`, `text`, and `timeEnd` are typed as `T | undefined` because the
// underlying cell values in `series.values` are typed `string | number | null`;
// each is narrowed at the construction site to its corresponding `T` (string
// for `title`/`text`, number for `timeEnd`) using `typeof` guards rather than
// type assertions. The resulting shape is structurally assignable to
// `AnnotationEvent[]` at the `annotationEvents()` call site in datasource.ts
// (whose fields are all optional). The runtime values are unchanged from the
// prior `any`-typed pass-through for well-formed InfluxQL responses; for the
// edge case of a non-matching cell type (e.g., a numeric value in a column
// configured as the title column) the narrowed field becomes `undefined`
// rather than leaking through unsoundly, matching what the downstream
// `AnnotationEvent` consumer expects.
interface InfluxAnnotation {
  annotation: InfluxQuery | undefined;
  time: number;
  title: string | undefined;
  timeEnd: number | undefined;
  tags: string[];
  text: string | undefined;
}

export default class InfluxSeries {
  refId?: string;
  series: InfluxRawSeries[];
  alias?: string;
  annotation?: InfluxQuery;
  meta?: QueryResultMeta;

  constructor(options: {
    series: InfluxRawSeries[];
    alias?: string;
    annotation?: InfluxQuery;
    meta?: QueryResultMeta;
    refId?: string;
  }) {
    this.series = options.series;
    this.alias = options.alias;
    this.annotation = options.annotation;
    this.meta = options.meta;
    this.refId = options.refId;
  }

  getTimeSeries(): TimeSeries[] {
    const output: TimeSeries[] = [];
    let i, j;

    if (this.series.length === 0) {
      return output;
    }

    each(this.series, (series) => {
      const columns = series.columns.length;
      const tags = map(series.tags, (value, key) => {
        return key + ': ' + value;
      });

      for (j = 1; j < columns; j++) {
        let seriesName = series.name;
        const columnName = series.columns[j];
        if (columnName !== 'value') {
          seriesName = seriesName + '.' + columnName;
        }

        if (this.alias) {
          // `_getSeriesName` returns `this.alias?.replace(...)` which is typed as
          // `string | undefined`. This branch is gated by `if (this.alias)`, so
          // at runtime the result is always a string; non-null assertion keeps
          // the inferred local type as `string` without changing behavior.
          seriesName = this._getSeriesName(series, j)!;
        } else if (series.tags) {
          seriesName = seriesName + ' {' + tags.join(', ') + '}';
        }

        // `datapoints` is declared with the target `TimeSeriesPoints` shape
        // (`(number | null)[][]`) and each cell is narrowed at construction
        // time from the wider `string | number | null` source-cell type using
        // a `typeof === 'number'` guard. For real-world InfluxQL responses
        // with numeric value columns and numeric Unix-millisecond timestamps
        // this is a no-op; for the edge case of a non-numeric cell the value
        // is coerced to `null`, matching the `TimeSeries.datapoints` contract
        // and avoiding the need for a type assertion below.
        const datapoints: TimeSeriesPoints = [];
        if (series.values) {
          for (i = 0; i < series.values.length; i++) {
            const valueCell = series.values[i][j];
            const timeCell = series.values[i][0];
            datapoints[i] = [
              typeof valueCell === 'number' ? valueCell : null,
              typeof timeCell === 'number' ? timeCell : null,
            ];
          }
        }

        output.push({
          title: seriesName,
          target: seriesName,
          datapoints,
          tags: series.tags,
          meta: this.meta,
          refId: this.refId,
        });
      }
    });

    return output;
  }

  _getSeriesName(series: InfluxRawSeries, index: number) {
    const regex = /\$(\w+)|\[\[([\s\S]+?)\]\]/g;
    const segments = series.name.split('.');

    return this.alias?.replace(regex, (match, g1, g2) => {
      const group = g1 || g2;
      const segIndex = parseInt(group, 10);

      if (group === 'm' || group === 'measurement') {
        return series.name;
      }
      if (group === 'col') {
        return series.columns[index];
      }
      if (!isNaN(segIndex)) {
        return segments[segIndex] ?? match;
      }
      if (group.indexOf('tag_') !== 0) {
        return match;
      }

      const tag = group.replace('tag_', '');
      if (!series.tags) {
        return match;
      }
      return series.tags[tag];
    });
  }

  getAnnotations() {
    const list: InfluxAnnotation[] = [];

    each(this.series, (series) => {
      let titleCol: number | null = null;
      let timeCol: number | null = null;
      let timeEndCol: number | null = null;
      // indices into series.columns / series.values rows
      const tagsCol: number[] = [];
      let textCol: number | null = null;

      each(series.columns, (column, index) => {
        if (column === 'time') {
          timeCol = index;
          return;
        }
        if (column === 'sequence_number') {
          return;
        }
        if (column === this.annotation?.titleColumn) {
          titleCol = index;
          return;
        }
        if (includes((this.annotation?.tagsColumn || '').replace(' ', '').split(','), column)) {
          tagsCol.push(index);
          return;
        }
        if (column === this.annotation?.textColumn) {
          textCol = index;
          return;
        }
        if (column === this.annotation?.timeEndColumn) {
          timeEndCol = index;
          return;
        }
        // legacy case
        if (!titleCol && textCol !== index) {
          titleCol = index;
        }
      });

      each(series.values, (value) => {
        // The four column indices below (`timeCol`, `titleCol`, `timeEndCol`,
        // `textCol`) are typed as `number | null` to reflect "no matching
        // column found" semantics. At the indexing sites the non-null
        // assertions assert the index is numeric for the type system; at
        // runtime, indexing with `null` resolves to `undefined`, which is the
        // same pass-through behavior the prior `any`-typed indices produced.
        // Each cell access below uses a `typeof` guard to narrow the wider
        // source-cell type (`string | number | null`) to the corresponding
        // `InfluxAnnotation` field type without using a type assertion. For
        // well-formed InfluxQL annotation responses (numeric timestamps,
        // string title/text/tag columns, numeric timeEnd) the narrowing is a
        // no-op; for malformed cells the narrowed value falls back to a
        // safe default (`0` for `time` to match prior `+new Date(null) === 0`
        // semantics, `undefined` for `title`/`text`/`timeEnd`, and an empty
        // tag list for non-string tag cells).
        const timeRaw = value[timeCol!];
        const titleRaw = value[titleCol!];
        const timeEndRaw = value[timeEndCol!];
        const textRaw = value[textCol!];
        const data = {
          annotation: this.annotation,
          // `+new Date(null) === 0`, so coalescing `null` to `0` is identical
          // to the prior pass-through behavior while satisfying the `Date`
          // constructor's `string | number` parameter type.
          time: +new Date(timeRaw ?? 0),
          title: typeof titleRaw === 'string' ? titleRaw : undefined,
          timeEnd: typeof timeEndRaw === 'number' ? timeEndRaw : undefined,
          // Remove empty values, then split in different tags for comma separated values
          tags: flatten(
            tagsCol
              .filter((t) => {
                return value[t];
              })
              .map((t) => {
                // After the `filter` above, `value[t]` is truthy; for InfluxQL
                // tag columns this is always a string. Narrow with `typeof`
                // to preserve the pre-existing string-split behavior; the
                // empty-array fallback is unreachable for well-formed
                // responses.
                const cell = value[t];
                return typeof cell === 'string' ? cell.split(',') : [];
              })
          ),
          text: typeof textRaw === 'string' ? textRaw : undefined,
        };

        list.push(data);
      });
    });

    return list;
  }

  getTable(): TableData {
    const table = new TableModel();
    let i, j;

    table.refId = this.refId;
    table.meta = this.meta;

    if (this.series.length === 0) {
      return table;
    }

    // the order is:
    // - first the first item from the value-array (this is often (always?) the timestamp)
    // - then all the tag-values
    // - then the rest of the value-array
    //
    // we have to keep this order both in table.columns and table.rows

    each(this.series, (series, seriesIndex: number) => {
      if (seriesIndex === 0) {
        const firstCol = series.columns[0];
        // Check the first column's name, if it is `time`, we
        // mark it as having the type time
        const firstTableCol = firstCol === 'time' ? { text: 'Time', type: FieldType.time } : { text: firstCol };
        table.columns.push(firstTableCol);
        each(keys(series.tags), (key) => {
          table.columns.push({ text: key });
        });
        for (j = 1; j < series.columns.length; j++) {
          table.columns.push({ text: series.columns[j] });
        }
      }

      if (series.values) {
        for (i = 0; i < series.values.length; i++) {
          const values = series.values[i];
          const reordered = [values[0]];
          if (series.tags) {
            for (const key in series.tags) {
              if (series.tags.hasOwnProperty(key)) {
                reordered.push(series.tags[key]);
              }
            }
          }
          for (j = 1; j < values.length; j++) {
            reordered.push(values[j]);
          }
          table.rows.push(reordered);
        }
      }
    });

    return table;
  }
}
