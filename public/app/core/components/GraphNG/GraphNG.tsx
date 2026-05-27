import * as React from 'react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { type default as uPlot, type AlignedData } from 'uplot';

import {
  type DataFrame,
  type DataLinkPostProcessor,
  type Field,
  FieldMatcherID,
  fieldMatchers,
  FieldType,
  getLinksSupplier,
  type InterpolateFunction,
  type TimeRange,
  type TimeZone,
} from '@grafana/data';
import { type DashboardCursorSync, type VizLegendOptions } from '@grafana/schema';
import { type Themeable2, VizLayout, type VizLayoutLegendProps } from '@grafana/ui';
import {
  type AxisProps,
  pluginLog,
  type Renderers,
  type ScaleProps,
  UPlotChart,
  type UPlotConfigBuilder,
} from '@grafana/ui/internal';

import { type GraphNGLegendEvent, type XYFieldMatchers } from './types';
import { preparePlotFrame as defaultPreparePlotFrame } from './utils';

/**
 * @internal -- not a public API
 */
export type PropDiffFn<T extends Record<string, unknown> = {}> = (prev: T, next: T) => boolean;

export interface GraphNGProps extends Themeable2 {
  frames: DataFrame[];
  structureRev?: number; // a number that will change when the frames[] structure changes
  width: number;
  height: number;
  timeRange: TimeRange;
  timeZone: TimeZone[] | TimeZone;
  legend: VizLegendOptions;
  fields?: XYFieldMatchers; // default will assume timeseries data
  renderers?: Renderers;
  tweakScale?: (opts: ScaleProps, forField: Field) => ScaleProps;
  tweakAxis?: (opts: AxisProps, forField: Field) => AxisProps;
  onLegendClick?: (event: GraphNGLegendEvent) => void;
  children?: (builder: UPlotConfigBuilder, alignedFrame: DataFrame) => React.ReactNode;
  prepConfig: (
    alignedFrame: DataFrame,
    allFrames: DataFrame[],
    getTimeRange: () => TimeRange,
    annotationLanes?: number
  ) => UPlotConfigBuilder;
  propsToDiff?: Array<string | PropDiffFn>;
  preparePlotFrame?: (frames: DataFrame[], dimFields: XYFieldMatchers) => DataFrame | null;
  renderLegend: (config: UPlotConfigBuilder) => React.ReactElement<VizLayoutLegendProps> | null;
  replaceVariables: InterpolateFunction;
  dataLinkPostProcessor?: DataLinkPostProcessor;
  cursorSync?: DashboardCursorSync;

  // Remove fields that are hidden from the visualization before rendering
  // The fields will still be available for other things like data links
  // this is a temporary hack that only works when:
  // 1. renderLegend (above) does not render <PlotLegend>
  // 2. does not have legend series toggle
  // 3. passes through all fields required for link/action gen (including those with hideFrom.viz)
  omitHideFromViz?: boolean;

