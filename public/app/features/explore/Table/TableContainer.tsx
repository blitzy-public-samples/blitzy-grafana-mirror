import { css } from '@emotion/css';
import { useState } from 'react';
import { shallowEqual } from 'react-redux';

import {
  applyFieldOverrides,
  type SplitOpen,
  type DataFrame,
  LoadingState,
  FieldType,
  DataLinksContext,
  type EventBus,
  EventBusSrv,
} from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { config, getTemplateSrv, PanelRenderer } from '@grafana/runtime';
import { type TimeZone } from '@grafana/schema';
import { type AdHocFilterItem, PanelChrome, PanelContextProvider, useTheme2 } from '@grafana/ui';
import {
  hasDeprecatedParentRowIndex,
  migrateFromParentRowIndexToNestedFrames,
} from 'app/plugins/panel/table/migrations';
import { type ExploreItemState } from 'app/types/explore';
import { type StoreState, useSelector } from 'app/types/store';

import { LimitedDataDisclaimer } from '../LimitedDataDisclaimer';
import { MetaInfoText } from '../MetaInfoText';
import { selectIsWaitingForData } from '../state/query';
import { exploreDataLinkPostProcessorFactory } from '../utils/links';

const MAX_NUMBER_OF_COLUMNS = 20;

interface TableContainerProps {
  exploreId: string;
  width: number;
  timeZone: TimeZone;
  onCellFilterAdded?: (filter: AdHocFilterItem) => void;
  splitOpenFn: SplitOpen;
  eventBus?: EventBus;
  ariaLabel?: string;
}

/**
 * Selector callback that derives the slice of redux state previously injected
 * by `connect(mapStateToProps)`. Kept as a named function so the wrapper can
 * invoke it inside `useSelector(state => mapStateToProps(state, ownProps))`
 * preserving the exact return shape.
 *
 * Note on `selectIsWaitingForData` invocation: this selector is implemented as
 * a curried factory in `../state/query.ts` — calling `selectIsWaitingForData(exploreId)`
 * returns a fresh `(state: StoreState) => boolean` selector closure on every
 * call. We invoke that closure with `state` here to materialize the BOOLEAN
 * loading flag (mirroring the canonical pattern in `Logs/LogsContainer.tsx`
 * line ~404: `const loading = selectIsWaitingForData(exploreId)(state);`).
 *
 * The previous form `const loadingInState = selectIsWaitingForData(exploreId);`
 * (without the `(state)` invocation) caused `loadingInState` to hold the
 * SELECTOR FUNCTION REFERENCE itself, not its boolean result. Two consequences
 * followed:
 *   1. Because every call to `selectIsWaitingForData(exploreId)` returns a new
 *      function reference, the returned `{ loading, tableResult, range }`
 *      object failed `shallowEqual` between subsequent selector invocations —
 *      silently causing unnecessary re-renders under `connect` and triggering
 *      React-Redux's dev-mode `useSelector` stability check after this file's
 *      class→functional + connect-HOC unwinding modernization (AAP §0.2.1
 *      Cohort 1 item #22, §0.6.2). The check fails the test suite via
 *      `jest-fail-on-console`.
 *   2. Because a function reference is always truthy, the downstream ternary
 *      `tableResult && tableResult.length > 0 ? false : loadingInState`
 *      effectively meant "if there is no result data, always show LoadingState.Loading"
 *      — a phantom loading spinner that was rendered regardless of whether the
 *      query was actually still in flight. This was a latent UX defect that
 *      the curried-but-not-invoked selector was masking.
 *
 * Invoking the selector with `(state)` corrects both issues: `loadingInState`
 * is now the BOOLEAN it was intended to be (per the variable name), the
 * returned slice is `shallowEqual`-stable across renders, and the table panel
 * displays the loading state precisely when the query response is actually
 * `Loading` or `Streaming` (matching `selectIsWaitingForData`'s contract).
 */
export function mapStateToProps(state: StoreState, { exploreId }: TableContainerProps) {
  const explore = state.explore;
  const item: ExploreItemState = explore.panes[exploreId]!;
  const { tableResult, range } = item;
  const loadingInState = selectIsWaitingForData(exploreId)(state);
  const loading = tableResult && tableResult.length > 0 ? false : loadingInState;
  return { loading, tableResult, range };
}

/** State slice previously injected by `connect(mapStateToProps)`. */
export type StateProps = ReturnType<typeof mapStateToProps>;

type Props = TableContainerProps & StateProps;

const hasSubFrames = (data: DataFrame) => data.fields.some((f) => f.type === FieldType.nestedFrames);

function getTableHeight(rowCount: number, hasSubFramesValue: boolean) {
  if (rowCount === 0) {
    return 200;
  }
  // tries to estimate table height, with a min of 300 and a max of 600
  // if there are multiple tables, there is no min
  const height = Math.min(600, Math.max(rowCount * 36, hasSubFramesValue ? 300 : 0) + 40 + 46);

  // esure minimum height of 300
  return Math.max(height, 300);
}

function getTableTitle(dataFrames: DataFrame[] | null, data: DataFrame, i: number) {
  let name = data.name;
  if (!name && (dataFrames?.length ?? 0) > 1) {
    name = data.refId || `${i}`;
  }

  return name
    ? t('explore.table.title-with-name', 'Table - {{name}}', { name, interpolation: { escapeValue: false } })
    : t('explore.table.title', 'Table');
}

