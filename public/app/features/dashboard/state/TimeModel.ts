import { type RawTimeRange, type TimeRange, type TimeZone } from '@grafana/data';
import { type TimePickerConfig } from '@grafana/schema';

export interface TimeModel {
  time: RawTimeRange;
  fiscalYearStartMonth?: number;
  refresh?: string;
  timepicker: TimePickerConfig;
  getTimezone(): TimeZone;
  timeRangeUpdated(timeRange: TimeRange): void;
}
