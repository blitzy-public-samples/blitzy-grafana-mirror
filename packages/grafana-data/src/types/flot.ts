export interface FlotDataPoint {
  dataIndex: number;
  datapoint: number[];
  pageX: number;
  pageY: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `series` is an opaque flot.js library internal series object; flot has no TypeScript types and the shape is library-defined
  series: any;
  seriesIndex: number;
}