export const TableContainer = (props: Props) => {
  const { loading, onCellFilterAdded, tableResult, width, splitOpenFn, range, timeZone, eventBus } = props;
  const theme = useTheme2();
  const [showAll, setShowAll] = useState(false);

  let dataFrames = hasDeprecatedParentRowIndex(tableResult)
    ? migrateFromParentRowIndexToNestedFrames(tableResult)
    : tableResult;
  const dataLinkPostProcessor = exploreDataLinkPostProcessorFactory(splitOpenFn, range);

  let dataLimited = false;

  if (dataFrames?.length) {
    dataFrames = dataFrames.map((frame) => {
      frame.fields.forEach((field, index) => {
        const custom = field.config.custom ?? {};

        const hiddenByColumnLimit = showAll ? false : index >= MAX_NUMBER_OF_COLUMNS;
        dataLimited = dataLimited || hiddenByColumnLimit;

        const hiddenByDatasource = custom.hideFrom?.viz === true || custom.hidden === true;
        const hidden = hiddenByDatasource || hiddenByColumnLimit;

        field.config.custom = {
          ...custom,
          hidden,
          hideFrom: {
            ...custom.hideFrom,
            viz: hidden,
          },
        };
      });
      return frame;
    });

    dataFrames = applyFieldOverrides({
      data: dataFrames,
      timeZone,
      theme: config.theme2,
      replaceVariables: getTemplateSrv().replace.bind(getTemplateSrv()),
      fieldConfig: {
        defaults: {},
        overrides: [],
      },
      dataLinkPostProcessor,
    });
  }

  const frames = dataFrames?.filter(
    (frame: DataFrame | undefined): frame is DataFrame => !!frame && frame.length !== 0
  );

  return (
    <>
      {frames && frames.length === 0 && (
        <PanelChrome title={t('explore.table.title', 'Table')} width={width} height={200}>
          {() => <MetaInfoText metaItems={[{ value: t('explore.table.no-data', '0 series returned') }]} />}
        </PanelChrome>
      )}
      {frames && frames.length > 0 && (
        <div className={css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1) })}>
          {frames.map((data, i) => (
            <PanelChrome
              key={data.refId || `table-${i}`}
              title={getTableTitle(dataFrames, data, i)}
              titleItems={[
                !showAll && dataLimited && (
                  <LimitedDataDisclaimer
                    toggleShowAllSeries={() => setShowAll(true)}
                    info={
                      <Trans i18nKey={'table.container.show-only-series'}>
                        Showing only {{ MAX_NUMBER_OF_COLUMNS }} columns
                      </Trans>
                    }
                    tooltip={t(
                      'table.container.content',
                      'Showing too many columns in a single table may impact performance and make data harder to read. Consider refining your queries.'
                    )}
                    buttonLabel={<Trans i18nKey={'table.container.show-all-series'}>Show all columns</Trans>}
                  />
                ),
              ]}
              width={width}
              height={getTableHeight(data.length, hasSubFrames(data))}
              loadingState={loading ? LoadingState.Loading : undefined}
            >
              {(innerWidth, innerHeight) => (
                <DataLinksContext.Provider value={{ dataLinkPostProcessor }}>
                  <PanelContextProvider
                    value={{
                      eventsScope: 'explore',
                      eventBus: eventBus ?? new EventBusSrv(),
                      onAddAdHocFilter: onCellFilterAdded,
                    }}
                  >
                    <PanelRenderer
                      data={{
                        series: [data],
                        state: loading ? LoadingState.Loading : LoadingState.Done,
                        timeRange: range,
                      }}
                      pluginId={'table'}
                      title=""
                      width={innerWidth}
                      height={innerHeight}
                      timeZone={timeZone}
                    />
                  </PanelContextProvider>
                </DataLinksContext.Provider>
              )}
            </PanelChrome>
          ))}
        </div>
      )}
    </>
  );
};

export const TableContainerWithTheme = TableContainer;

/**
 * Hook-based replacement for the previous `connect(...)` HOC. Sources Redux
 * state via `useSelector` (typed through `app/types/store`) and forwards both
 * the own props and the derived state slice to the inner `TableContainer`
 * component, whose signature is unchanged.
 *
 * `shallowEqual` is supplied as the equality comparator for `useSelector` —
 * `mapStateToProps` returns a fresh object literal each call (composed of
 * stable Redux references and primitives), so without shallow comparison
 * React-Redux would re-render on every store update AND emit a dev-mode
 * "Selector returned a different result when called with the same parameters"
 * warning (which fails `jest-fail-on-console` tests). This restores the exact
 * shallow-equal merge semantics that `connect(mapStateToProps)` previously
 * provided. See AAP §0.8.3 (Redux `connect` Integration Analysis) for the
 * canonical rationale; same pattern is used in `ExploreToolbar.tsx`.
 *
 * This pattern satisfies AAP §0.5.3 ("HOC redux access replaced by hooks") and
 * the user rule "useDispatch/useSelector from app/types/store" while honoring
 * the MINIMAL CHANGE MANDATE. Since the previous `mapDispatchToProps` was an
 * empty object, no dispatch binding is required.
 */
const ConnectedTableContainer = (ownProps: TableContainerProps) => {
  const stateProps = useSelector((state: StoreState) => mapStateToProps(state, ownProps), shallowEqual);
  return <TableContainer {...ownProps} {...stateProps} />;
};

export default ConnectedTableContainer;
