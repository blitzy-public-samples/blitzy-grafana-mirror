import { isNumber, isFinite, escape } from 'lodash';

import {
  type DecimalCount,
  formattedValueToString,
  getValueFormat,
  stringToJsRegex,
  type ValueFormatter,
} from '@grafana/data';

/**
 * Single legacy datapoint tuple: `[value, timestamp]`. Both elements may be
 * `null` in legacy flot data because gaps and missing timestamps were always
 * permitted by the historical flot-based panels that consume this class.
 */
type TimeSeriesPoint = [number | null, number | null];

/**
 * Aggregated statistics computed by {@link TimeSeries.getFlotPairs}. Field
 * names and shapes mirror the legacy flot stats object that older panels
 * (graph, singlestat, etc.) rely on. Fields that the calculation explicitly
 * resets to `null` when no data is present remain nullable; running counters
 * such as `total`, `delta`, and `diffperc` are always numeric.
 */
interface TimeSeriesStats {
  total: number;
  max: number | null;
  min: number | null;
  logmin: number;
  avg: number | null;
  current: number | null;
  first: number | null;
  delta: number;
  diff: number | null;
  diffperc: number;
  range: number | null;
  timeStep: number;
  count?: number;
}

/** Legacy flot lines configuration consumed by graph-style panels. */
interface SeriesLines {
  show?: boolean;
  lineWidth?: number;
  fill?: number;
  fillColor?: string | { colors: Array<{ opacity: number }> } | null;
  steps?: boolean;
}

/** Legacy flot dashes configuration. `dashLength` may be sparsely populated. */
interface SeriesDashes {
  show?: boolean;
  lineWidth?: number;
  dashLength: number[];
}

/** Legacy flot bars configuration. */
interface SeriesBars {
  show?: boolean;
  fillColor?: string;
}

/** Legacy flot points configuration. */
interface SeriesPoints {
  show?: boolean;
  radius?: number;
}

/**
 * Per-series override entry consumed by
 * {@link TimeSeries.applySeriesOverrides}. Field shapes match the override
 * objects produced by the legacy graph-panel editor.
 */
interface SeriesOverride {
  alias?: string;
  lines?: boolean;
  dashes?: boolean;
  points?: boolean;
  bars?: boolean;
  fill?: number;
  fillGradient?: number;
  stack?: boolean | string | number;
  linewidth?: number;
  dashLength?: number;
  spaceLength?: number;
  nullPointMode?: string;
  pointradius?: number;
  steppedLine?: boolean;
  zindex?: number;
  fillBelowTo?: string;
  color?: string;
  transform?: string;
  legend?: boolean;
  hideTooltip?: boolean;
  yaxis?: number;
  hiddenSeries?: boolean;
}

/** Options for {@link TimeSeries.hideFromLegend}. */
interface HideFromLegendOptions {
  hideEmpty?: boolean;
  hideZero?: boolean;
}

/** Constructor options for {@link TimeSeries}. */
interface TimeSeriesOptions {
  datapoints: TimeSeriesPoint[];
  alias?: string;
  color?: string;
  unit?: string;
  dataFrameIndex?: number;
  fieldIndex?: number;
}

/**
 * Minimal panel-options shape required by {@link updateLegendValues}. Only
 * the legend-decimals-related fields are read; the rest of the legacy panel
 * options object is irrelevant here.
 */
interface LegendUpdatePanelOptions {
  yaxes: Array<{ format?: string; decimals?: DecimalCount }>;
  decimals?: DecimalCount;
}

// `aliasOrRegex` is widened to `string | undefined` because legacy override
// objects may omit `alias` entirely. The leading falsy-guard already handled
// `undefined` at runtime; the previous `any` typing masked this nuance.
function matchSeriesOverride(aliasOrRegex: string | undefined, seriesAlias: string) {
  if (!aliasOrRegex) {
    return false;
  }

  if (aliasOrRegex[0] === '/') {
    const regex = stringToJsRegex(aliasOrRegex);
    return seriesAlias.match(regex) != null;
  }

  return aliasOrRegex === seriesAlias;
}

function translateFillOption(fill: number) {
  return fill === 0 ? 0.001 : fill / 10;
}

