import type * as React from 'react';
import type { JSX, ReactNode } from 'react';

import { type DataFrameFieldIndex, type DisplayValue } from '@grafana/data';
import { type LegendDisplayMode, type LegendPlacement, type LineStyle } from '@grafana/schema';

export enum SeriesVisibilityChangeBehavior {
  Isolate,
  Hide,
}

export interface VizLegendBaseProps<T> {
  placement: LegendPlacement;
  className?: string;
  items: Array<VizLegendItem<T>>;
  thresholdItems?: Array<VizLegendItem<T>>;
  mappingItems?: Array<VizLegendItem<T>>;
  seriesVisibilityChangeBehavior?: SeriesVisibilityChangeBehavior;
  onLabelClick?: (item: VizLegendItem<T>, event: React.MouseEvent<HTMLButtonElement>) => void;
  itemRenderer?: (item: VizLegendItem<T>, index: number) => JSX.Element;
  onLabelMouseOver?: (
    item: VizLegendItem,
    event: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>
  ) => void;
  onLabelMouseOut?: (
    item: VizLegendItem,
    event: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>
  ) => void;
  readonly?: boolean;
  limit?: number;
  filterAction?: ReactNode;
}

export interface VizLegendTableProps<T> extends VizLegendBaseProps<T> {
  sortBy?: string;
  sortDesc?: boolean;
  onToggleSort?: (sortBy: string) => void;
  isSortable?: boolean;
}

// ROLLBACK (AAP §0.8.6 Step 7 LAST RESORT): generic default <T = any> preserved for back-compat.
// `LegendProps` is consumed at sites that omit the generic argument (e.g., the VizLegend function
// body itself, where the local generic <T> has no concrete bound and must remain assignable to
// `LegendProps<T>`). Narrowing the default to `unknown` makes `VizLegendItem<unknown>[]` non-
// assignable to `VizLegendItem<T>[]` (e.g., VizLegend.tsx:78,103, VizLegendTable.tsx:86), and
// breaks consumer call sites that read unparameterized `VizLegendItem` (e.g., public/app/plugins/
// panel/nodeGraph/Legend.tsx:99 where `getColorLegendItems()` returns items without an explicit T
// but is assigned into a typed array).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
export interface LegendProps<T = any> extends VizLegendBaseProps<T>, VizLegendTableProps<T> {
  displayMode: LegendDisplayMode;
}

// ROLLBACK (AAP §0.8.6 Step 7 LAST RESORT): generic default <T = any> preserved for back-compat.
// See justification on `LegendProps` above. `VizLegendItem` is consumed without explicit type
// arguments by VizLegendTableItem.tsx (lines 16/18/20/24) and nodeGraph/Legend.tsx:99; narrowing
// default to `unknown` breaks those invariant generic positions because consumers cannot then
// assign their results into the typed arrays.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
export interface VizLegendItem<T = any> {
  getItemKey?: () => string;
  label: string;
  color?: string;
  gradient?: string;
  yAxis: number;
  disabled?: boolean;
  // displayValues?: DisplayValue[];
  getDisplayValues?: () => DisplayValue[];
  fieldIndex?: DataFrameFieldIndex;
  fieldName?: string;
  data?: T;
  lineStyle?: LineStyle;
}
