import { type DataFrame, FieldType } from '@grafana/data';

// Annotation points/regions are 5px with 1px of padding
export const ANNOTATION_LANE_SIZE = 7;
export const ANNOTATION_REGION_MIN_WIDTH = 5;

export function getXAnnotationFrames(dataFrames: DataFrame[] = []) {
  return dataFrames.filter(
    (frame) =>
      frame.name !== 'exemplar' &&
      frame.name !== 'xymark' &&
      frame.length > 0 &&
      frame.fields.some((f) => f.type === FieldType.time)
  );
}

export function getXYAnnotationFrames(dataFrames: DataFrame[] = []) {
  return dataFrames.filter((frame) => frame.name === 'xymark');
}

export function getAnnoRegionBoxStyle(plotWidth: number, right: number, left: number) {
  const clampedRight = Math.min(plotWidth, right);
  const clampedLeft = Math.max(0, left);
  const width = clampedRight - clampedLeft;

  // If the anno is too small to see/click, adjust the left offset and set a minWidth
  const isAnnoTooSmall = width < ANNOTATION_REGION_MIN_WIDTH;
  const widthOffset = (ANNOTATION_REGION_MIN_WIDTH - width) / 2;
  const adjustedLeft = isAnnoTooSmall ? clampedLeft - widthOffset : clampedLeft;
  // clamp again in case centering after setting new minWidth bumped the edge of the anno out of the plot
  const clampedLeftAgain = Math.max(0, adjustedLeft);

  return {
    left: clampedLeftAgain,
    width,
    minWidth: isAnnoTooSmall ? ANNOTATION_REGION_MIN_WIDTH : undefined,
  };
}

/**
 * Columnar representation of annotation event data extracted from a DataFrame.
 * Each field name maps to a per-row array of values for that field.
 *
 * Mirrors the shape of @grafana/data's AnnotationEvent fields (time, timeEnd, text, tags,
 * id, isRegion, color, alertId, newState, data, login, avatarUrl, dashboardUID, title) and
 * adds optional XY-marker geometry fields (xMin, xMax, yMin, yMax, fillOpacity, lineWidth, lineStyle)
 * used by xymark annotation frames in AnnotationsPlugin2.
 *
 * `time` is required because every annotation frame in this codebase has a time field by contract
 * (getXAnnotationFrames filters by FieldType.time presence).
 * All other fields are optional to reflect the union of X-annotation and XY-annotation frame shapes.
 * The index signature accommodates arbitrary additional annotation columns from custom annotation sources
 * (e.g., user-defined dashboards may attach extra metadata fields) without forcing narrowing at every call site.
 */
export interface AnnoVals {
  time: number[];
  timeEnd?: number[];
  isRegion?: boolean[];
  text?: string[];
  title?: string[];
  tags?: string[][];
  color?: string[];
  alertId?: number[];
  newState?: string[];
  data?: unknown[];
  login?: string[];
  avatarUrl?: string[];
  dashboardUID?: string[];
  id?: Array<number | undefined>;
  // XY-annotation geometry fields (xymark frames)
  xMin?: number[];
  xMax?: number[];
  yMin?: number[];
  yMax?: number[];
  fillOpacity?: number[];
  lineWidth?: number[];
  lineStyle?: string[];
  // Allow arbitrary additional annotation columns from custom annotation sources.
  [key: string]: unknown[] | undefined;
}