function getFillGradient(amount: number) {
  if (!amount) {
    return null;
  }

  return {
    colors: [{ opacity: 0.0 }, { opacity: amount / 10 }],
  };
}

/**
 * Calculate decimals for legend and update values for each series.
 * @param data series data
 * @param panel
 * @param height
 */
export function updateLegendValues(data: TimeSeries[], panel: LegendUpdatePanelOptions, height: number) {
  for (let i = 0; i < data.length; i++) {
    const series = data[i];
    const yaxes = panel.yaxes;
    const seriesYAxis = series.yaxis || 1;
    const axis = yaxes[seriesYAxis - 1];
    const formatter = getValueFormat(axis.format);

    // decimal override
    if (isNumber(panel.decimals)) {
      series.updateLegendValues(formatter, panel.decimals);
    } else if (isNumber(axis.decimals)) {
      series.updateLegendValues(formatter, axis.decimals + 1);
    } else {
      series.updateLegendValues(formatter, null);
    }
  }
}

/**
 * @deprecated: This class should not be used in new panels
 *
 * Use DataFrame and helpers instead
 */
export default class TimeSeries {
  datapoints: TimeSeriesPoint[];
  id: string;
  // Represents index of original data frame in the quey response
  dataFrameIndex: number;
  // Represents index of field in the data frame
  fieldIndex: number;
  label: string;
  alias: string;
  aliasEscaped: string;
  color?: string;
  valueFormater: ValueFormatter;
  // `stats` is initialized in the constructor with sentinel defaults so that
  // `getFlotPairs()` can write to its fields without dereferencing `undefined`.
  // The legacy implementation initialized `stats` to `{}` and relied on
  // `getFlotPairs` overwriting every field before any external read; the
  // populated default object preserves that contract while satisfying the
  // strengthened `TimeSeriesStats` typing.
  stats: TimeSeriesStats;
  legend: boolean;
  hideTooltip?: boolean;
  allIsNull?: boolean;
  allIsZero?: boolean;
  decimals: DecimalCount;
  hasMsResolution: boolean;
  isOutsideRange?: boolean;

  // The following fields are only populated by `applySeriesOverrides()` and
  // are accessed only after that method runs. Definite-assignment
  // assertions preserve the existing runtime semantics where these fields
  // are `undefined` until overrides are applied.
  lines!: SeriesLines;
  hiddenSeries?: boolean;
  dashes!: SeriesDashes;
  bars: SeriesBars;
  points!: SeriesPoints;
  yaxis!: number;
  zindex!: number;
  stack?: boolean | string | number;
  nullPointMode!: string | null;
  fillBelowTo?: string;
  transform?: string;
  flotpairs?: Array<[number | null, number | null]>;
  unit?: string;

  constructor(opts: TimeSeriesOptions) {
    this.datapoints = opts.datapoints;
    // Historically `opts.alias` is mandatory in production code paths but
    // omitted by some legacy tests. The non-null assertions preserve the
    // pre-existing runtime behavior of assigning `undefined` to these
    // fields when callers omit `alias`; consumers either set `alias`
    // explicitly afterward or never read these fields.
    this.label = opts.alias!;
    this.id = opts.alias!;
    this.alias = opts.alias!;
    this.aliasEscaped = escape(opts.alias);
    this.color = opts.color;
    this.bars = { fillColor: opts.color };
    this.valueFormater = getValueFormat('none');
    // Initialize `stats` with sentinel defaults matching the
    // `TimeSeriesStats` shape. The legacy code wrote `this.stats = {}` and
    // relied on `getFlotPairs()` to populate every field on first use; this
    // typed initialization preserves the same "every field defined after
    // getFlotPairs" contract without resorting to a banned type assertion.
    this.stats = {
      total: 0,
      max: null,
      min: null,
      logmin: 0,
      avg: null,
      current: null,
      first: null,
      delta: 0,
      diff: null,
      diffperc: 0,
      range: null,
      timeStep: 0,
    };
    this.legend = true;
    this.unit = opts.unit;
    this.dataFrameIndex = opts.dataFrameIndex!;
    this.fieldIndex = opts.fieldIndex!;
    this.hasMsResolution = this.isMsResolutionNeeded();
  }

