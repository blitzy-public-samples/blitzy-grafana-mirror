import { css } from '@emotion/css';
import { isEqual } from 'lodash';
import {
  forwardRef,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import ReactDOM from 'react-dom';
import { FixedSizeList } from 'react-window';

import { type GrafanaTheme2 } from '@grafana/data';

import { useTheme2 } from '../../themes/ThemeContext';
import { type CompletionItem, type CompletionItemGroup, CompletionItemKind } from '../../types/completion';
import { calculateListSizes, calculateLongestLabel, flattenGroupItems } from '../../utils/typeahead';

import { TypeaheadInfo } from './TypeaheadInfo';
import { TypeaheadItem } from './TypeaheadItem';

const modulo = (a: number, n: number) => a - n * Math.floor(a / n);

interface Props {
  origin: string;
  groupedItems: CompletionItemGroup[];
  prefix?: string;
  menuRef?: (el: TypeaheadHandle) => void;
  onSelectSuggestion?: (suggestion: CompletionItem) => void;
  isOpen?: boolean;
}

export interface State {
  allItems: CompletionItem[];
  listWidth: number;
  listHeight: number;
  itemHeight: number;
  hoveredItem: number | null;
  typeaheadIndex: number | null;
}

/**
 * Imperative handle exposed to parent components via the `menuRef` prop and
 * via React refs. Only the methods that the in-tree consumer
 * `slate-plugins/suggestions.tsx` actually invokes are surfaced.
 */
export interface TypeaheadHandle {
  moveMenuIndex: (moveAmount: number) => void;
  insertSuggestion: () => void;
}

/**
 * Backward-compatibility type alias. Prior to the class→functional
 * conversion, `Typeahead` was a class whose instance type was used by
 * `slate-plugins/suggestions.tsx` (e.g. `let typeaheadRef: Typeahead;`).
 * After the conversion the value `Typeahead` is a forwardRef functional
 * component, but the type namespace continues to expose the same identifier
 * so existing consumer annotations remain valid without modification.
 * TypeScript permits the same identifier in both the type and value
 * namespaces, so this alias coexists with the `const Typeahead` below.
 */
export type Typeahead = TypeaheadHandle;

type Action =
  | { type: 'INIT_DIMENSIONS'; payload: Pick<State, 'allItems' | 'listWidth' | 'listHeight' | 'itemHeight'> }
  | { type: 'UPDATE_DIMENSIONS'; payload: Pick<State, 'allItems' | 'listWidth' | 'listHeight' | 'itemHeight'> }
  | { type: 'SET_HOVERED_ITEM'; payload: number | null }
  | { type: 'SET_TYPEAHEAD_INDEX'; payload: number };

const initialState: State = {
  hoveredItem: null,
  typeaheadIndex: null,
  allItems: [],
  listWidth: -1,
  listHeight: -1,
  itemHeight: -1,
};

function typeaheadReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INIT_DIMENSIONS':
      return { ...state, ...action.payload };
    case 'UPDATE_DIMENSIONS':
      return { ...state, ...action.payload, typeaheadIndex: null };
    case 'SET_HOVERED_ITEM':
      return { ...state, hoveredItem: action.payload };
    case 'SET_TYPEAHEAD_INDEX':
      return { ...state, typeaheadIndex: action.payload };
    default:
      return state;
  }
}

function computeMenuPosition(): string {
  // Exit for unit tests
  if (!window.getSelection) {
    return '';
  }

  const selection = window.getSelection();
  const node = selection && selection.anchorNode;

  // Align menu overlay to editor node
  if (node && node.parentElement) {
    // Read from DOM
    const rect = node.parentElement.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    return `position: absolute; display: flex; top: ${rect.top + scrollY + rect.height + 6}px; left: ${
      rect.left + scrollX - 2
    }px`;
  }

  return '';
}