  /**
   * needed for propsToDiff to re-init the plot & config
   * this is a generic approach to plot re-init, without having to specify which panel-level options
   * should cause invalidation. we can drop this in favor of something like panelOptionsRev that gets passed in
   * similar to structureRev. then we can drop propsToDiff entirely.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- panel-options blob is heterogeneous and varies per panel implementation; consumers (e.g., TimeSeries.tsx) navigate nested properties via optional chaining without type-narrowing
  options?: Record<string, any>;

  // Annotation lanes count
  annotationLanes?: number;
}

function sameProps<T extends Record<string, unknown>>(
  prevProps: T,
  nextProps: T,
  propsToDiff: Array<string | PropDiffFn> = []
) {
  for (const propName of propsToDiff) {
    if (typeof propName === 'function') {
      if (!propName(prevProps, nextProps)) {
        return false;
      }
    } else if (nextProps[propName] !== prevProps[propName]) {
      return false;
    }
  }

  return true;
}

/**
 * @internal -- not a public API
 */
export interface GraphNGState {
  alignedFrame: DataFrame;
  alignedData?: AlignedData;
  config?: UPlotConfigBuilder;
}

const defaultMatchers = {
  x: fieldMatchers.get(FieldMatcherID.firstTimeField).get({}),
  y: fieldMatchers.get(FieldMatcherID.byTypes).get(new Set([FieldType.number, FieldType.enum])),
};

/**
 * Top-level helper that builds a `GraphNGState` from the given props. Extracted
 * from the former `GraphNG` class so it can be invoked from both the lazy
 * `useState` initializer (initial mount) and the `useLayoutEffect` props-change
 * handler (componentDidUpdate analog). Returns `null` when the underlying frame
 * alignment yields no aligned frame, mirroring the original class behavior
 * (which would have left `state` unassigned in that path).
 *
 * Mechanical translation rules applied vs. the original class method:
 *   - `this.props.*` -> `props.*` (call sites already passed the latest props)
 *   - `this.state?.config` -> `prevConfig` (passed in by the caller)
 *   - `this.getTimeRange` -> `getTimeRange` (passed in by the caller)
 *   - `let state: GraphNGState = null as any;` removed in favor of early-return
 */
function prepState(
  props: GraphNGProps,
  withConfig: boolean,
  prevConfig: UPlotConfigBuilder | undefined,
  getTimeRange: () => TimeRange
): GraphNGState | null {
  const { frames, fields = defaultMatchers, preparePlotFrame, replaceVariables, dataLinkPostProcessor } = props;

  const preparePlotFrameFn = preparePlotFrame ?? defaultPreparePlotFrame;

  const withLinks = frames.some((frame) => frame.fields.some((field) => (field.config.links?.length ?? 0) > 0));

  const alignedFrame = preparePlotFrameFn(
    frames,
    {
      ...fields,
      // if there are data links, keep all fields during join so they're index-matched
      y: withLinks ? () => true : fields.y,
    },
    props.timeRange
  );

  pluginLog('GraphNG', false, 'data aligned', alignedFrame);

  if (!alignedFrame) {
    return null;
  }

  let alignedFrameFinal = alignedFrame;

  if (withLinks) {
    const timeZone = Array.isArray(props.timeZone) ? props.timeZone[0] : props.timeZone;

    // for links gen we need to use original frames but with the aligned/joined data values
    let linkFrames = frames.map((frame, frameIdx) => ({
      ...frame,
      fields: alignedFrame.fields.filter(
        (field, fieldIdx) => fieldIdx === 0 || field.state?.origin?.frameIndex === frameIdx
      ),
      length: alignedFrame.length,
    }));

    linkFrames.forEach((linkFrame, frameIndex) => {
      linkFrame.fields.forEach((field) => {
        field.getLinks = getLinksSupplier(
          linkFrame,
          field,
          {
            ...field.state?.scopedVars,
            __dataContext: {
              value: {
                data: linkFrames,
                field: field,
                frame: linkFrame,
                frameIndex,
              },
            },
          },
          replaceVariables,
          timeZone,
          dataLinkPostProcessor
        );
      });
    });

    // filter join field and fields.y
    alignedFrameFinal = {
      ...alignedFrame,
      fields: alignedFrame.fields.filter((field, i) => i === 0 || fields.y(field, alignedFrame, [alignedFrame])),
    };
  }

  if (props.omitHideFromViz) {
    const nonHiddenFields = alignedFrameFinal.fields.filter((field) => field.config.custom?.hideFrom?.viz !== true);
    alignedFrameFinal = {
      ...alignedFrameFinal,
      fields: nonHiddenFields,
      length: nonHiddenFields.length,
    };
  }

  let config = prevConfig;

  if (withConfig) {
    config = props.prepConfig(alignedFrameFinal, props.frames, getTimeRange, props.annotationLanes);
    pluginLog('GraphNG', false, 'config prepared', config);
  }

  const state: GraphNGState = {
    alignedFrame: alignedFrameFinal,
    config,
  };

  pluginLog('GraphNG', false, 'data prepared', state.alignedData);

  return state;
}

/**
 * "Time as X" core component, expects ascending x
 */
export function GraphNG(props: GraphNGProps) {
  // Mirror the class instance's `this.props` reference so that the stable
  // `getTimeRange` callback below always returns the LATEST `props.timeRange`,
  // even when called from inside long-lived uPlot config closures that were
  // created on an earlier render. Updating during render (not in an effect)
  // ensures the ref is fresh by the time effects/callbacks fire on this render.
  const latestPropsRef = useRef(props);
  latestPropsRef.current = props;

  // Preserve the original `private plotInstance` ref. The class only set it
  // (never read it); we retain the slot for minimal-change parity so any future
  // reader gets the same semantics as before.
  const plotInstance = useRef<uPlot | null>(null);

  // Tracks the previous render's props for the `componentDidUpdate` analog
  // below. Initialized to `null` so the first `useLayoutEffect` run can detect
  // the mount case and short-circuit (initial state is computed by `useState`).
  // Typed as `Readonly<GraphNGProps>` to mirror React's `this.props` in the
  // original class; this matters for `sameProps`'s `T extends Record<string,
  // unknown>` constraint, which is satisfied by homomorphic mapped types like
  // `Readonly<X>` but not by plain interfaces lacking an index signature.
  const prevPropsRef = useRef<Readonly<GraphNGProps> | null>(null);

  // Stable replacement for the class arrow method `getTimeRange = () => this.props.timeRange`.
  // The empty dependency array gives a single referentially-stable function for the
  // component's lifetime; it reads through the always-current `latestPropsRef` so
  // callers (notably uPlot config) see the latest time range at draw time.
  const getTimeRange = useCallback<() => TimeRange>(() => latestPropsRef.current.timeRange, []);

  // Replaces the constructor's initial state setup. The lazy initializer runs
  // exactly once on mount, mirroring the original constructor's behavior of
  // computing `prepState(props)` and seeding `state.alignedData` via
  // `state.config!.prepData!([state.alignedFrame])`.
  const [state, setState] = useState<GraphNGState | null>(() => {
    const initial = prepState(props, true, undefined, getTimeRange);
    if (initial) {
      return {
        ...initial,
        alignedData: initial.config!.prepData!([initial.alignedFrame]) as AlignedData,
      };
    }
    return null;
  });

  // componentDidUpdate analog. `useLayoutEffect` (not `useEffect`) is used
  // because GraphNG drives uPlot, a third-party charting library that attaches
  // directly to DOM nodes — synchronous-after-commit timing avoids a visual
  // flash between React paint and uPlot reattach. The dependency array lists
  // every closure-captured value (`props`, `getTimeRange`) per the
  // `react-hooks/exhaustive-deps` rule; because parents typically pass a new
  // `props` object every render (and `getTimeRange` is referentially stable
  // via its empty-deps `useCallback`), this is equivalent to running on every
  // render — matching the original `componentDidUpdate` cadence. The internal
  // gating condition below is the literal translation of the original
  // `componentDidUpdate` skip-when-no-relevant-change guard.
  useLayoutEffect(() => {
    // Capture the previous-render props snapshot, then advance the ref so the
    // next effect run sees this render as the "previous" one. Updating before
    // the rest of the effect runs ensures the ref is consistent even if the
    // subsequent setState updater is skipped.
    const prevProps = prevPropsRef.current;
    prevPropsRef.current = props;

    if (prevProps === null) {
      // First render — initial state already computed via `useState` lazy init.
      return;
    }

    const { frames, structureRev, timeZone, cursorSync, propsToDiff } = props;

    const propsChanged = !sameProps(prevProps, props, propsToDiff);

    if (
      frames !== prevProps.frames ||
      propsChanged ||
      timeZone !== prevProps.timeZone ||
      cursorSync !== prevProps.cursorSync
    ) {
      setState((prevState) => {
        const prevConfig = prevState?.config;
        let newState = prepState(props, false, prevConfig, getTimeRange);

        if (newState) {
          const shouldReconfig =
            prevState?.config === undefined ||
            timeZone !== prevProps.timeZone ||
            cursorSync !== prevProps.cursorSync ||
            structureRev !== prevProps.structureRev ||
            !structureRev ||
            propsChanged;

          if (shouldReconfig) {
            const newConfig = props.prepConfig(
              newState.alignedFrame,
              props.frames,
              getTimeRange,
              props.annotationLanes
            );
            pluginLog('GraphNG', false, 'config recreated', newConfig);
            newState = { ...newState, config: newConfig };
          }

          return {
            ...newState,
            alignedData: newState.config!.prepData!([newState.alignedFrame]) as AlignedData,
          };
        }

        // No new state could be produced (alignedFrame was null); keep current
        // state to avoid an unnecessary re-render.
        return prevState;
      });
    }
  }, [props, getTimeRange]);

  const { width, height, children, renderLegend } = props;

  // Original render returned null when `config` was missing. We extend that
  // guard to also cover the `state === null` case (which the class would never
  // have reached without throwing — null-state safety is a strict improvement).
  if (!state || !state.config) {
    return null;
  }

  const { config, alignedFrame, alignedData } = state;

  return (
    <VizLayout width={width} height={height} legend={renderLegend(config)}>
      {(vizWidth: number, vizHeight: number) => (
        <UPlotChart
          config={config}
          data={alignedData!}
          width={vizWidth}
          height={vizHeight}
          plotRef={(u) => {
            plotInstance.current = u;
          }}
        >
          {children ? children(config, alignedFrame) : null}
        </UPlotChart>
      )}
    </VizLayout>
  );
}