  applySeriesOverrides(overrides: SeriesOverride[]) {
    this.lines = {};
    this.dashes = {
      dashLength: [],
    };
    this.points = {};
    this.yaxis = 1;
    this.zindex = 0;
    this.nullPointMode = null;
    delete this.stack;
    delete this.bars.show;

    for (let i = 0; i < overrides.length; i++) {
      const override = overrides[i];
      if (!matchSeriesOverride(override.alias, this.alias)) {
        continue;
      }
      if (override.lines !== void 0) {
        this.lines.show = override.lines;
      }
      if (override.dashes !== void 0) {
        this.dashes.show = override.dashes;
        this.lines.lineWidth = 0;
      }
      if (override.points !== void 0) {
        this.points.show = override.points;
      }
      if (override.bars !== void 0) {
        this.bars.show = override.bars;
      }
      if (override.fill !== void 0) {
        this.lines.fill = translateFillOption(override.fill);
      }
      if (override.fillGradient !== void 0) {
        this.lines.fillColor = getFillGradient(override.fillGradient);
      }
      if (override.stack !== void 0) {
        this.stack = override.stack;
      }
      if (override.linewidth !== void 0) {
        this.lines.lineWidth = this.dashes.show ? 0 : override.linewidth;
        this.dashes.lineWidth = override.linewidth;
      }
      if (override.dashLength !== void 0) {
        this.dashes.dashLength[0] = override.dashLength;
      }
      if (override.spaceLength !== void 0) {
        this.dashes.dashLength[1] = override.spaceLength;
      }
      if (override.nullPointMode !== void 0) {
        this.nullPointMode = override.nullPointMode;
      }
      if (override.pointradius !== void 0) {
        this.points.radius = override.pointradius;
      }
      if (override.steppedLine !== void 0) {
        this.lines.steps = override.steppedLine;
      }
      if (override.zindex !== void 0) {
        this.zindex = override.zindex;
      }
      if (override.fillBelowTo !== void 0) {
        this.fillBelowTo = override.fillBelowTo;
      }
      if (override.color !== void 0) {
        this.setColor(override.color);
      }
      if (override.transform !== void 0) {
        this.transform = override.transform;
      }
      if (override.legend !== void 0) {
        this.legend = override.legend;
      }
      if (override.hideTooltip !== void 0) {
        this.hideTooltip = override.hideTooltip;
      }

      if (override.yaxis !== void 0) {
        this.yaxis = override.yaxis;
      }
      if (override.hiddenSeries !== void 0) {
        this.hiddenSeries = override.hiddenSeries;
      }
    }
  }

