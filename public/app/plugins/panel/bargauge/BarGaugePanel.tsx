import { isNumber } from 'lodash';
import { memo, useCallback, type CSSProperties, type JSX } from 'react';

import {
  type DisplayProcessor,
  type DisplayValue,
  type DisplayValueAlignmentFactors,
  type FieldConfig,
  type FieldDisplay,
  getDisplayValueAlignmentFactors,
  getFieldDisplayValues,
  type PanelProps,
  VizOrientation,
} from '@grafana/data';
import { config } from '@grafana/runtime';
import { BarGaugeSizing } from '@grafana/schema';
import { BarGauge, Box, DataLinksContextMenu, VizLayout, VizRepeater, type VizRepeaterRenderValueProps } from '@grafana/ui';
import { type DataLinksContextMenuApi } from '@grafana/ui/internal';

import { BarGaugeLegend } from './BarGaugeLegend';
import { defaultOptions, type Options } from './panelcfg.gen';

// Layout style for the DataLinksContextMenu's `style` prop. Defined at module scope to avoid an
// inline `style={{...}}` literal — matches the sibling pattern in gauge/GaugePanel.tsx.
// DataLinksContextMenu's API only accepts `style: CSSProperties` (no className), so this is the
// minimal-change replacement that preserves the original full-height layout of the menu wrapper
// (allowing the rendered <BarGauge> child to fill the orientation-flexed <Box> container above).
// Hoisting to module scope also gives the prop a stable referential identity across re-renders,
// preventing unnecessary downstream churn. See AAP §0.5.3 / §0.9.2.6 / §0.9.2.12.
const dataLinksContextMenuStyle: CSSProperties = { height: '100%' };

export type BarGaugePanelProps = PanelProps<Options>;

export const BarGaugePanel = memo((props: BarGaugePanelProps) => {
  const { data, options, fieldConfig, replaceVariables, timeZone, height, width, renderCounter } = props;

  // Inlined from the original getItemSpacing() method — pure function of options.displayMode
  const itemSpacing = options.displayMode === 'lcd' ? 2 : 10;

  // Memoized renderComponent — consumed by renderValue, which is passed to VizRepeater (PureComponent).
  // Stable identity preserves VizRepeater's shallow-equality skip behavior.
  const renderComponent = useCallback(
    (
      valueProps: VizRepeaterRenderValueProps<FieldDisplay, DisplayValueAlignmentFactors>,
      menuProps: DataLinksContextMenuApi
    ): JSX.Element => {
      const { value, alignmentFactors, orientation, width: valueWidth, height: valueHeight, count } = valueProps;
      const { field, display, view, colIndex } = value;
      const { openMenu, targetClassName } = menuProps;
      // check if the total height is bigger than the visualization height, if so, there will be scrollbars for overflow
      const isOverflow = (valueHeight + itemSpacing) * count - itemSpacing > height;

      let processor: DisplayProcessor | undefined = undefined;
      if (view && isNumber(colIndex)) {
        processor = view.getFieldDisplayProcessor(colIndex);
      }

      return (
        <BarGauge
          value={clearNameForSingleSeries(count, fieldConfig.defaults, display)}
          width={valueWidth}
          height={valueHeight}
          orientation={orientation}
          field={field}
          text={options.text}
          display={processor}
          theme={config.theme2}
          itemSpacing={itemSpacing}
          displayMode={options.displayMode}
          onClick={openMenu}
          className={targetClassName}
          alignmentFactors={count > 1 ? alignmentFactors : undefined}
          showUnfilled={options.showUnfilled}
          valueDisplayMode={options.valueMode}
          namePlacement={options.namePlacement}
          isOverflow={isOverflow}
        />
      );
    },
    [options, fieldConfig, height, itemSpacing]
  );

  // Memoized renderValue — passed directly to VizRepeater (PureComponent) for shallow-equality skip.
  const renderValue = useCallback(
    (valueProps: VizRepeaterRenderValueProps<FieldDisplay, DisplayValueAlignmentFactors>): JSX.Element => {
      const { value, orientation } = valueProps;
      const { hasLinks, getLinks } = value;

      if (hasLinks && getLinks) {
        return (
          <Box width="100%" display={orientation === VizOrientation.Vertical ? 'flex' : 'block'}>
            <DataLinksContextMenu style={dataLinksContextMenuStyle} links={getLinks}>
              {(api) => renderComponent(valueProps, api)}
            </DataLinksContextMenu>
          </Box>
        );
      }

      return renderComponent(valueProps, {});
    },
    [renderComponent]
  );

  // Memoized getValues — passed directly to VizRepeater (PureComponent) for shallow-equality skip.
  const getValues = useCallback((): FieldDisplay[] => {
    return getFieldDisplayValues({
      fieldConfig,
      reduceOptions: options.reduceOptions,
      replaceVariables,
      theme: config.theme2,
      data: data.series,
      timeZone,
    });
  }, [data, fieldConfig, options.reduceOptions, replaceVariables, timeZone]);

  // Inlined from the original getOrientation() — derives effective orientation from options and panel dimensions
  const computedOrientation: VizOrientation =
    options.orientation === VizOrientation.Auto
      ? width > height
        ? VizOrientation.Vertical
        : VizOrientation.Horizontal
      : options.orientation;

  // Inlined from the original calcBarSize() — derives min/max viz dimensions from sizing options
  const isManualSizing = options.sizing === BarGaugeSizing.Manual;
  const isVertical = computedOrientation === VizOrientation.Vertical;
  const isHorizontal = computedOrientation === VizOrientation.Horizontal;
  const minVizWidth = isManualSizing && isVertical ? options.minVizWidth : defaultOptions.minVizWidth;
  const minVizHeight = isManualSizing && isHorizontal ? options.minVizHeight : defaultOptions.minVizHeight;
  const maxVizHeight = isManualSizing && isHorizontal ? options.maxVizHeight : defaultOptions.maxVizHeight;

  // Inlined from the original getLegend() — renders BarGaugeLegend when enabled and data is present
  const legend =
    options.legend.showLegend && data && data.series.length > 0 ? (
      <BarGaugeLegend data={data.series} {...options.legend} />
    ) : null;

  return (
    <VizLayout width={width} height={height} legend={legend}>
      {(vizWidth: number, vizHeight: number) => (
        <VizRepeater
          source={data}
          getAlignmentFactors={getDisplayValueAlignmentFactors}
          getValues={getValues}
          renderValue={renderValue}
          renderCounter={renderCounter}
          width={vizWidth}
          height={vizHeight}
          maxVizHeight={maxVizHeight}
          minVizWidth={minVizWidth}
          minVizHeight={minVizHeight}
          itemSpacing={itemSpacing}
          orientation={options.orientation}
        />
      )}
    </VizLayout>
  );
});

BarGaugePanel.displayName = 'BarGaugePanel';

export function clearNameForSingleSeries(count: number, field: FieldConfig, display: DisplayValue): DisplayValue {
  if (count === 1 && !field.displayName) {
    return {
      ...display,
      title: undefined,
    };
  }

  return display;
}