// eslint-disable-next-line @typescript-eslint/no-redeclare -- Intentional dual-namespace declaration: `export type Typeahead = TypeaheadHandle` (above) lives in the TYPE namespace and this `const Typeahead` lives in the VALUE namespace. TypeScript permits the merge so that `slate-plugins/suggestions.tsx`'s consumer pattern `let typeaheadRef: Typeahead;` and `(menu: Typeahead) => ...` keep type-checking after the class→functional conversion. The `@typescript-eslint/no-redeclare` rule's `ignoreDeclarationMerge` option does not cover TSTypeAliasDeclaration + VariableDeclarator merges, even though they are valid TypeScript.
export const Typeahead = forwardRef<TypeaheadHandle, Props>(function Typeahead(props, ref) {
  const { origin, groupedItems, prefix, menuRef, onSelectSuggestion, isOpen = false } = props;

  const theme = useTheme2();
  const listRef = useRef<FixedSizeList>(null);

  const [state, dispatch] = useReducer(typeaheadReducer, initialState);
  const { allItems, listWidth, listHeight, itemHeight, hoveredItem, typeaheadIndex } = state;

  // Mirrors `this.forceUpdate()` from the original class implementation.
  // The `selectionchange` listener invokes this to recompute `menuPosition`
  // (which reads from `window.getSelection()`) on caret movement.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Tracks the previous typeaheadIndex across renders so we can scroll only
  // when it actually changes. Mirrors the `prevState.typeaheadIndex` argument
  // of the original `componentDidUpdate`.
  const prevTypeaheadIndexRef = useRef<number | null>(null);

  // Tracks the previous groupedItems across renders so we can recompute
  // dimensions only when they actually change. Mirrors the
  // `prevProps.groupedItems` argument of the original `componentDidUpdate`.
  const prevGroupedItemsRef = useRef<CompletionItemGroup[] | null>(null);

  // Mount-only: subscribe to selectionchange events and seed the initial
  // list dimensions from the props at mount time. Replaces componentDidMount.
  useEffect(() => {
    document.addEventListener('selectionchange', forceUpdate);

    const initialAllItems = flattenGroupItems(groupedItems);
    const longestLabel = calculateLongestLabel(initialAllItems);
    const dims = calculateListSizes(theme, initialAllItems, longestLabel);
    dispatch({
      type: 'INIT_DIMENSIONS',
      payload: { allItems: initialAllItems, ...dims },
    });

    prevGroupedItemsRef.current = groupedItems;

    // Replaces componentWillUnmount.
    return () => {
      document.removeEventListener('selectionchange', forceUpdate);
    };
    // The original componentDidMount intentionally captured the props at
    // mount time only; subsequent prop changes are handled by the dedicated
    // groupedItems-change effect below. Re-running this effect on prop/theme
    // changes would duplicate that work and re-attach the selectionchange
    // listener on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-compute dimensions when groupedItems change; reset the typeahead index.
  // Replaces the corresponding branch of componentDidUpdate.
  useEffect(() => {
    if (prevGroupedItemsRef.current !== null && !isEqual(prevGroupedItemsRef.current, groupedItems)) {
      const updatedAllItems = flattenGroupItems(groupedItems);
      const longestLabel = calculateLongestLabel(updatedAllItems);
      const dims = calculateListSizes(theme, updatedAllItems, longestLabel);
      dispatch({
        type: 'UPDATE_DIMENSIONS',
        payload: { allItems: updatedAllItems, ...dims },
      });
    }
    prevGroupedItemsRef.current = groupedItems;
  }, [groupedItems, theme]);

  // Scroll the virtualized list to the typeahead-selected item when it
  // changes. Replaces the corresponding branch of componentDidUpdate.
  useEffect(() => {
    if (typeaheadIndex !== null && prevTypeaheadIndexRef.current !== typeaheadIndex && listRef.current) {
      if (typeaheadIndex === 1) {
        // The original class had an early `return` here that skipped the
        // dimension-recompute branch when typeaheadIndex === 1. With the
        // dimension-recompute logic split into its own effect, that early-return
        // is no longer expressible without re-merging the effects; the split is
        // acceptable because (a) the simultaneous-change scenario is extremely
        // rare and (b) when it does occur, the UPDATE_DIMENSIONS dispatch resets
        // typeaheadIndex to null, which subsumes the original scroll-to-0
        // visual intent.
        listRef.current.scrollToItem(0); // special case for handling the first group label
      } else {
        listRef.current.scrollToItem(typeaheadIndex);
      }
    }
    prevTypeaheadIndexRef.current = typeaheadIndex;
  }, [typeaheadIndex]);

  const onMouseEnter = useCallback((index: number) => {
    dispatch({ type: 'SET_HOVERED_ITEM', payload: index });
  }, []);

  const onMouseLeave = useCallback(() => {
    dispatch({ type: 'SET_HOVERED_ITEM', payload: null });
  }, []);

  const moveMenuIndex = useCallback(
    (moveAmount: number) => {
      const itemCount = allItems.length;
      if (itemCount) {
        // Select next suggestion
        const currentTypeaheadIndex = typeaheadIndex || 0;
        let newTypeaheadIndex = modulo(currentTypeaheadIndex + moveAmount, itemCount);

        if (allItems[newTypeaheadIndex].kind === CompletionItemKind.GroupTitle) {
          newTypeaheadIndex = modulo(newTypeaheadIndex + moveAmount, itemCount);
        }

        dispatch({ type: 'SET_TYPEAHEAD_INDEX', payload: newTypeaheadIndex });
      }
    },
    [allItems, typeaheadIndex]
  );

  const insertSuggestion = useCallback(() => {
    if (onSelectSuggestion && typeaheadIndex !== null) {
      onSelectSuggestion(allItems[typeaheadIndex]);
    }
  }, [onSelectSuggestion, typeaheadIndex, allItems]);

  // Build the imperative handle exposed via menuRef and React refs.
  const handle = useMemo<TypeaheadHandle>(
    () => ({
      moveMenuIndex,
      insertSuggestion,
    }),
    [moveMenuIndex, insertSuggestion]
  );

  // Expose the handle via React's standard ref-forwarding API.
  useImperativeHandle(ref, () => handle, [handle]);

  // Backward compat: also publish the same handle through the legacy
  // `menuRef` callback prop. Mirrors `this.props.menuRef(this);` from
  // componentDidMount, but additionally republishes when the closure-bound
  // handle identity changes so consumers always reference the latest
  // closure (this is consistent with class instance methods always reading
  // `this.state` directly).
  useEffect(() => {
    if (menuRef) {
      menuRef(handle);
    }
  }, [menuRef, handle]);

  // Recomputed on every render, matching the original `get menuPosition()`
  // accessor; the selectionchange listener triggers re-renders via
  // forceUpdate so this stays current with caret/selection movement.
  const menuPosition = computeMenuPosition();
  const styles = getStyles(theme);

  const showDocumentation = hoveredItem || typeaheadIndex;
  const documentationItem = allItems[hoveredItem ? hoveredItem : typeaheadIndex || 0];

  return (
    <Portal origin={origin} isOpen={isOpen} style={menuPosition}>
      <ul role="menu" className={styles.typeahead} data-testid="typeahead">
        <FixedSizeList
          ref={listRef}
          itemCount={allItems.length}
          itemSize={itemHeight}
          itemKey={(index) => {
            const item = allItems && allItems[index];
            const key = item ? `${index}-${item.label}` : `${index}`;
            return key;
          }}
          width={listWidth}
          height={listHeight}
        >
          {({ index, style }) => {
            const item = allItems && allItems[index];
            if (!item) {
              return null;
            }

            return (
              <TypeaheadItem
                onClickItem={() => (onSelectSuggestion ? onSelectSuggestion(item) : {})}
                isSelected={typeaheadIndex === null ? false : allItems[typeaheadIndex] === item}
                item={item}
                prefix={prefix}
                style={style}
                onMouseEnter={() => onMouseEnter(index)}
                onMouseLeave={onMouseLeave}
              />
            );
          }}
        </FixedSizeList>
      </ul>

      {showDocumentation && <TypeaheadInfo height={listHeight} item={documentationItem} />}
    </Portal>
  );
});

Typeahead.displayName = 'Typeahead';

interface PortalProps {
  index?: number;
  isOpen: boolean;
  origin: string;
  style: string;
}

function Portal({ children, index = 0, origin = 'query', style, isOpen }: PropsWithChildren<PortalProps>) {
  // Lazily create the portal node once for the lifetime of this component
  // instance. Mirrors the original Portal class constructor.
  const [node] = useState<HTMLDivElement>(() => {
    const div = document.createElement('div');
    div.setAttribute('style', style);
    div.classList.add(`slate-typeahead-${origin}-${index}`);
    return div;
  });

  // Append the node on mount and remove it on unmount. Replaces the
  // appendChild from the original constructor and componentWillUnmount.
  useEffect(() => {
    document.body.appendChild(node);
    return () => {
      document.body.removeChild(node);
    };
  }, [node]);

  if (isOpen) {
    node.setAttribute('style', style);
    node.classList.add(`slate-typeahead--open`);
    return ReactDOM.createPortal(children, node);
  }

  node.classList.remove(`slate-typeahead--open`);
  return null;
}

const getStyles = (theme: GrafanaTheme2) => ({
  typeahead: css({
    position: 'relative',
    zIndex: theme.zIndex.typeahead,
    borderRadius: theme.shape.radius.default,
    border: `1px solid ${theme.components.panel.borderColor}`,
    maxHeight: '66vh',
    overflowY: 'scroll',
    overflowX: 'hidden',
    outline: 'none',
    listStyle: 'none',
    background: theme.components.panel.background,
    color: theme.colors.text.primary,
    boxShadow: theme.shadows.z2,

    strong: {
      color: theme.v1.palette.yellow,
    },
  }),
});
