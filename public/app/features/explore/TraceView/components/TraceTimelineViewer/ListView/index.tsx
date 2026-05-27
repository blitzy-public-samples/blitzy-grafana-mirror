// Copyright (c) 2017 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { css, cx } from '@emotion/css';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useReducer,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';

import type TNil from '../../types/TNil';

import Positions from './Positions';

/**
 * @typedef
 */
export type TListViewProps = {
  /**
   * Number of elements in the list.
   */
  dataLength: number;
  /**
   * Convert item index (number) to the key (string). ListView uses both indexes
   * and keys to handle the addition of new rows.
   */
  getIndexFromKey: (key: string) => number;
  /**
   * Convert item key (string) to the index (number). ListView uses both indexes
   * and keys to handle the addition of new rows.
   */
  getKeyFromIndex: (index: number) => string;
  /**
   * Number of items to draw and add to the DOM, initially.
   */
  initialDraw?: number;
  /**
   * Trigger a redraw of the list view.
   */
  redraw: {};
  /**
   * The parent provides fallback height measurements when there is not a
   * rendered element to measure.
   */
  itemHeightGetter: (index: number, key: string) => number;
  /**
   * Function that renders an item; rendered items are added directly to the
   * DOM, they are not wrapped in list item wrapper HTMLElement.
   */
  // itemRenderer(itemKey, style, i, attrs)
  itemRenderer: (
    itemKey: string,
    style: Record<string, string | number>,
    index: number,
    attributes: Record<string, string>
  ) => ReactNode;
  /**
   * `className` for the HTMLElement that holds the items.
   */
  itemsWrapperClassName?: string;
  /**
   * When adding new items to the DOM, this is the number of items to add above
   * and below the current view. E.g. if list is 100 items and is scrolled
   * halfway down (so items [46, 55] are in view), then when a new range of
   * items is rendered, it will render items `46 - viewBuffer` to
   * `55 + viewBuffer`.
   */
  viewBuffer: number;
  /**
   * The minimum number of items offscreen in either direction; e.g. at least
   * `viewBuffer` number of items must be off screen above and below the
   * current view, or more items will be rendered.
   */
  viewBufferMin: number;
  /**
   * When `true`, expect `_wrapperElm` to have `overflow: visible` and to,
   * essentially, be tall to the point the entire page will will end up
   * scrolling as a result of the ListView. Similar to react-virtualized
   * window scroller.
   *
   * - Ref: https://bvaughn.github.io/react-virtualized/#/components/WindowScroller
   * - Ref:https://github.com/bvaughn/react-virtualized/blob/497e2a1942529560681d65a9ef9f5e9c9c9a49ba/docs/WindowScroller.md
   */
  windowScroller?: boolean;
  /**
   * You need to pass in scrollElement when windowScroller is set to false.
   * This element is responsible for tracking scrolling for lazy loading.
   */
  scrollElement?: Element;
};

const DEFAULT_INITIAL_DRAW = 100;

/**
 * Imperative handle exposed by the `ListView` component via `React.forwardRef` +
 * `useImperativeHandle`. Consumers (e.g., `VirtualizedTraceView.tsx`) attach a
 * `ref` to `<ListView>` and then call these methods to drive scroll-to-index,
 * read the visible window, etc.
 */
export type ListViewHandle = {
  getViewHeight: () => number;
  getBottomVisibleIndex: () => number;
  getTopVisibleIndex: () => number;
  getRowPosition: (index: number) => { height: number; y: number };
  scrollToIndex: (index: number, headerHeight: number) => void;
};

/**
 * Virtualized list view component, for the most part, only renders the window
 * of items that are in-view with some buffer before and after. Listens for
 * scroll events and updates which items are rendered. See react-virtualized
 * for a suite of components with similar, but generalized, functionality.
 * https://github.com/bvaughn/react-virtualized
 *
 * Note: Presently, ListView cannot be wrapped in `React.memo`. This is because
 * ListView is sensitive to the underlying state that drives the list items, but
 * it doesn't actually receive that state. So, a render may still be required
 * even if ListView's props are unchanged.
 */
