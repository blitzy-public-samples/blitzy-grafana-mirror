import { type TimeRange, type TimeZone } from '@grafana/data';

export interface TimeModel {
  /**
   * Runtime time range. Historically typed as `any` because legacy persisted
   * dashboards may supply heterogeneous shapes (raw strings, partial RawTimeRange
   * objects, dashboard-defaults that have been merged from JSON) before the
   * dashboard model normalizes them. Existing tests in `TimeSrv.test.ts`
   * intentionally cover null / partial-shape inputs (e.g. `refresh_intervals: null`),
   * which a stricter type would reject without changing runtime behaviour.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- preserves null/partial shapes accepted by TimeSrv at runtime; tightening here breaks existing null-handling tests
  time: any;
  fiscalYearStartMonth?: number;
  refresh?: string;
  /**
   * Time picker configuration. Kept as `any` for the same reason as `time`:
   * the runtime accepts `null` and other partial shapes that the published
   * `TimePickerConfig` schema does not permit; tightening it cascades into
   * test files (which are out of scope) and breaks behaviour preservation.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- preserves null/partial shapes accepted at runtime; tightening to TimePickerConfig breaks existing tests that pass `refresh_intervals: null`
  timepicker: any;
  getTimezone(): TimeZone;
  timeRangeUpdated(timeRange: TimeRange): void;
}
