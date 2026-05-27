import { css } from '@emotion/css';
import {
  type ComponentType,
  createElement,
  type PropsWithChildren,
  type ReactNode,
  type RefCallback,
  useCallback,
  useRef,
} from 'react';

import { type GrafanaTheme2 } from '@grafana/data';

import { useTheme2 } from '../../themes/ThemeContext';
import { closePopover } from '../../utils/closePopover';
import { Popover } from '../Tooltip/Popover';
import { PopoverController } from '../Tooltip/PopoverController';

import { ColorPickerPopover, type ColorPickerProps } from './ColorPickerPopover';
import { ColorSwatch } from './ColorSwatch';
import { SeriesColorPickerPopover } from './SeriesColorPickerPopover';

/**
 * If you need custom trigger for the color picker you can do that with a render prop pattern and supply a function
 * as a child. You will get show/hide function which you can map to desired interaction (like onClick or onMouseLeave)
 * and a ref which needs to be passed to an HTMLElement for correct positioning. If you want to use class or functional
 * component as a custom trigger you will need to forward the reference to first HTMLElement child.
 */
type ColorPickerTriggerRenderer = (props: {
  // We use RefCallback<HTMLElement> here (instead of RefObject<HTMLElement>) because RefObject<T>
  // is covariant via its readonly `current` field, which would prevent consumers from passing this
  // ref to elements typed for any specific HTMLElement subtype (e.g. HTMLDivElement,
  // HTMLButtonElement) without TypeScript variance errors. RefCallback<T> uses React's
  // bivarianceHack so it is bivariant in T, allowing any HTMLElement subtype at the call site
  // while we still capture the element internally as HTMLElement | null.
  ref: RefCallback<HTMLElement>;
  showColorPicker: () => void;
  hideColorPicker: () => void;
  isOpen: boolean;
}) => ReactNode;

export const colorPickerFactory = <T extends ColorPickerProps>(
  popover: ComponentType<PropsWithChildren<T>>,
  displayName = 'ColorPicker'
) => {
  const ColorPickerComponent = (props: T & { children?: ColorPickerTriggerRenderer }) => {
    const { children, onChange, color, id } = props;
    const theme = useTheme2();
    const pickerTriggerRef = useRef<HTMLElement | null>(null);
    const styles = getStyles(theme);

    // Stable RefCallback<HTMLElement> that captures the trigger element (which may be a div, button,
    // or any HTMLElement subtype) into our HTMLElement-typed mutable ref. The bivariance of
    // RefCallback<HTMLElement> is what allows it to be assigned to <ColorSwatch ref={...}> (which
    // expects Ref<HTMLDivElement>) and to consumer-rendered triggers like <button ref={...}> without
    // any type assertions.
    const setPickerTriggerRef = useCallback<RefCallback<HTMLElement>>((el) => {
      pickerTriggerRef.current = el;
    }, []);

    const popoverElement = createElement(
      popover,
      {
        ...props,
        onChange,
      },
      null
    );

    return (
      <PopoverController content={popoverElement} hideAfter={300}>
        {(showPopper, hidePopper, popperProps) => {
          return (
            <>
              {pickerTriggerRef.current && (
                <Popover
                  {...popperProps}
                  referenceElement={pickerTriggerRef.current}
                  wrapperClassName={styles.colorPicker}
                  onMouseLeave={hidePopper}
                  onMouseEnter={showPopper}
                  onKeyDown={(event) => closePopover(event, hidePopper)}
                />
              )}

              {children ? (
                children({
                  ref: setPickerTriggerRef,
                  showColorPicker: showPopper,
                  hideColorPicker: hidePopper,
                  isOpen: popperProps.show,
                })
              ) : (
                <ColorSwatch
                  id={id}
                  ref={setPickerTriggerRef}
                  onClick={showPopper}
                  onMouseLeave={hidePopper}
                  color={theme.visualization.getColorByName(color || '#000000')}
                  aria-label={color}
                />
              )}
            </>
          );
        }}
      </PopoverController>
    );
  };

  return ColorPickerComponent;
};

/**
 * https://developers.grafana.com/ui/latest/index.html?path=/docs/pickers-colorpicker--docs
 */
export const ColorPicker = colorPickerFactory(ColorPickerPopover, 'ColorPicker');
export const SeriesColorPicker = colorPickerFactory(SeriesColorPickerPopover, 'SeriesColorPicker');

const getStyles = (theme: GrafanaTheme2) => {
  return {
    colorPicker: css({
      position: 'absolute',
      zIndex: theme.zIndex.tooltip,
      color: theme.colors.text.primary,
      maxWidth: '400px',
      fontSize: theme.typography.size.sm,
      maxHeight: '100vh',
      overflow: 'auto',
    }),
  };
};
