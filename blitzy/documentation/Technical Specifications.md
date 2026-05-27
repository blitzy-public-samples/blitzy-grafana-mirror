# 0. Agent Action Plan

## 0.1 Intent Clarification

### 0.1.1 Core Refactoring Objective

Based on the prompt, the Blitzy platform understands that the refactoring objective is to modernize the Grafana (v13.0.0-pre) frontend code base across four — and only four — strictly scoped modernization dimensions, without altering runtime behavior, rendered visual output, backend/API contracts, plugin SDK surfaces, or any files outside the four dimensions. The Blitzy platform understands this to be a **behavior-preserving structural refactor** of the existing React/TypeScript frontend inside the current repository (no new repository, no migration), driven entirely by replacing legacy patterns with modern `@grafana/ui` design-system-aligned patterns.

- **Refactoring type**: Code structure + Design pattern + Modularity (specifically: React class→functional component migration, raw HTML→design system component adoption, inline/legacy styling→theme-aware Emotion styling, and TypeScript `any`→explicit typing). It is explicitly **not** a performance refactor, tech-stack migration, or architectural re-shaping.
- **Target repository**: Same repository — in-place modernization within the Grafana monorepo (no fork or new package extraction).
- **Behavior preservation**: Runtime behavior, DOM output semantics, accessibility semantics, Redux/RTK Query data flow, React Router routes, plugin extension points, and all public SDK exports (`@grafana/data`, `@grafana/ui`, `@grafana/runtime`, `@grafana/schema`, `@grafana/e2e-selectors`) MUST remain unchanged.

The refactoring goals, restated with enhanced technical clarity:

- **Goal 1 — Class→Functional Component Migration (71 files)**: Convert the 71 in-scope class components (those extending `React.Component` or `React.PureComponent`) into React 18 functional components that use hooks exclusively (`useState`, `useReducer`, `useEffect`, `useRef`, `useCallback`, `useMemo`, `React.memo`). `ErrorBoundary` subclasses that require class form for `getDerivedStateFromError`/`componentDidCatch` are explicitly tolerated by the existing lint rule `react-prefer-function-component: ['error', { allowJsxUtilityClass: true }]` and remain out of scope unless their class form contains non-error-boundary logic that can be extracted.
- **Goal 2 — Raw HTML → Design System Component Replacement**:
  - 60 files using raw `<button>` → `Button` / `LinkButton` / `IconButton` / `ToolbarButton` from `@grafana/ui`.
  - 69 files using raw `<table>` → `Table` / `InteractiveTable` from `@grafana/ui`, or an equivalent `Table`-family composition.
  - 70 files using raw `<form>` → `@grafana/ui` form primitives (`Field`, `FieldSet`, `InlineField`, `Form`, `Legend`, `Label`, `RadioButtonGroup`, `Input`, `Combobox`, `Switch`, `Checkbox`, etc.) composed with the caller's existing `react-hook-form` or state wiring.
  - When no direct `@grafana/ui` replacement exists, the raw element MUST be left in place with an inline comment flagging the gap rather than replaced with a hand-rolled approximation.
- **Goal 3 — Styling Migration (185 + 172 = 357 files)**:
  - 185 files with inline `style={{}}` attributes → composed `Box`, `Stack`, `Grid`, `Space` layout primitives and/or `useStyles2(getStyles)` + `css()` from `@emotion/css`.
  - 172 files with hardcoded legacy `className` strings (e.g., `"gf-form"`, `"page-heading"`, `"width-20"`, `"filter-table"` from `public/sass/`) → `useStyles2(getStyles)` theme-aware Emotion class names.
- **Goal 4 — TypeScript Strictness (443 files / 568 occurrences)**: Replace every `any` annotation, `any` type assertion, `any` generic, and `any` cast with a concrete type, a generic parameter, an inferred type, or `unknown` + narrowing. New `@ts-ignore`, `@ts-expect-error`, and `@ts-nocheck` suppressions are prohibited. Retained `// eslint-disable-next-line @typescript-eslint/no-explicit-any` suppressions are permitted only for genuinely unresolvable external types and MUST carry an inline justification.

Implicit requirements surfaced from the prompt:

- **Lint/typecheck gate**: `tsc --noEmit` and `yarn lint` MUST stay clean after each category batch — zero new errors, zero new ESLint violations. The existing `eslint-suppressions.json` baseline (4,008 lines, 712 files, 827 `no-explicit-any` suppressions, 77 `react-prefer-function-component` suppressions) MUST be reduced as each file is remediated, never expanded.
- **Test preservation**: `yarn test --passWithNoTests` MUST pass at 100% for changed files after each category batch. Existing unit tests drive the behavior-preservation contract.
- **Bundle-size budget**: No entrypoint chunk may grow by more than 2%. This constrains substitutions to same-weight-class design-system imports and forbids pulling in new heavy dependencies.
- **Lighthouse regression budget**: Dashboard, Explore, and Alerting pages must not regress by more than 3 points on any metric.
- **Accessibility preservation**: ARIA attributes, keyboard navigation, and focus management must be preserved or improved — never degraded. This maps directly onto the fact that `@grafana/ui`'s `Button`, `Table`, and form primitives already encode correct accessible semantics and are typically an a11y improvement over raw HTML (e.g., `Button` forwards `aria-label` and `aria-disabled` correctly for tooltip-wrapped disabled states).
- **i18n continuity**: Any replacement that touches JSX text must preserve existing `<Trans>` / `t()` translation markup imported from `@grafana/i18n` (per `eslint.config.js` restricted-imports and `@grafana/i18n/no-untranslated-strings`).
- **Minimal-change mandate**: Only the changes strictly required to implement each of the four dimensions are permitted. No opportunistic cleanup, no API changes, no behavior changes. When multiple implementation approaches exist, choose the one requiring the least surrounding-code modification.

### 0.1.2 Technical Interpretation

This refactoring translates to the following technical transformation strategy: the Blitzy platform will perform a **pattern-driven file-by-file rewrite** where each target file is modified in place, its imports are adjusted to pull the required primitives from `@grafana/ui` / `@grafana/i18n` / `@emotion/css` / `react`, and its body is restructured to use the modern idiom while preserving every externally observable behavior. No file is moved, renamed, or split. No new packages are introduced. No `package.json` dependencies are added or upgraded beyond what the target files strictly require (and those dependencies are already present — `@grafana/ui`, `@grafana/i18n`, `@emotion/css`, `@emotion/react`, `react@18.3.1` are all in the current `package.json`).

The current→target architecture mapping:

| Dimension | Current Pattern (Source) | Target Pattern (@grafana/ui / React 18) |
| --- | --- | --- |
| Component model | class Foo extends PureComponent<Props, State> with constructor, componentDidMount, componentDidUpdate, componentWillUnmount, setState, this.bind | const Foo = (props: Props) => { ... } with useState / useReducer, useEffect, useRef, useCallback |
| HOC theme access | withTheme2(...), Themeable2 prop extension | const theme = useTheme2() inside functional body |
| HOC Redux wiring | connect(mapStateToProps, mapDispatchToProps)(Class) | useSelector + useDispatch from app/types/store (per eslint.config.js line 71-74 restricted imports) |
| Buttons | <button className="gf-form-btn" onClick={...}>Label</button> | <Button variant="primary" onClick={...}>Label</Button> |
| Icon-only buttons | <button aria-label="..."><i className="fa fa-..." /></button> | <IconButton name="..." aria-label="..." tooltip="..." /> |
| Tables | <table className="filter-table"><tr>...</tr></table> | <InteractiveTable columns={...} data={...} /> or <Table .../> composition |
| Forms | <form onSubmit={...}><div className="gf-form">...</div></form> | <Form onSubmit={...}>{(formApi) => (<><Field>...</Field></>)}</Form> or inline <FieldSet><Field>...</Field></FieldSet> |
| Layout inline styles | <div style={{ display: 'flex', gap: 8, padding: 16 }}> | <Stack gap={1} padding={2}> or <Box display="flex" gap={1} padding={2}> |
| Non-layout inline styles | <div style={{ background: '#ccc', borderRadius: 4 }}> | useStyles2(getStyles) + getStyles = (theme) => ({ wrapper: css({ background: theme.colors.background.secondary, borderRadius: theme.shape.radius.default }) }) |
| Hardcoded legacy className | <div className="gf-form-group"> referencing public/sass/_grafana.scss tokens | <Stack direction="column" gap={1}> or useStyles2 with theme.spacing / theme.colors |
| any typing | function foo(x: any): any, as any, Array<any>, Record<string, any> | Concrete types from @grafana/data (DataFrame, DataQuery, PanelProps), local interfaces, generics <T extends BaseT>, or unknown + narrowing |
| Third-party any | const lib: any = require('lib') | .d.ts ambient module declaration scoped to that import |

Transformation rules the Blitzy platform will apply mechanically:

- **Rule T1 — Lifecycle translation**:

  - `constructor(props)` → move initial state to `useState(...)` / `useReducer(reducer, initialState)`; move instance-variable initialization to `useRef(...)`.
  - `componentDidMount` → `useEffect(() => { ... }, [])`.
  - `componentDidUpdate(prevProps, prevState)` → `useEffect(() => { ... }, [dep1, dep2, ...])` with exhaustive deps.
  - `componentWillUnmount` → `return () => { ... }` inside the `useEffect` body.
  - `setState({ a: 1 })` → `setA(1)` from `useState`, or `dispatch({ type: '...', payload: 1 })` from `useReducer`.
  - `this.something = ...` where `something` is not state → `const somethingRef = useRef(...)`; read/write via `somethingRef.current`.
  - `PureComponent` shallow-equality optimization → wrap the functional component in `React.memo` only when referential-equality behavior is demonstrably intentional; otherwise drop (functional components do not auto-memoize).
  - `this.bind(...)` helpers → stable callbacks via `useCallback` only when referential stability matters to children.

- **Rule T2 — Raw-element replacement**: Map semantic role to `@grafana/ui` component by import name; if no equivalent, leave raw element in place with `// Design system gap: no @grafana/ui replacement for <raw-element>; keeping raw per refactor protocol` comment. Never hand-roll an approximation.

- **Rule T3 — Styling migration**: Layout-only inline styles → `Box` / `Stack` / `Grid` / `Space`. Non-layout inline styles and all hardcoded legacy class names → colocated `getStyles(theme: GrafanaTheme2)` at end of file, consumed via `useStyles2(getStyles)`, using theme tokens (`theme.spacing`, `theme.colors`, `theme.shape.radius`, `theme.typography`, `theme.breakpoints`) rather than raw values. Emotion `object` syntax is required (`@emotion/syntax-preference: [2, 'object']` in `eslint.config.js`).

- **Rule T4 — Typing migration**: Prefer in order: (1) existing exported type from `@grafana/data` / `@grafana/ui` / `@grafana/schema`, (2) locally declared `interface` or `type`, (3) generic parameter, (4) inferred type, (5) `unknown` with type narrowing, (6) scoped `.d.ts` declaration for untyped dependencies. `any` with inline justification is the last resort.

- **Rule T5 — i18n preservation**: All user-visible text already wrapped in `<Trans>` or `t()` MUST remain wrapped; text inside replacement `@grafana/ui` components (e.g., `Button` children, `Field` label props) MUST receive the same translation treatment.

- **Rule T6 — Import hygiene**: Imports are added, removed, or merged as the rewrite requires, using `import type { ... } from ...` for type-only imports (per `@typescript-eslint/consistent-type-imports` rule). The restricted-import rules in `eslint.config.js` (lines 45–74) are strictly honored: no imports of `Layout`, `HorizontalGroup`, `VerticalGroup`, deep `@grafana/*/src/*` paths, `useDispatch` / `useSelector` from `react-redux`, or `t` / `Trans` from `react-i18next`.

This is a single-phase, mechanical, pattern-matching refactor. There are no architectural decisions, no schema changes, no route changes, and no dependency upgrades. The Blitzy platform treats each target file as an independent rewrite unit and validates compliance through `tsc --noEmit`, `yarn lint`, and scoped `yarn test` after each category.

## 0.2 Source Analysis

### 0.2.1 Comprehensive Source File Discovery

The Blitzy platform has enumerated all source files requiring refactoring by matching the four modernization dimensions against the Grafana monorepo tree at `HEAD`. The discovery was performed using direct filesystem inspection (`grep -rE` + `eslint-suppressions.json` cross-reference) against the committed code under `public/app/**`, `packages/**`, and `apps/**`, excluding `.test.*`, `.spec.*`, `.stories.tsx`, `*.gen.ts`, `*.e2e.ts`, `e2e/**`, `e2e-playwright/**`, and `packages/grafana-ui/src/graveyard/**` per the user's OUT-OF-SCOPE directives.

Search patterns used (for reproducibility and for validation that no file is missed):

- Class components: `grep -rE 'extends (React\.)?(Component\|PureComponent)' public/app packages apps --include='*.tsx' --include='*.ts'` (cross-referenced against `eslint-suppressions.json` entries carrying `react-prefer-function-component/react-prefer-function-component`).
- Raw `<button>`: `grep -rE '<button([[:space:]]|>)' public/app packages apps --include='*.tsx'`.
- Raw `<table>`: `grep -rE '<table([[:space:]]|>)' public/app packages apps --include='*.tsx'`.
- Raw `<form>`: `grep -rE '<form([[:space:]]|>)' public/app packages apps --include='*.tsx'`.
- Inline styles: `grep -rE 'style=\{\{' public/app packages apps --include='*.tsx'`.
- Legacy className strings: `grep -rE 'className=["\047][a-z][a-z0-9-]+["\047]' public/app packages apps --include='*.tsx'` (further filtered to strings appearing in `public/sass/_grafana.scss` and `public/sass/base/**`).
- `any` occurrences: cross-referenced with `eslint-suppressions.json` entries carrying `@typescript-eslint/no-explicit-any` and with `grep -rE '[^a-zA-Z0-9_]any[^a-zA-Z0-9_]' public/app packages --include='*.tsx' --include='*.ts'` (excluding string literals and comments).

The following seven tables enumerate every source-file cohort that requires transformation. File paths are given as repository-relative absolute paths. Counts reflect the user's authoritative totals in the prompt's SYSTEM BOUNDARIES & CONSTRAINTS section; the Blitzy platform will refactor **every file** matching each category's detection criteria even where the raw grep count differs slightly from the stated total, because the eslint-suppressions baseline and the refactor's success criteria both require zero-remaining occurrences.

**Source Cohort 1 — Class components (71 files, in-scope). Complete enumeration (sourced from** `eslint-suppressions.json` `react-prefer-function-component` **suppressions intersected with production-path files):**

| # | File Path | Domain |
| --- | --- | --- |
| 1 | public/app/AppWrapper.tsx | Application root |
| 2 | public/app/core/components/GraphNG/GraphNG.tsx | Core viz |
| 3 | public/app/core/components/OptionsUI/multiSelect.tsx | Core options UI |
| 4 | public/app/core/components/OptionsUI/select.tsx | Core options UI |
| 5 | public/app/core/components/SharedPreferences/SharedPreferencesOld.tsx | Core profile |
| 6 | public/app/features/alerting/unified/components/rule-editor/QueryRows.tsx | Alerting |
| 7 | public/app/features/annotations/components/StandardAnnotationQueryEditor.tsx | Annotations |
| 8 | public/app/features/dashboard/components/DashboardRow/DashboardRow.tsx | Dashboard legacy |
| 9 | public/app/features/dashboard/components/DashboardSettings/VersionsSettings.tsx | Dashboard legacy |
| 10 | public/app/features/dashboard/components/PanelEditor/PanelEditor.tsx | Dashboard legacy |
| 11 | public/app/features/dashboard/components/PanelEditor/PanelEditorQueries.tsx | Dashboard legacy |
| 12 | public/app/features/dashboard/components/ShareModal/ShareSnapshot.tsx | Dashboard legacy |
| 13 | public/app/features/dashboard/components/SubMenu/SubMenu.tsx | Dashboard legacy |
| 14 | public/app/features/dashboard/components/TransformationsEditor/TransformationsEditor.tsx | Dashboard legacy |
| 15 | public/app/features/dashboard/containers/DashboardPage.tsx | Dashboard legacy |
| 16 | public/app/features/dashboard/dashgrid/DashboardGrid.tsx | Dashboard legacy |
| 17 | public/app/features/dashboard/dashgrid/DashboardPanel.tsx | Dashboard legacy |
| 18 | public/app/features/dashboard/dashgrid/PanelStateWrapper.tsx | Dashboard legacy |
| 19 | public/app/features/explore/Explore.tsx | Explore |
| 20 | public/app/features/explore/Logs/LiveLogs.tsx | Explore |
| 21 | public/app/features/explore/Logs/LogsContainer.tsx | Explore |
| 22 | public/app/features/explore/Table/TableContainer.tsx | Explore |
| 23 | public/app/features/explore/TraceView/components/TracePageHeader/SpanGraph/ViewingLayer.tsx | Explore TraceView |
| 24 | public/app/features/explore/TraceView/components/TraceTimelineViewer/ListView/index.tsx | Explore TraceView |
| 25 | public/app/features/explore/TraceView/components/TraceTimelineViewer/TimelineHeaderRow/TimelineColumnResizer.tsx | Explore TraceView |
| 26 | public/app/features/explore/TraceView/components/TraceTimelineViewer/TimelineHeaderRow/TimelineViewingLayer.tsx | Explore TraceView |
| 27 | public/app/features/explore/TraceView/components/TraceTimelineViewer/VirtualizedTraceView.tsx | Explore TraceView |
| 28 | public/app/features/explore/TraceView/components/TraceTimelineViewer/index.tsx | Explore TraceView |
| 29 | public/app/features/explore/TraceView/components/utils/DraggableManager/demo/DividerDemo.tsx | Explore TraceView demo |
| 30 | public/app/features/explore/TraceView/components/utils/DraggableManager/demo/DraggableManagerDemo.tsx | Explore TraceView demo |
| 31 | public/app/features/explore/TraceView/components/utils/DraggableManager/demo/RegionDemo.tsx | Explore TraceView demo |
| 32 | public/app/features/inspector/InspectDataTab.tsx | Inspector |
| 33 | public/app/features/inspector/QueryInspector.tsx | Inspector |
| 34 | public/app/features/logs/components/LogDetailsRow.tsx | Logs |
| 35 | public/app/features/logs/components/LogMessageAnsi.tsx | Logs |
| 36 | public/app/features/query/components/QueryEditorRow.tsx | Query |
| 37 | public/app/features/query/components/QueryEditorRows.tsx | Query |
| 38 | public/app/features/query/components/QueryGroup.tsx | Query |
| 39 | public/app/features/transformers/editors/FilterByNameTransformerEditor.tsx | Transformers |
| 40 | public/app/features/variables/editor/VariableEditorContainer.tsx | Variables |
| 41 | public/app/features/variables/editor/VariableEditorEditor.tsx | Variables |
| 42 | public/app/features/variables/pickers/OptionsPicker/OptionsPicker.tsx | Variables |
| 43 | public/app/features/variables/query/QueryVariableEditor.tsx | Variables |
| 44 | public/app/plugins/datasource/azuremonitor/components/ConfigEditor/ConfigEditor.tsx | Datasource plugin |
| 45 | public/app/plugins/datasource/cloud-monitoring/components/VariableQueryEditor.tsx | Datasource plugin |
| 46 | public/app/plugins/datasource/grafana/components/QueryEditor.tsx | Datasource plugin |
| 47 | public/app/plugins/datasource/graphite/components/MetricTankMetaInspector.tsx | Datasource plugin |
| 48 | public/app/plugins/datasource/graphite/configuration/ConfigEditor.tsx | Datasource plugin |
| 49 | public/app/plugins/datasource/influxdb/components/editor/config/ConfigEditor.tsx | Datasource plugin |
| 50 | public/app/plugins/datasource/influxdb/components/editor/query/flux/FluxQueryEditor.tsx | Datasource plugin |
| 51 | public/app/plugins/datasource/influxdb/components/editor/query/fsql/FSQLEditor.tsx | Datasource plugin |
| 52 | public/app/plugins/datasource/loki/components/LokiCheatSheet.tsx | Datasource plugin |
| 53 | public/app/plugins/datasource/loki/components/LokiLabelBrowser.tsx | Datasource plugin |
| 54 | public/app/plugins/datasource/loki/components/LokiQueryField.tsx | Datasource plugin |
| 55 | public/app/plugins/datasource/tempo/QueryField.tsx | Datasource plugin |
| 56 | public/app/plugins/datasource/tempo/_importedDependencies/components/AdHocFilter/AdHocFilter.tsx | Datasource plugin |
| 57 | public/app/plugins/panel/annolist/AnnoListPanel.tsx | Panel plugin |
| 58 | public/app/plugins/panel/bargauge/BarGaugePanel.tsx | Panel plugin |
| 59 | public/app/plugins/panel/canvas/CanvasPanel.tsx | Panel plugin |
| 60 | public/app/plugins/panel/debug/CursorView.tsx | Panel plugin |
| 61 | public/app/plugins/panel/debug/EventBusLogger.tsx | Panel plugin |
| 62 | public/app/plugins/panel/debug/RenderInfoViewer.tsx | Panel plugin |
| 63 | public/app/plugins/panel/geomap/GeomapPanel.tsx | Panel plugin |
| 64 | public/app/plugins/panel/geomap/components/DebugOverlay.tsx | Panel plugin |
| 65 | public/app/plugins/panel/geomap/components/ObservablePropsWrapper.tsx | Panel plugin |
| 66 | public/app/plugins/panel/gettingstarted/GettingStarted.tsx | Panel plugin |
| 67 | public/app/plugins/panel/histogram/Histogram.tsx | Panel plugin |
| 68 | public/app/plugins/panel/live/LivePanel.tsx | Panel plugin |
| 69 | packages/grafana-runtime/src/components/DataSourcePicker.tsx | SDK package |
| 70 | packages/grafana-ui/src/components/QueryField/QueryField.tsx | SDK package |
| 71 | packages/grafana-ui/src/components/Typeahead/Typeahead.tsx | SDK package |

Additional class components detected but explicitly **out of scope** (per user): `packages/grafana-ui/src/components/ErrorBoundary/ErrorBoundary.tsx`, `packages/grafana-sql/src/components/ErrorBoundary.tsx`, `public/app/features/plugins/components/PluginErrorBoundary.tsx` (class form required by React's error-boundary API; `allowJsxUtilityClass: true`), plus `packages/grafana-ui/src/components/Forms/Legacy/{Input,Select,Switch}/*.tsx` (deprecated `LegacyForms` bundle — scheduled for removal, not conversion), `packages/grafana-ui/src/graveyard/**` (excluded by ESLint config), and `packages/grafana-ui/src/components/{Monaco/CodeEditor.tsx, Select/ValueContainer.tsx, TableInputCSV/TableInputCSV.tsx, VizRepeater/VizRepeater.tsx, uPlot/Plot.tsx}` (SDK library internals where class form interacts with 3rd-party wrappers, listed separately in the prompt's in-scope 71-file total by user as part of selected SDK targets; the Blitzy platform will treat the 71 as the authoritative in-scope list).

**Source Cohort 2 — Files containing raw** `<button>` **(60 files, in-scope).** All files matching the grep pattern in production paths. Representative enumeration:

| # | File Path |
| --- | --- |
| 1 | public/app/core/components/AppChrome/TopBar/TopSearchBarCommandPaletteTrigger.tsx |
| 2 | public/app/core/components/CardButton.tsx |
| 3 | public/app/core/components/NestedFolderPicker/Skeleton.tsx |
| 4 | public/app/core/components/TagFilter/TagFilter.tsx |
| 5 | public/app/features/alerting/unified/components/expressions/Expression.tsx |
| 6 | public/app/features/alerting/unified/components/import-to-gma/ImportToGMA.tsx |
| 7 | public/app/features/alerting/unified/components/mute-timings/MuteTimingTimeInterval.tsx |
| 8 | public/app/features/alerting/unified/components/rule-editor/QueryOptions.tsx |
| 9 | public/app/features/alerting/unified/rule-list/components/EvaluationGroup.tsx |
| 10 | public/app/features/alerting/unified/rule-list/filter/RulesFilterSidebar.tsx |
| 11 | public/app/features/dashboard/components/PanelEditor/PanelHeaderCorner.tsx |
| 12 | public/app/features/dimensions/editors/ResourcePickerPopover.tsx |
| 13 | public/app/features/explore/TraceView/components/TracePageHeader/TracePageHeader.tsx |
| 14 | public/app/features/logs/components/LogRowMessage.tsx |
| 15 | public/app/features/logs/components/fieldSelector/ActiveFields.tsx |
| 16 | public/app/features/logs/components/fieldSelector/Field.tsx |
| 17 | public/app/features/logs/components/panel/LogLineMessage.tsx |
| 18 | public/app/features/provisioning/Shared/MessageList.tsx |
| 19 | public/app/features/scopes/selector/ScopesTreeItem.tsx |
| 20 | public/app/plugins/datasource/influxdb/components/editor/query/influxql/visual/PartListSection.tsx |
| 21 | public/app/plugins/datasource/opentsdb/components/FilterSection.tsx |
| 22 | public/app/plugins/datasource/opentsdb/components/TagSection.tsx |
| 23 | public/app/plugins/panel/annolist/AnnotationListItem.tsx |
| 24 | packages/grafana-prometheus/src/querybuilder/components/QueryBuilderContent.tsx |
| 25 | packages/grafana-ui/src/components/Card/Card.tsx |
| 26 | packages/grafana-ui/src/components/FilterPill/FilterPill.tsx |
| 27 | packages/grafana-ui/src/components/Table/TableNG/components/HeaderCell.tsx |
| 28 | packages/grafana-ui/src/components/Table/TableRT/HeaderRow.tsx |
| 29 | packages/grafana-ui/src/components/Tags/Tag.tsx |
| 30 | packages/grafana-ui/src/components/VizLegend/FacetedLabelsFilter.tsx |
| …30–60 | All remaining files matching the raw <button> grep pattern; the Blitzy platform enumerates the full set at refactor time using the pattern <button([[:space:]]\|>) applied to public/app/**/*.tsx and packages/**/src/**/*.tsx. |

Note: Several of the files listed (e.g., `CardButton.tsx`, `FilterPill.tsx`, `Card.tsx`, `Tag.tsx`) contain raw `<button>` as the intentional semantic root of a design-system primitive. In these specific cases the raw `<button>` is the correct implementation and will be flagged as a "Design System gap: component is itself a button primitive" with inline justification rather than replaced. All other occurrences are call-sites that MUST be replaced with `@grafana/ui` `Button` / `LinkButton` / `IconButton` / `ToolbarButton`.

**Source Cohort 3 — Files containing raw** `<table>` **(69 files, in-scope).** Concentrated in alerting tables, admin tables, dashboard settings tables, datasource lists, and public dashboards. Representative enumeration:

| # | File Path |
| --- | --- |
| 1 | public/app/core/components/AccessControl/PermissionList.tsx |
| 2 | public/app/core/components/help/HelpModal.tsx |
| 3 | public/app/features/admin/AdminOrgsTable.tsx |
| 4 | public/app/features/admin/AdminSettingsTable.tsx |
| 5 | public/app/features/admin/UserLdapSyncInfo.tsx |
| 6 | public/app/features/admin/UserListPublicDashboardPage/UserListPublicDashboardPage.tsx |
| 7 | public/app/features/admin/UserOrgs.tsx |
| 8 | public/app/features/admin/UserPermissions.tsx |
| 9 | public/app/features/admin/UserProfile.tsx |
| 10 | public/app/features/admin/UserSessions.tsx |
| 11 | public/app/features/alerting/unified/components/expressions/Expression.tsx |
| 12 | public/app/features/alerting/unified/components/receivers/TemplateDataDocs.tsx |
| 13 | public/app/features/alerting/unified/components/receivers/TemplatesTable.tsx |
| 14 | public/app/features/alerting/unified/components/receivers/form/fields/KeyValueMapInput.tsx |
| 15 | public/app/features/alerting/unified/components/rule-editor/CloudAlertPreview.tsx |
| 16 | public/app/features/alerting/unified/components/silences/SilencedAlertsTable.tsx |
| 17 | public/app/features/alerting/unified/notifications/NotificationDetailAlerts.tsx |
| 18 | public/app/features/annotations/components/AnnotationResultMapper.tsx |
| 19 | public/app/features/dashboard-scene/panel-edit/SaveLibraryVizPanelModal.tsx |
| 20 | public/app/features/dashboard-scene/settings/ProvisionedControlsSection.tsx |
| 21 | public/app/features/dashboard-scene/settings/annotations/AnnotationSettingsList.tsx |
| 22 | public/app/features/dashboard-scene/settings/links/DashboardLinkList.tsx |
| 23 | public/app/features/dashboard-scene/settings/variables/VariablesUnknownTable.tsx |
| 24 | public/app/features/dashboard-scene/settings/variables/components/VariableStaticOptionsFormItems.tsx |
| 25 | public/app/features/dashboard-scene/settings/version-history/VersionHistoryTable.tsx |
| 26 | public/app/features/dashboard-scene/sharing/ShareButton/share-externally/EmailShare/ConfigEmailSharing/EmailListConfiguration.tsx |
| 27 | public/app/features/dashboard/components/AnnotationSettings/AnnotationSettingsList.tsx |
| 28 | public/app/features/dashboard/components/ShareModal/SharePublicDashboard/ConfigPublicDashboard/EmailSharingConfiguration.tsx |
| 29 | public/app/features/dashboard/components/VersionHistory/VersionHistoryTable.tsx |
| 30 | public/app/features/datasources/components/DashboardsTable.tsx |
| …30–69 | All remaining matches under admin/, alerting/, dashboard-scene/, logs/, transformers/, serviceaccounts/, profile/, plugins/, manage-dashboards/, library-panels/, explore/, dimensions/, visualization/, teams/, support-bundles/, invites/, connections/, packages/grafana-prometheus/src/**, packages/grafana-flamegraph/src/CallTree/**. |

**Source Cohort 4 — Files containing raw** `<form>` **(70 files, in-scope).** Concentrated in alerting notifications/receivers/silences, provisioning pages, admin LDAP and user pages, core login/signup/forgotten-password flows, dashboard-scene sharing and settings, and auth-config. Representative enumeration:

| # | File Path |
| --- | --- |
| 1 | public/app/core/components/ForgottenPassword/ChangePassword.tsx |
| 2 | public/app/core/components/ForgottenPassword/ForgottenPassword.tsx |
| 3 | public/app/core/components/Login/LoginForm.tsx |
| 4 | public/app/core/components/SharedPreferences/SharedPreferencesFunctional.tsx |
| 5 | public/app/core/components/SharedPreferences/SharedPreferencesOld.tsx |
| 6 | public/app/core/components/Signup/SignupPage.tsx |
| 7 | public/app/core/components/Signup/VerifyEmail.tsx |
| 8 | public/app/features/admin/AdminEditOrgPage.tsx |
| 9 | public/app/features/admin/UserCreatePage.tsx |
| 10 | public/app/features/admin/ldap/LdapPage.tsx |
| 11 | public/app/features/admin/ldap/LdapSettingsPage.tsx |
| 12 | public/app/features/admin/ldap/LdapTestDrawer.tsx |
| 13 | public/app/features/alerting/unified/components/import-to-gma/ImportToGMARules.tsx |
| 14 | public/app/features/alerting/unified/components/mute-timings/MuteTimingForm.tsx |
| 15 | public/app/features/alerting/unified/components/notification-policies/EditDefaultPolicyForm.tsx |
| 16 | public/app/features/alerting/unified/components/notification-policies/EditNotificationPolicyForm.tsx |
| 17 | public/app/features/alerting/unified/components/receivers/GlobalConfigForm.tsx |
| 18 | public/app/features/alerting/unified/components/receivers/form/ReceiverForm.tsx |
| 19 | public/app/features/alerting/unified/components/receivers/form/TestContactPointModal.tsx |
| 20 | public/app/features/alerting/unified/components/rule-editor/GrafanaEvaluationBehavior.tsx |
| 21 | public/app/features/alerting/unified/components/rule-editor/alert-rule-form/AlertRuleForm.tsx |
| 22 | public/app/features/alerting/unified/components/rule-editor/alert-rule-form/ModifyExportRuleForm.tsx |
| 23 | public/app/features/alerting/unified/components/rule-editor/labels/LabelsField.tsx |
| 24 | public/app/features/alerting/unified/components/rules/state-history/LokiStateHistory.tsx |
| 25 | public/app/features/alerting/unified/components/saved-searches/InlineRenameInput.tsx |
| 26 | public/app/features/alerting/unified/components/saved-searches/InlineSaveInput.tsx |
| 27 | public/app/features/alerting/unified/components/silences/SilencesEditor.tsx |
| 28 | public/app/features/alerting/unified/group-details/GroupEditPage.tsx |
| 29 | public/app/features/alerting/unified/rule-list/filter/RulesFilter.v2.tsx |
| 30 | public/app/features/auth-config/ProviderConfigForm.tsx |
| …30–70 | All remaining matches under provisioning/, dashboard-scene/ sharing/settings/, migrate-to-cloud/, serviceaccounts/, datasources/, teams/, plus the occurrence in packages/grafana-ui/src/components/Forms/Form.tsx (which is the design-system Form wrapper itself — raw <form> is correct there). |

Note: `packages/grafana-ui/src/components/Forms/Form.tsx` is intentionally the raw-`<form>` implementation that powers `<Form>` and is therefore a "Design System gap: this file IS the form primitive" — it will retain its raw `<form>` with an inline justification comment instead of being rewritten.

**Source Cohort 5 — Files with inline** `style={{...}}` **(185 files, in-scope).** Heavy concentration in `packages/grafana-ui/src/components/**` (legacy style scaffolding inside the design-system itself), `public/app/plugins/panel/**` (panel plugin internals), `public/app/features/dashboard-scene/**` (scene UI), `public/app/plugins/datasource/**` (datasource editors), `public/app/features/explore/**`, `public/app/features/alerting/**`, `public/app/features/provisioning/**`, `public/app/features/canvas/**`, `public/app/core/components/**`, `public/app/features/dashboard/**`, `public/app/features/admin/**`, `public/app/features/teams/**`, `public/app/features/browse-dashboards/**`, `public/app/features/variables/**`, `packages/grafana-flamegraph/src/CallTree/**`. The Blitzy platform will rewrite every occurrence of `style={{ ... }}` in `.tsx` production files matching the pattern outside `.test.*`, `.spec.*`, `.stories.tsx`, `*.gen.ts`, `e2e/`, `e2e-playwright/`, and `packages/grafana-ui/src/graveyard/**`.

**Source Cohort 6 — Files with hardcoded legacy** `className` **strings (172 files, in-scope).** The legacy class strings originate from `public/sass/_grafana.scss` (`.gf-form`, `.gf-form-group`, `.gf-form-inline`, `.gf-form-btn`, `.filter-table`, `.page-heading`, `.panel-empty`, `.page-heading`), `public/sass/base/_text.scss` (`.width-20`, `.width-30`, `.width-4`, `.max-width-10`, `.text-right`, `.external-link`, `.motor`, `.prop`), and related generated files (`public/sass/_variables.generated.scss`, `public/sass/_variables.dark.generated.scss`, `public/sass/_variables.light.generated.scss`). Concentrated in `public/app/plugins/datasource/**` (40 files — highest), `packages/grafana-ui/src/components/**` (16 files), `public/app/features/dashboard-scene/**` (12 files), `public/app/core/components/**` (11 files), `public/app/features/transformers/**` (9), `public/app/features/dashboard/**` (8), `public/app/features/admin/**` (8), `public/app/plugins/panel/**` (7), `public/app/features/variables/**` (7), `public/app/features/datasources/**` (5), `public/app/features/explore/**` (4), plus admin/serviceaccounts/profile/canvas and `packages/grafana-prometheus/src/configuration/**`. The Blitzy platform will replace every such string with theme-aware Emotion-generated class names produced by `useStyles2(getStyles)` using tokens from `GrafanaTheme2` (spacing, colors, shape, typography, breakpoints).

**Source Cohort 7 — Files with TypeScript** `any` **(443 files, 568 occurrences, in-scope).** Cross-referenced from `eslint-suppressions.json` (`@typescript-eslint/no-explicit-any` counts totalling 827 suppressions across 283 files) plus additional non-suppressed `any` occurrences in `.tsx` / `.ts` source files. Concentrated in (top 10):

| Module | Files with any |
| --- | --- |
| public/app/plugins/datasource/** | 32 |
| public/app/features/dashboard/** | 27 |
| packages/grafana-ui/src/components/** | 25 |
| packages/grafana-data/src/types/** | 23 |
| public/app/plugins/panel/** | 22 |
| public/app/features/variables/** | 18 |
| public/app/features/alerting/** | 17 |
| public/app/features/transformers/** | 8 |
| public/app/features/dashboard-scene/** | 7 |
| packages/grafana-data/src/utils/** | 7 |

High-density files (top 10 by `any` count from `eslint-suppressions.json`): `packages/grafana-data/src/types/datasource.ts` (24), `public/app/features/dashboard/state/DashboardModel.ts` (24), `public/app/core/time_series2.ts` (19), `public/app/features/dashboard/state/PanelModel.ts` (17), `public/app/features/dashboard/state/DashboardMigrator.ts` (16), `public/app/plugins/datasource/opentsdb/datasource.ts` (16), `packages/grafana-ui/src/components/SingleStatShared/SingleStatBaseOptions.ts` (13), `packages/grafana-runtime/src/services/backendSrv.ts` (12), `public/app/plugins/datasource/influxdb/query_part.ts` (12), `packages/grafana-data/src/types/panel.ts` (11).

**Explicitly excluded from the** `any` **refactor** (OUT OF SCOPE per user): all `.gen.ts` files (RTK Query generated endpoints with thousands of `any`s in generated mutation argument shapes — e.g., `packages/grafana-api-clients/src/clients/rtkq/iam/v0alpha1/endpoints.gen.ts`: 66 `any`s), all `.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`, `.stories.tsx`, `.e2e.ts`, protobuf outputs, and `packages/grafana-ui/src/graveyard/**`.

### 0.2.2 Current Structure Mapping

```plaintext
Current (relevant subtrees):
├── public/
│   ├── app/
│   │   ├── AppWrapper.tsx                    [CLASS → FUNCTIONAL]
│   │   ├── app.ts, initApp.ts, index.ts      [untouched]
│   │   ├── core/
│   │   │   └── components/
│   │   │       ├── GraphNG/GraphNG.tsx       [CLASS → FUNCTIONAL]
│   │   │       ├── OptionsUI/{multiSelect,select}.tsx   [CLASS → FUNCTIONAL]
│   │   │       ├── SharedPreferences/SharedPreferencesOld.tsx   [CLASS → FUNCTIONAL]
│   │   │       ├── CardButton.tsx            [inline styles, raw <button> = primitive]
│   │   │       ├── Login/LoginForm.tsx       [raw <form> → design system]
│   │   │       ├── Signup/*.tsx              [raw <form> → design system]
│   │   │       ├── ForgottenPassword/*.tsx   [raw <form> → design system]
│   │   │       ├── TagFilter/TagFilter.tsx   [raw <button>, inline styles]
│   │   │       ├── AppChrome/TopBar/*.tsx    [raw <button>]
│   │   │       ├── NestedFolderPicker/*.tsx  [raw <button>]
│   │   │       ├── AccessControl/PermissionList.tsx          [raw <table>]
│   │   │       ├── help/HelpModal.tsx                        [raw <table>]
│   │   │       └── … (11 className, 12 inline-style, 4 any-typed, 4 class-component files)
│   │   └── features/                         (51 feature modules)
│   │       ├── alerting/unified/**           [6 <button>, 7 <table>, 17 <form>, 17 any, 1 class, 14 inline style, many className]
│   │       ├── admin/**                      [8 <table>, 5 <form>, 9 inline style, 8 className]
│   │       ├── annotations/**                [1 class, 1 <table>, 1 any]
│   │       ├── auth-config/**                [1 <form>]
│   │       ├── browse-dashboards/**          [3 inline style, 8 any]
│   │       ├── canvas/**                     [11 inline style, 3 className]
│   │       ├── correlations/**
│   │       ├── dashboard/**                  [11 class, 1 <button>, 3 <table>, 2 <form>, 11 inline style, 8 className, 27 any]
│   │       ├── dashboard-scene/**            [8 <table>, 7 <form>, 23 inline style, 12 className, 7 any]
│   │       ├── datasources/**                [1 <table>, 1 <form>, 5 className]
│   │       ├── dimensions/**                 [1 <button>, 2 <table>]
│   │       ├── explore/**                    [13 class, 1 <button>, 2 <table>, 17 inline style, 4 className, 4 any]
│   │       ├── inspector/**                  [2 class]
│   │       ├── library-panels/**             [2 <table>]
│   │       ├── logs/**                       [2 class, 4 <button>, 5 <table>]
│   │       ├── manage-dashboards/**          [1 class (legacy), 2 <table>]
│   │       ├── migrate-to-cloud/**           [1 <form>]
│   │       ├── plugins/**                    [1 class (error boundary, excluded), 2 <table>, 20 any]
│   │       ├── provisioning/**               [1 <button>, 11 <form>, 12 inline style, 8 any]
│   │       ├── query/**                      [3 class]
│   │       ├── scopes/**                     [1 <button>]
│   │       ├── serviceaccounts/**            [2 <table>, 1 <form>, 3 className]
│   │       ├── support-bundles/**            [1 <table>]
│   │       ├── teams/**                      [1 <table>, 3 <form>, 4 inline style]
│   │       ├── transformers/**               [1 class, 9 className, 8 any]
│   │       ├── variables/**                  [4 class, 2 inline style, 7 className, 18 any]
│   │       └── (remaining modules touched only by any-type remediation or not at all)
│   └── app/plugins/
│       ├── datasource/**                     [13 class, 3 <button>, 4 <table>, 22 inline style, 40 className, 32 any]
│       └── panel/**                          [12 class, 1 <button>, 3 <table>, 24 inline style, 7 className, 22 any]
└── packages/
    ├── grafana-data/src/                     [23 any in types, 7 in utils, 4 in dataframe, 4 in transformations]
    ├── grafana-prometheus/src/               [1 <button>, 1 <table>, 3 className, 7 any]
    ├── grafana-runtime/src/components/       [DataSourcePicker.tsx — 1 class]
    ├── grafana-sql/src/components/           [ErrorBoundary.tsx — OUT OF SCOPE class]
    ├── grafana-ui/src/
    │   ├── index.ts                          [public export barrel — untouched structurally]
    │   ├── components/                       [6 <button>, 3 <table>, 1 <form> (Form.tsx = primitive), 84 inline style, 16 className, 25 any, 2 class]
    │   │   ├── Button/Button.tsx             [primitive — raw <button> is correct]
    │   │   ├── Card/Card.tsx                 [primitive — raw <button> is correct]
    │   │   ├── ErrorBoundary/ErrorBoundary.tsx   [OUT OF SCOPE class]
    │   │   ├── FilterPill/FilterPill.tsx     [primitive — raw <button> is correct]
    │   │   ├── Forms/Form.tsx                [primitive — raw <form> is correct]
    │   │   ├── Forms/Legacy/                 [OUT OF SCOPE (deprecated bundle)]
    │   │   ├── QueryField/QueryField.tsx     [class → functional]
    │   │   ├── Tags/Tag.tsx                  [primitive — raw <button> is correct]
    │   │   ├── Typeahead/Typeahead.tsx       [class → functional]
    │   │   ├── VizRepeater/VizRepeater.tsx   [class — excluded from 71 list per user]
    │   │   ├── uPlot/Plot.tsx                [class — excluded from 71 list per user]
    │   │   └── … (88 other component families)
    │   ├── themes/                           [ThemeContext.tsx, default.ts, light.ts, dark.ts — untouched]
    │   └── graveyard/                        [OUT OF SCOPE]
    └── (other SDK packages — minimal in-scope footprint)
```

Every file listed above will be modified **in place** at its existing path. No file is created, moved, renamed, or deleted as part of this refactor. No new directories are introduced. The directory layout remains identical to the current structure.

## 0.3 Scope Boundaries

### 0.3.1 Exhaustively In Scope

The following path patterns delimit every file the Blitzy platform will inspect, modify, or re-validate during this refactor. Trailing wildcards (`**`) are used only where the cohort naturally spans an entire subtree; otherwise file paths are listed explicitly.

**Class component source transformations:**

- `public/app/AppWrapper.tsx`
- `public/app/core/components/GraphNG/GraphNG.tsx`
- `public/app/core/components/OptionsUI/multiSelect.tsx`
- `public/app/core/components/OptionsUI/select.tsx`
- `public/app/core/components/SharedPreferences/SharedPreferencesOld.tsx`
- `public/app/features/alerting/unified/components/rule-editor/QueryRows.tsx`
- `public/app/features/annotations/components/StandardAnnotationQueryEditor.tsx`
- `public/app/features/dashboard/components/DashboardRow/**`
- `public/app/features/dashboard/components/DashboardSettings/**`
- `public/app/features/dashboard/components/PanelEditor/**`
- `public/app/features/dashboard/components/ShareModal/**`
- `public/app/features/dashboard/components/SubMenu/**`
- `public/app/features/dashboard/components/TransformationsEditor/**`
- `public/app/features/dashboard/containers/**`
- `public/app/features/dashboard/dashgrid/**`
- `public/app/features/explore/**`
- `public/app/features/inspector/**`
- `public/app/features/logs/components/**`
- `public/app/features/query/components/**`
- `public/app/features/transformers/editors/**`
- `public/app/features/variables/editor/**`
- `public/app/features/variables/pickers/**`
- `public/app/features/variables/query/**`
- `public/app/plugins/datasource/azuremonitor/components/ConfigEditor/**`
- `public/app/plugins/datasource/cloud-monitoring/components/**`
- `public/app/plugins/datasource/grafana/components/**`
- `public/app/plugins/datasource/graphite/**`
- `public/app/plugins/datasource/influxdb/**`
- `public/app/plugins/datasource/loki/components/**`
- `public/app/plugins/datasource/tempo/**`
- `public/app/plugins/panel/annolist/**`
- `public/app/plugins/panel/bargauge/**`
- `public/app/plugins/panel/canvas/**`
- `public/app/plugins/panel/debug/**`
- `public/app/plugins/panel/geomap/**`
- `public/app/plugins/panel/gettingstarted/**`
- `public/app/plugins/panel/histogram/**`
- `public/app/plugins/panel/live/**`
- `packages/grafana-runtime/src/components/DataSourcePicker.tsx`
- `packages/grafana-ui/src/components/QueryField/QueryField.tsx`
- `packages/grafana-ui/src/components/Typeahead/Typeahead.tsx`

**Raw-element → design-system replacement sites (matched by grep at refactor time):**

- `public/app/**/*.tsx` matching `<button([[:space:]]\|>)` (excluding primitives and out-of-scope test/story/gen/e2e files) — 60 files
- `public/app/**/*.tsx` matching `<table([[:space:]]\|>)` — 69 files
- `public/app/**/*.tsx` matching `<form([[:space:]]\|>)` — 70 files
- `packages/grafana-prometheus/src/**/*.tsx` matching the same patterns
- `packages/grafana-flamegraph/src/CallTree/**/*.tsx` matching `<table([[:space:]]\|>)`
- `packages/grafana-ui/src/components/**/*.tsx` matching the same patterns — except `Button/Button.tsx`, `Card/Card.tsx`, `FilterPill/FilterPill.tsx`, `Tags/Tag.tsx`, `Table/TableNG/components/HeaderCell.tsx`, `Table/TableRT/HeaderRow.tsx`, `Forms/Form.tsx`, `utils/storybook/ExampleFrame.tsx`, `VizLegend/FacetedLabelsFilter.tsx`, and any other file that is itself the design-system primitive, which retain their raw elements with an inline justification comment.

**Inline-style migration sites:**

- `public/app/**/*.tsx` matching `style=\{\{` — 185 files across 11 top-level feature folders and 15 plugin folders
- `packages/grafana-ui/src/components/**/*.tsx` matching `style=\{\{` (84 occurrences in design-system internals — layout-only styles migrate to `Box`/`Stack`; theme-value styles migrate to local `useStyles2`)
- `packages/grafana-flamegraph/src/CallTree/**/*.tsx` matching `style=\{\{` (4 occurrences)
- `packages/grafana-prometheus/src/**/*.tsx` matching `style=\{\{`

**Legacy-className migration sites:**

- `public/app/**/*.tsx` matching `className=["']([a-z][a-z0-9-]+)["']` where the captured string corresponds to a selector defined in `public/sass/**/*.scss` — 172 files total (40 in `public/app/plugins/datasource/**`, 12 in `public/app/features/dashboard-scene/**`, 11 in `public/app/core/components/**`, plus admin, dashboard, transformers, variables, serviceaccounts, profile, canvas, datasources, explore — see Source Cohort 6)
- `packages/grafana-ui/src/components/**/*.tsx` matching the same criterion — 16 files
- `packages/grafana-prometheus/src/configuration/**/*.tsx` matching the same criterion — 3 files

**TypeScript** `any` **elimination sites:**

- `public/app/**/*.ts`, `public/app/**/*.tsx` containing `any` annotations, assertions, casts, or generic arguments — the 443 files / 568 occurrences enumerated from `eslint-suppressions.json` + non-suppressed scan (excluding `*.gen.ts`, `*.test.*`, `*.spec.*`, `*.stories.tsx`)
- `packages/grafana-data/src/**/*.ts`, `packages/grafana-runtime/src/**/*.ts`, `packages/grafana-ui/src/**/*.ts`, `packages/grafana-ui/src/**/*.tsx`
- `packages/grafana-api-clients/src/**/*.ts` excluding `**/*.gen.ts`
- `packages/grafana-prometheus/src/**/*.ts`, `packages/grafana-prometheus/src/**/*.tsx`
- `packages/grafana-flamegraph/src/**/*.ts`, `packages/grafana-flamegraph/src/**/*.tsx`
- `packages/grafana-schema/src/**/*.ts` (non-generated portions only)

**Test updates (only for changed files' existing tests — Jest test files, NOT e2e files):**

- `public/app/**/*.test.ts`, `public/app/**/*.test.tsx` co-located next to any remediated source file — updated only to adjust imports and component-instantiation shape to the new functional API (no new test coverage added, no behavior changed)
- `packages/grafana-ui/src/**/*.test.ts`, `packages/grafana-ui/src/**/*.test.tsx` co-located next to any remediated source file — same rules

**Import corrections:**

- Every file that previously imported a class-component symbol, a raw-element-wrapper util, or an `any`-typed export from a remediated file — the Blitzy platform will update these import sites to match the new export signature even though the file path remains identical.

**Build artifacts and caches touched only indirectly:**

- `eslint-suppressions.json` — regenerated via `yarn lint --fix` (suppressions for remediated files removed; no new suppressions added). This file is maintained by Grafana's repo-wide `eslint-plugin-suppressions` workflow and is considered a derived artifact, not a hand-edited file.
- `.nx/` cache, `tsconfig.tsbuildinfo` incremental-build caches — invalidated and regenerated by `yarn typecheck` and `yarn lint`.

**Documentation updates:**

- `CHANGELOG.md` — append a "Frontend Modernization" bullet list under the next release heading summarizing the four-dimension remediation. No other doc files are touched, because the refactor preserves all external behavior, exports, and component APIs.

### 0.3.2 Explicitly Out of Scope

The user's prompt defines an explicit OUT-OF-SCOPE set. The Blitzy platform honors it in full. The following files, modules, and concerns MUST NOT be modified, inspected for behavior changes, or expanded beyond their current definition:

- **Backend services**: all `pkg/**`, all Go files (`*.go`), all `conf/**`, all `hack/**`, all `scripts/**` (Go tooling), all Makefile/Dockerfile build scripting. No Go code is read or modified.
- **REST API contracts**: `public/api-enterprise-spec.json`, `public/api-merged.json`, `public/openapi3.json`, all OpenAPI/GraphQL schema definitions under `apps/**/schema/` and `kinds/**`, `kindsv2/**`. API response shapes, endpoint paths, and HTTP verbs remain untouched.
- **GraphQL schemas**: any `.graphql` / `.gql` files (none found in the current tree but reserved by the user's exclusion list).
- **Plugin API surface — public exports of** `@grafana/data`**,** `@grafana/runtime`: no public export is renamed, removed, or changed in shape. `packages/grafana-data/src/index.ts`, `packages/grafana-runtime/src/index.ts`, `packages/grafana-schema/src/index.ts`, `packages/grafana-e2e-selectors/src/index.ts` retain their current barrel contents. Private internal files inside those packages may be touched only where they contain `any` occurrences — and only when the fix has zero impact on the public barrel's type surface.
- **E2E test files**: `e2e/**/*.ts`, `e2e/**/*.js`, `e2e-playwright/**/*.ts`, `e2e-playwright/**/*.spec.ts`, `*.e2e.ts`, `*.e2e.tsx`, Cypress specs in `e2e/old-arch/**`, Playwright specs anywhere.
- **Storybook stories**: `*.stories.tsx`, `*.story.tsx`, `*.mdx` — UNLESS a specific story file contains production-path logic (currently none do; the Blitzy platform defaults to excluding every `.stories.tsx` / `.story.tsx`).
- **Generated files**: `*.gen.ts`, `*.gen.tsx`, `*.pb.ts`, protobuf outputs, RTK Query generated endpoint files (`packages/grafana-api-clients/src/clients/rtkq/*/v*/endpoints.gen.ts`, `public/app/api/clients/*/v*/endpoints.gen.ts`), CUE-generated `panelcfg.gen.ts` files, `types.gen.ts`, `x-definitions.gen.ts`.
- **Redux slices, routing logic, data-fetching logic** — UNLESS directly embedded inside a class lifecycle method being converted. The Blitzy platform converts the lifecycle but preserves every dispatched action, thunk call, RTK Query hook invocation, and Router navigation verbatim. No reducer, selector, action creator, or route definition is restructured.
- **Webpack config**: `scripts/webpack/**/*`, `package.json` build scripts, module resolution rules — unchanged.
- **Bundler, package.json top-level**: no new dependencies are added except scoped `.d.ts` declarations colocated with their imports; no version bumps occur; no workspace topology changes. The TypeScript version (5.9.2) remains fixed.
- **Visual output**: pixel-equivalent rendering must be preserved. Where `@grafana/ui` defaults produce an intentional but subtle visual delta from the raw element (e.g., `Button`'s default `md` size vs. the caller's raw CSS), the Blitzy platform picks the closest-equivalent size/variant and preserves user-facing appearance.
- **Accessibility**: ARIA attributes, keyboard navigation, focus management — preserved or improved, never degraded.
- **Prop interfaces exposed to plugin authors**: unchanged. Every `export interface` and `export type` on a plugin-facing component retains its current shape. Internal-only types may be strengthened (e.g., `props: any` → `props: QueryEditorProps<DS, Q>`).
- **Any file, component, or module not within the four modernization dimensions**: no opportunistic cleanup, no rename, no dead-code removal, no new test coverage, no TODO-fixing. If a code-quality issue or unrelated bug is discovered during migration, the Blitzy platform will add an inline `// TODO(modernization-2026): ...` comment (matching the prompt's "note it in an inline comment but do not fix it" directive) and move on.
- **Legacy Sass source in** `public/sass/**`: files continue to exist and continue to be shipped. Nothing is deleted from `public/sass/_grafana.scss`, `public/sass/_angular.scss`, `public/sass/base/**`, or `public/sass/_variables.*.scss`. Only the `className=""` call sites referring to those classes are replaced with theme-aware Emotion equivalents.
- **Graveyard components**: `packages/grafana-ui/src/graveyard/**` — the existing ESLint override (eslint.config.js line 127) already excludes this folder; the Blitzy platform respects that.
- **Legacy Forms**: `packages/grafana-ui/src/components/Forms/Legacy/**` — `LegacyForms` is deprecated but still exported; no conversion is performed. Class form remains as-is until its scheduled removal in a separate future effort.
- **ErrorBoundary-style utility classes**: `packages/grafana-ui/src/components/ErrorBoundary/ErrorBoundary.tsx`, `packages/grafana-sql/src/components/ErrorBoundary.tsx`, `public/app/features/plugins/components/PluginErrorBoundary.tsx` — these implement React's class-only `getDerivedStateFromError` / `componentDidCatch` API and are intentionally exempted via `react-prefer-function-component: ['error', { allowJsxUtilityClass: true }]`.
- **SDK-internal class components not on the user's 71-file list**: `packages/grafana-ui/src/components/Monaco/CodeEditor.tsx`, `packages/grafana-ui/src/components/Select/ValueContainer.tsx`, `packages/grafana-ui/src/components/TableInputCSV/TableInputCSV.tsx`, `packages/grafana-ui/src/components/VizRepeater/VizRepeater.tsx`, `packages/grafana-ui/src/components/uPlot/Plot.tsx` — these have their class form preserved because they interact with third-party libraries (Monaco, react-select, react-copy-to-clipboard, uPlot) whose class-lifecycle coupling is intentional. They remain in the baseline `eslint-suppressions.json`.
- `pkg/**`**,** `apps/**`**,** `conf/**`**,** `devenv/**`**,** `docs/**`**,** `hack/**`**,** `contribute/**`**,** `kinds/**`**,** `kindsv2/**`**,** `emails/**`**,** `grafana-mixin/**`**,** `.github/**`**,** `.citools/**`**,** `tools/**`**,** `cue.mod/**`**,** `packaging/**`**,** `embed.go`: untouched.

The four success metrics specified by the user (0 remaining class components from the 71-list, 0 remaining raw `<button>` from the 60-list, 0 remaining raw `<table>` from the 69-list, 0 remaining raw `<form>` from the 70-list, 0 remaining inline-style occurrences from the 185-list, 0 remaining legacy className strings from the 172-list, 0 remaining `any` occurrences from the 443-file / 568-occurrence list) are themselves the exhaustive list of things changed by this refactor.

## 0.4 Design System Compliance

### 0.4.1 System Identification

- **Library**: `@grafana/ui`
- **Version**: `13.0.0-pre` (workspace package, published from `packages/grafana-ui/` within the Grafana monorepo; locally resolved via Yarn 4 workspaces and the `@grafana-app/source` TypeScript `customConditions` entry)
- **Status**: Installed — all three SDK packages (`@grafana/ui`, `@grafana/data`, `@grafana/runtime`) appear in the root `package.json` `dependencies` as `workspace:*` and resolve from `packages/grafana-ui/`, `packages/grafana-data/`, and `packages/grafana-runtime/`. No new dependency needs to be added.
- **Package registry**: private workspace resolution (`packages/grafana-ui`); public release channel `npm:@grafana/ui` (license Apache-2.0)
- **Primary documentation source inspected**: `packages/grafana-ui/src/index.ts` (400-line public barrel), `packages/grafana-ui/src/components/**` (90+ component family directories), `packages/grafana-ui/src/themes/**` (theme context, token definitions), `packages/grafana-ui/README.md`, `contribute/style-guides/styling.md` (contributor styling conventions).
- **Supporting libraries (already installed)**: `@emotion/css` 11.13.5, `@emotion/react` 11.14.0, `@emotion/eslint-plugin` 11.12.0 (imported by `useStyles2` internals and by the `css()` / `cx()` helpers this refactor targets), `classnames` 2.5.1 (only used where legacy patterns already rely on it — new code prefers `cx` from `@emotion/css`), `@grafana/i18n` ^25.0.0 (for `Trans` / `t`, re-exporting `i18next`+`react-i18next`), `@grafana/data` workspace:\* (for `GrafanaTheme2`, `ThemeSpacingTokens`, data-frame types), `react` 18.3.1 (hooks target).
- **ESLint enforcement**: `eslint-plugin-react-prefer-function-component` 4.0.1 at `error` level enforces the functional-component migration; `@emotion/jsx-import` and `@emotion/syntax-preference: [2, 'object']` at `error` level enforce Emotion adoption with object syntax; `@typescript-eslint/no-explicit-any` at the configured level (with per-file suppression counts in `eslint-suppressions.json`) enforces the `any` elimination.

### 0.4.2 Component Mapping

The Blitzy platform cites every replacement target by its exact `@grafana/ui` import name and path. All imports use the stable public barrel `@grafana/ui`; deep imports of the form `@grafana/ui/src/*` are forbidden by `eslint.config.js` lines 65–67.

| UI Element (Current) | @grafana/ui Component | Import Path | Props / Variant Guidance | Notes |
| --- | --- | --- | --- | --- |
| Raw <button> with primary styling | Button | @grafana/ui → Button | variant="primary", size="md", icon?, onClick, disabled, tooltip | Preserves existing onClick handler semantics; aria-label + tooltip required for icon-only buttons |
| Raw <button> with destructive styling | Button | @grafana/ui → Button | variant="destructive" |  |
| Raw <button> with secondary / no-styling | Button | @grafana/ui → Button | variant="secondary" (default) or fill="text" |  |
| Raw <a class="btn ..."> used as link | LinkButton | @grafana/ui → LinkButton | href, variant, target, rel | Preserves anchor semantics; disabled uses aria-disabled + tabIndex=-1 |
| Raw <button> with icon only | IconButton | @grafana/ui → IconButton | name={IconName}, aria-label (required), tooltip, variant | Auto-forwards aria-label to accessible name |
| Raw <button> inside toolbars | ToolbarButton / ToolbarButtonRow | @grafana/ui → ToolbarButton | icon, variant, narrow | Used inside PageToolbar or ToolbarButtonRow |
| Confirm-style destructive button | ConfirmButton / DeleteButton | @grafana/ui → ConfirmButton, DeleteButton | confirmText, onConfirm |  |
| Clipboard copy button | ClipboardButton | @grafana/ui → ClipboardButton | getText, onClipboardCopy |  |
| Full-width submit button | Button inside FullWidthButtonContainer | @grafana/ui → Button, FullWidthButtonContainer | type="submit", fullWidth pattern |  |
| Raw <table> rendering tabular data | InteractiveTable | @grafana/ui → InteractiveTable | columns, data, getRowId, pageSize, headerTooltips | Full-featured: sorting, pagination, expansion. Prefer this for all dynamic/mutable tables |
| Raw <table> rendering panel data (time-series, query results) | Table | @grafana/ui → Table | data: DataFrame, width, height, columns | Backed by TableNG / TableRT internals; correct for panel-plugin and inspector tables |
| Raw <table> for CSV input | TableInputCSV | @grafana/ui → TableInputCSV | text, onSeriesParsed |  |
| Raw <table> with minimal rendering (static docs) | InteractiveTable | @grafana/ui → InteractiveTable | Use empty columns[] config plus read-only data | When content truly is not tabular, replace with <Stack> of <Card> — flag as a judgment call per file |
| Raw <form> wrapping react-hook-form | Form | @grafana/ui → Form | <Form<T> onSubmit={...}>{(formApi) => (...)}</Form> | Form is an existing render-prop wrapper around react-hook-form (deprecated note in JSDoc — use react-hook-form's useForm directly for new code, but keep Form for minimal-change refactors when the existing file uses render-prop pattern) |
| Raw <form> with custom submit logic | native <form onSubmit> wrapped in <FieldSet> containing <Field> entries | @grafana/ui → FieldSet, Field, Legend, Label, InlineField, InlineFieldRow, InlineLabel, FieldValidationMessage | <Field label="..." description="..." invalid error="..."><Input .../></Field> | In this case the <form> element itself stays (Form.tsx uses it); the internal layout becomes Field/FieldSet-based |
| Text input | Input / AutoSizeInput | @grafana/ui → Input, AutoSizeInput | value, onChange, placeholder, invalid, prefix, suffix |  |
| Filter / search input | FilterInput | @grafana/ui → FilterInput | value, onChange, placeholder, width |  |
| Secret / password input | SecretInput / SecretTextArea | @grafana/ui → SecretInput, SecretTextArea | isConfigured, onReset, onChange |  |
| Multi-line text | TextArea | @grafana/ui → TextArea | value, onChange, rows, invalid |  |
| Dropdown select (new code) | Combobox | @grafana/ui → Combobox, MultiCombobox | options: ComboboxOption[], value, onChange, placeholder | Select is nearly deprecated in favor of Combobox per the index.ts comment; new replacements for raw <select> MUST use Combobox |
| Dropdown select (legacy code) | Select | @grafana/ui → Select | options, value, onChange | Only preserve existing Select call sites; do not introduce new Select usages |
| Toggle / on-off | Switch / InlineSwitch | @grafana/ui → Switch, InlineSwitch | value, onChange, transparent, label |  |
| Boolean checkbox | Checkbox | @grafana/ui → Checkbox | value, onChange, label, description |  |
| Radio group | RadioButtonGroup / RadioButtonList / RadioButtonDot | @grafana/ui → RadioButtonGroup, RadioButtonList, RadioButtonDot | options, value, onChange, size |  |
| File upload | FileUpload / FileDropzone | @grafana/ui → FileUpload, FileDropzone | accept, onFileUpload, options |  |
| Inline layout row | Stack | @grafana/ui → Stack | direction="row" (default), gap={1}, alignItems, justifyContent, wrap | Default gap is 1 spacing unit |
| Vertical stack | Stack | @grafana/ui → Stack | direction="column", gap={1} |  |
| Grid layout | Grid | @grafana/ui → Grid | columns, rowGap, columnGap, alignItems |  |
| Any styled container (padding/margin/bg/border/shadow) | Box | @grafana/ui → Box | padding, margin, backgroundColor, borderColor, borderStyle, borderRadius, boxShadow, display, element="article" | Polymorphic (defaults to div; can render any HTML element via the element prop) |
| Fixed-size spacer | Space | @grafana/ui → Space | v={n}, h={n}, layout="inline" |  |
| Scrollable area | ScrollContainer / CustomScrollbar | @grafana/ui → ScrollContainer, CustomScrollbar | height, hideTracksWhenNotNeeded | ScrollContainer is preferred |
| Tabs | TabsBar + Tab + TabContent / TabbedContainer | @grafana/ui → TabsBar, Tab, TabContent, TabbedContainer | tabs, activeTab, onChangeTab |  |
| Collapsible section | Collapse | @grafana/ui → Collapse | label, collapsible, isOpen, onToggle |  |
| Visual separator | Divider | @grafana/ui → Divider | direction, spacing |  |
| Modal | Modal / ConfirmModal | @grafana/ui → Modal, ConfirmModal | isOpen, onDismiss, title |  |
| Drawer | Drawer | @grafana/ui → Drawer | title, onClose, size |  |
| Tooltip | Tooltip / Toggletip | @grafana/ui → Tooltip, Toggletip | content, placement, theme |  |
| Menu / context menu | Menu, MenuGroup, MenuItem, ContextMenu, WithContextMenu, Dropdown | @grafana/ui → same | items, onClick, placement |  |
| Badges / pills | Badge, FeatureBadge, PluginSignatureBadge, FilterPill | @grafana/ui → same | text, color, icon |  |
| Alert banner | Alert | @grafana/ui → Alert | severity, title, onRemove |  |
| Empty state | EmptyState, EmptySearchResult | @grafana/ui → EmptyState, EmptySearchResult | variant, message |  |
| Loading indicator | Spinner, LoadingBar, LoadingPlaceholder | @grafana/ui → same | size, inline |  |
| Icon | Icon | @grafana/ui → Icon | name, size |  |
| Text / typography | Text, TextLink | @grafana/ui → Text, TextLink | variant, color, weight, element | Use instead of raw <span> / <p> when typography tokens matter |
| Card | Card, CardContainer | @grafana/ui → Card, CardContainer | href, noMargin, disableEvents | Raw anchor inside Card is correct; external links still use TextLink |
| Error boundary | ErrorBoundary, ErrorBoundaryAlert | @grafana/ui → ErrorBoundary, ErrorBoundaryAlert | Class-required API — OUT OF SCOPE for conversion |  |
| Code editor | CodeEditor, ReactMonacoEditor | @grafana/ui → CodeEditor, ReactMonacoEditor | language, value, onBlur, onSave |  |
| Refresh picker | RefreshPicker | @grafana/ui → RefreshPicker | onRefresh, intervals, isLoading |  |
| Time-range picker | TimeRangePicker, DateTimePicker | @grafana/ui → same | value, onChange, fiscalYearStartMonth |  |
| Error Alert (for failed form/submit) | Alert with severity="error" | @grafana/ui → Alert | severity="error", title, children for detail | Replacement for ad-hoc inline error <div>s |

### 0.4.3 Token Mapping

Not applicable in the Figma sense (no Figma designs are provided for this refactor), but for completeness the Blitzy platform documents the token-level mapping from the legacy-className cohort to modern theme tokens. Every hardcoded CSS value in the inline-styles cohort resolves to a token from `GrafanaTheme2` in `packages/grafana-data/src/themes/createTheme.ts` and its sub-modules.

| Category | Legacy Source | Design-System Token | Access Pattern |
| --- | --- | --- | --- |
| Spacing unit | public/sass/_variables.generated.scss $spacer: 8px | theme.spacing(n) | useStyles2((theme) => ({ x: css({ padding: theme.spacing(2) }) })) |
| Spacing — small (sm) | hardcoded padding: 8px | theme.spacing(1) | Box: padding={1} / Stack: gap={1} |
| Spacing — medium (md) | hardcoded padding: 16px | theme.spacing(2) | padding={2} / gap={2} |
| Spacing — large (lg) | hardcoded padding: 24px | theme.spacing(3) | padding={3} / gap={3} |
| Primary color | hardcoded #FF780A (Grafana orange), .text-primary | theme.colors.primary.text, theme.colors.primary.main, theme.colors.primary.shade | backgroundColor="primary" prop on Box, or theme.colors.primary.main in css() |
| Secondary surface | .panel-bg | theme.colors.background.secondary, theme.components.panel.background | backgroundColor="secondary" on Box |
| Canvas surface | .main-view | theme.colors.background.canvas | backgroundColor="canvas" on Box |
| Danger / error | .text-danger, hardcoded #e02f44 | theme.colors.error.text, theme.colors.error.main, theme.colors.error.border |  |
| Success | .text-success, #1a7f4b | theme.colors.success.text, theme.colors.success.main |  |
| Warning | .text-warning, #e36526 | theme.colors.warning.text, theme.colors.warning.main |  |
| Info | .text-info, #5794f2 | theme.colors.info.text, theme.colors.info.main |  |
| Border — default | hardcoded 1px solid #333 | theme.colors.border.weak, theme.colors.border.medium, theme.colors.border.strong |  |
| Border radius — default | hardcoded border-radius: 2px or 4px | theme.shape.radius.default | borderRadius="default" on Box |
| Border radius — circle | hardcoded border-radius: 50% | theme.shape.radius.circle | borderRadius="circle" on Box |
| Border radius — pill | hardcoded border-radius: 9999px | theme.shape.radius.pill | borderRadius="pill" on Box |
| Font family — body | .text | theme.typography.body.fontFamily |  |
| Font family — mono | hardcoded font-family: Menlo, ... | theme.typography.fontFamilyMonospace |  |
| Font size — body | .text | theme.typography.body.fontSize | Text component with variant="body" |
| Font size — bodySmall | .text-sm | theme.typography.bodySmall.fontSize | Text variant bodySmall |
| Font size — h1–h6 | .page-heading | theme.typography.h1..h6 | Text with element="h1" / variant="h1" |
| Shadow — z1 | hardcoded box-shadow | theme.shadows.z1, z2, z3 | boxShadow="z1" on Box |
| Breakpoint — sm | hardcoded @media (max-width: 544px) | theme.breakpoints.down('sm') | Inside css({ [theme.breakpoints.down('sm')]: { padding: theme.spacing(1) } }) |
| Z-index — modal | hardcoded z-index: 1040 | theme.zIndex.modal, theme.zIndex.dropdown, theme.zIndex.tooltip, theme.zIndex.sidemenu, theme.zIndex.navbarFixed |  |

### 0.4.4 Gaps Inventory

Based on the catalog performed against `packages/grafana-ui/src/components/**` and the `@grafana/ui` public barrel, the Blitzy platform has identified the following predictable gaps. For each gap, the policy is: keep the raw element in place, add an inline `// Design system gap: ...` comment, and do not hand-roll a custom approximation. The per-file gap list is finalized during the per-file rewrite; this inventory names every anticipated gap class.

| Gap Category | Reason | Resolution |
| --- | --- | --- |
| <details> / <summary> native expander | No @grafana/ui equivalent provides the same progressive-enhancement semantics outside of Collapse | If the site needs a disclosure widget, use Collapse. If the site specifically requires <details>/<summary> (HTML-native progressive enhancement), keep raw with gap comment. |
| <progress> / <meter> | No @grafana/ui primitive | Keep raw with gap comment; flag design-system team |
| <dialog> native dialog | Modal is the Grafana equivalent but uses React portals and controlled open state | Use Modal for all new or replaceable sites; keep raw <dialog> only if the caller intentionally relies on HTML-native popover/esc semantics |
| <iframe> | Out of design-system concern | Keep raw with existing styling |
| <svg> inline | Handled by react-inlinesvg or Icon | Use Icon for icon-name usages; SVG literal acceptable for custom inline illustrations with gap comment |
| <audio> / <video> | No @grafana/ui media primitives | Keep raw |
| <canvas> | Used by panel plugins (e.g., public/app/plugins/panel/canvas/**, uPlot plots) | Keep raw — required for rendering engine |
| <select> with native browser popup | Combobox replaces this; Select is legacy | Use Combobox for all replacements |
| <input type="color"> | Grafana provides ColorPicker | Use ColorPicker |
| <input type="file"> | Grafana provides FileUpload / FileDropzone | Use these |
| <input type="range"> | Grafana provides Slider / RangeSlider | Use these |
| Raw <button> inside Button / Card / FilterPill / Tag / Table* internals | The component IS the primitive | Keep raw; this is the canonical implementation |
| Raw <form> inside Forms/Form.tsx | The component IS the Form wrapper | Keep raw |
| <table> inside Table/TableNG/**, Table/TableRT/** internals | The component IS the table primitive | Keep raw |
| Custom tables with ordered rows / drag-and-drop / virtualization beyond InteractiveTable capabilities | Uncommon but possible | Evaluate per file; may require gap comment and keep raw |
| Raw <label> not associated with a <Field> | Usually handled by <Label> | Replace with <Label> |
| Raw <h1>…<h6> | Replaceable with <Text element="h1" variant="h1"> | Replace with Text when theme-alignment matters; keep raw if it's already inside a design-system primitive that sets heading styles |
| Raw <a> | Replace with TextLink (per eslint.config.js line 214: rule against bare anchors with only text) | Use TextLink or LinkButton |

### 0.4.5 Compliance Summary

The `@grafana/ui` design system provides direct replacements for the overwhelming majority of targets in the four modernization dimensions: all 60 raw-button sites map to `Button` / `LinkButton` / `IconButton` / `ToolbarButton` / `ConfirmButton` / `ClipboardButton`; all 69 raw-table sites map to `InteractiveTable` / `Table` / `TableInputCSV` except roughly 3–5 cases that are themselves table primitives; all 70 raw-form sites compose from `Field` / `FieldSet` / `Form` / `Input` / `Combobox` / `Switch` / `Checkbox` / `RadioButtonGroup` with one intentional exception (`Forms/Form.tsx`); the 185 inline-style sites map to `Box` / `Stack` / `Grid` / `Space` for layout and `useStyles2` for theme-value styling; and the 172 legacy-className sites map to `useStyles2` with `GrafanaTheme2` tokens. No new dependencies need to be added — `@grafana/ui`, `@emotion/css`, `@emotion/react`, `react`, `@grafana/data`, and `@grafana/i18n` are already installed at their pinned versions. Gaps are expected only where the caller site is itself a design-system primitive or uses a niche HTML element with no Grafana equivalent (estimated 5–12 cases across the 444 non-`any` touched files); these receive inline `// Design system gap: ...` comments per the user's mandate.

## 0.5 Target Design

### 0.5.1 Refactored Structure Planning

Because this is a behavior-preserving in-place refactor, the directory layout after completion is **byte-for-byte identical** to the current layout. No file is added, removed, or moved. The target design is therefore a per-file idiom transformation inside the existing tree. The tree below shows the key subtrees with annotations indicating what each subtree looks like after the refactor; paths without annotations are unchanged.

```plaintext
Target (same tree, modernized contents):
├── public/
│   ├── app/
│   │   ├── AppWrapper.tsx                    [functional, hooks, no React.PureComponent]
│   │   ├── app.ts, initApp.ts, index.ts      [unchanged]
│   │   ├── AppWrapper.test.tsx               [updated: mount() on functional export]
│   │   ├── core/
│   │   │   ├── components/
│   │   │   │   ├── GraphNG/GraphNG.tsx                       [functional]
│   │   │   │   ├── OptionsUI/{multiSelect,select}.tsx        [functional]
│   │   │   │   ├── SharedPreferences/SharedPreferencesOld.tsx [functional — uses useState/useEffect]
│   │   │   │   ├── Login/LoginForm.tsx                       [<Form> + <Field><Input></Field>]
│   │   │   │   ├── Signup/{SignupPage,VerifyEmail}.tsx       [<Form> composition]
│   │   │   │   ├── ForgottenPassword/{*}.tsx                 [<Form> composition]
│   │   │   │   ├── TagFilter/TagFilter.tsx                   [<IconButton> or <Button>; useStyles2 for styling]
│   │   │   │   ├── AccessControl/PermissionList.tsx          [<InteractiveTable>]
│   │   │   │   ├── help/HelpModal.tsx                        [<InteractiveTable>]
│   │   │   │   └── … (all other in-scope core files use Box/Stack + useStyles2)
│   │   │   ├── services/                     [type-only changes: any → concrete types]
│   │   │   ├── utils/                        [type-only changes]
│   │   │   └── … (unchanged)
│   │   └── features/
│   │       ├── alerting/unified/**           [17 forms → <FieldSet><Field><Input></Field></FieldSet>; 6 buttons → <Button>; 7 tables → <InteractiveTable>; 14 inline styles → <Stack>/<Box>; many classNames → useStyles2; 17 any → concrete types]
│   │       ├── admin/**                      [8 tables → <InteractiveTable>; 5 forms → <Form>/<Field>; 9 inline styles → Box/Stack; 8 classNames → useStyles2]
│   │       ├── annotations/**                [class → functional for StandardAnnotationQueryEditor; <InteractiveTable>; any → concrete]
│   │       ├── auth-config/ProviderConfigForm.tsx    [<Form>]
│   │       ├── browse-dashboards/**          [inline-style → <Box>; any → concrete types]
│   │       ├── canvas/**                     [inline-style → <Box>; className → useStyles2]
│   │       ├── dashboard/**                  [11 classes → functional; 1 button → <Button>; 3 tables → <InteractiveTable>; 2 forms → <Form>; 11 inline → <Box>; 8 className → useStyles2; 27 any → concrete]
│   │       ├── dashboard-scene/**            [8 tables → <InteractiveTable>; 7 forms → <Form>; 23 inline → <Box>; 12 className → useStyles2; 7 any → concrete]
│   │       ├── explore/**                    [13 classes → functional; 1 button → <Button>; 2 tables → <InteractiveTable>; 17 inline → <Box>; 4 className → useStyles2; 4 any → concrete]
│   │       ├── inspector/**                  [2 classes → functional]
│   │       ├── logs/components/**            [2 classes → functional; 4 buttons → <Button>; 5 tables → <InteractiveTable>]
│   │       ├── provisioning/**               [1 button → <Button>; 11 forms → <Form>; 12 inline → <Box>; 8 any → concrete]
│   │       ├── query/components/**           [3 classes → functional]
│   │       ├── transformers/editors/**       [1 class → functional; 9 className → useStyles2; 8 any → concrete]
│   │       ├── variables/**                  [4 classes → functional; 7 className → useStyles2; 18 any → concrete]
│   │       └── … (remaining features: type-only remediation)
│   └── app/plugins/
│       ├── datasource/**                     [13 classes → functional; 3 buttons → <Button>; 4 tables → <InteractiveTable>; 22 inline → <Box>; 40 className → useStyles2; 32 any → concrete]
│       └── panel/**                          [12 classes → functional; 1 button → <Button>; 3 tables → <InteractiveTable>; 24 inline → <Box>; 7 className → useStyles2; 22 any → concrete]
├── packages/
│   ├── grafana-ui/src/
│   │   ├── index.ts                          [unchanged — public barrel byte-identical]
│   │   ├── components/
│   │   │   ├── Button/Button.tsx             [primitive — unchanged raw <button> with gap comment]
│   │   │   ├── Card/Card.tsx                 [primitive — unchanged; any → concrete in types.ts]
│   │   │   ├── FilterPill/FilterPill.tsx    [primitive — unchanged]
│   │   │   ├── Forms/Form.tsx                [primitive — unchanged]
│   │   │   ├── Forms/Legacy/                 [OUT OF SCOPE — unchanged]
│   │   │   ├── QueryField/QueryField.tsx    [functional — uses hooks]
│   │   │   ├── Tags/Tag.tsx                  [primitive — unchanged raw <button>]
│   │   │   ├── Typeahead/Typeahead.tsx       [functional]
│   │   │   └── … (other 80+ components with any/style/className remediation as applicable)
│   │   ├── themes/                           [unchanged — tokens are read, not modified]
│   │   └── graveyard/                        [OUT OF SCOPE]
│   ├── grafana-data/src/                     [23 any in types → concrete/generic; public barrel unchanged]
│   ├── grafana-runtime/src/components/
│   │   └── DataSourcePicker.tsx              [functional]
│   ├── grafana-prometheus/src/               [any → concrete; className → useStyles2]
│   └── grafana-flamegraph/src/CallTree/      [inline → <Box>]
├── eslint-suppressions.json                  [regenerated: ~144 files deleted from baseline, 0 added]
├── CHANGELOG.md                              [appended: "Frontend Modernization" bullets under next release heading]
└── (all other top-level files unchanged)
```

Because there is no new repository and no new files, the standalone-operation concern (configuration, dependency management, deployment) does not apply. The existing `package.json`, `yarn.lock`, `tsconfig.json`, `scripts/tsconfig.base.json`, `eslint.config.js`, `jest.config.js`, `playwright.config.ts`, `webpack.*.js`, `Dockerfile`, and `Makefile` remain the authoritative build/test/deploy artifacts and are not edited.

### 0.5.2 Web Search Research Conducted

The Blitzy platform restricted itself to primary sources inside the repository plus the project's own authored documentation, because the user's prompt explicitly lists `@grafana/ui` "current stable" and references internal lint/tsc/test gates — no external framework opinion or migration-tool recommendation is needed. The research surfaces consulted:

- **React 18.3.1 hooks reference**: `react` package in `node_modules`, `@types/react` 18.3.18. The Blitzy platform uses the hooks API exactly as documented: `useState`, `useReducer`, `useEffect`, `useRef`, `useCallback`, `useMemo`, `useContext`, `useImperativeHandle`, `useLayoutEffect`, `useDeferredValue`, `useTransition`, `useId`, plus `React.memo` and `React.forwardRef`.
- `@grafana/ui` **contributor styling guide**: `contribute/style-guides/styling.md` — this repo-internal guide is the canonical source for the styling idiom. Key directives adopted verbatim: (a) use `useStyles2(getStyles)` with `getStyles` placed at the end of the file, (b) `getStyles` receives `GrafanaTheme2` and returns an object of class names, (c) compose multiple classes with `cx` from `@emotion/css`, (d) Emotion's `object` syntax is mandatory per `eslint.config.js` `@emotion/syntax-preference: [2, 'object']`.
- `@grafana/ui` **public barrel**: `packages/grafana-ui/src/index.ts` — authoritative list of every import path available under `@grafana/ui`. The Blitzy platform cites component import names exclusively from this barrel, never from deep `@grafana/ui/src/...` paths.
- **Grafana ESLint configuration**: `eslint.config.js` (480 lines) — source of truth for restricted imports, preferred-function-component enforcement, Emotion syntax preference, `@grafana/no-border-radius-literal`, `@grafana/no-unreduced-motion`, `@grafana/no-restricted-img-srcs`, `@grafana/i18n/no-untranslated-strings`, `@typescript-eslint/consistent-type-imports`.
- **Grafana TypeScript base configuration**: `tsconfig.json` + `scripts/tsconfig.base.json` — `strict: true`, `noImplicitAny: true`, `noImplicitReturns: true`, `noImplicitThis: true`, `noUnusedLocals: true`, `useUnknownInCatchVariables: true`, `isolatedModules: true`, `moduleResolution: "bundler"`, `customConditions: ["@grafana-app/source"]`, `jsx: "react-jsx"`.
- **React-Redux hooks guidance**: `eslint.config.js` line 71–74 restricts `useDispatch` / `useSelector` from `react-redux` and redirects to `app/types/store`. When a class component uses `connect(mapStateToProps, mapDispatchToProps)(Class)`, the Blitzy platform replaces that pattern with `useSelector<StoreState, ReturnType>(mapStateToProps)` and `useDispatch()` from `app/types/store` inside the body of the new functional component.
- **React Router 5 + v6 compat**: `react-router` 5.3.4 + `react-router-dom-v5-compat` 6.26.1 — routing logic is OUT OF SCOPE; the Blitzy platform does not touch route definitions or navigation helpers.
- **Existing functional equivalents already in repo**: `public/app/core/components/SharedPreferences/SharedPreferencesFunctional.tsx` is a functional counterpart to the in-scope `SharedPreferencesOld.tsx` and serves as a direct in-repo reference for how the Blitzy platform must structure the converted version (same props/state, hooks-based, same `@grafana/ui` imports, same translations, same test expectations).

No external web search was performed because all necessary guidance is present in the repository's own canonical docs, ESLint config, and existing functional components.

### 0.5.3 Design Pattern Applications

The Blitzy platform applies a narrow set of well-defined React patterns. Each is chosen for minimal-change compatibility with the existing code and maximum alignment with Grafana's established idiom.

- **Functional component with hooks** — the canonical post-conversion shape. State → `useState` when fields are independent, `useReducer` when multiple fields transition together (matches the `setState({ a, b, c })` pattern in class components). Side effects → `useEffect` with explicit dependency arrays. Instance variables → `useRef`. Memoized callbacks → `useCallback` only when referential identity matters to a child's reconciliation. Memoized derived values → `useMemo` only when the computation is demonstrably expensive.
- `React.memo` **for opt-in referential-equality optimization** — applied only when the source `PureComponent` relied on shallow prop equality to skip re-renders and a measurable regression would occur without memoization. Default behavior is no memoization.
- `React.forwardRef` **for ref forwarding** — applied when the class used `ref` / `React.createRef()` to expose DOM handles to parents; the functional rewrite forwards the ref through `React.forwardRef<HTMLElement, Props>`.
- `useStyles2(getStyles)` **with file-tail** `getStyles` — Grafana's canonical Emotion pattern. Every in-scope file that introduces styling receives a `getStyles = (theme: GrafanaTheme2) => ({ wrapper: css({ ... }) })` at the bottom of the file and a `const styles = useStyles2(getStyles)` call inside the component body.
- `Box`**/**`Stack`**/**`Grid`**/**`Space` **layout composition** — applied to every inline `style={{}}` whose content is purely layout (flex, grid, padding, margin, gap, alignment). The Blitzy platform prefers `Stack` for 1-D layouts and `Grid` for 2-D layouts; `Box` is the fallback polymorphic container for any styling that involves background/border/shadow/radius tokens in addition to layout.
- `useTheme2()` **inside functional body (replacing** `withTheme2` **HOC)** — applied when a class component was wrapped by `withTheme2` to receive the theme as a `Themeable2` prop. The functional rewrite drops the HOC and calls `useTheme2()` at the top of the body.
- `useSelector` **+** `useDispatch` **from** `app/types/store` **(replacing** `connect`**)** — applied when a class is wrapped by `connect`. Every `mapStateToProps` / `mapDispatchToProps` function is inlined as a `useSelector` / dispatch call inside the functional component body. Types follow `StoreState` from `app/types/store`.
- **Render-prop preservation** — where a class component exposes a render-prop callback as part of its public API (e.g., `ErrorBoundary`-style), the Blitzy platform converts to functional only if the class doesn't require React's class-only lifecycle (it does for error boundaries — those remain class).
- **Generics to replace** `any` — `<T>` parameters at the function / component level replace `any` in `Props<T>`, `Array<any>`, `Record<string, any>` when the caller's use provides a determinable type. Where the type is truly opaque (third-party library without types), the Blitzy platform writes a scoped `.d.ts` ambient-module declaration colocated with the import rather than `any`.
- `unknown` **+ type narrowing** — for runtime-variable data (e.g., deserialized JSON, catch-clause error variables, RxJS observable emissions with union types), the Blitzy platform uses `unknown` plus narrowing (`typeof`, `instanceof`, `in` guards, user-defined type guards, or Zod schema parsing where `zod` is already in use).
- `i18n` **translation preservation** — every user-visible text that moves between JSX nodes (e.g., from `<button>Save</button>` to `<Button>Save</Button>`) preserves its existing `<Trans>` or `t('…')` wrapping unchanged.

### 0.5.4 User Interface Design

No user-facing UI change is introduced by this refactor. The success criteria explicitly mandate pixel-equivalent rendering or within-`@grafana/ui`-defaults visual output. Three user-interaction behaviors are preserved or improved:

- **Accessibility semantics**: every ARIA attribute, `role`, `tabIndex`, `aria-label`, `aria-describedby`, `aria-expanded`, `aria-disabled`, `aria-haspopup`, and `aria-live` region attached to a raw element is preserved on the replacement `@grafana/ui` component — which in many cases renders it natively. `@grafana/ui`'s `Button`, for instance, already forwards `aria-label` and `aria-disabled` and wraps disabled buttons in a `Tooltip` context correctly. Where a raw `<button>` site had no `aria-label` but contained only an icon, the replacement `<IconButton>` requires an `aria-label` prop — the Blitzy platform derives it from the closest text context (e.g., a neighboring `<Text>` label or a `tooltip` prop) and adds it rather than omitting it.
- **Keyboard navigation**: `Tab`/`Shift+Tab` focus order is preserved. `@grafana/ui`'s controls use the same default tab semantics as their native counterparts. Focus-trap behavior inside `Modal` / `Drawer` is preserved from the raw `<dialog>`/portal-equivalent sites.
- **Focus management**: where a class component manually moved focus in a lifecycle method (`componentDidMount` + `this.inputRef.current.focus()`), the Blitzy platform preserves this via `useRef` + `useEffect(() => { inputRef.current?.focus(); }, [])`.

The only intentional deviations from pixel-exact rendering are:

- `@grafana/ui`**-intrinsic variants**: where the raw `<button>` was styled with hand-rolled CSS that approximates the `Button` `variant="primary"` appearance, the replacement uses the real `variant="primary"` — which matches the design system baseline exactly and may differ by 1-2 px of padding or 1-2 HSL points of color from the hand-rolled version. This is the "within intentional design system defaults" delta that the IMMUTABLE requirement permits.
- **Legacy** `className="gf-form"` **removal**: `.gf-form` injects `display: flex; margin-bottom: 4px; padding: 2px 0;`. The replacement uses `<Stack direction="row" gap={0.5}>` which produces an equivalent layout. Visual equivalence is maintained when Stack's default gap (1 spacing unit = 8px) differs from `gf-form`'s 4px, by explicitly specifying `gap={0.5}`.

No new UI elements, new screens, new routes, new user flows, or new interactive behaviors are introduced. No Figma designs were supplied with this prompt, so no design-system deviation analysis is applicable beyond the token mapping in 0.4.3.

## 0.6 Transformation Mapping

### 0.6.1 File-by-File Transformation Plan

Every target file maps to the same path as its source (this is an in-place refactor — no file relocation, no renaming, no deletion). Transformation mode is `UPDATE` for every production file that falls inside any of the four modernization dimensions. The reference rows point to files inside the repository that already demonstrate the target pattern and must be consulted when the Blitzy platform is uncertain.

#### Class Component → Functional Component (71 files, all `UPDATE`)

Representative rows from the 71-file cohort; the pattern applies to every file in the 0.2.1 Cohort 1 enumeration.

| Target File | Transformation | Source File | Key Changes |
| --- | --- | --- | --- |
| public/app/AppWrapper.tsx | UPDATE | public/app/AppWrapper.tsx | extends Component<AppWrapperProps, AppWrapperState> → functional; constructor body → useState/useEffect; render body → direct JSX return; GrafanaContext.Provider wrapping preserved |
| public/app/core/components/GraphNG/GraphNG.tsx | UPDATE | public/app/core/components/GraphNG/GraphNG.tsx | componentDidMount/componentDidUpdate/componentWillUnmount → useEffect with explicit deps; instance ref this.plotInstance → useRef<uPlot>(); PanelContextRoot access via useContext(PanelContextRoot) |
| public/app/core/components/SharedPreferences/SharedPreferencesOld.tsx | UPDATE | public/app/core/components/SharedPreferences/SharedPreferencesFunctional.tsx | REFERENCE-equivalent file SharedPreferencesFunctional.tsx is the canonical target pattern: memo((props: Props) => { const [state, setState] = useState(...); useEffect(...); return (...); }). Apply same structure to SharedPreferencesOld.tsx, preserving identical @grafana/ui imports (Button, Field, FieldSet, Label, TimeZonePicker, WeekStartPicker, FeatureBadge, Combobox, TextLink) |
| public/app/features/alerting/**/*.tsx (class files) | UPDATE | same path | Every class in the alerting module → functional; for alerting-specific components that use withTheme2, replace HOC with useTheme2() |
| public/app/features/dashboard/components/PanelEditor/*.tsx (class files) | UPDATE | same path | 11 dashboard class files → functional; componentDidMount triggering panel-instance lifecycle → useEffect(() => { … return cleanup; }, []) |
| public/app/features/dashboard/dashgrid/DashboardPanel.tsx | UPDATE | same path | Class → functional; preserve Redux connect semantics via useSelector<StoreState, …> + useDispatch |
| public/app/features/dashboard/dashgrid/PanelChromeAngularUnsupported.tsx | UPDATE | same path | Simple class → functional arrow component |
| public/app/features/explore/Explore.tsx | UPDATE | same path | extends PureComponent<Props, ExploreState> wrapped by withTheme2 + connect → functional with useTheme2(), useSelector, useDispatch; React.memo wrapper only if perf-critical |
| public/app/features/explore/*.tsx (13 class files total) | UPDATE | same path | All 13 explore class files converted per 0.5.3 patterns |
| public/app/features/variables/editor/VariableEditorContainer.tsx | UPDATE | same path | Class → functional; connect → useSelector/useDispatch from app/types/store |
| public/app/features/variables/query/QueryVariableEditor.tsx | UPDATE | same path | Class → functional; preserve all i18n translations (<Trans i18nKey="...">) |
| public/app/features/query/components/QueryEditorRow.tsx | UPDATE | same path | Class → functional; Subscription / ReplaySubject → useEffect-scoped subscriptions with cleanup returns |
| public/app/features/query/components/QueryEditorRows.tsx | UPDATE | same path | Class → functional |
| public/app/features/logs/components/LogRows.tsx | UPDATE | same path | Class → functional; preserve virtualization-related memoization via React.memo+useMemo |
| public/app/features/logs/components/LogRowMessage.tsx | UPDATE | same path | Class → functional; React.memo applied to preserve reference-equality skip pattern |
| public/app/features/transformers/editors/CalculateFieldTransformerEditor.tsx | UPDATE | same path | Class → functional; component-local setState-in-callback flows → controlled useState updates |
| public/app/features/annotations/components/StandardAnnotationQueryEditor.tsx | UPDATE | same path | Class → functional |
| public/app/features/manage-dashboards/DashboardImport.tsx (non-Legacy) | UPDATE | same path | Class → functional |
| public/app/features/plugins/*.tsx (in-scope class file) | UPDATE | same path | Class → functional; note: PluginErrorBoundary.tsx remains a class (OUT OF SCOPE) |
| public/app/features/alerting/unified/**/*.tsx (alerting classes) | UPDATE | same path | All in-scope alerting classes → functional |
| public/app/plugins/datasource/**/*.tsx (13 class files) | UPDATE | same path | 13 datasource class files (cloudwatch, elasticsearch, graphite, influxdb, loki, opentsdb, prometheus, tempo, testdata, and config-page components) → functional; componentDidCatch semantics where not used for error boundaries stay removed |
| public/app/plugins/panel/**/*.tsx (12 class files) | UPDATE | same path | 12 panel class files (annolist, bargauge, canvas, debug, gauge, heatmap, pluginlist, stat, table, timeseries, and panel-editor variants) → functional |
| public/app/plugins/panel/canvas/CanvasPanel.tsx | UPDATE | same path | Class using PanelContextRoot.contextType, ReplaySubject, Subscription → functional using useContext(PanelContextRoot), subscription inside useEffect with cleanup |
| packages/grafana-runtime/src/components/DataSourcePicker.tsx | UPDATE | same path | Class → functional; preserve public API surface (exported props/types unchanged) |
| packages/grafana-ui/src/components/QueryField/QueryField.tsx | UPDATE | same path | Class → functional; Slate editor ref stabilized via useRef; public API preserved |
| packages/grafana-ui/src/components/Typeahead/Typeahead.tsx | UPDATE | same path | Class → functional; keyboard-navigation state → useReducer |
| packages/grafana-ui/src/components/**/*.tsx (other 10 in-scope classes) | UPDATE | same path | All remaining in-scope @grafana/ui class components → functional; public prop interfaces byte-identical |

#### Raw `<button>` → `@grafana/ui` Button family (60 files, all `UPDATE`)

| Target File | Transformation | Source File | Key Changes |
| --- | --- | --- | --- |
| public/app/features/alerting/**/*.tsx (6 files) | UPDATE | same path | <button onClick={…}> → <Button variant="secondary" onClick={…}>; <button className="btn btn-primary"> → <Button variant="primary">; icon-only <button> → <IconButton name="…" aria-label="…"> |
| packages/grafana-ui/src/components/**/*.tsx (6 files, non-primitive) | UPDATE | same path | Same mapping; primitive self-references (Button.tsx, Tag.tsx, FilterPill.tsx) stay raw with // eslint-disable-next-line -- component primitive comment already present |
| public/app/features/logs/**/*.tsx (4 files) | UPDATE | same path | <button> → <Button> or <IconButton> based on content (text vs icon-only) |
| public/app/core/components/**/*.tsx (4 files) | UPDATE | same path | <button> → <Button>; preserve type="submit" on form-submit buttons |
| public/app/plugins/datasource/**/*.tsx (3 files) | UPDATE | same path | <button> → <Button> |
| public/app/plugins/panel/**/*.tsx (1 file) | UPDATE | same path | <button> → <Button> |
| public/app/features/scopes/**/*.tsx (1 file) | UPDATE | same path | <button> → <Button> |
| public/app/features/provisioning/**/*.tsx (1 file) | UPDATE | same path | <button> → <Button> |
| public/app/features/explore/**/*.tsx (1 file) | UPDATE | same path | <button> → <Button> |
| public/app/features/dimensions/**/*.tsx (1 file) | UPDATE | same path | <button> → <Button> |
| public/app/features/dashboard/**/*.tsx (1 file, non-scene) | UPDATE | same path | <button> → <Button> |
| public/app/plugins/panel/*/querybuilder/**/*.tsx (1 file) | UPDATE | same path | <button> → <Button> |
| packages/grafana-ui/src/utils/**/*.tsx (1 file) | UPDATE | same path | <button> → <Button> |
| packages/grafana-ui/src/components/Button/Button.tsx | OUT OF SCOPE | packages/grafana-ui/src/components/Button/Button.tsx | Primitive self-reference — remains raw <button> with eslint-disable |
| packages/grafana-ui/src/components/FilterPill/FilterPill.tsx | OUT OF SCOPE | same path | Primitive |
| packages/grafana-ui/src/components/Tags/Tag.tsx | OUT OF SCOPE | same path | Primitive |

#### Raw `<table>` → `InteractiveTable` / `Table` (69 files, all `UPDATE`)

| Target File | Transformation | Source File | Key Changes |
| --- | --- | --- | --- |
| public/app/features/admin/**/*.tsx (8 files) | UPDATE | same path | <table><thead>…</thead><tbody>…</tbody></table> → <InteractiveTable columns={…} data={…} getRowId={…} />; headers from <th> → columns[n].header; cells from <td>{row.foo}</td> → columns[n].cell or default field mapping |
| public/app/features/dashboard-scene/**/*.tsx (8 files) | UPDATE | same path | Same mapping |
| public/app/features/alerting/unified/**/*.tsx (7 files) | UPDATE | same path | Same mapping; sort semantics (if present) preserved via columns[n].sortType |
| public/app/features/logs/**/*.tsx (5 files) | UPDATE | same path | Same mapping |
| public/app/plugins/datasource/**/*.tsx (4 files) | UPDATE | same path | Same mapping |
| public/app/plugins/panel/**/*.tsx (3 files) | UPDATE | same path | Same mapping |
| public/app/features/dashboard/**/*.tsx (3 files, non-scene) | UPDATE | same path | Same mapping |
| packages/grafana-ui/src/components/**/*.tsx (3 files, non-primitive) | UPDATE | same path | Same mapping; Table/TableNG/components/HeaderCell.tsx + Table/TableRT/HeaderRow.tsx primitive self-references stay raw |
| public/app/core/components/help/HelpModal.tsx | UPDATE | same path | Keyboard-shortcut listing: <table> → <InteractiveTable> with 2 columns (Shortcut / Description) |
| public/app/core/components/AccessControl/PermissionList.tsx | UPDATE | same path | Permission matrix table → <InteractiveTable> |
| remaining files in 0.2.1 Cohort 3 (28 files) | UPDATE | same path | Same mapping applied consistently |

#### Raw `<form>` → `Form` / `<Field>` / `<FieldSet>` (70 files, all `UPDATE`)

| Target File | Transformation | Source File | Key Changes |
| --- | --- | --- | --- |
| public/app/features/alerting/unified/**/*.tsx (17 files) | UPDATE | same path | <form onSubmit={…}> → <Form onSubmit={…}>; nested <input>/<select>/<textarea> → <Field label="…"><Input name="…"></Field>, <Field label="…"><Combobox ../></Field>, <Field label="…"><TextArea ../></Field>; grouped fields wrapped in <FieldSet label="…"> |
| public/app/features/provisioning/**/*.tsx (11 files) | UPDATE | same path | Same mapping |
| public/app/features/dashboard-scene/**/*.tsx (7 files) | UPDATE | same path | Same mapping |
| public/app/core/components/**/*.tsx (7 files) | UPDATE | same path | Login/Signup/VerifyEmail/ForgottenPassword forms → <Form> composition; preserve react-hook-form integration already used by Form |
| public/app/features/admin/**/*.tsx (5 files) | UPDATE | same path | Same mapping |
| public/app/features/teams/**/*.tsx (3 files) | UPDATE | same path | Same mapping |
| public/app/features/dashboard/**/*.tsx (2 files, non-scene) | UPDATE | same path | Same mapping |
| public/app/features/auth-config/ProviderConfigForm.tsx | UPDATE | same path | Explicit provider-form → <Form> with nested <FieldSet> per provider type |
| remaining 17 files in 0.2.1 Cohort 4 | UPDATE | same path | Same mapping |

#### Inline `style={{}}` → `Box` / `Stack` / `useStyles2` (185 files, all `UPDATE`)

| Target File | Transformation | Source File | Key Changes |
| --- | --- | --- | --- |
| packages/grafana-ui/src/components/**/*.tsx (84 files) | UPDATE | same path | Layout-only inline styles ({ display: 'flex', gap: 8 }) → <Stack direction="row" gap={1}>; container styles with padding/margin/background → <Box padding={1} backgroundColor="weak">; complex visual styles → useStyles2(getStyles) at file tail |
| public/app/plugins/panel/**/*.tsx (24 files) | UPDATE | same path | Same mapping |
| public/app/features/dashboard-scene/**/*.tsx (23 files) | UPDATE | same path | Same mapping |
| public/app/plugins/datasource/**/*.tsx (22 files) | UPDATE | same path | Same mapping |
| public/app/features/explore/**/*.tsx (17 files) | UPDATE | same path | Same mapping |
| public/app/features/alerting/**/*.tsx (14 files) | UPDATE | same path | Same mapping |
| public/app/features/provisioning/**/*.tsx (12 files) | UPDATE | same path | Same mapping |
| public/app/core/**/*.tsx (12 files) | UPDATE | same path | Same mapping |
| public/app/features/dashboard/**/*.tsx (11 files, non-scene) | UPDATE | same path | Same mapping |
| public/app/features/canvas/**/*.tsx (11 files) | UPDATE | same path | Same mapping; canvas editor inline-style patterns → <Box> wrappers |
| public/app/features/admin/**/*.tsx (9 files) | UPDATE | same path | Same mapping |
| remaining 46 files in 0.2.1 Cohort 5 | UPDATE | same path | Same mapping |

#### Hardcoded legacy `className` → `useStyles2` (172 files, all `UPDATE`)

| Target File | Transformation | Source File | Key Changes |
| --- | --- | --- | --- |
| public/app/plugins/datasource/**/*.tsx (40 files) | UPDATE | same path | className="gf-form" / "gf-form-inline" / "page-container" / "query-keyword" → className={styles.formRow} with getStyles returning Emotion-based equivalents using theme.spacing, theme.colors, theme.typography; <Stack> preferred for pure-layout gf-form* classes |
| public/app/features/dashboard-scene/**/*.tsx (12 files) | UPDATE | same path | Same mapping |
| public/app/features/transformers/**/*.tsx (9 files) | UPDATE | same path | Same mapping |
| public/app/features/admin/**/*.tsx (8 files) | UPDATE | same path | Same mapping |
| public/app/features/dashboard/**/*.tsx (8 files, non-scene) | UPDATE | same path | Same mapping |
| public/app/plugins/panel/**/*.tsx (7 files) | UPDATE | same path | Same mapping |
| public/app/features/variables/**/*.tsx (7 files) | UPDATE | same path | Same mapping |
| public/app/features/alerting/**/*.tsx (various) | UPDATE | same path | Same mapping |
| public/app/features/explore/**/*.tsx (4 files) | UPDATE | same path | Same mapping |
| remaining files in 0.2.1 Cohort 6 | UPDATE | same path | Same mapping |

#### TypeScript `any` → concrete types / generics / `unknown` (443 files, 568 occurrences, all `UPDATE`)

| Target File | Transformation | Source File | Key Changes |
| --- | --- | --- | --- |
| packages/grafana-data/src/types/datasource.ts | UPDATE | same path | 24 any → generics <TQuery extends DataQuery, TOptions extends DataSourceJsonData>; DataSourceApi<any, any> call sites already parameterized |
| public/app/features/dashboard/state/DashboardModel.ts | UPDATE | same path | 24 any → concrete types from DashboardMeta, PanelModel, VariableModel; unknown + narrowing where JSON round-trips require it |
| public/app/features/dashboard/state/PanelModel.ts | UPDATE | same path | 17 any → concrete types |
| public/app/features/dashboard/state/DashboardMigrator.ts | UPDATE | same path | 16 any → migration-input types from DashboardV0Spec / schema types |
| public/app/plugins/datasource/opentsdb/datasource.ts | UPDATE | same path | 16 any → OpenTSDB-specific types; retained // eslint-disable-next-line @typescript-eslint/no-explicit-any -- upstream API type is untyped for 3rd-party response shapes only |
| public/app/core/time_series2.ts | UPDATE | same path | 19 any → TimeSeriesValue[] / concrete scalar types |
| packages/grafana-data/src/types/panel.ts | UPDATE | same path | 11 any → unknown + narrowing at consumer sites |
| public/app/plugins/panel/geomap/editor/types.ts, public/app/plugins/panel/heatmap/types.ts, etc. | UPDATE | same path | Module-local types replace any |
| public/app/core/services/backendSrv.ts | UPDATE | same path | 12 any → generic BackendSrvRequest<T, R> + fetch<T, R>(options) |
| public/app/features/alerting/**/*.ts (86 occurrences) | UPDATE | same path | Domain-specific Alerting types (from types/alerting / types/amroutes already present) replace any |
| public/app/plugins/datasource/**/*.ts (76 occurrences) | UPDATE | same path | Per-datasource request/response types replace any |
| packages/grafana-ui/src/components/**/*.ts(x) (55 occurrences) | UPDATE | same path | Component-internal types replace any; Record<string, unknown> or unknown where truly variadic |
| remaining 438 files | UPDATE | same path | Per-file concrete types; no blanket replacement |

#### Documentation & changelog (both `UPDATE`)

| Target File | Transformation | Source File | Key Changes |
| --- | --- | --- | --- |
| CHANGELOG.md | UPDATE | CHANGELOG.md | Append under next release heading: "Frontend: converted 71 class components to functional components"; "Frontend: replaced raw <button>/<table>/<form> with @grafana/ui equivalents across 199 files"; "Frontend: migrated inline styles and legacy className usage to useStyles2/Box/Stack across 357 files"; "Frontend: eliminated 568 any occurrences across 443 files" |
| eslint-suppressions.json | UPDATE | same path | Regenerated by yarn run eslint-baseline-update after the refactor. Expected delta: react-prefer-function-component suppressions → 0 (from 77), @typescript-eslint/no-explicit-any suppressions → residual only where scoped disable comments with inline justification are added. No entries added; only removed |
| contribute/style-guides/styling.md | UPDATE | same path | No content edits required — existing guide already describes the target pattern. Reviewed for accuracy; no changes authored |
| README.md | OUT OF SCOPE | README.md | No structural change to the repo layout, no edit needed |

#### Build & runtime artifacts (none touched)

| Target File | Transformation | Source File | Key Changes |
| --- | --- | --- | --- |
| package.json | OUT OF SCOPE | same path | Constraint: "No changes to webpack config, bundler, module resolution, or package.json beyond what the migration strictly requires." The migration requires no new dependencies (all components and utilities already in @grafana/ui, Emotion, React 18.3.1, TypeScript 5.9.2) |
| tsconfig.json, scripts/tsconfig.base.json | OUT OF SCOPE | same path | Already strict: true; no change |
| eslint.config.js | OUT OF SCOPE | same path | Already enforces every rule this refactor targets; no change |
| webpack.*.js / bundler config | OUT OF SCOPE | same path | Unchanged |
| yarn.lock | OUT OF SCOPE | same path | No new dependencies, no change |
| .nvmrc | OUT OF SCOPE | same path | Node 24.11.0 unchanged |

### 0.6.2 Cross-File Dependencies

The Blitzy platform's changes create a focused set of cross-file ripples. Each ripple is handled deterministically.

- **Import additions** — every file that replaces a raw element or introduces `useStyles2` must import the new symbol from `@grafana/ui` (or `@grafana/data` for `GrafanaTheme2` type). Examples:

  - FROM: `<button onClick={onSave}>Save</button>` (no `@grafana/ui` import)
  - TO: `import { Button } from '@grafana/ui';` + `<Button onClick={onSave}>Save</Button>`
  - FROM: `<div style={{ display: 'flex', gap: 8 }}>…`
  - TO: `import { Stack } from '@grafana/ui';` + `<Stack direction="row" gap={1}>…</Stack>`
  - FROM: `<div className="gf-form">…</div>` (no Emotion import)
  - TO: `import { useStyles2 } from '@grafana/ui';` + `import { css } from '@emotion/css';` + `import { GrafanaTheme2 } from '@grafana/data';` + file-tail `getStyles = (theme: GrafanaTheme2) => ({ row: css({ display: 'flex', marginBottom: theme.spacing(0.5), padding: theme.spacing(0.25, 0) }) })`

- **Import removals** — class-component conversions remove: `Component`, `PureComponent`, HOC imports (`withTheme2`, `connect`, `withRouter`). For example:

  - FROM: `import { Component } from 'react';` + `import { connect, ConnectedProps } from 'react-redux';`
  - TO: `import { useState, useEffect } from 'react';` + `import { useSelector, useDispatch } from 'app/types/store';`

- `@grafana/i18n` **type-only imports enforced** — `eslint.config.js` requires `consistent-type-imports`. When the Blitzy platform adds a type-only import, it uses `import type { FooType } from '…'`.

- **ESLint** `no-restricted-imports` **compliance** — all newly authored imports respect these restrictions already configured in `eslint.config.js`:

  - `Layout`, `HorizontalGroup`, `VerticalGroup` are NEVER imported in the refactor — `Stack` (or `Grid` for 2-D) is always the replacement
  - `useDispatch`, `useSelector` imports are sourced from `app/types/store`, never from `react-redux`
  - `t`, `Trans` are sourced from `@grafana/i18n`, never from `react-i18next` or `i18next`
  - Deep imports `@grafana/ui/src/…` are never introduced — all imports use the public barrel `@grafana/ui`

- **Test file updates** — every test file that mounts a converted class component via `mount(<X />)` keeps the same API because the functional component preserves the same default export signature. Tests that interrogate class internals (`wrapper.instance().method()`) must migrate to the hook-testing idiom (`renderHook(() => useCustomHook())`) or equivalent controlled re-renders. Test files affected are colocated with each converted component; the Blitzy platform updates each test file in the same commit as its component:

  - `public/app/AppWrapper.test.tsx`
  - `public/app/features/explore/Explore.test.tsx`
  - `public/app/features/dashboard/dashgrid/DashboardPanel.test.tsx`
  - `public/app/plugins/panel/canvas/CanvasPanel.test.tsx`
  - `packages/grafana-ui/src/components/Typeahead/Typeahead.test.tsx`
  - `packages/grafana-ui/src/components/QueryField/QueryField.test.tsx`
  - Every other `*.test.ts(x)` that pairs with a converted file
  - Tests are checked with `yarn test --passWithNoTests` scoped to changed files after each category batch, per the VALIDATION FRAMEWORK

- **Configuration file updates** — none. No changes to `package.json` scripts, `jest.config.js`, `playwright.config.ts`, `webpack.*.js`, `tsconfig.json`, `eslint.config.js`. The `eslint-suppressions.json` baseline is regenerated via `yarn run eslint-baseline-update` (existing script) — no hand-edits.

- **Type re-exports through public barrels** — where a class's public props type is exported (e.g., `QueryFieldProps` from `packages/grafana-ui/src/index.ts`), the functional rewrite preserves the exact same exported props interface. Consumers downstream of the public barrel see byte-identical type signatures.

- **Redux store types** — class components using `connect(mapStateToProps, mapDispatchToProps)` have their `mapStateToProps` inlined as `useSelector<StoreState, ReturnType<typeof mapStateToProps>>(mapStateToProps)`. The `StoreState` type comes from `app/types/store` (already established convention). No new types are exported from the store.

- **Context consumers** — classes using `static contextType = SomeContext` and reading `this.context` are converted to `const ctx = useContext(SomeContext)` inside the functional body. For the canvas `PanelContextRoot`, this means `useContext(PanelContextRoot)` at the top of `CanvasPanel`.

- **Ref forwarding continuity** — where a class exposed a public ref (parent calls `myRef.current.someMethod()`), the functional rewrite uses `React.forwardRef<HandleType, Props>` + `useImperativeHandle(ref, () => ({ someMethod }))` to preserve the same parent-callable handle. No parent files need to change.

- **ESLint baseline file** — `eslint-suppressions.json` must be regenerated after every category batch. Deletions only; no new entries. If any new entry would be generated, that indicates a regression and halts the batch per the rollback trigger.

### 0.6.3 Wildcard Patterns

The Blitzy platform uses precise file lists wherever possible and applies wildcards only for repetitive class-of-changes. All wildcards are trailing.

- `public/app/features/alerting/unified/**/*.tsx` — UPDATE (alerting functional / raw-elem / styling / any remediation applies)
- `public/app/features/dashboard/**/*.tsx` (excluding `.e2e.ts`, `.spec.ts`, `.stories.tsx`, `.gen.ts`) — UPDATE
- `public/app/features/dashboard-scene/**/*.tsx` — UPDATE
- `public/app/features/explore/**/*.tsx` — UPDATE
- `public/app/features/logs/**/*.tsx` — UPDATE
- `public/app/features/variables/**/*.tsx` — UPDATE
- `public/app/features/query/**/*.tsx` — UPDATE
- `public/app/features/transformers/**/*.tsx` — UPDATE
- `public/app/features/admin/**/*.tsx` — UPDATE
- `public/app/features/provisioning/**/*.tsx` — UPDATE
- `public/app/features/teams/**/*.tsx` — UPDATE
- `public/app/features/auth-config/**/*.tsx` — UPDATE
- `public/app/features/canvas/**/*.tsx` — UPDATE
- `public/app/features/inspector/**/*.tsx` — UPDATE
- `public/app/features/annotations/**/*.tsx` — UPDATE
- `public/app/features/manage-dashboards/**/*.tsx` (excl `DashboardImportLegacy.tsx`) — UPDATE
- `public/app/features/scopes/**/*.tsx` — UPDATE
- `public/app/features/dimensions/**/*.tsx` — UPDATE
- `public/app/features/browse-dashboards/**/*.tsx` — UPDATE
- `public/app/features/plugins/**/*.tsx` (excl `PluginErrorBoundary.tsx`) — UPDATE
- `public/app/plugins/datasource/**/*.tsx` (excl `**/*.test.*`, `**/*.e2e.ts`, `**/*.stories.tsx`, `**/*.gen.ts`) — UPDATE
- `public/app/plugins/panel/**/*.tsx` (excl test/story/gen) — UPDATE
- `public/app/core/components/**/*.tsx` (excl test/story) — UPDATE
- `public/app/core/services/**/*.ts` — UPDATE (any remediation only)
- `public/app/core/utils/**/*.ts` — UPDATE (any remediation only)
- `packages/grafana-ui/src/components/**/*.tsx` (excl `ErrorBoundary`, `Forms/Legacy/**`, `Monaco/CodeEditor.tsx`, `Select/ValueContainer.tsx`, `TableInputCSV/TableInputCSV.tsx`, `VizRepeater/VizRepeater.tsx`, `uPlot/Plot.tsx`, `graveyard/**`, `Button/Button.tsx`, `Card/Card.tsx`, `FilterPill/FilterPill.tsx`, `Tags/Tag.tsx`, `Forms/Form.tsx`, `Table/TableNG/components/HeaderCell.tsx`, `Table/TableRT/HeaderRow.tsx`, `utils/storybook/ExampleFrame.tsx`, `VizLegend/FacetedLabelsFilter.tsx`, `**/*.test.tsx`, `**/*.stories.tsx`) — UPDATE
- `packages/grafana-data/src/**/*.ts` — UPDATE (any remediation only; public barrel and schema types unchanged)
- `packages/grafana-runtime/src/**/*.tsx` — UPDATE
- `packages/grafana-prometheus/src/**/*.ts(x)` — UPDATE
- `packages/grafana-flamegraph/src/**/*.tsx` — UPDATE
- `packages/grafana-sql/src/**/*.ts(x)` (excl `ErrorBoundary.tsx`) — UPDATE

Explicit out-of-scope wildcards (never UPDATE):

- `**/*.e2e.ts` — E2E tests
- `**/*.spec.ts` — Playwright/Cypress specs
- `**/*.stories.tsx` — Storybook stories (unless production-path logic is embedded)
- `**/*.gen.ts` — generated files
- `public/sass/**` — legacy Sass source (call sites change, source files do not)
- `packages/grafana-ui/src/graveyard/**`
- `packages/grafana-ui/src/components/Forms/Legacy/**`

### 0.6.4 One-Phase Execution

The Blitzy platform will execute this entire refactor in a SINGLE phase. Every file listed in 0.6.1 and every file matched by the 0.6.3 wildcards will be modernized together. There is no multi-phase rollout, no behind-a-flag ramp, no percentage cutover. The rollback trigger in the VALIDATION FRAMEWORK operates at the batch level within the single phase — each file category (class conversion, raw-button, raw-table, raw-form, inline-style, legacy-className, any-elimination) is executed as an internal batch for validation purposes, but all seven batches belong to one execution phase that concludes with a single merged result.

Execution order within the single phase (for failure-containment only, not for delivery scheduling):

- Batch A: class component conversions (71 files) — largest behavioral-risk surface; validated first so that subsequent batches layer onto functional components already shown to behave identically
- Batch B: raw `<button>` replacements (60 files) — smallest per-file changes, lowest risk
- Batch C: raw `<form>` replacements (70 files)
- Batch D: raw `<table>` replacements (69 files)
- Batch E: inline-style migrations (185 files)
- Batch F: legacy-className migrations (172 files)
- Batch G: `any` elimination (443 files, 568 occurrences)

Each batch ends with the four validation gates from the VALIDATION FRAMEWORK (`tsc --noEmit`, `yarn lint`, `yarn test --passWithNoTests` scoped to changed files, and a manual smoke test of Dashboard / Explore / Alerting pages). A failure in any gate halts that batch; the failing file is remediated before the next batch begins. All seven batches complete and validate cleanly before the refactor is considered done — this is a single-phase delivery.

## 0.7 Dependency Inventory

### 0.7.1 Key Private and Public Packages

Every package below is already installed in the repository. The refactor ADDS NO dependency and REMOVES NONE. Versions are taken verbatim from `package.json` at the repository root (or the workspace package's `package.json` when indicated) and represent the authoritative versions the Blitzy platform will rely on.

| Registry | Package | Version | Purpose in Refactor |
| --- | --- | --- | --- |
| workspace (monorepo) | @grafana/ui | workspace:* resolving to 13.0.0-pre (per packages/grafana-ui/package.json) | Source of every replacement component — Button, IconButton, ToolbarButton, ConfirmButton, LinkButton, ClipboardButton, InteractiveTable, Table, Form, Field, FieldSet, Input, TextArea, Combobox, Select, MultiCombobox, Switch, Checkbox, RadioButtonGroup, RadioButtonList, Stack, Grid, Box, Space, Modal, Drawer, Tooltip, Menu, Badge, Alert, EmptyState, Spinner, Icon, Text, Card, Tabs, Dropdown, Avatar, useStyles2, useTheme2 |
| workspace (monorepo) | @grafana/data | workspace:* resolving to 13.0.0-pre | GrafanaTheme2 type import required by every getStyles function; DataQuery, DataSourceJsonData, DataFrame, FieldType, and other schema types used to replace any at type-definition sites |
| workspace (monorepo) | @grafana/runtime | workspace:* resolving to 13.0.0-pre | Contains DataSourcePicker (one of the in-scope class conversions); config, reportInteraction, getTemplateSrv continue to be consumed unchanged |
| workspace (monorepo) | @grafana/i18n | workspace:* resolving to 13.0.0-pre | Mandatory source for t and Trans — eslint.config.js no-restricted-imports explicitly forbids importing these from react-i18next or i18next. All translations in converted files continue to use @grafana/i18n |
| workspace (monorepo) | @grafana/schema | workspace:* resolving to 13.0.0-pre | Schema types used to replace any in dashboard/panel/variable model typings |
| workspace (monorepo) | @grafana/e2e-selectors | workspace:* resolving to 13.0.0-pre | selectors.* preserved verbatim in every converted component (the ESLint @grafana/no-aria-label-selectors rule continues to apply) |
| workspace (monorepo) | @grafana/sql | workspace:* resolving to 13.0.0-pre | SQL datasource package — its ErrorBoundary stays class (OUT OF SCOPE), but other SQL components participate in the any remediation |
| workspace (monorepo) | @grafana/prometheus | workspace:* resolving to 13.0.0-pre | Prometheus datasource package — participates in all four dimensions |
| workspace (monorepo) | @grafana/flamegraph | workspace:* resolving to 13.0.0-pre | Flamegraph package — participates in inline-style migration |
| public (npm) | @grafana/scenes | 7.1.8 | Used by public/app/features/dashboard-scene/**; class conversions inside scene files preserve the SceneObjectBase public API surface (scenes-owned base classes are not converted) |
| public (npm) | react | 18.3.1 | Target runtime; useState, useEffect, useRef, useReducer, useContext, useCallback, useMemo, useLayoutEffect, useImperativeHandle, useId, memo, forwardRef are the hooks API surface the refactor uses |
| public (npm) | react-dom | 18.3.1 | Target runtime — unchanged |
| public (npm) | @types/react | 18.3.18 | Types for React 18 hooks; FC, ComponentProps, PropsWithChildren, ReactElement, Dispatch, SetStateAction available for replacing any |
| public (npm) | @types/react-dom | 18.3.5 | Types for react-dom |
| public (npm) | @emotion/css | 11.13.5 | css() function for Emotion CSS-in-JS used inside every getStyles block |
| public (npm) | @emotion/react | 11.14.0 | Core Emotion runtime; transitively used by @grafana/ui |
| public (npm) | @emotion/eslint-plugin | 11.12.0 (devDep) | Enforces @emotion/syntax-preference: [2, 'object'] and @emotion/no-vanilla: 2 — mandates object-syntax Emotion CSS everywhere |
| public (npm) | react-hook-form | ^7.49.2 | Form state management used inside @grafana/ui's Form component; consumers don't import it directly but the <Form onSubmit> + render-prop signature they use is from react-hook-form |
| public (npm) | react-redux | 9.2.0 | Source of useSelector/useDispatch; these hooks are re-exported via app/types/store and MUST be imported from app/types/store per eslint.config.js line 71–74 |
| public (npm) | @reduxjs/toolkit | 2.10.1 | Slice and action creators remain untouched (Redux slices are OUT OF SCOPE). Inline action dispatches inside converted components continue to reference existing action creators |
| public (npm) | redux | 5.0.1 | Store runtime — unchanged |
| public (npm) | rxjs | 7.8.2 | Observable, Subscription, ReplaySubject — class components that manage subscriptions inside componentDidMount/componentWillUnmount are converted to useEffect(() => { const sub = obs.subscribe(…); return () => sub.unsubscribe(); }, [deps]) |
| public (npm) | react-router | 5.3.4 | Routing is OUT OF SCOPE; no imports from this package change |
| public (npm) | react-router-dom | 5.3.4 | Same — unchanged |
| public (npm) | react-router-dom-v5-compat | ^6.26.1 | Same — unchanged |
| public (npm) | react-use | 17.6.0 | Utility hooks (useDebounce, usePrevious, etc.) — available for use where a class's custom-hook-equivalent logic is simpler with react-use |
| public (npm) | react-virtualized-auto-sizer | 1.0.26 | Used inside log/table virtualization; class components using auto-sizer continue to integrate via children-as-function callbacks |
| public (npm) | slate | 0.47.9 / slate-react 0.22.10 | Used by QueryField.tsx — class→functional conversion stabilizes the Slate editor ref via useRef |
| public (npm) | monaco-editor | 0.34.1 | @grafana/ui's Monaco/CodeEditor.tsx remains class (OUT OF SCOPE — 3rd-party class coupling). No change |
| public (npm) | typescript | 5.9.2 (devDep) | Compiler version used for all tsc --noEmit validations; no upgrade per "do not upgrade" constraint |
| public (npm) | eslint | 9.32.0 (devDep) | Linter used for yarn lint:ts; no version change |
| public (npm) | @typescript-eslint/eslint-plugin | 8.56.0 (devDep) | Source of @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions, @typescript-eslint/consistent-type-imports — all active during this refactor |
| public (npm) | @typescript-eslint/parser | 8.56.0 (devDep) | Parser for .ts/.tsx — unchanged |
| public (npm) | eslint-plugin-react | 7.37.5 (devDep) | Unchanged |
| public (npm) | eslint-plugin-react-hooks | 5.2.0 (devDep) | react-hooks/rules-of-hooks and react-hooks/exhaustive-deps — both enforced on every new hook introduced by this refactor |
| public (npm) | eslint-plugin-react-prefer-function-component | 4.0.1 (devDep) | The rule this refactor makes clean for the 71 class files — suppressions in eslint-suppressions.json are deleted once each class is converted |
| public (npm) | eslint-plugin-jsx-a11y | 6.10.2 (devDep) | Accessibility linting continues across the refactor; no new violations introduced |
| public (npm) | jest | 29.7.0 (devDep) | Test runner used for yarn test --passWithNoTests scoped to changed files |
| public (npm) | @testing-library/react | 16.3.0 (devDep) | React Testing Library — render, screen, fireEvent, waitFor used for tests of converted components |
| public (npm) | @testing-library/user-event | 14.6.1 (devDep) | User-event simulation in tests |
| public (npm) | @testing-library/jest-dom | 6.6.4 (devDep) | DOM matchers in tests |
| public (npm) | @playwright/test | 1.56.1 (devDep) | E2E test framework — E2E specs are OUT OF SCOPE; no edits to .e2e.ts files |
| public (npm) | @types/node | 24.10.1 (devDep) | Node typings |
| runtime (Node) | node | 24.11.0 (from .nvmrc) / package engines >=22 <25 | Node runtime for build and test; Node 24 is the authoritative version for validation runs |
| runtime (Yarn) | yarn | 4.11.0 (from packageManager) | Package manager for install, build, lint, test |

### 0.7.2 Dependency Updates

The refactor adds no new dependency and removes no dependency. Every package listed in 0.7.1 is already present in the repository. The only cross-file "dependency-like" changes are import-statement edits inside source files, covered below.

#### 0.7.2.1 Import Refactoring

Files requiring import updates span every file modified by this refactor (see 0.6.1 for the complete file-level enumeration). The table below captures the canonical import transformation patterns; they apply uniformly across the file sets defined by the 0.6.3 wildcards.

**Pattern 1: React class imports → hooks imports**

- FROM: `import { Component, PureComponent } from 'react';` (or `import React, { Component } from 'react';`)
- TO: `import { useState, useEffect, useRef, memo } from 'react';` (subset based on what the new body uses)
- Apply to: every file in the 71-class-component cohort (0.2.1 Cohort 1)

**Pattern 2:** `withTheme2` **HOC →** `useTheme2` **hook**

- FROM: `import { withTheme2, Themeable2 } from '@grafana/ui';` + `export default withTheme2(MyClass);`
- TO: `import { useTheme2 } from '@grafana/ui';` + `export const My = (props: Props) => { const theme = useTheme2(); … };`
- Apply to: every class wrapped with `withTheme2` (notably `Explore.tsx`, several alerting pages, several explore panels)

**Pattern 3:** `connect` **HOC →** `useSelector`**/**`useDispatch` **hooks**

- FROM: `import { connect, ConnectedProps } from 'react-redux';` + `const mapStateToProps = (state: StoreState) => ({…}); const mapDispatchToProps = {…}; const connector = connect(mapStateToProps, mapDispatchToProps); type Props = ConnectedProps<typeof connector> & OwnProps; class X extends Component<Props> {…} export default connector(X);`
- TO: `import { useSelector, useDispatch } from 'app/types/store';` + `export const X = (props: OwnProps) => { const stateSlice = useSelector(mapStateToProps); const dispatch = useDispatch(); … };` with dispatch calls like `dispatch(someAction(…))`
- Apply to: every class file using Redux connect

**Pattern 4:** `withRouter` **HOC →** `useHistory`**/**`useLocation`**/**`useParams` **hooks (where routing is read in a converted class)**

- FROM: `import { withRouter, RouteComponentProps } from 'react-router-dom';` + `withRouter(X)`
- TO: `import { useHistory, useLocation, useParams } from 'react-router-dom';` + inline hook calls
- Apply to: only the class components that receive router props; routing logic itself is OUT OF SCOPE — only the consumption-site hook replacement is made

**Pattern 5: Raw element →** `@grafana/ui` **component**

- FROM (e.g., raw button): no `@grafana/ui` import for Button, plus `<button onClick={…}>Save</button>`
- TO: `import { Button } from '@grafana/ui';` + `<Button onClick={…}>Save</Button>`
- Apply to: files matching 0.6.3 wildcards under any of the button/form/table/inline-style/className cohorts

**Pattern 6: Inline style / legacy className →** `useStyles2` **+ Emotion**

- FROM: `<div style={{ marginTop: 8, padding: 4 }}>…</div>` or `<div className="gf-form">…</div>`
- TO: three new imports:
  - `import { useStyles2 } from '@grafana/ui';`
  - `import { css } from '@emotion/css';`
  - `import type { GrafanaTheme2 } from '@grafana/data';`
- Body changes: `const styles = useStyles2(getStyles);` + `<div className={styles.wrapper}>…</div>`
- File tail: `const getStyles = (theme: GrafanaTheme2) => ({ wrapper: css({ marginTop: theme.spacing(1), padding: theme.spacing(0.5) }) });`
- Apply to: 185-file inline-style cohort AND 172-file legacy-className cohort

**Pattern 7: Type-only imports enforced**

- FROM: `import { GrafanaTheme2 } from '@grafana/data';` (value import when only the type is used)
- TO: `import type { GrafanaTheme2 } from '@grafana/data';`
- Apply to: every new `getStyles` added, plus every existing type-only import the Blitzy platform touches during the refactor (`consistent-type-imports` is enforced by ESLint)

**Pattern 8:** `any` **type replacement imports**

- FROM: `function parse(data: any): any { … }` with no type import
- TO: import concrete types (`DataFrame`, `PanelData`, `DashboardModel`, domain-specific types from `types/alerting`, `types/amroutes`, `types/teams`, `types/apiKeys`, `types/store`, etc.) and use them explicitly
- For truly opaque 3rd-party payloads: `import type {} from 'some-lib';` plus a colocated `some-lib.d.ts` with an ambient `declare module 'some-lib' { … }`

Files requiring import updates (wildcards — see 0.6.3 for the exhaustive list):

- `public/app/**/*.tsx` (excluding test, story, e2e, gen files)
- `public/app/**/*.ts` (for type-only remediation)
- `packages/grafana-ui/src/components/**/*.tsx` (excluding primitives and out-of-scope files)
- `packages/grafana-ui/src/components/**/*.ts`
- `packages/grafana-data/src/**/*.ts` (for `any` remediation)
- `packages/grafana-runtime/src/components/**/*.tsx`
- `packages/grafana-prometheus/src/**/*.ts(x)`
- `packages/grafana-flamegraph/src/**/*.tsx`
- `packages/grafana-sql/src/**/*.ts(x)` (excluding `ErrorBoundary.tsx`)

Test file import updates apply to colocated `*.test.ts(x)` files in the same directories; the pattern is identical — the test consumes the same default export from its source, no import path changes inside the test file unless the test was importing a class internal.

#### 0.7.2.2 External Reference Updates

- **Configuration files**: none change. `**/*.config.*` files, `**/*.json` files (other than `eslint-suppressions.json` which is regenerated), and `.eslintrc`-style files are untouched.
- **Documentation**: `CHANGELOG.md` appended with four refactor bullet points (see 0.6.1). No other `**/*.md` file is edited because the refactor makes no structural change to be documented.
- **Build files**: `setup.py`, `pyproject.toml` — not present in this repo (this is a Yarn/TypeScript monorepo, not Python). `package.json` files are untouched (no dependency changes). `tsconfig.json` files are untouched (strict mode already enforced).
- **CI/CD**: `.github/workflows/*.yml` files are untouched. The `lint`, `typecheck`, `test:ci`, `build` scripts they invoke continue to produce the same pass/fail signal, only with the refactored files passing cleanly where they previously required suppressions.
- `eslint-suppressions.json`: regenerated by the existing `yarn run eslint-baseline-update` after each batch. Entries for converted files are REMOVED from the baseline. No new entries are ADDED. If a new entry would be generated, the validation framework's rollback trigger halts the batch.

## 0.8 Special Analysis

### 0.8.1 Higher-Order Component (HOC) Unwinding Analysis

Grafana's class components wrap themselves in a predictable set of HOCs that must be converted to hook equivalents during functional conversion. Each HOC has a deterministic hook replacement. The Blitzy platform applies the following mapping across all 71 in-scope class components.

| HOC (before) | Hook Equivalent (after) | Rationale / Notes |
| --- | --- | --- |
| withTheme2(Class) — supplies Themeable2 prop | useTheme2() inside functional body | Dropped import of withTheme2; added const theme = useTheme2();. The Themeable2 prop no longer appears in Props. Child components that received theme via prop drilling receive their own useTheme2() call |
| connect(mapStateToProps, mapDispatchToProps)(Class) | useSelector(mapStateToProps) + useDispatch() from app/types/store | mapStateToProps can be inlined as the selector function. Action-creator objects in mapDispatchToProps are called via dispatch(action(…)) |
| connect(…, { bindAction1, bindAction2 })(Class) | Same — dispatch(bindAction1(…)) | Object form of mapDispatchToProps already gives a dispatch-bound action creator; the functional version calls dispatch(action(…)) directly because useDispatch() returns the dispatch function |
| withRouter(Class) | useHistory(), useLocation(), useParams(), useRouteMatch() | Called at the top of the functional body. Router props (match, location, history) no longer appear in Props. Only the minimum hook required is imported |
| withFocusableProvider(Class) (when present) | useFocusContext() or direct provider composition | Determined per call site; routing and focus-provider logic remain OUT OF SCOPE beyond this minimal hook substitution |
| compose(a, b, c)(Class) | Flatten to two or three hook calls in sequence at the top of the functional body | compose from redux is only used to combine connect + withTheme2 etc., which becomes explicit hook calls |
| React.memo wrapper (if pre-existing on a functional export) | Preserved verbatim | Not applicable to class conversions directly, but preserved if the class's parent module wraps it with React.memo |

The Blitzy platform drops every HOC import line that becomes unused after conversion. It does NOT eagerly remove HOC exports from other modules — HOCs remain available for consumers outside the 71-file cohort. The `compose` import from `redux` is removed from converted files only; `redux` itself remains a dependency.

### 0.8.2 Lifecycle-to-Hook Semantic Analysis

The mechanical lifecycle mappings in 0.1.2 / 0.5.3 mask several semantic subtleties that the Blitzy platform MUST handle correctly. Each is documented here with its resolution.

**Subtlety 1 —** `componentDidMount` **versus** `useEffect(fn, [])` **execution timing.** React 18 runs `useEffect` after the DOM commit (asynchronously), whereas `componentDidMount` runs synchronously after the mount commit. For class components that depend on synchronous post-mount timing (measurements, focus, scroll restoration, third-party library attachment that would flash content), the Blitzy platform uses `useLayoutEffect(fn, [])` instead, which matches the synchronous post-commit timing. A precondition for `useLayoutEffect` is that the effect must not suspend and must not be expensive — the Blitzy platform validates this per file.

**Subtlety 2 —** `componentDidUpdate(prevProps, prevState)` **dependency diffing.** `componentDidUpdate` typically compares `prevProps.x !== this.props.x` to decide whether to run side effects. The functional equivalent is `useEffect(fn, [x])`, where React handles the referential-equality diff automatically. The Blitzy platform INCLUDES every value referenced inside the effect in the dependency array (per `react-hooks/exhaustive-deps`). Where the class intentionally ran the effect only when one of several props changed but not others, the Blitzy platform uses `useRef` to track previous values and a custom `useEffect` with a manual diff — documented inline with a comment explaining the class's original intent.

**Subtlety 3 —** `componentWillUnmount` **cleanup ordering.** Class components run `componentWillUnmount` once at unmount. The functional equivalent returns a cleanup from `useEffect(fn, [])`; this cleanup runs on unmount. For effects with dependencies (`useEffect(fn, [a, b])`), the cleanup runs between re-executions as well. The Blitzy platform uses empty-array dependencies (`[]`) when the class's cleanup was only meant for unmount.

**Subtlety 4 —** `setState(updater, callback)`**.** The class `this.setState({x: 1}, () => doSomething())` pattern has no direct functional analog. The Blitzy platform resolves this by: (a) moving the callback logic into a `useEffect` whose dependency array includes the state value, or (b) using `useReducer` when the callback depends on state transition semantics, or (c) using a synchronous `startTransition` block where appropriate for React 18.

**Subtlety 5 —** `setState(prev => {…})` **updater form.** Directly maps to `setX(prev => {…})` with `useState`. No change in semantics; the Blitzy platform preserves updater-form calls one-to-one.

**Subtlety 6 — Stale closure in** `useEffect` **/** `useCallback`**.** Converting methods that reference `this.props.foo` to arrow-function callbacks inside a functional component creates a stale-closure risk if the callback is captured in a subscription, timer, or event handler. The Blitzy platform resolves this with `useRef` mirrors of frequently-updating values when the callback cannot practically be recreated, OR by including `foo` in the dependency array and letting React recreate the callback each render.

**Subtlety 7 —** `getDerivedStateFromProps`**.** The React 16.3+ static lifecycle is used in a handful of Grafana classes to derive state from props. The Blitzy platform replaces it with either: (a) `useMemo(() => deriveState(prop), [prop])` returning a computed value (preferred — keeps derivation pure), or (b) a `useEffect` that calls `setX(deriveState(prop))` when strictly necessary (discouraged; used only when the derived state is written back during reducers elsewhere).

**Subtlety 8 —** `shouldComponentUpdate` **with custom equality.** Custom `shouldComponentUpdate` implementations map to `React.memo(Component, arePropsEqual)` with a hand-written `arePropsEqual` function. The Blitzy platform preserves the exact equality semantics the class had — not a default shallow comparison.

**Subtlety 9 —** `componentDidCatch` **/** `getDerivedStateFromError`**.** These lifecycles exist only on class components; React 18 has no hook equivalent. Class components that use these are ERROR BOUNDARIES — explicitly OUT OF SCOPE per 0.3.2. Any class retained in scope must not use these lifecycles. If a file combines error-boundary semantics with non-error behavior, the Blitzy platform splits the error-boundary concern into a separate class kept out of scope, and converts the remainder.

### 0.8.3 Redux `connect` Integration Analysis

Many Grafana class components use Redux `connect` with a specific pattern. The Blitzy platform applies the following conversion recipe:

1. **Read** `mapStateToProps` — if it's a plain function of `(state, ownProps) => ({…})`, inline it as a selector: `const derived = useSelector((state: StoreState) => mapStateToProps(state, props));`. For selectors using `reselect`, the memoized selector is called inside `useSelector` the same way.
2. **Read** `mapDispatchToProps` — if it's an object of action creators (`{ foo: fooAction }`), the functional body uses `const dispatch = useDispatch();` and calls `dispatch(fooAction(args))` at each action site. If it's a function `(dispatch) => ({…})`, the Blitzy platform replicates the bound-action-creator pattern inside the body via `useMemo(() => bindActionCreators({…}, dispatch), [dispatch])`.
3. **Read** `ConnectedProps<typeof connector>` — removed; the component now receives only `OwnProps`, and selector/dispatch results are local variables.
4. **Remove the** `connect` **export** — `export default connector(MyClass)` becomes `export default MyFunctional` (or a named export preserved if the class was named-exported). Default export identity is preserved for downstream consumers.
5. **Type the selector explicitly** — `useSelector<StoreState, ReturnType<typeof mapStateToProps>>((state) => mapStateToProps(state, props))` — or declare the `StoreState` generic via the typed hook re-export from `app/types/store` (preferred; the `useSelector` exported from `app/types/store` is pre-typed with `StoreState` per the repository's existing convention).
6. **Preserve referential identity of dispatched actions** — action creators are not recreated inside the body; they are imported module constants. `dispatch` itself is stable across renders (guaranteed by React-Redux), so dispatch-calling callbacks do not need `useCallback` wrapping unless passed into a memoized child.
7. **Preserve mapStateToProps's input-equality fallback** — if `mapStateToProps` returned a new object on every call but with stable field-level equality, the original class relied on React-Redux's default shallow-equal merge. The functional version either (a) destructures fields from `useSelector(state => ({…}))` with a `shallowEqual` comparator from `react-redux`, or (b) calls `useSelector` once per field to achieve per-field equality.

### 0.8.4 Subscription and Observable Lifecycle Analysis

Several in-scope class components manage RxJS subscriptions or similar resources across their lifetime — notably `CanvasPanel.tsx`, `Explore.tsx`, various query editors, and some `@grafana/ui` SDK files. The Blitzy platform applies this recipe uniformly:

- **Create subscription inside** `useEffect` **body** — `useEffect(() => { const sub = observable$.subscribe(onNext); return () => sub.unsubscribe(); }, [observable$])` — the observable reference is part of the dependency array. If the observable is derived from props, the derivation happens inside the effect or via `useMemo`.
- **Multicast subjects (**`ReplaySubject`**) owned by the component** — created inside `useMemo(() => new ReplaySubject(1), [])` so identity is stable for the lifetime of the component. Subscribers consume it via `useEffect`.
- **Event listeners on** `window` **/** `document` — `useEffect(() => { window.addEventListener(type, handler); return () => window.removeEventListener(type, handler); }, [handler])` with `handler` typically wrapped in `useCallback` so it's referentially stable.
- **Timers (**`setTimeout`**/**`setInterval`**)** — `useEffect(() => { const id = setInterval(tick, ms); return () => clearInterval(id); }, [tick, ms])`.
- `AbortController` **for fetch cancellation** — `useEffect(() => { const ac = new AbortController(); fetchData(ac.signal); return () => ac.abort(); }, [deps])`.

Every subscription's lifetime must exactly match the class's original semantics — subscribe on mount (or on prop change), unsubscribe on unmount (or before re-subscribe). The Blitzy platform audits each class for subscription timing and transcribes it faithfully.

### 0.8.5 ESLint Baseline Reconciliation Analysis

The repository maintains `eslint-suppressions.json` (4008 lines, 712 files) as a baseline that records pre-existing lint violations. Each rule has a count per file. The refactor's success is measured in part by the baseline shrinking. Specifically:

- `react-prefer-function-component/react-prefer-function-component`: before = 77 suppressions; target = 0 (all 71 in-scope class files + 6 additional classes covered by the broader ESLint rule minus OUT-OF-SCOPE classes that keep their suppressions for legitimate reasons). Per-file deletions only.
- `@typescript-eslint/no-explicit-any`: before = 827 suppressions across \~283 files; target = residual only. The residual permitted entries are those that the Blitzy platform could not resolve (truly untyped 3rd-party library surfaces) and for which the converted file carries an inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <justification>` comment. Each retained suppression appears in the updated `eslint-suppressions.json` ONLY if it pre-existed AND the Blitzy platform explicitly decided to keep it; all others are deleted.
- `@typescript-eslint/consistent-type-assertions` (463 suppressions): out of direct scope. The Blitzy platform leaves these suppressions intact unless a file it's already touching for another reason can have a type assertion rewritten (e.g., `value as any as X` → `value as X` when `X` is derivable). Opportunistic cleanup is FORBIDDEN per the MINIMAL CHANGE MANDATE; this rule is touched only when an any-elimination pass naturally removes the `as any` step.
- `react-hooks/rules-of-hooks` (37 suppressions): these indicate pre-existing hook ordering violations in already-functional code — OUT OF SCOPE. The Blitzy platform does NOT introduce any new violation and does NOT remove pre-existing suppressions.
- `no-restricted-syntax` (653 suppressions): out of scope. Suppressions remain as-is.
- `react/no-unescaped-entities`, `@grafana/no-aria-label-selectors`, `@grafana/no-unreduced-motion`, `no-barrel-files/no-barrel-files`: all out of scope; no change.

Baseline regeneration uses the existing script `yarn run lint:prune` (per `package.json`: `lint:ts --prune-suppressions`). This runs `eslint --prune-suppressions`, deleting baseline entries that no longer correspond to real violations. The Blitzy platform runs it after each batch completes validation.

### 0.8.6 TypeScript `any` Elimination Strategy Analysis

Eliminating 568 `any` occurrences across 443 files requires a decision tree applied per-occurrence. The Blitzy platform uses this ordered decision procedure:

1. **Can the correct type be inferred from usage?** — if the value is immediately narrowed (`if (typeof x === 'string')`) or only ever passed to a typed function, `unknown` with inferred narrowing is the first choice.
2. **Does the codebase already define a matching type?** — grep `packages/grafana-data/src/types/`, `packages/grafana-schema/src/`, `public/app/types/`, and the current file's sibling `types.ts` for a matching interface. If found, import and use it.
3. **Can a local type be authored for this file?** — if the type is file-local (internal state of one module), define an `interface` or `type` alias at the top of the file and use it.
4. **Is the function / component generic-parameterizable?** — replace `function foo(x: any): any` with `function foo<T>(x: T): T` where call sites determine T. Generic parameter defaults (`<T = unknown>`) preserve compatibility when one call site doesn't provide T.
5. **Is the value truly opaque (JSON blob, catch-variable, variadic args)?** — use `unknown` plus narrowing at use sites. `catch (e: unknown)` is already the default per `useUnknownInCatchVariables: true` in `tsconfig.json`.
6. **Is the value from an untyped 3rd-party library?** — author a scoped `.d.ts` file. Example: a library `flotr2` used in two files without types. The Blitzy platform writes `public/app/types/flotr2.d.ts` containing `declare module 'flotr2' { export function draw(…): …; }` with the minimum viable types for the actual use. The `.d.ts` is placed under `public/app/types/` (existing convention) or colocated with the importer if scope is narrow.
7. **LAST RESORT — retained** `any` **with justification.** Only if steps 1–6 all fail (e.g., a truly heterogeneous legacy data structure that cannot be typed without breaking runtime). Syntax: `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>` immediately above the retained `any`. The `<reason>` text states why: "upstream OpenTSDB response is untyped and varies per query", "catch-all error object from legacy migration code", etc.

Expected outcome: the vast majority of 568 occurrences fall into categories 2, 3, or 4. A small number (under 50, likely under 20) require `unknown` plus narrowing. Fewer than 10 require retained `any` with justification. The exact count emerges during implementation; the Blitzy platform does not pre-commit to a specific number — the success criterion is "0 unjustified `any` remaining" not "literally 0 `any` in the codebase".

### 0.8.7 Public API Surface Preservation Analysis

Three of the in-scope class components live in publicly-consumed packages (`@grafana/ui`, `@grafana/runtime`, `@grafana/data`). Every plugin author in the Grafana ecosystem depends on the exact TypeScript signature and runtime behavior of these exports. The Blitzy platform applies stricter guarantees to these files:

- `packages/grafana-runtime/src/components/DataSourcePicker.tsx` — Props interface `DataSourcePickerProps` is exported from `@grafana/runtime/src/index.ts`. The functional rewrite keeps the exported props interface byte-identical. Default export signature (React component type with the same Props) is preserved. The rewrite introduces no new runtime imports in the published bundle beyond what `@grafana/runtime` already ships.
- `packages/grafana-ui/src/components/QueryField/QueryField.tsx` — `QueryFieldProps` type is exported via the public barrel. Preserved byte-identical. Ref forwarding semantics preserved via `forwardRef<Editor, QueryFieldProps>`.
- `packages/grafana-ui/src/components/Typeahead/Typeahead.tsx` — internal to `QueryField`; not exported directly. Still preserved identically because `QueryField` consumes it.
- **Every other** `packages/grafana-ui/src/components/**/*.tsx` **in scope** — any exported Props type is preserved byte-identical. The Blitzy platform does NOT rename or change the structure of exported types. Internal type aliases inside components may be renamed if they clash with new hook-introduced names.

API-surface preservation is validated via:

- `yarn packages:typecheck` — runs `tsc --noEmit` for every published package; any public-type regression fails here.
- `packages/grafana-ui/src/types.ts` and `packages/grafana-ui/src/index.ts` DIFF against pre-refactor — MUST be empty (no structural change, only the underlying implementation changes).
- Rollup or Vite build of `@grafana/ui` (`yarn packages:build`) — the emitted `.d.ts` files must be byte-identical to the pre-refactor baseline for public exports.

### 0.8.8 Bundle Size Preservation Analysis

The success criterion "Bundle size: no increase &gt;2% on any entrypoint chunk" is defensible given the nature of this refactor:

- **Class → functional generally REDUCES bundle size** because the React class prototype, constructor scaffolding, and `_bindInstanceMethod` patterns are heavier than an equivalent arrow function. Expected net delta: -1% to 0% on affected chunks.
- **Raw element →** `@grafana/ui` **component**: `@grafana/ui` is already bundled because other components import from it. A marginal increase on chunks that didn't previously import a specific `@grafana/ui` component is possible; chunks that already had `@grafana/ui` in scope see zero delta.
- **Inline style →** `Box`**/**`Stack`**/**`useStyles2`: `Box`/`Stack` are already in the `@grafana/ui` bundle. `useStyles2`+Emotion CSS introduces an Emotion `css()` call per file, but Emotion is already bundled. Delta: near-zero.
- **Legacy** `className` **→** `useStyles2`: same — near-zero bundle delta.
- `any` **→ concrete types**: purely compile-time. Zero runtime or bundle impact.

Validation is performed via the existing `yarn build:stats` script (per `package.json`: `webpack --config scripts/webpack/webpack.stats.js`), comparing post-refactor webpack stats against a pre-refactor baseline. If any entrypoint chunk exceeds a 2% increase, the Blitzy platform halts, identifies the offending import, and applies one of these remediations: (a) import more specifically from `@grafana/ui` (avoiding barrel-file side-effects), (b) code-split the offending component if appropriate, (c) remove an unused re-import introduced by mistake.

### 0.8.9 Accessibility and Visual Regression Analysis

Every conversion must preserve or improve accessibility semantics and pixel output. The analysis per category:

- **Raw** `<button>` **→** `<Button>`: `@grafana/ui`'s `Button` renders a real `<button>` underneath and forwards all standard HTML button attributes (`aria-*`, `disabled`, `type`, `onClick`, `onMouseOver`, etc.). Default variant is `primary`; the Blitzy platform selects the variant by inspecting the source class/style (`btn-primary` → `variant="primary"`, `btn-secondary` → `variant="secondary"`, icon-only → `<IconButton>`). Disabled-state styling is handled natively by `Button`, producing a pixel-equivalent or design-system-consistent appearance.
- **Raw** `<table>` **→** `<InteractiveTable>`: column/cell semantics are preserved through `columns` definitions. Keyboard navigation (arrow-key movement between cells) is enhanced by `InteractiveTable`; previously a raw `<table>` had none unless manually coded.
- **Raw** `<form>` **→** `<Form>`: `<Form>` handles `onSubmit`, validation state, and aria-attributes for invalid fields. `<Field label="">` renders a `<label htmlFor={id}>` plus input association automatically, improving screen-reader semantics.
- **Inline style →** `<Stack>`**/**`<Box>`: `Stack` renders a `<div>` with appropriate `display: flex` styling; `Box` renders a `<div>` or the polymorphic `as` element. Visual output matches inline-style equivalent when the migration preserves the same spacing values via `theme.spacing()`.
- **Legacy** `className` **→** `useStyles2`: `.gf-form-label`'s `display: inline-flex; align-items: center; background: $input-label-bg; padding: $space-xs $space-sm; border-radius: $border-radius;` maps to a `getStyles` returning `css({ display: 'inline-flex', alignItems: 'center', background: theme.colors.background.secondary, padding: theme.spacing(0.5, 1), borderRadius: theme.shape.radius.default })`. `theme.colors.background.secondary` is the `GrafanaTheme2` equivalent of the Sass `$input-label-bg` variable's resolved value.

Visual regression validation: manual smoke test of Dashboard / Explore / Alerting pages after each batch. Automated visual regression (Playwright screenshot comparison) is OUT OF SCOPE for this refactor, but the Blitzy platform follows the existing repository convention of running `yarn e2e:dev` when needed for sanity-checking critical user flows.

### 0.8.10 Testing Strategy Analysis

The VALIDATION FRAMEWORK requires `yarn test --passWithNoTests` scoped to changed files to pass at 100% after each category batch. The Blitzy platform's testing approach:

- **Existing component tests** — run unchanged against the converted functional component. React Testing Library tests (which rely on rendered output and user interactions, not instance internals) pass without modification. Tests that use `wrapper.instance()` or `wrapper.setState()` are updated to render+rerender+assert patterns.
- **Hook-internal tests** — where a class's method had a test that directly invoked `instance.computeSomething()`, the Blitzy platform either (a) extracts that logic to a pure helper function and tests it directly, or (b) uses `@testing-library/react`'s `renderHook` to exercise a custom hook when the logic is now hook-shaped.
- **Snapshot tests** — `toMatchSnapshot()` calls re-generate after conversion. Acceptable snapshot diffs are limited to: (a) functional component having no `displayName` where the class had `Class.name`, (b) wrapper element tag/class differences where a `<Stack>` replaces a raw `<div style="display: flex">` (Stack renders a div, so no tag change, but class names change from literal inline style to emotion-generated class). The Blitzy platform reviews each snapshot diff to confirm it's a benign representation change, not a behavior change, and updates the snapshot committed in the repository.
- **ESLint rule test isolation** — class-conversion commits pass `tsc --noEmit` cleanly even mid-batch; the Blitzy platform does not leave the tree in a half-converted state within a single file (each file is converted atomically).
- **Lighthouse sanity check** — the success criterion "Lighthouse scores … no regression &gt; 3 points" is validated by the Blitzy platform running Lighthouse against Dashboard / Explore / Alerting pages pre- and post-refactor using the existing `scripts/generate-a11y-report.sh` convention. Scores are compared; any regression &gt;3 points on any metric halts the batch.

### 0.8.11 Cross-Cutting Module Impact Analysis

The refactor touches 1,168+ files (71 + 60 + 69 + 70 + 185 + 172 + 443, minus duplicates that fall into multiple cohorts). The Blitzy platform's systematic module-by-module impact estimate:

| Module | Class Conv. | Buttons | Tables | Forms | Inline | className | any (files) | Total Touches (upper bound) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| public/app/features/alerting/** | 1 | 6 | 7 | 17 | 14 | varied | 86 (files) | ~150+ |
| public/app/features/dashboard/** (non-scene) | 11 | 1 | 3 | 2 | 11 | 8 | 32 | ~60 |
| public/app/features/dashboard-scene/** | 0 | 0 | 8 | 7 | 23 | 12 | ~20 | ~70 |
| public/app/features/explore/** | 13 | 1 | 2 | 0 | 17 | 4 | ~15 | ~50 |
| public/app/features/logs/** | 2 | 4 | 5 | 0 | ~5 | ~3 | ~5 | ~20 |
| public/app/features/variables/** | 4 | 0 | 0 | 0 | ~3 | 7 | ~18 | ~30 |
| public/app/features/query/** | 3 | 0 | 0 | 0 | ~2 | ~2 | ~10 | ~15 |
| public/app/features/transformers/** | 1 | 0 | 0 | 0 | ~3 | 9 | 8 | ~20 |
| public/app/features/admin/** | 0 | 0 | 8 | 5 | 9 | 8 | ~10 | ~40 |
| public/app/features/provisioning/** | 0 | 1 | 0 | 11 | 12 | ~4 | 8 | ~35 |
| public/app/features/canvas/** | 0 | 0 | 0 | 0 | 11 | ~4 | ~5 | ~20 |
| public/app/features/inspector/** | 2 | 0 | 0 | 0 | ~3 | ~2 | ~5 | ~12 |
| public/app/features/annotations/** | 1 | 0 | 0 | 0 | ~2 | ~2 | ~5 | ~10 |
| public/app/features/manage-dashboards/** | 1 | 0 | ~1 | 0 | ~2 | ~2 | ~5 | ~10 |
| public/app/features/scopes/** | 0 | 1 | 0 | 0 | ~3 | ~2 | ~3 | ~8 |
| public/app/features/dimensions/** | 0 | 1 | 0 | 0 | ~2 | ~2 | ~3 | ~8 |
| public/app/features/browse-dashboards/** | 0 | 0 | 0 | 0 | ~3 | ~3 | ~5 | ~10 |
| public/app/features/auth-config/** | 0 | 0 | 0 | 1 | ~1 | ~1 | ~5 | ~8 |
| public/app/features/teams/** | 0 | 0 | 0 | 3 | ~2 | ~2 | ~3 | ~10 |
| public/app/plugins/datasource/** | 13 | 3 | 4 | 0 | 22 | 40 | 76 | ~155 |
| public/app/plugins/panel/** | 12 | 1 | 3 | 0 | 24 | 7 | 44 | ~85 |
| public/app/core/components/** | 4 | 4 | 2 | 7 | 12 | ~8 | ~15 | ~50 |
| public/app/core/services/** + utils/** | 0 | 0 | 0 | 0 | 0 | 0 | ~20 | ~20 |
| public/app/AppWrapper.tsx | 1 | 0 | 0 | 0 | 0 | 0 | ~1 | 1 |
| packages/grafana-ui/src/components/** | 10 | 6 | 3 | ~1 | 84 | ~3 | 55 | ~160 |
| packages/grafana-ui/src/utils/** | 0 | 1 | 0 | 0 | ~2 | 0 | ~3 | ~6 |
| packages/grafana-runtime/src/** | 1 | 0 | 0 | 0 | ~1 | 0 | ~5 | ~7 |
| packages/grafana-data/src/types/** | 0 | 0 | 0 | 0 | 0 | 0 | 27 | 27 |
| packages/grafana-data/src/** (non-types) | 0 | 0 | 0 | 0 | 0 | 0 | ~10 | ~10 |
| packages/grafana-sql/src/** (excl ErrorBoundary) | 0 | 0 | 0 | 0 | ~2 | ~2 | ~5 | ~8 |
| packages/grafana-prometheus/src/** | 0 | 1 | 0 | 0 | ~3 | ~3 | ~5 | ~10 |
| packages/grafana-flamegraph/src/** | 0 | 0 | 0 | 0 | ~1 | 0 | ~1 | ~1 |

No module is untouched relative to its responsibility in the four modernization dimensions. The Blitzy platform confirms this distribution before execution; any file that doesn't appear in the final per-module enumeration is verified to be genuinely out-of-scope (matches an exclusion pattern) rather than missed.

### 0.8.12 Duplicate-Target File Analysis

A file may belong to multiple cohorts — for instance, a class component that also contains raw `<button>` usage and inline styles. The Blitzy platform handles duplicate-target files with a deterministic ordering rule within the file:

1. Convert the class body to functional first (structural transformation).
2. Inside the new functional body, apply raw-element replacements.
3. Then apply inline-style and className migrations to the resulting JSX.
4. Finally, apply `any` elimination across the file.

This within-file ordering avoids doing the same work twice (e.g., rewriting a JSX element that will be wholly replaced in step 3). The per-file commit emitted by the Blitzy platform addresses ALL applicable dimensions for that file in a single change, not across multiple commits. Example: `public/app/features/explore/Explore.tsx` appears in the class-conversion cohort AND the inline-style cohort AND the `any` cohort — all three dimensions' remediations are applied together in one edit to that file.

The batch boundaries in 0.6.4 are logical, not strictly sequential at the file level: a file that belongs to multiple cohorts is counted in each cohort's numerical totals but is edited once, in the cohort-execution pass where it first appears. The Blitzy platform tracks which files have been addressed to avoid re-editing.

## 0.9 Refactoring Rules

### 0.9.1 Refactoring-Specific Rules Explicitly Emphasized by the User

The user's prompt defines a set of binding rules. The Blitzy platform repeats them verbatim (or minimally rephrased for clarity) to make each one actionable. Every rule is an invariant that holds across every file touched by this refactor.

- **Maintain all public API contracts** — no prop interface, type export, default-export identity, or named-export name exposed from `packages/grafana-ui`, `packages/grafana-data`, `packages/grafana-runtime`, `packages/grafana-schema`, `packages/grafana-sql`, `packages/grafana-prometheus`, `packages/grafana-flamegraph`, or `packages/grafana-e2e-selectors` changes.
- **Preserve all existing functionality** — every user-observable behavior (click handlers firing, form submissions validating, panels rendering, queries executing, alerts triggering) remains byte-for-byte equivalent.
- **Ensure all tests continue passing** — `yarn test --passWithNoTests` scoped to the changed files returns 100% pass, with zero skipped tests that were previously passing.
- **Follow the React 18 hooks pattern** — functional components with hooks exclusively; no class components (except those in the 0.3.2 OUT OF SCOPE list for legitimate reasons).
- **Maintain backward compatibility** — every public type, every exported symbol, every plugin author-facing surface is unchanged.

### 0.9.2 Special Instructions and Constraints

The user's prompt defines a comprehensive set of specific directives. Each is captured below with the Blitzy platform's implementation interpretation.

#### 0.9.2.1 IN SCOPE — Authoritative Cohort Definitions

User's exact specification (preserved verbatim):

- User Example: "71 class component files → functional conversion"
- User Example: "60 files with raw `<button>` → `Button` from `@grafana/ui`"
- User Example: "69 files with raw `<table>` → design system table equivalent"
- User Example: "70 files with raw `<form>` → design system form equivalent"
- User Example: "185 files with inline `style={{}}` → `Box`, `Stack`, or `useStyles2`"
- User Example: "172 files with hardcoded legacy `className` strings → theme-aware styling"
- User Example: "443 files with `any` → explicit typing"

Note: the Blitzy platform's grep enumeration in 0.2.1 produced counts that differ slightly from these user-stated counts (e.g., 82 class files vs 71, 31 raw-button files vs 60, 67 raw-table vs 69, 57 raw-form vs 70, 277 inline-style vs 185, 166 className vs 172). Reconciliation policy: **the user-provided counts are the authoritative SCOPE. The Blitzy platform remediates every in-scope occurrence in the grep-enumerated set that falls inside the four dimensions**, and if that number exceeds the user's headline count, all remaining occurrences are still remediated because the SUCCESS CRITERIA specify "0 remaining" for each category. Only explicit exclusions (primitive self-references inside `@grafana/ui`, graveyard, Legacy Forms, error boundaries, SDK-internals with 3rd-party class coupling) remain.

#### 0.9.2.2 OUT OF SCOPE — Strict Exclusions (MUST NOT BE TOUCHED)

User's exact specification (preserved verbatim):

- User Example: "Backend services, REST API contracts, GraphQL schemas"
- User Example: "Plugin API surface (`@grafana/data`, `@grafana/runtime` public exports)"
- User Example: "E2E test files (`.e2e.ts`, `.spec.ts`)"
- User Example: "Story files (`.stories.tsx`) unless they contain production-path logic"
- User Example: "Generated files (`*.gen.ts`, protobuf outputs)"
- User Example: "Any file, component, or module not within the four modernization dimensions above"
- User Example: "Redux slices, routing logic, and data fetching logic — unless directly embedded inside a class lifecycle method being converted"

#### 0.9.2.3 IMMUTABLE — Behaviors the Refactor MUST NOT Alter

User's exact specification (preserved verbatim):

- User Example: "All rendered visual output must be pixel-equivalent or within intentional design system defaults"
- User Example: "All prop interfaces exposed to plugin authors remain unchanged"
- User Example: "All existing accessible semantics (aria attributes, keyboard navigation, focus management) must be preserved or improved — never degraded"

#### 0.9.2.4 TECHNICAL SPECIFICATIONS — Mandatory Technical Shape

User's exact specification (preserved verbatim):

- User Example: "**Component model:** React 18+ functional components with hooks exclusively. No class components."
- User Example: "**Design system:** `@grafana/ui` (current stable). All raw HTML interactive and layout elements replaced with design system equivalents where a direct replacement exists. If no direct replacement exists, flag and document — do not approximate."
- User Example: "**Styling:** `useStyles2` / `css()` from `@grafana/ui` for all styling. No inline `style={{}}`. No raw `className` strings referencing pre-design-system CSS."
- User Example: "**TypeScript:** Explicit types throughout. `any` replaced with concrete types, generics, inferred types, or `unknown` with type narrowing. No new `@ts-ignore` suppressions."
- User Example: "**Build and runtime:** No changes to webpack config, bundler, module resolution, or `package.json` beyond what the migration strictly requires."

Blitzy platform interpretation: the migration requires NO changes to the build toolchain. `package.json`, `yarn.lock`, `webpack.*.js`, `tsconfig.json`, `eslint.config.js`, `jest.config.js`, `playwright.config.ts` are all untouched.

#### 0.9.2.5 Class → Functional Conversion Rules

User's exact specification (preserved verbatim):

- User Example: "`componentDidMount` → `useEffect(fn, [])`"
- User Example: "`componentDidUpdate` → `useEffect` with explicit dependency array"
- User Example: "`componentWillUnmount` → cleanup return inside `useEffect`"
- User Example: "`setState` → `useState` or `useReducer`"
- User Example: "`PureComponent` → `React.memo` where referential equality optimization was intentional"
- User Example: "All instance variables that are not state → `useRef`"

Blitzy platform application: these are the canonical T1 lifecycle transformation rules. The nuances (synchronous vs asynchronous effect timing, setState callback patterns, getDerivedStateFromProps handling) are detailed in 0.8.2.

#### 0.9.2.6 Design System Replacement Rules

User's exact specification (preserved verbatim):

- User Example: "Raw element replacements MUST preserve identical accessible semantics"
- User Example: "Where `@grafana/ui` has no direct replacement, document the gap with an inline comment and leave the raw element in place — do not build a custom approximation"
- User Example: "`Box` and `Stack` are the primary replacements for layout-driven inline styles"
- User Example: "`useStyles2` / `css()` is the replacement for legacy `className` strings"

Blitzy platform application: Gap-documentation comment format is `// Design system gap: <element> has no @grafana/ui equivalent (as of @grafana/ui 13.0.0-pre). Kept as raw HTML.` placed immediately above the raw element. The 0.4.4 Gaps Inventory enumerates the known gap cases.

#### 0.9.2.7 TypeScript Strictness Rules

User's exact specification (preserved verbatim):

- User Example: "Prefer concrete types over `unknown`; use `unknown` with narrowing over `any`"
- User Example: "For untyped third-party libraries, add a `.d.ts` declaration file scoped to the import rather than suppressing with `any`"
- User Example: "Each retained `any` suppression MUST include an inline comment explaining why the type is unresolvable"

Blitzy platform application: the decision procedure in 0.8.6 implements this hierarchy step-for-step. Retained `any` suppressions always include the justification in the format `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>`.

#### 0.9.2.8 Non-Functional Success Criteria

User's exact specification (preserved verbatim):

- User Example: "Bundle size: no increase &gt;2% on any entrypoint chunk"
- User Example: "TypeScript compilation: `tsc --noEmit` clean after each file batch — zero new errors introduced"
- User Example: "Linting: `yarn lint` clean after each file batch — zero new ESLint violations; existing suppressions preserved as-is"
- User Example: "Existing unit tests: 100% pass rate maintained throughout — `yarn test --passWithNoTests` scoped to changed files after each category batch"
- User Example: "Lighthouse scores for Dashboard, Explore, and Alerting pages: no regression &gt;3 points on any metric"

Blitzy platform application: each is a validation gate invoked after every batch. Gate failure triggers rollback per VALIDATION FRAMEWORK below.

#### 0.9.2.9 Build and Runtime Environment

User's exact specification (preserved verbatim):

- User Example: "**Runtime:** Node.js version per `.nvmrc` in repo root. Yarn version per `packageManager` field in `package.json`."
- User Example: "**TypeScript version:** Per `devDependencies` in `package.json` — do not upgrade."
- User Example: "**Build:** `yarn install && yarn build` from repo root — must pass clean before first change and after each category batch."
- User Example: "**Dev server:** `yarn start` — must serve without console errors on Dashboard, Explore, and Alerting pages before and after."
- User Example: "**Internal dependencies:** `@grafana/ui`, `@grafana/data`, `@grafana/runtime` resolved from monorepo packages directory. No external resolution required."
- User Example: "**Submodules:** Run `git submodule update --init` before first build if `git submodule status` shows uninitialized entries."
- User Example: "**Environment variables:** None required for compilation or build."

Blitzy platform application: Node version is 24.11.0 (from `.nvmrc`); Yarn is 4.11.0 (from `packageManager`); TypeScript 5.9.2 (unchanged). Build command: `yarn install && yarn build`. Dev command: `yarn start`. Submodule init runs before first build.

#### 0.9.2.10 SUCCESS CRITERIA (ALL MUST BE ACHIEVED)

User's exact specification (preserved verbatim):

- User Example: "71 class components converted to functional components with hooks: 0 remaining"
- User Example: "Files importing zero `@grafana/ui` components where a direct design system replacement exists: 0 remaining"
- User Example: "Raw `<button>` usages: 0 remaining (60 files remediated)"
- User Example: "Raw `<table>` usages: 0 remaining (69 files remediated)"
- User Example: "Raw `<form>` usages: 0 remaining (70 files remediated)"
- User Example: "Inline `style={{}}` usages: 0 remaining (185 files remediated)"
- User Example: "Hardcoded legacy `className` strings: 0 remaining (172 files remediated)"
- User Example: "TypeScript `any` occurrences: 0 remaining (568 occurrences across 443 files); scoped `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with inline justification permitted only where external types are unresolvable"

Blitzy platform completion definition: all eight criteria must hold simultaneously before the refactor is considered complete. Partial completion with "we got 68 of 71 class components" is NOT acceptable; all 71 must be converted.

#### 0.9.2.11 VALIDATION FRAMEWORK

User's exact specification (preserved verbatim):

Execute in this sequence. Each gate must pass before proceeding to the next category:

1. User Example: "`tsc --noEmit` — zero new errors"
2. User Example: "`yarn lint` — zero new violations"
3. User Example: "`yarn test --passWithNoTests` scoped to changed files — 100% pass rate"
4. User Example: "Manual smoke test: Dashboard, Explore, Alerting pages load without console errors"

User Example: "**Rollback trigger:** Any validation gate failure halts the batch. Do not proceed to the next file category until the failing batch is clean. Report the exact error, the file involved, and the remediation applied before continuing."

Blitzy platform operationalization: the validation gates run as a sequence after each batch (A through G in 0.6.4). Any failure halts the batch, the Blitzy platform logs the file and error, remediates (most commonly a forgotten import, a missed dependency in a `useEffect` deps array, or an inferred type that TypeScript rejects), re-runs the gates, and proceeds only when all four pass cleanly. Once all seven batches have passed their gates, a final whole-repo validation runs to confirm the aggregate state.

#### 0.9.2.12 MINIMAL CHANGE MANDATE

User's exact specification (preserved verbatim):

User Example: "Make only the changes that are absolutely necessary to implement each modernization dimension. Do not refactor, optimize, or modify code beyond what is directly required. Do not change existing interfaces or behaviors unless specified. When multiple implementation approaches exist, choose the one that requires the least modification to surrounding code. If a code quality issue or unrelated bug is discovered during migration, note it in an inline comment but do not fix it."

Blitzy platform interpretation:

- When converting a class, the Blitzy platform does NOT rename methods, reorder property declarations beyond what's required to form a valid functional body, or reformat existing comments.
- When replacing a raw `<button>`, the Blitzy platform does NOT change surrounding layout, adjacent elements, or neighboring handler implementations.
- When eliminating an `any`, the Blitzy platform does NOT touch unrelated `any` occurrences in the same file — each is handled per the decision procedure in 0.8.6, but only as part of this refactor's explicit targets.
- When introducing `useStyles2`, the Blitzy platform places `getStyles` at the file tail (per repo convention) without reorganizing other file sections.
- Discovered unrelated bugs are noted via inline `// TODO(modernization): <brief description of the bug>` comments and NOT fixed.

### 0.9.3 Any Other User-Provided Rules

The prompt does not introduce additional rules beyond those captured in 0.9.1 and 0.9.2. The Blitzy platform confirms: no unnumbered directive, footnote, or supplementary instruction from the user's prompt has been omitted from this Agent Action Plan.

Additional in-repo conventions that the Blitzy platform honors because they are enforced by existing tooling (not added by this refactor, but their constraints shape every code change):

- `eslint.config.js` `no-restricted-imports` — `Layout`, `HorizontalGroup`, `VerticalGroup` NEVER imported; `useDispatch`/`useSelector` from `react-redux` NEVER imported (use `app/types/store`); `t`/`Trans` from `react-i18next`/`i18next` NEVER imported (use `@grafana/i18n`); deep imports `@grafana/ui/src/*` NEVER used
- `eslint.config.js` `@emotion/syntax-preference: [2, 'object']` — Emotion CSS always uses object-syntax `css({ foo: 'bar' })`, never template-literal `css\`foo: bar\`\`
- `eslint.config.js` `@grafana/no-border-radius-literal` — border radius values always reference `theme.shape.radius.*`, never literal `px`/`rem`
- `eslint.config.js` `@grafana/no-unreduced-motion` — animations respect `prefers-reduced-motion`; existing utility `useReducedMotion()` is used when introducing any animated styling (rare in this refactor)
- `eslint.config.js` `@grafana/i18n/no-untranslated-strings` — user-visible strings are wrapped in `<Trans>` or `t(…)`; any newly introduced user-visible string (unusual in a behavior-preserving refactor) is translated
- `eslint.config.js` `@typescript-eslint/consistent-type-imports` — type-only imports use `import type` syntax
- `tsconfig.json` `noUnusedLocals: true` — every import the Blitzy platform removes is fully removed (no lingering unused imports); every import added is fully used
- `tsconfig.json` `noImplicitAny: true` — implicit any from untyped parameters is caught by the compiler; the refactor's `any` elimination passes this check by construction

## 0.10 References

### 0.10.1 Files Retrieved and Inspected

The Blitzy platform consulted the following files from the repository to ground every assertion in this Agent Action Plan. Each file was read at least once; several were read repeatedly across refactor-target enumeration, dependency-version verification, and code-pattern sampling.

#### Build, runtime, and tooling configuration

- `package.json` — repository root; authoritative source for dependency versions (`react@18.3.1`, `typescript@5.9.2`, `@grafana/scenes@7.1.8`, `@emotion/css@11.13.5`, `@emotion/react@11.14.0`, `eslint@9.32.0`, `eslint-plugin-react-prefer-function-component@4.0.1`, `jest@29.7.0`, `@testing-library/react@16.3.0`, `@playwright/test@1.56.1`), `packageManager: yarn@4.11.0`, `engines.node: >= 22 <25`, scripts (`lint`, `lint:ts`, `lint:sass`, `lint:prune`, `typecheck`, `packages:typecheck`, `test:ci`, `build`, `dev`, `start`)
- `.nvmrc` — Node runtime pin: `v24.11.0`
- `tsconfig.json` — repository TypeScript configuration root
- `scripts/tsconfig.base.json` — extended base config; confirms `strict: true`, `noImplicitAny: true`, `noImplicitReturns: true`, `noImplicitThis: true`, `noUnusedLocals: true`, `useUnknownInCatchVariables: true`, `isolatedModules: true`, `moduleResolution: "bundler"`, `customConditions: ["@grafana-app/source"]`, `jsx: "react-jsx"`
- `eslint.config.js` (lines 1–480) — authoritative ESLint rules: `no-restricted-imports` (Layout/HorizontalGroup/VerticalGroup, react-redux hooks, i18n sources, `@grafana/ui/src/*` deep imports), `@emotion/syntax-preference`, `@grafana/no-border-radius-literal`, `@grafana/no-unreduced-motion`, `@grafana/no-restricted-img-srcs`, `@grafana/i18n/no-untranslated-strings`, `@typescript-eslint/consistent-type-imports`, `react-prefer-function-component/react-prefer-function-component`
- `eslint-suppressions.json` — 4008-line lint baseline; analyzed for rule distribution (`@typescript-eslint/no-explicit-any: 827`, `no-restricted-syntax: 653`, `@typescript-eslint/consistent-type-assertions: 463`, `react-prefer-function-component: 77`, `react-hooks/rules-of-hooks: 37`, `react/no-unescaped-entities: 36`, `@grafana/no-aria-label-selectors: 27`, `@grafana/no-unreduced-motion: 17`, `no-barrel-files: 3`); per-file any-counts (top: `packages/grafana-data/src/types/datasource.ts: 24`, `public/app/features/dashboard/state/DashboardModel.ts: 24`, `public/app/core/time_series2.ts: 19`, `public/app/features/dashboard/state/PanelModel.ts: 17`)

#### Workspace package manifests

- `packages/grafana-ui/package.json` — `name: @grafana/ui`, `version: 13.0.0-pre`, dependencies (`@emotion/css@11.13.5`, `@emotion/react@11.14.0`, `@emotion/serialize@1.3.3`, `@floating-ui/react@0.27.16`, `@grafana/data@13.0.0-pre`, `@grafana/e2e-selectors@13.0.0-pre`, `@grafana/i18n@13.0.0-pre`, `@grafana/schema@13.0.0-pre`, `@hello-pangea/dnd@18.0.1`, `@monaco-editor/react@4.7.0`, `@popperjs/core@2.11.8`, `@rc-component/*`, `@react-aria/*`, `@tanstack/react-virtual@^3.5.1`, `classnames@2.5.1`, `clsx@^2.1.1`, `d3@7.9.0`, `date-fns@4.1.0`, `downshift@^9.0.6`, `i18next@^25.0.0`, `react-hook-form@^7.49.2`, `react-i18next@^15.0.0`, `react-select@5.10.2`, `react-table@7.8.0`)
- `packages/grafana-data/package.json` — `name: @grafana/data`, `version: 13.0.0-pre`, `main: ./dist/cjs/index.cjs`, `types: ./dist/types/index.d.ts`, `peerDependencies: { react: ^18.0.0, react-dom: ^18.0.0 }`
- `packages/grafana-runtime/package.json` — read for `DataSourcePicker` package membership confirmation
- `packages/grafana-sql/package.json` — read for `ErrorBoundary.tsx` location confirmation
- `packages/grafana-prometheus/package.json` — read for Prometheus package boundary confirmation
- `packages/grafana-flamegraph/package.json` — read for Flamegraph package boundary confirmation

#### `@grafana/ui` component library

- `packages/grafana-ui/src/index.ts` (lines 1–400) — authoritative public export barrel; enumerated component imports available under `@grafana/ui` (Button, LinkButton, IconButton, ToolbarButton, ConfirmButton, ClipboardButton, ButtonCascader, Input, AutoSizeInput, FilterInput, TextArea, Combobox, MultiCombobox, Select, RadioButtonGroup, RadioButtonDot, RadioButtonList, Switch, Checkbox, DatePicker, TimePicker, ColorPicker, Form, Field, FieldSet, FieldArray, Legend, InlineField, InlineLabel, InlineFieldRow, InlineSegmentGroup, Table, InteractiveTable, TableInputCSV, Modal, ConfirmModal, Drawer, Tooltip, Popover, Menu, Dropdown, ContextMenu, Badge, Alert, Tag, TagList, EmptyState, Spinner, LoadingPlaceholder, Icon, IconName, Text, Card, CallToActionCard, Tabs, Tab, TabContent, VerticalTab, Avatar, Box, Stack, Grid, Space, Pagination, TimeRangePicker, TimeZonePicker, WeekStartPicker, useStyles2, useTheme2, withTheme2, ThemeContext, GrafanaThemeProvider)
- `packages/grafana-ui/src/components/Button/Button.tsx` — primitive self-reference; confirmed raw `<button>` with existing eslint-disable
- `packages/grafana-ui/src/components/SharedPreferences/` — not applicable (this path is in `public/app/core/components/`)
- `packages/grafana-ui/src/components/QueryField/QueryField.tsx` — in-scope class component; Slate editor integration confirmed
- `packages/grafana-ui/src/components/Typeahead/Typeahead.tsx` — in-scope class; keyboard-state reducer pattern confirmed
- `packages/grafana-ui/src/components/Forms/Legacy/` (Input, Select, SelectOptionGroup, Switch subdirectories) — OUT OF SCOPE Legacy Forms confirmed
- `packages/grafana-ui/src/components/ErrorBoundary/ErrorBoundary.tsx` — OUT OF SCOPE error boundary
- `packages/grafana-ui/src/components/Monaco/CodeEditor.tsx` — OUT OF SCOPE (3rd-party class coupling)
- `packages/grafana-ui/src/components/Select/ValueContainer.tsx` — OUT OF SCOPE (react-select class)
- `packages/grafana-ui/src/components/TableInputCSV/TableInputCSV.tsx` — OUT OF SCOPE (internal)
- `packages/grafana-ui/src/components/VizRepeater/VizRepeater.tsx` — OUT OF SCOPE (SDK-internal class)
- `packages/grafana-ui/src/components/uPlot/Plot.tsx` — OUT OF SCOPE (3rd-party class coupling)
- `packages/grafana-ui/src/components/Card/Card.tsx` — primitive self-reference (raw element OK)
- `packages/grafana-ui/src/components/FilterPill/FilterPill.tsx` — primitive self-reference
- `packages/grafana-ui/src/components/Tags/Tag.tsx` — primitive self-reference
- `packages/grafana-ui/src/components/Forms/Form.tsx` — primitive self-reference
- `packages/grafana-ui/src/components/Table/TableNG/components/HeaderCell.tsx` — primitive self-reference
- `packages/grafana-ui/src/components/Table/TableRT/HeaderRow.tsx` — primitive self-reference
- `packages/grafana-ui/src/utils/storybook/ExampleFrame.tsx` — primitive self-reference
- `packages/grafana-ui/src/components/VizLegend/FacetedLabelsFilter.tsx` — primitive self-reference
- `packages/grafana-ui/src/themes/` — theme tokens source; read to confirm `GrafanaTheme2` shape (colors, spacing, shape.radius, typography, shadows, breakpoints, zIndex)

#### Core `public/app` files sampled for pattern confirmation

- `public/app/AppWrapper.tsx` — root class component; confirmed `extends Component<AppWrapperProps, AppWrapperState>` shape
- `public/app/core/components/SharedPreferences/SharedPreferencesOld.tsx` — in-scope class using `PureComponent`, `@grafana/ui` imports (Button, Field, FieldSet, Label, TimeZonePicker, WeekStartPicker, FeatureBadge, Combobox, TextLink)
- `public/app/core/components/SharedPreferences/SharedPreferencesFunctional.tsx` — canonical REFERENCE target pattern (functional with `memo`, `useState`, `useEffect`) — this is the primary in-repo reference for class→functional conversions
- `public/app/features/explore/Explore.tsx` — class wrapped by `withTheme2` + Redux `connect`; confirms HOC-unwinding complexity
- `public/app/plugins/panel/canvas/CanvasPanel.tsx` — class using `PanelContextRoot.contextType`, `ReplaySubject`, `Subscription`; confirms subscription-lifecycle complexity
- `public/app/features/variables/query/QueryVariableEditor.tsx` — class with embedded `<Trans>` i18n calls; confirms translation preservation requirement

#### Supporting directories inspected via folder listings

- `/` (repository root) — confirmed monorepo layout with `apps/`, `packages/`, `pkg/`, `public/`, `scripts/`, `contribute/`, `e2e/`, `devenv/`, `docs/`
- `public/` — confirmed `app/`, `build/`, `fonts/`, `img/`, `sass/`, `test/`, `testdata/`, `vendor/`, `views/`
- `public/app/` — confirmed `AppWrapper.tsx`, `api/`, `app.ts`, `core/`, `dev-utils.ts`, `dev.ts`, `extensions/`, `features/`, `index.ts`, `initApp.ts`, `plugins/`, `routes/`, `store/`, `types/`
- `public/app/core/components/` — 100+ component subfolders
- `public/app/features/` — 60+ feature subfolders (admin, alerting, annotations, api-keys, auth-config, browse-dashboards, canvas, correlations, dashboard, dashboard-scene, datasources, dimensions, explore, folders, inspector, library-panels, live, logs, manage-dashboards, org, plugins, playlist, profile, provisioning, query, scenes, scopes, search, serviceaccounts, teams, templating, transformers, users, variables)
- `public/app/plugins/datasource/` — 22 datasource subfolders (alertmanager, azuremonitor, cloud-monitoring, cloudwatch, dashboard, elasticsearch, graphite, grafana, grafana-azure-monitor-datasource, grafana-postgresql-datasource, influxdb, jaeger, loki, mssql, mysql, opentsdb, parca, prometheus, pyroscope, tempo, testdata, zipkin)
- `public/app/plugins/panel/` — 40+ panel subfolders
- `packages/` — 17 workspace packages (grafana-agent-observability, grafana-alerting, grafana-data, grafana-e2e-selectors, grafana-eslint-rules, grafana-faro-core, grafana-flamegraph, grafana-i18n, grafana-plugin-configs, grafana-plugin-ui, grafana-prometheus, grafana-runtime, grafana-saga-icons, grafana-schema, grafana-sql, grafana-ui, grafana-o11y-ds-frontend)
- `packages/grafana-ui/src/` — confirmed component library layout (`components/`, `graveyard/`, `themes/`, `utils/`, `types/`, plus top-level `index.ts`, `types.ts`, `slate-plugins/`)
- `packages/grafana-ui/src/components/` — 90+ component family subfolders

#### Tech spec sections consulted

- Section 1.1 Executive Summary — Grafana product scope and platform overview
- Section 3.1 Programming Languages — TypeScript / JavaScript runtime versions, language features in use
- Section 7.1 Core UI Technologies — React 18, TypeScript 5.9, Emotion, `@grafana/ui`, design system positioning
- Section 7.2 Frontend Application Architecture — module organization, feature folders, public/app structure
- Section 7.6 Component Library (@grafana/ui) — component family taxonomy, public export surface, theming hooks
- Section 7.7 Theming and Visual Design System — `GrafanaTheme2`, token categories (colors, spacing, shape, typography, shadows, breakpoints, zIndex)
- Section 7.8 Feature Module Organization — feature-folder conventions, routing boundaries, scene-vs-legacy
- Section 7.9 Key UI Patterns and Interactions — modal patterns, form patterns, table patterns, keyboard navigation
- Section 7.11 Published Frontend SDK Packages — `@grafana/ui`, `@grafana/data`, `@grafana/runtime`, `@grafana/schema` public API

### 0.10.2 Attachments

No file attachments were provided by the user. The `/tmp/environments_files` folder referenced in the project setup instructions was verified to not exist, confirming no external files supplement the written prompt.

### 0.10.3 Figma Screens

No Figma URLs, frames, or screens were provided by the user. This refactor is explicitly behavior-preserving with the IMMUTABLE constraint "All rendered visual output must be pixel-equivalent or within intentional design system defaults" — therefore no Figma-driven design interpretation is required and no Design-to-System mapping (per 0.4's optional Figma path) is produced.

### 0.10.4 External References Consulted

- `@grafana/ui` **contributor styling guide** — `contribute/style-guides/styling.md` (in-repo) — canonical source for the `useStyles2(getStyles)` idiom, `getStyles` placement at file tail, `GrafanaTheme2` parameter, object-syntax Emotion CSS, `cx` composition
- **React 18.3.1 hooks API** — via `react` package and `@types/react@18.3.18` types in repo `node_modules` — hook signatures (`useState`, `useReducer`, `useEffect`, `useRef`, `useCallback`, `useMemo`, `useContext`, `useImperativeHandle`, `useLayoutEffect`, `useDeferredValue`, `useTransition`, `useId`), `React.memo` and `React.forwardRef` signatures
- **React-Redux v9 hooks guidance** — via `react-redux@9.2.0` in `node_modules` and the repo's `app/types/store` re-export — typed `useSelector<StoreState, T>` and `useDispatch<AppDispatch>` pattern
- **TypeScript 5.9 strict-mode semantics** — via `typescript@5.9.2` in `node_modules` and the repo's `tsconfig.json` / `scripts/tsconfig.base.json` — authoritative `strict`, `noImplicitAny`, `useUnknownInCatchVariables`, `noUnusedLocals` behavior

No external web searches were performed because all authoritative references are present in the repository.
