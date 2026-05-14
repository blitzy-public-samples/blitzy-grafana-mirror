import { createContext, useContext } from 'react';

import {
  EventBusSrv,
  type EventBus,
  type DashboardCursorSync,
  type AnnotationEventUIModel,
  type ThresholdsConfig,
  type CoreApp,
  type DataFrame,
  type DataLinkPostProcessor,
} from '@grafana/data';

import { type AdHocFilterItem } from '../Table/types';

import { type OnSelectRangeCallback, type SeriesVisibilityChangeMode } from './types';

/** @alpha */
export interface PanelContext {
  /** Identifier for the events scope */
  eventsScope: string;
  eventBus: EventBus;

  /** Dashboard panels sync */
  sync?: () => DashboardCursorSync;

  /** Information on what the outer container is */
  app?: CoreApp | 'string';

  /**
   * Called when a component wants to change the color for a series
   *
   * @alpha -- experimental
   */
  onSeriesColorChange?: (label: string, color: string) => void;

  onToggleSeriesVisibility?: (label: string | string[] | null, mode: SeriesVisibilityChangeMode) => void;

  canAddAnnotations?: () => boolean;
  canEditAnnotations?: (dashboardUID?: string) => boolean;
  canDeleteAnnotations?: (dashboardUID?: string) => boolean;
  canExecuteActions?: () => boolean;
  onAnnotationCreate?: (annotation: AnnotationEventUIModel) => void;
  onAnnotationUpdate?: (annotation: AnnotationEventUIModel) => void;
  onAnnotationDelete?: (id: string) => void;

  /**
   * Called when a user selects an area on the panel, if defined will override the default behavior of the panel,
   * which is to update the time range
   */
  onSelectRange?: OnSelectRangeCallback;

  /**
   * Used from visualizations like Table to add ad-hoc filters from cell values
   */
  onAddAdHocFilter?: (item: AdHocFilterItem) => void;

  /**
   * Returns filters based on existing grouping or an empty array
   */
  getFiltersBasedOnGrouping?: (items: AdHocFilterItem[]) => AdHocFilterItem[];
  /**
   *
   * Used to apply multiple filters at once
   */
  onAddAdHocFilters?: (items: AdHocFilterItem[]) => void;
  /**
   * Enables modifying thresholds directly from the panel
   *
   * @alpha -- experimental
   */
  canEditThresholds?: boolean;

  /**
   * Shows threshold indicators on the right-hand side of the panel
   *
   * @alpha -- experimental
   */
  showThresholds?: boolean;

  /**
   * Called when a panel wants to change default thresholds configuration
   *
   * @alpha -- experimental
   */
  onThresholdsChange?: (thresholds: ThresholdsConfig) => void;

  /** For instance state that can be shared between panel & options UI  */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- instanceState is per-plugin and cannot be globally typed; plugins must narrow at use site
  instanceState?: any;

  /** Update instance state, this is only supported in dashboard panel context currently */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `onInstanceStateChange` is a publicly-exported SDK callback (PanelContext is re-exported from `@grafana/ui` and consumed by every plugin author with a custom panel options UI). The `state` argument shape is per-plugin and intentionally opaque — tightening to `unknown` per AAP §0.8.6 would force every existing plugin to add narrowing logic at the call site, which is a public API contract break. Per AAP §0.9.1 ("Maintain all public API contracts") and §0.8.7 ("Public API Surface Preservation Analysis"), retain `any` with this inline justification.
  onInstanceStateChange?: (state: any) => void;

  /**
   * Called when a panel is changing the sort order of the legends.
   */
  onToggleLegendSort?: (sortBy: string) => void;

  /**
   * Optional, only some contexts support this. This action can be cancelled by user which will result
   * in a the Promise resolving to a false value.
   */
  onUpdateData?: (frames: DataFrame[]) => Promise<boolean>;

  /**
   * Optional supplier for internal data links. If not provided a link pointing to Explore will be generated.
   * @internal
   * @deprecated Please use DataLinksContext instead. This property will be removed in next major.
   */
  dataLinkPostProcessor?: DataLinkPostProcessor;
}

export const PanelContextRoot = createContext<PanelContext>({
  eventsScope: 'global',
  eventBus: new EventBusSrv(),
});

/**
 * @alpha
 */
export const PanelContextProvider = PanelContextRoot.Provider;

/**
 * @alpha
 */
export const usePanelContext = () => useContext(PanelContextRoot);