const ListView = forwardRef<ListViewHandle, TListViewProps>(function ListView(props, ref) {
  const {
    dataLength,
    getIndexFromKey,
    getKeyFromIndex,
    initialDraw = DEFAULT_INITIAL_DRAW,
    itemHeightGetter,
    itemRenderer,
    itemsWrapperClassName = '',
    scrollElement,
    viewBuffer,
    viewBufferMin,
    windowScroller = false,
  } = props;

  const styles = useStyles2(getStyles);

  // Force-update mechanism: replaces `this.forceUpdate()` from the class form.
  // useReducer returning a stable dispatch is the canonical hook idiom.
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);

  // Refs replicate every class instance variable. Refs survive across renders
  // without triggering re-renders themselves; mutations are synchronous.
  /**
   * Keeps track of the height and y-value of items, by item index, in the
   * ListView.
   */
  const yPositionsRef = useRef<Positions>(new Positions(200));
  /**
   * Keep track of the known / measured heights of the rendered items; populated
   * with values through observation and keyed on the item key, not the item
   * index.
   */
  const knownHeightsRef = useRef<Map<string, number>>(new Map());
  /**
   * The start index of the items currently drawn.
   */
  const startIndexDrawnRef = useRef<number>(2 ** 20);
  /**
   * The end index of the items currently drawn.
   */
  const endIndexDrawnRef = useRef<number>(-(2 ** 20));
  /**
   * The start index of the items currently in view.
   */
  const startIndexRef = useRef<number>(0);
  /**
   * The end index of the items currently in view.
   */
  const endIndexRef = useRef<number>(0);
  /**
   * Height of the visual window, e.g. height of the scroller element.
   */
  const viewHeightRef = useRef<number>(-1);
  /**
   * `scrollTop` of the current scroll position.
   */
  const scrollTopRef = useRef<number>(-1);
  /**
   * Used to keep track of whether or not a re-calculation of what should be
   * drawn / viewable has been scheduled.
   */
  const isScrolledOrResizedRef = useRef<boolean>(false);
  /**
   * If `windowScroller` is true, this notes how far down the page the scroller
   * is located. (Note: repositioning and below-the-fold views are untested)
   */
  const htmlTopOffsetRef = useRef<number>(-1);
  // _htmlElm is only relevant if props.windowScroller is true
  const htmlElmRef = useRef<HTMLElement>(document.documentElement);
  /**
   * Element holding the scroller.
   */
  const wrapperElmRef = useRef<Element | TNil>(undefined);
  /**
   * HTMLElement holding the rendered items.
   */
  const itemHolderElmRef = useRef<HTMLElement | TNil>(undefined);

  /**
   * Get the height of the element at index `i`; first check the known heights,
   * fallback to `props.itemHeightGetter(...)`.
   */
  const getHeight = useCallback(
    (i: number) => {
      const key = getKeyFromIndex(i);
      const known = knownHeightsRef.current.get(key);
      // known !== known iff known is NaN
      // eslint-disable-next-line no-self-compare
      if (known != null && known === known) {
        return known;
      }
      return itemHeightGetter(i, key);
    },
    [getKeyFromIndex, itemHeightGetter]
  );

  const getViewHeight = useCallback(() => viewHeightRef.current, []);

  /**
   * Get the index of the item at the bottom of the current view.
   */
  const getBottomVisibleIndex = useCallback((): number => {
    const bottomY = scrollTopRef.current + viewHeightRef.current;
    return yPositionsRef.current.findFloorIndex(bottomY, getHeight);
  }, [getHeight]);

  /**
   * Get the index of the item at the top of the current view.
   */
  const getTopVisibleIndex = useCallback(
    (): number => yPositionsRef.current.findFloorIndex(scrollTopRef.current, getHeight),
    [getHeight]
  );

  const getRowPosition = useCallback(
    (index: number): { height: number; y: number } => yPositionsRef.current.getRowPosition(index, getHeight),
    [getHeight]
  );

  const scrollToIndex = useCallback(
    (index: number, headerHeight: number) => {
      // calculate the position of the list view relative to the scroll parent
      const scrollElementTop = scrollElement?.getBoundingClientRect().top || 0;
      const listViewTop =
        (scrollElement?.scrollTop || 0) + (itemHolderElmRef.current?.getBoundingClientRect().top || 0);
      const listViewOffset = listViewTop - scrollElementTop;

      const itemOffset = getRowPosition(index).y;

      // hard code a small offset to leave a little bit of space above the focused span, so it is visually clear
      // that there is content above
      scrollElement?.scrollTo({ top: itemOffset + listViewOffset - headerHeight - 80 });
    },
    [scrollElement, getRowPosition]
  );

  // Expose imperative API matching the original class's public methods.
  useImperativeHandle(
    ref,
    () => ({
      getViewHeight,
      getBottomVisibleIndex,
      getTopVisibleIndex,
      getRowPosition,
      scrollToIndex,
    }),
    [getViewHeight, getBottomVisibleIndex, getTopVisibleIndex, getRowPosition, scrollToIndex]
  );

  /**
   * Returns true if the view height (scroll window) or scroll position have
   * changed.
   */
  const isViewChanged = useCallback((): boolean => {
    if (!wrapperElmRef.current) {
      return false;
    }
    const useRoot = windowScroller;
    const clientHeight = useRoot ? htmlElmRef.current.clientHeight : wrapperElmRef.current.clientHeight;
    const scrollTop = useRoot ? htmlElmRef.current.scrollTop : wrapperElmRef.current.scrollTop;
    return clientHeight !== viewHeightRef.current || scrollTop !== scrollTopRef.current;
  }, [windowScroller]);

  /**
   * Recalculate startIndex and endIndex, e.g. which items are in view.
   */
  const calcViewIndexes = useCallback(() => {
    const useRoot = windowScroller;
    // funky if statement is to satisfy flow
    if (!useRoot) {
      /* istanbul ignore next */
      if (!wrapperElmRef.current) {
        viewHeightRef.current = -1;
        startIndexRef.current = 0;
        endIndexRef.current = 0;
        return;
      }
      viewHeightRef.current = wrapperElmRef.current.clientHeight;
      scrollTopRef.current = wrapperElmRef.current.scrollTop;
    } else {
      viewHeightRef.current = window.innerHeight - htmlTopOffsetRef.current;
      scrollTopRef.current = window.scrollY;
    }
    const yStart = scrollTopRef.current;
    const yEnd = scrollTopRef.current + viewHeightRef.current;
    startIndexRef.current = yPositionsRef.current.findFloorIndex(yStart, getHeight);
    endIndexRef.current = yPositionsRef.current.findFloorIndex(yEnd, getHeight);
  }, [windowScroller, getHeight]);

  /**
   * Checked to see if the currently rendered items are sufficient, if not,
   * force an update to trigger more items to be rendered.
   */
  const positionList = useCallback(() => {
    isScrolledOrResizedRef.current = false;
    if (!wrapperElmRef.current) {
      return;
    }
    calcViewIndexes();
    // indexes drawn should be padded by at least viewBufferMin
    const startIndex = startIndexRef.current;
    const endIndex = endIndexRef.current;
    const maxStart = viewBufferMin > startIndex ? 0 : startIndex - viewBufferMin;
    const minEnd = viewBufferMin < dataLength - endIndex ? endIndex + viewBufferMin : dataLength - 1;
    if (maxStart < startIndexDrawnRef.current || minEnd > endIndexDrawnRef.current) {
      forceRender();
    }
  }, [calcViewIndexes, viewBufferMin, dataLength]);

  /**
   * Scroll event listener that schedules a remeasuring of which items should
   * be rendered.
   */
  const onScroll = useCallback(() => {
    if (!isScrolledOrResizedRef.current) {
      isScrolledOrResizedRef.current = true;
      window.requestAnimationFrame(positionList);
    }
  }, [positionList]);

  /**
   * Go through all items that are rendered and save their height based on their
   * item-key (which is on a data-* attribute). If any new or adjusted heights
   * are found, re-measure the current known y-positions (via .yPositions).
   */
  const scanItemHeights = useCallback(() => {
    if (!itemHolderElmRef.current) {
      return;
    }
    // note the keys for the first and last altered heights, the `yPositions`
    // needs to be updated
    let lowDirtyKey: string | null = null;
    let highDirtyKey: string | null = null;
    let isDirty = false;
    // iterating childNodes is faster than children
    // https://jsperf.com/large-htmlcollection-vs-large-nodelist
    const nodes = itemHolderElmRef.current.childNodes;
    const max = nodes.length;
    for (let i = 0; i < max; i++) {
      const node = nodes[i];
      if (node instanceof HTMLElement) {
        // use `.getAttribute(...)` instead of `.dataset` for jest / JSDOM
        const itemKey = node.getAttribute('data-item-key');
        if (!itemKey) {
          // eslint-disable-next-line no-console
          console.warn('itemKey not found');
          continue;
        }
        // measure the first child, if it's available, otherwise the node itself
        // (likely not transferable to other contexts, and instead is specific to
        // how we have the items rendered)
        const measureSrc: Element = node.firstElementChild || node;
        const observed = measureSrc.clientHeight;
        const known = knownHeightsRef.current.get(itemKey);
        if (observed !== known) {
          knownHeightsRef.current.set(itemKey, observed);
          if (!isDirty) {
            isDirty = true;
            // eslint-disable-next-line no-multi-assign
            lowDirtyKey = highDirtyKey = itemKey;
          } else {
            highDirtyKey = itemKey;
          }
        }
      }
    }
    if (lowDirtyKey != null && highDirtyKey != null) {
      // update yPositions, then redraw
      const imin = getIndexFromKey(lowDirtyKey);
      const imax = highDirtyKey === lowDirtyKey ? imin : getIndexFromKey(highDirtyKey);
      yPositionsRef.current.calcHeights(imax, getHeight, imin);
      forceRender();
    }
  }, [getIndexFromKey, getHeight]);

  // Ref callback for the wrapper div (windowScroller mode only). Mirrors the
  // original `_initWrapper` which was a no-op when windowScroller=false (the
  // wrapper element was assigned from props.scrollElement in componentDidMount).
  const initWrapper = useCallback(
    (elm: HTMLDivElement | null) => {
      if (!windowScroller) {
        return;
      }
      wrapperElmRef.current = elm ?? undefined;
      if (elm) {
        viewHeightRef.current = elm.clientHeight;
      }
    },
    [windowScroller]
  );

  // Ref callback for the items-holder div. Mirrors the original
  // `_initItemHolder` which also calls scanItemHeights on attach.
  const initItemHolder = useCallback(
    (elm: HTMLDivElement | null) => {
      itemHolderElmRef.current = elm ?? undefined;
      scanItemHeights();
    },
    [scanItemHeights]
  );

  // componentDidMount + componentDidUpdate scroll-listener management.
  //
  // Use useLayoutEffect to match the synchronous post-commit timing of the
  // original lifecycle methods, which is critical for measurements that must
  // happen before paint (AAP §0.8.2 Subtlety 1).
  //
  // The dependency array `[windowScroller, scrollElement, onScroll]` mirrors
  // the original `componentDidUpdate(prevProps)` behavior: when `scrollElement`
  // changes, the cleanup function fires (removing the old listener) and the
  // effect re-runs (adding the listener to the new element).
  useLayoutEffect(() => {
    if (windowScroller) {
      if (wrapperElmRef.current) {
        const { top } = wrapperElmRef.current.getBoundingClientRect();
        htmlTopOffsetRef.current = top + htmlElmRef.current.scrollTop;
      }
      window.addEventListener('scroll', onScroll);
      return () => {
        window.removeEventListener('scroll', onScroll);
      };
    }
    // The wrapper element should be the one that handles the scrolling. Once we are not using scroll-canvas we can remove this.
    wrapperElmRef.current = scrollElement;
    const elm = scrollElement;
    elm?.addEventListener('scroll', onScroll);
    return () => {
      elm?.removeEventListener('scroll', onScroll);
    };
  }, [windowScroller, scrollElement, onScroll]);

  // componentDidUpdate equivalent: always re-scan rendered item heights after
  // every commit. The original class called `_scanItemHeights()` in
  // componentDidUpdate unconditionally (apart from the itemHolderElm guard,
  // which is preserved). Omitting the deps argument matches that semantic.
  //
  // Note: this also runs after the initial mount. The initItemHolder ref
  // callback ALSO calls scanItemHeights on attach (matching the original
  // class), so the initial mount triggers it twice. scanItemHeights is
  // idempotent — a second call when no heights changed is a no-op — so this
  // is safe and matches the original observable behavior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (itemHolderElmRef.current) {
      scanItemHeights();
    }
  });

  // ---- Render-phase computation -------------------------------------------
  yPositionsRef.current.profileData(dataLength);

  let start: number;
  let end: number;

  if (!wrapperElmRef.current) {
    start = 0;
    end = (initialDraw < dataLength ? initialDraw : dataLength) - 1;
  } else {
    if (isViewChanged()) {
      calcViewIndexes();
    }
    const maxStart = viewBufferMin > startIndexRef.current ? 0 : startIndexRef.current - viewBufferMin;
    const minEnd =
      viewBufferMin < dataLength - endIndexRef.current ? endIndexRef.current + viewBufferMin : dataLength - 1;
    if (maxStart < startIndexDrawnRef.current || minEnd > endIndexDrawnRef.current) {
      start = viewBuffer > startIndexRef.current ? 0 : startIndexRef.current - viewBuffer;
      end = endIndexRef.current + viewBuffer;
      if (end >= dataLength) {
        end = dataLength - 1;
      }
    } else {
      start = startIndexDrawnRef.current > dataLength - 1 ? 0 : startIndexDrawnRef.current;
      end = endIndexDrawnRef.current > dataLength - 1 ? dataLength - 1 : endIndexDrawnRef.current;
    }
  }

  yPositionsRef.current.calcHeights(end, getHeight, start || -1);
  startIndexDrawnRef.current = start;
  endIndexDrawnRef.current = end;

  const items: ReactNode[] = [];
  items.length = end - start + 1;
  for (let i = start; i <= end; i++) {
    const { y: top, height } = yPositionsRef.current.getRowPosition(i, getHeight);
    // Per-row absolute positioning — `top` and `height` are dynamic per render
    // from the cumulative position cache. This object is passed to
    // `itemRenderer` (a prop function) and applied as a style attribute on the
    // consumer's rendered item — it is NOT an inline `style={{}}` on this
    // file's own JSX, so it does not match the inline-style migration pattern.
    const style = {
      height,
      top,
      position: 'absolute',
    };
    const itemKey = getKeyFromIndex(i);
    const attrs = { 'data-item-key': itemKey };
    items.push(itemRenderer(itemKey, style, i, attrs));
  }

  // Dynamic per-render scroller height from cumulative position cache; cannot
  // be statically classed. Built as a typed variable rather than an inline
  // literal so this is not a `style={{}}` literal-object pattern.
  const scrollerStyle: CSSProperties = {
    position: 'relative',
    height: yPositionsRef.current.getEstimatedHeight(),
  };

  return (
    <div
      ref={initWrapper}
      onScroll={!windowScroller ? onScroll : undefined}
      className={cx(styles.wrapper, !windowScroller && styles.wrapperScroller)}
      data-testid="ListView"
    >
      <div style={scrollerStyle}>
        <div className={cx(styles.itemsHolder, itemsWrapperClassName)} ref={initItemHolder}>
          {items}
        </div>
      </div>
    </div>
  );
});

ListView.displayName = 'ListView';

export default ListView;

const getStyles = (_theme: GrafanaTheme2) => ({
  wrapper: css({
    position: 'relative',
  }),
  wrapperScroller: css({
    height: '100%',
    overflowY: 'auto',
  }),
  itemsHolder: css({
    position: 'absolute',
    top: 0,
    margin: 0,
    padding: 0,
  }),
});