  getFlotPairs(fillStyle: string) {
    const result = [];

    this.stats.total = 0;
    this.stats.max = -Number.MAX_VALUE;
    this.stats.min = Number.MAX_VALUE;
    this.stats.logmin = Number.MAX_VALUE;
    this.stats.avg = null;
    this.stats.current = null;
    this.stats.first = null;
    this.stats.delta = 0;
    this.stats.diff = null;
    this.stats.diffperc = 0;
    this.stats.range = null;
    this.stats.timeStep = Number.MAX_VALUE;
    this.allIsNull = true;
    this.allIsZero = true;

    const ignoreNulls = fillStyle === 'connected';
    const nullAsZero = fillStyle === 'null as zero';
    let currentTime;
    let currentValue;
    let nonNulls = 0;
    let previousTime;
    let previousValue = 0;
    let previousDeltaUp = true;

    for (let i = 0; i < this.datapoints.length; i++) {
      currentValue = this.datapoints[i][0];
      currentTime = this.datapoints[i][1];

      // Due to missing values we could have different timeStep all along the series
      // so we have to find the minimum one (could occur with aggregators such as ZimSum)
      if (previousTime !== undefined) {
        // `currentTime` and `previousTime` are derived from `this.datapoints[i][1]`
        // which is typed `number | null`. In practice timestamps are always
        // numeric in production data; the non-null assertions express that
        // runtime invariant while preserving the original `null - null === 0`
        // JavaScript semantics in the edge case where a `null` timestamp does
        // appear (assertions are erased at compile time).
        const timeStep = currentTime! - previousTime!;
        if (timeStep < this.stats.timeStep) {
          this.stats.timeStep = timeStep;
        }
      }
      previousTime = currentTime;

      if (currentValue === null) {
        if (ignoreNulls) {
          continue;
        }
        if (nullAsZero) {
          currentValue = 0;
        }
      }

      if (currentValue !== null) {
        if (isNumber(currentValue)) {
          this.stats.total += currentValue;
          this.allIsNull = false;
          nonNulls++;
        }

        if (currentValue > this.stats.max) {
          this.stats.max = currentValue;
        }

        if (currentValue < this.stats.min) {
          this.stats.min = currentValue;
        }

        if (this.stats.first === null) {
          this.stats.first = currentValue;
        } else {
          if (previousValue > currentValue) {
            // counter reset
            previousDeltaUp = false;
            if (i === this.datapoints.length - 1) {
              // reset on last
              this.stats.delta += currentValue;
            }
          } else {
            if (previousDeltaUp) {
              this.stats.delta += currentValue - previousValue; // normal increment
            } else {
              this.stats.delta += currentValue; // account for counter reset
            }
            previousDeltaUp = true;
          }
        }
        previousValue = currentValue;

        if (currentValue < this.stats.logmin && currentValue > 0) {
          this.stats.logmin = currentValue;
        }

        if (currentValue !== 0) {
          this.allIsZero = false;
        }
      }

      result.push([currentTime, currentValue]);
    }

    if (this.stats.max === -Number.MAX_VALUE) {
      this.stats.max = null;
    }
    if (this.stats.min === Number.MAX_VALUE) {
      this.stats.min = null;
    }

    if (result.length && !this.allIsNull) {
      this.stats.avg = this.stats.total / nonNulls;
      this.stats.current = result[result.length - 1][1];
      if (this.stats.current === null && result.length > 1) {
        this.stats.current = result[result.length - 2][1];
      }
    }
    if (this.stats.max !== null && this.stats.min !== null) {
      this.stats.range = this.stats.max - this.stats.min;
    }
    if (this.stats.current !== null && this.stats.first !== null) {
      this.stats.diff = this.stats.current - this.stats.first;
      this.stats.diffperc = this.stats.diff / this.stats.first;
    }

    this.stats.count = result.length;
    return result;
  }

  updateLegendValues(formater: ValueFormatter, decimals: DecimalCount) {
    this.valueFormater = formater;
    this.decimals = decimals;
  }

  formatValue(value: number | null) {
    if (!isFinite(value)) {
      value = null; // Prevent NaN formatting
    }
    // The runtime `ValueFormatter` (produced by `getValueFormat`/`toFixedUnit`)
    // begins with `if (size === null) return { text: '' };`, so passing `null`
    // through is safe at runtime even though the public `ValueFormatter` type
    // declares `value: number`. The non-null assertion preserves byte-identical
    // behavior; the previous `any` typing masked the signature mismatch.
    return formattedValueToString(this.valueFormater(value!, this.decimals));
  }

  isMsResolutionNeeded() {
    for (let i = 0; i < this.datapoints.length; i++) {
      // Hoist the (possibly null) timestamp into a local so the narrowing flows
      // into the modulus expression. The legacy code applied `% 1000` to the
      // stringified form, relying on JavaScript's implicit string-to-number
      // coercion. Applying the modulus to the numeric form produces the same
      // result for the always-numeric timestamps that reach this check.
      const timeValue = this.datapoints[i][1];
      if (timeValue !== null && timeValue !== undefined) {
        const timestamp = timeValue.toString();
        if (timestamp.length === 13 && timeValue % 1000 !== 0) {
          return true;
        }
      }
    }
    return false;
  }

  hideFromLegend(options: HideFromLegendOptions) {
    if (options.hideEmpty && this.allIsNull) {
      return true;
    }
    // ignore series excluded via override
    if (!this.legend) {
      return true;
    }

    // ignore zero series
    if (options.hideZero && this.allIsZero) {
      return true;
    }

    return false;
  }

  setColor(color: string) {
    this.color = color;
    this.bars.fillColor = color;
  }
}
