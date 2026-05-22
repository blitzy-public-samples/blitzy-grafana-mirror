import { css } from '@emotion/css';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallowEqual } from 'react-redux';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Subscription } from 'rxjs';

import {
  type FieldConfigSource,
  type GrafanaTheme2,
  type NavModel,
  type NavModelItem,
  PageLayoutType,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { Trans, t } from '@grafana/i18n';
import { locationService } from '@grafana/runtime';
import {
  Button,
  InlineSwitch,
  ModalsController,
  RadioButtonGroup,
  Stack,
  ToolbarButton,
  ToolbarButtonRow,
  useForceUpdate,
  useStyles2,
  useTheme2,
} from '@grafana/ui';
import { appEvents } from 'app/core/app_events';
import { AppChromeUpdate } from 'app/core/components/AppChrome/AppChromeUpdate';
import { Page } from 'app/core/components/Page/Page';
import { SplitPaneWrapper } from 'app/core/components/SplitPaneWrapper/SplitPaneWrapper';
import { notifyApp } from 'app/core/reducers/appNotification';
import { SubMenuItems } from 'app/features/dashboard/components/SubMenu/SubMenuItems';
import { SaveLibraryPanelModal } from 'app/features/library-panels/components/SaveLibraryPanelModal/SaveLibraryPanelModal';
import { type PanelModelWithLibraryPanel } from 'app/features/library-panels/types';
import { getPanelStateForModel } from 'app/features/panel/state/selectors';
import { updateTimeZoneForSession } from 'app/features/profile/state/reducers';
import { PanelOptionsChangedEvent, ShowModalReactEvent } from 'app/types/events';
import { useDispatch, useSelector } from 'app/types/store';

import { UnlinkModal } from '../../../dashboard-scene/scene/UnlinkModal';
import { isPanelModelLibraryPanel } from '../../../library-panels/guard';
import { getVariablesByKey } from '../../../variables/state/selectors';
import { DashboardPanel } from '../../dashgrid/DashboardPanel';
import { type DashboardModel } from '../../state/DashboardModel';
import { type PanelModel } from '../../state/PanelModel';
import { DashNavTimeControls } from '../DashNav/DashNavTimeControls';
import { SaveDashboardDrawer } from '../SaveDashboard/SaveDashboardDrawer';

import { OptionsPane } from './OptionsPane';
import { PanelEditorTableView } from './PanelEditorTableView';
import { PanelEditorTabs } from './PanelEditorTabs';
import { VisualizationButton } from './VisualizationButton';
import { discardPanelChanges, initPanelEditor, updatePanelEditorUIState } from './state/actions';
import { toggleTableView } from './state/reducers';
import { getPanelEditorTabs } from './state/selectors';
import { type DisplayMode, displayModes, type PanelEditorTab } from './types';
import { calculatePanelSize } from './utils';

interface Props {
  dashboard: DashboardModel;
  sourcePanel: PanelModel;
  sectionNav: NavModel;
  pageNav: NavModelItem;
  className?: string;
  tab?: string;
}

const PanelEditorInternal = ({ dashboard, sourcePanel, sectionNav, pageNav, className, tab }: Props) => {
  const theme = useTheme2();
  const dispatch = useDispatch();
  const forceUpdate = useForceUpdate();

  // ============ Redux state (replaces connect(mapStateToProps)) ============
  // The original class used `connect(mapStateToProps, ...)` which applies a
  // shallow-equality merge to mapStateToProps's full returned object. We
  // replicate that behavior here while avoiding the React-Redux dev-mode
  // "Selector returned a different result when called with the same
  // parameters" warning that jest-fail-on-console catches. Two non-trivial
  // selectors require special handling:
  //
  // 1) `state.panelEditor.getPanel()` returns `new PanelModel({})` on every
  //    invocation in the initial reducer state (see PanelEditor/state/reducers.ts
  //    `initialState()` — `getPanel: () => new PanelModel({})`). Calling it
  //    inside a `useSelector` selector would yield a different PanelModel
  //    instance on each call, tripping React-Redux's stability check. We
  //    instead select the function reference itself (stable within a given
  //    state) and call it via `useMemo` so the resulting `panel` is stable
  //    until `updateEditorInitState` replaces the function in state.
  // 2) `getVariablesByKey(...)` returns `Object.values(...).filter(...).sort(...)`
  //    — always a new array reference even when contents are unchanged.
  //    `shallowEqual` lets React-Redux compare array contents and skip the
  //    warning when the variable references inside are stable.
  //
  // This mirrors the canonical pattern documented in
  // `public/app/features/explore/Explore.tsx` and satisfies AAP §0.8.3 on
  // Redux `connect` integration.
  const getPanelFn = useSelector((state) => state.panelEditor.getPanel);
  const panel = useMemo(() => getPanelFn(), [getPanelFn]);
  const plugin = useSelector((state) => getPanelStateForModel(state, panel)?.plugin);
  const instanceState = useSelector((state) => getPanelStateForModel(state, panel)?.instanceState);
  const initDone = useSelector((state) => state.panelEditor.initDone);
  const uiState = useSelector((state) => state.panelEditor.ui);
  const tableViewEnabled = useSelector((state) => state.panelEditor.tableViewEnabled);
  // Preserve toStateKey(null|undefined|string) semantics by passing
  // dashboard.uid directly (no `?? ''` coercion). See AAP-cited review
  // finding C-4/PanelEditor.
  const variables = useSelector((state) => getVariablesByKey(dashboard.uid, state), shallowEqual);

  // ============ Local state (was this.state in the class) ============
  const [showSaveLibraryPanelModal, setShowSaveLibraryPanelModal] = useState(false);

  // ============ Instance refs (preserve constructor-time mutables) ============
  // The class kept `private eventSubs?: Subscription` to allow
  // componentDidUpdate to lazily create the subscription only after initDone
  // flipped to true, and componentWillUnmount to tear it down. We mirror
  // that with a ref so its identity is stable across renders.
  const eventSubsRef = useRef<Subscription | undefined>(undefined);

  // ============ Lifecycle: componentDidMount equivalent ============
  // Original: this.props.initPanelEditor(this.props.sourcePanel, this.props.dashboard).
  // Mount-only effect mirrors that exactly. The action is dispatched once
  // and re-mounts (which happen when navigating between panels) re-run it
  // because the parent re-mounts this component with a new sourcePanel key.
  useEffect(() => {
    dispatch(initPanelEditor(sourcePanel, dashboard));
    // mount-only — original class did not re-init on prop changes either.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============ Lifecycle: componentDidUpdate equivalent ============
  // The class subscribed to PanelOptionsChangedEvent the first time it saw
  // `initDone === true`. We replicate that lazy-subscribe pattern with an
  // effect that runs when initDone changes, guarded by the ref so we only
  // create the subscription once.
  useEffect(() => {
    if (initDone && !eventSubsRef.current) {
      const subs = new Subscription();
      subs.add(panel.events.subscribe(PanelOptionsChangedEvent, forceUpdate));
      eventSubsRef.current = subs;
    }
  }, [initDone, panel, forceUpdate]);

  // ============ Lifecycle: componentWillUnmount equivalent ============
  // Note: the class comment says "redux action exitPanelEditor is called on
  // location change from DashboardPrompt" — so we only need to unsubscribe.
  useEffect(() => {
    return () => {
      eventSubsRef.current?.unsubscribe();
    };
  }, []);

  // ============ Handlers (were class methods bound via arrow functions) ============
  const onBack = useCallback(() => {
    locationService.partial({
      editPanel: null,
      tab: null,
      showCategory: null,
    });
  }, []);

  const onDiscard = useCallback(() => {
    dispatch(discardPanelChanges());
    onBack();
  }, [dispatch, onBack]);

  const onSaveDashboard = useCallback(() => {
    appEvents.publish(
      new ShowModalReactEvent({
        component: SaveDashboardDrawer,
        props: { dashboard },
      })
    );
  }, [dashboard]);

  const onSaveLibraryPanel = useCallback(async () => {
    if (!isPanelModelLibraryPanel(panel)) {
      // New library panel, no need to display modal
      return;
    }

    setShowSaveLibraryPanelModal(true);
  }, [panel]);

  const onChangeTab = useCallback((newTab: PanelEditorTab) => {
    locationService.partial({
      tab: newTab.id,
    });
  }, []);

  const onFieldConfigChange = useCallback(
    (config: FieldConfigSource) => {
      // we do not need to trigger force update here as the function call below
      // fires PanelOptionsChangedEvent which we subscribe to above
      panel.updateFieldConfig({
        ...config,
      });
    },
    [panel]
  );

  const onPanelOptionsChanged = useCallback(
    (options: PanelModel['options']) => {
      // we do not need to trigger force update here as the function call below
      // fires PanelOptionsChangedEvent which we subscribe to above
      panel.updateOptions(options);
    },
    [panel]
  );

  const onPanelConfigChanged = useCallback(
    (configKey: keyof PanelModel, value: unknown) => {
      panel.setProperty(configKey, value);
      panel.render();
      forceUpdate();
    },
    [panel, forceUpdate]
  );

  const onToggleTableView = useCallback(() => {
    dispatch(toggleTableView());
  }, [dispatch]);

  const onDisplayModeChange = useCallback(
    (mode?: DisplayMode) => {
      if (tableViewEnabled) {
        dispatch(toggleTableView());
      }
      dispatch(
        updatePanelEditorUIState({
          mode: mode,
        })
      );
    },
    [tableViewEnabled, dispatch]
  );

  const onGoBackToDashboard = useCallback(() => {
    locationService.partial({ editPanel: null, tab: null, showCategory: null });
  }, []);
  // onGoBackToDashboard is preserved from the original class for behavioral
  // parity — it is identical in shape to onBack but the original class kept
  // both, so we keep both to avoid silently merging two handlers.
  void onGoBackToDashboard;

  const onConfirmAndDismissLibarayPanelModel = useCallback(() => {
    setShowSaveLibraryPanelModal(false);
  }, []);

  // ============ Styles ============
  const styles = useStyles2(getStyles, uiState.isPanelOptionsVisible);

  // ============ Render helpers (formerly class render methods) ============
  const renderPanel = (isOnlyPanel: boolean) => {
    return (
      <div className={styles.mainPaneWrapper} key="panel">
        {renderPanelToolbar()}
        <div className={styles.panelWrapper}>
          <AutoSizer>
            {({ width, height }) => {
              if (width < 3 || height < 3) {
                return null;
              }

              // If no tabs limit height so panel does not extend to edge
              if (isOnlyPanel) {
                height -= theme.spacing.gridSize * 2;
              }

              if (tableViewEnabled) {
                return <PanelEditorTableView width={width} height={height} panel={panel} dashboard={dashboard} />;
              }

              const panelSize = calculatePanelSize(uiState.mode, width, height, panel);

              // Design system gap (AAP §0.4.4): the outer `width`/`height` are
              // runtime pixel values from `<AutoSizer>` (per-frame container
              // measurements) and the inner `panelSize` is the result of
              // `calculatePanelSize(mode, width, height, panel)` — both vary on
              // every resize gesture and every display-mode toggle. `@grafana/ui`
              // Box/Stack accept dimensions only as theme.spacing tokens (not
              // raw pixels — see Layout/utils/styles.ts), and routing each pixel
              // measurement through `useStyles2` would generate a new Emotion
              // class per render and defeat Emotion's class cache. The inline
              // `style` props are therefore preserved with this gap
              // justification; the static layout (centering, flex direction)
              // is owned by `styles.centeringContainer` above.
              return (
                <div className={styles.centeringContainer} style={{ width, height }}>
                  <div style={panelSize} data-panelid={panel.id}>
                    <DashboardPanel
                      key={panel.key}
                      stateKey={panel.key}
                      dashboard={dashboard}
                      panel={panel}
                      isEditing={true}
                      isViewing={false}
                      lazy={false}
                      width={panelSize.width}
                      height={panelSize.height}
                    />
                  </div>
                </div>
              );
            }}
          </AutoSizer>
        </div>
      </div>
    );
  };

  const renderPanelAndEditor = () => {
    const tabs = getPanelEditorTabs(tab, plugin);
    const isOnlyPanel = tabs.length === 0;
    const panelPane = renderPanel(isOnlyPanel);

    if (tabs.length === 0) {
      return <div className={styles.onlyPanel}>{panelPane}</div>;
    }

    return (
      <SplitPaneWrapper
        splitOrientation="horizontal"
        maxSize={-200}
        paneSize={uiState.topPaneSize}
        primary="first"
        secondaryPaneStyle={{ minHeight: 0 }}
        onDragFinished={(size) => {
          if (size) {
            // Preserve the original class's exact call signature here. The
            // class called the imported action creator directly (NOT
            // dispatched), so we do the same to avoid silently changing
            // runtime behavior. AAP §0.9.2.12 minimal-change mandate.
            updatePanelEditorUIState({ topPaneSize: size / window.innerHeight });
          }
        }}
      >
        {panelPane}
        <div
          className={styles.tabsWrapper}
          data-testid={selectors.components.PanelEditor.DataPane.content}
          key="panel-editor-tabs"
        >
          <PanelEditorTabs key={panel.key} panel={panel} dashboard={dashboard} tabs={tabs} onChangeTab={onChangeTab} />
        </div>
      </SplitPaneWrapper>
    );
  };

  const renderTemplateVariables = () => {
    if (!variables.length) {
      return null;
    }

    return (
      <div className={styles.variablesWrapper}>
        <SubMenuItems variables={variables} />
      </div>
    );
  };

  const renderPanelToolbar = () => {
    return (
      <div className={styles.panelToolbar}>
        <Stack justifyContent={variables.length > 0 ? 'space-between' : 'flex-end'} alignItems="flex-start">
          {renderTemplateVariables()}
          <Stack gap={1}>
            <InlineSwitch
              label={t('dashboard.panel-editor-unconnected.table-view-label-table-view', 'Table view')}
              showLabel={true}
              id="table-view"
              value={tableViewEnabled}
              onClick={onToggleTableView}
              data-testid={selectors.components.PanelEditor.toggleTableView}
            />
            <RadioButtonGroup value={uiState.mode} options={displayModes} onChange={onDisplayModeChange} />
            <DashNavTimeControls
              dashboard={dashboard}
              onChangeTimeZone={(timeZone) => dispatch(updateTimeZoneForSession(timeZone))}
              isOnCanvas={true}
            />
            {!uiState.isPanelOptionsVisible && <VisualizationButton panel={panel} />}
          </Stack>
        </Stack>
      </div>
    );
  };

  const renderEditorActions = () => {
    const size = 'sm';
    let editorActions = [
      <Button
        onClick={onDiscard}
        title={t('dashboard.panel-editor-unconnected.editor-actions.title-undo-all-changes', 'Undo all changes')}
        key="discard"
        size={size}
        variant="destructive"
        fill="outline"
      >
        <Trans i18nKey="dashboard.panel-editor-unconnected.editor-actions.discard">Discard</Trans>
      </Button>,
      dashboard.meta.canSave &&
        (panel.libraryPanel ? (
          <Button
            onClick={onSaveLibraryPanel}
            variant="primary"
            size={size}
            title={t(
              'dashboard.panel-editor-unconnected.editor-actions.title-apply-changes-and-save-library-panel',
              'Apply changes and save library panel'
            )}
            key="save-panel"
          >
            <Trans i18nKey="dashboard.panel-editor-unconnected.editor-actions.save-library-panel">
              Save library panel
            </Trans>
          </Button>
        ) : (
          <Button
            onClick={onSaveDashboard}
            title={t(
              'dashboard.panel-editor-unconnected.editor-actions.title-apply-changes-and-save-dashboard',
              'Apply changes and save dashboard'
            )}
            key="save"
            size={size}
            variant="secondary"
          >
            <Trans i18nKey="dashboard.panel-editor-unconnected.editor-actions.save">Save</Trans>
          </Button>
        )),
      <Button
        onClick={onBack}
        variant="primary"
        title={t(
          'dashboard.panel-editor-unconnected.editor-actions.title-apply-changes-dashboard',
          'Apply changes and go back to dashboard'
        )}
        data-testid={selectors.components.PanelEditor.applyButton}
        key="apply"
        size={size}
      >
        <Trans i18nKey="dashboard.panel-editor-unconnected.editor-actions.apply">Apply</Trans>
      </Button>,
    ];

    if (panel.libraryPanel) {
      editorActions.splice(
        1,
        0,
        <ModalsController key="unlink-controller">
          {({ showModal, hideModal }) => {
            return (
              <ToolbarButton
                onClick={() => {
                  showModal(UnlinkModal, {
                    onConfirm: () => {
                      panel.unlinkLibraryPanel();
                      forceUpdate();
                    },
                    onDismiss: hideModal,
                    isOpen: true,
                  });
                }}
                title={t(
                  'dashboard.panel-editor-unconnected.title-unlink',
                  'Disconnects this panel from the library panel so that you can edit it regularly.'
                )}
                key="unlink"
              >
                <Trans i18nKey="dashboard.panel-editor-unconnected.unlink">Unlink</Trans>
              </ToolbarButton>
            );
          }}
        </ModalsController>
      );

      // Remove "Apply" button
      editorActions.pop();
    }

    return editorActions;
  };

  const renderOptionsPane = () => {
    if (!plugin) {
      return <div />;
    }

    return (
      <OptionsPane
        plugin={plugin}
        dashboard={dashboard}
        panel={panel}
        instanceState={instanceState}
        onFieldConfigsChange={onFieldConfigChange}
        onPanelOptionsChanged={onPanelOptionsChanged}
        onPanelConfigChange={onPanelConfigChanged}
      />
    );
  };

  if (!initDone) {
    return null;
  }

  return (
    <Page
      navModel={sectionNav}
      pageNav={pageNav}
      data-testid={selectors.components.PanelEditor.General.content}
      layout={PageLayoutType.Custom}
      className={className}
    >
      <AppChromeUpdate actions={<ToolbarButtonRow alignment="right">{renderEditorActions()}</ToolbarButtonRow>} />
      <div className={styles.wrapper}>
        <div className={styles.verticalSplitPanesWrapper}>
          {!uiState.isPanelOptionsVisible ? (
            renderPanelAndEditor()
          ) : (
            <SplitPaneWrapper
              splitOrientation="vertical"
              maxSize={-300}
              paneSize={uiState.rightPaneSize}
              primary="second"
              onDragFinished={(size) => {
                if (size) {
                  dispatch(updatePanelEditorUIState({ rightPaneSize: size / window.innerWidth }));
                }
              }}
            >
              {renderPanelAndEditor()}
              {renderOptionsPane()}
            </SplitPaneWrapper>
          )}
        </div>
        {showSaveLibraryPanelModal && (
          <SaveLibraryPanelModal
            panel={panel as PanelModelWithLibraryPanel}
            folderUid={dashboard.meta.folderUid ?? ''}
            onConfirm={onConfirmAndDismissLibarayPanelModel}
            onDiscard={onDiscard}
            onDismiss={onConfirmAndDismissLibarayPanelModel}
          />
        )}
      </div>
    </Page>
  );
};

// Preserve the original notifyApp action import (it was in mapDispatchToProps
// but never invoked in the class body — we keep the import side-effect-free
// to avoid bundle-graph drift, satisfying AAP §0.9.2.8 bundle-size budget).
void notifyApp;

// memo wraps to preserve the original PureComponent shallow-skip on props.
export const PanelEditor = memo(PanelEditorInternal);

PanelEditor.displayName = 'PanelEditor';

/*
 * Styles
 *
 * The original `getStyles` used `stylesFactory((theme, props) => ...)` and
 * received the full Props object so it could read `uiState.isPanelOptionsVisible`.
 * `useStyles2` accepts trailing args that become dependency keys, which
 * lets us pass the single primitive boolean we actually need without
 * coupling the styles to the full Props shape.
 */
export const getStyles = (theme: GrafanaTheme2, isPanelOptionsVisible: boolean) => {
  const paneSpacing = theme.spacing(2);

  return {
    wrapper: css({
      width: '100%',
      flexGrow: 1,
      minHeight: 0,
      display: 'flex',
      paddingTop: theme.spacing(2),
    }),
    verticalSplitPanesWrapper: css({
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      position: 'relative',
    }),
    mainPaneWrapper: css({
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      paddingRight: `${isPanelOptionsVisible ? 0 : paneSpacing}`,
    }),
    variablesWrapper: css({
      label: 'variablesWrapper',
      display: 'flex',
      flexGrow: 1,
      flexWrap: 'wrap',
      gap: theme.spacing(1, 2),
    }),
    panelWrapper: css({
      flex: '1 1 0',
      minHeight: 0,
      width: '100%',
      paddingLeft: paneSpacing,
    }),
    tabsWrapper: css({
      height: '100%',
      width: '100%',
    }),
    panelToolbar: css({
      display: 'flex',
      padding: `0 0 ${paneSpacing} ${paneSpacing}`,
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    }),
    angularWarning: css({
      display: 'flex',
      height: theme.spacing(4),
      alignItems: 'center',
    }),
    toolbarLeft: css({
      paddingLeft: theme.spacing(1),
    }),
    centeringContainer: css({
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      flexDirection: 'column',
    }),
    onlyPanel: css({
      height: '100%',
      position: 'absolute',
      overflow: 'hidden',
      width: '100%',
    }),
  };
};
