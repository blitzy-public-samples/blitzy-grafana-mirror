import { memo, useEffect, useRef, useState } from 'react';

import { type QueryEditorProps } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

import { MetricFindQueryTypes } from '../dataquery.gen';
import type CloudMonitoringDatasource from '../datasource';
import { extractServicesFromMetricDescriptors, getLabelKeys, getMetricTypes } from '../functions';
import { type CloudMonitoringQuery } from '../types/query';
import {
  type CloudMonitoringOptions,
  type CloudMonitoringVariableQuery,
  type MetricDescriptor,
  type VariableQueryData,
} from '../types/types';

import { VariableQueryField } from './Fields';

export type Props = QueryEditorProps<
  CloudMonitoringDatasource,
  CloudMonitoringQuery,
  CloudMonitoringOptions,
  CloudMonitoringVariableQuery
>;

// Module-level constants — preserve referential stability across renders and avoid
// re-creating these on every render (previously class instance properties).
const queryTypes: Array<{ value: string; label: string }> = [
  { value: MetricFindQueryTypes.Projects, label: 'Projects' },
  { value: MetricFindQueryTypes.Services, label: 'Services' },
  { value: MetricFindQueryTypes.MetricTypes, label: 'Metric Types' },
  { value: MetricFindQueryTypes.LabelKeys, label: 'Label Keys' },
  { value: MetricFindQueryTypes.LabelValues, label: 'Label Values' },
  { value: MetricFindQueryTypes.ResourceTypes, label: 'Resource Types' },
  { value: MetricFindQueryTypes.Aggregations, label: 'Aggregations' },
  { value: MetricFindQueryTypes.Aligners, label: 'Aligners' },
  { value: MetricFindQueryTypes.AlignmentPeriods, label: 'Alignment Periods' },
  { value: MetricFindQueryTypes.Selectors, label: 'Selectors' },
  { value: MetricFindQueryTypes.SLOServices, label: 'SLO Services' },
  { value: MetricFindQueryTypes.SLO, label: 'Service Level Objectives (SLO)' },
];

const defaults: VariableQueryData = {
  selectedQueryType: queryTypes[0].value,
  metricDescriptors: [],
  selectedService: '',
  selectedMetricType: '',
  labels: [],
  labelKey: '',
  metricTypes: [],
  services: [],
  sloServices: [],
  selectedSLOService: '',
  projects: [],
  projectName: '',
  loading: true,
};

// Pure module-level helper — replaces the class's `getLabels` instance method.
// Accepts all dependencies as parameters to avoid stale closures and keep the function pure.
async function getLabelsImpl(
  selectedMetricType: string,
  projectName: string,
  selectedQueryType: string,
  currentLabels: string[],
  currentLabelKey: string,
  datasource: CloudMonitoringDatasource
) {
  let result = { labels: currentLabels, labelKey: currentLabelKey };
  if (selectedMetricType && selectedQueryType === MetricFindQueryTypes.LabelValues) {
    const labels = await getLabelKeys(datasource, selectedMetricType, projectName);
    const labelKey = labels.some((l) => l === getTemplateSrv().replace(currentLabelKey))
      ? currentLabelKey
      : labels[0];
    result = { labels, labelKey };
  }
  return result;
}

export const CloudMonitoringVariableQueryEditor = memo(function CloudMonitoringVariableQueryEditor(props: Props) {
  const { datasource, query, onChange } = props;

  // Initial state mirrors the original class's constructor: `Object.assign(this.defaults, this.props.query)`.
  // We use `Object.assign({}, defaults, query)` with an empty-object first argument to avoid mutating
  // the shared module-level `defaults` constant (the original class mutated its instance-level
  // `this.defaults`, which was safe because each instance had its own copy).
  // The `useState` initializer is a function so the spread runs only on first render.
  const [state, setState] = useState<VariableQueryData>(() => Object.assign({}, defaults, query));

  // Track whether the component has completed its first render so `componentDidUpdate` semantics
  // can skip the initial mount (the original `componentDidUpdate` does NOT fire on first mount).
  const isFirstRender = useRef(true);

  // componentDidMount equivalent — runs once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await datasource.ensureGCEDefaultProject();
      const projectName = query.projectName || datasource.getDefaultProject();
      const projects = (await datasource.getProjects()) as MetricDescriptor[];
      const metricDescriptors = await datasource.getMetricTypes(
        query.projectName || datasource.getDefaultProject()
      );
      const services = extractServicesFromMetricDescriptors(metricDescriptors).map((m) => ({
        value: m.service,
        label: m.serviceShortName,
      }));

      let selectedService = '';
      if (services.some((s) => s.value === getTemplateSrv().replace(state.selectedService))) {
        selectedService = state.selectedService;
      } else if (services && services.length > 0) {
        selectedService = services[0].value;
      }

      const { metricTypes, selectedMetricType } = getMetricTypes(
        metricDescriptors,
        state.selectedMetricType,
        getTemplateSrv().replace(state.selectedMetricType),
        getTemplateSrv().replace(selectedService)
      );

      const sloServices = await datasource.getSLOServices(projectName);

      const labelsResult = await getLabelsImpl(
        selectedMetricType,
        projectName,
        state.selectedQueryType,
        state.labels,
        state.labelKey,
        datasource
      );

      if (cancelled) {
        return;
      }

      const newState: VariableQueryData = {
        ...state,
        services,
        selectedService,
        metricTypes,
        selectedMetricType,
        metricDescriptors,
        projects,
        labels: labelsResult.labels,
        labelKey: labelsResult.labelKey,
        sloServices,
        loading: false,
        projectName,
      };
      setState(newState);

      // Replicates `setState(state, () => this.onPropsChange())` callback semantics:
      // compute the new state locally and call onChange synchronously with it so the
      // parent receives the freshly-computed payload without waiting for React to commit
      // the state (avoiding stale-closure issues with React 18's async setState).
      const { metricDescriptors: _md, labels: _l, metricTypes: _mt, services: _s, ...queryModel } = newState;
      onChange({ ...queryModel, refId: 'CloudMonitoringVariableQueryEditor-VariableQuery' });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- componentDidMount semantics: run exactly once on mount, equivalent to the original class's mount-only fetch
  }, []);

  // componentDidUpdate equivalent — fire onPropsChange when selectedQueryType or selectedSLOService change.
  // Skip the initial render (original componentDidUpdate does not fire on mount).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const { metricDescriptors: _md, labels: _l, metricTypes: _mt, services: _s, ...queryModel } = state;
    onChange({ ...queryModel, refId: 'CloudMonitoringVariableQueryEditor-VariableQuery' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- match componentDidUpdate semantics: fire only when selectedQueryType or selectedSLOService change, not on every state mutation
  }, [state.selectedQueryType, state.selectedSLOService]);

  // Helper that replicates `onPropsChange = () => { ... }` from the original class.
  // Accepts an optional `newState` parameter (defaulting to current `state`), allowing
  // the post-setState callback pattern to pass the freshly-computed state without
  // relying on a re-render to read it.
  const onPropsChange = (newState: VariableQueryData = state) => {
    const { metricDescriptors: _md, labels: _l, metricTypes: _mt, services: _s, ...queryModel } = newState;
    onChange({ ...queryModel, refId: 'CloudMonitoringVariableQueryEditor-VariableQuery' });
  };

  const onQueryTypeChange = async (queryType: string) => {
    const labelsResult = await getLabelsImpl(
      state.selectedMetricType,
      state.projectName,
      queryType,
      state.labels,
      state.labelKey,
      datasource
    );
    // Note: original class `onQueryTypeChange` uses setState WITHOUT a callback. The
    // componentDidUpdate useEffect (above) fires onPropsChange when selectedQueryType
    // changes. We do not call onPropsChange directly here, matching the original behavior.
    setState((prev) => ({ ...prev, selectedQueryType: queryType, ...labelsResult }));
  };

  const onProjectChange = async (projectName: string) => {
    const metricDescriptors = await datasource.getMetricTypes(projectName);
    const labelsResult = await getLabelsImpl(
      state.selectedMetricType,
      projectName,
      state.selectedQueryType,
      state.labels,
      state.labelKey,
      datasource
    );
    const { metricTypes, selectedMetricType } = getMetricTypes(
      metricDescriptors,
      state.selectedMetricType,
      getTemplateSrv().replace(state.selectedMetricType),
      getTemplateSrv().replace(state.selectedService)
    );

    const sloServices = await datasource.getSLOServices(projectName);

    // Compute new state locally and call onPropsChange with it — replicates
    // `setState(s, () => this.onPropsChange())` from the original class.
    const newState: VariableQueryData = {
      ...state,
      labels: labelsResult.labels,
      labelKey: labelsResult.labelKey,
      metricTypes,
      selectedMetricType,
      metricDescriptors,
      projectName,
      sloServices,
    };
    setState(newState);
    onPropsChange(newState);
  };

  const onServiceChange = async (service: string) => {
    const { metricTypes, selectedMetricType } = getMetricTypes(
      state.metricDescriptors,
      state.selectedMetricType,
      getTemplateSrv().replace(state.selectedMetricType),
      getTemplateSrv().replace(service)
    );
    const labelsResult = await getLabelsImpl(
      selectedMetricType,
      state.projectName,
      state.selectedQueryType,
      state.labels,
      state.labelKey,
      datasource
    );
    const newState: VariableQueryData = {
      ...state,
      selectedService: service,
      metricTypes,
      selectedMetricType,
      labels: labelsResult.labels,
      labelKey: labelsResult.labelKey,
    };
    setState(newState);
    onPropsChange(newState);
  };

  const onMetricTypeChange = async (metricType: string) => {
    const labelsResult = await getLabelsImpl(
      getTemplateSrv().replace(metricType),
      state.projectName,
      state.selectedQueryType,
      state.labels,
      state.labelKey,
      datasource
    );
    const newState: VariableQueryData = {
      ...state,
      selectedMetricType: metricType,
      labels: labelsResult.labels,
      labelKey: labelsResult.labelKey,
    };
    setState(newState);
    onPropsChange(newState);
  };

  const onLabelKeyChange = (labelKey: string) => {
    const newState: VariableQueryData = { ...state, labelKey };
    setState(newState);
    onPropsChange(newState);
  };

  const renderQueryTypeSwitch = (queryType: string) => {
    const variableOptionGroup = {
      label: 'Template Variables',
      expanded: false,
      options: getTemplateSrv()
        .getVariables()
        .map((v) => ({
          value: `$${v.name}`,
          label: `$${v.name}`,
        })),
    };

    switch (queryType) {
      case MetricFindQueryTypes.MetricTypes:
        return (
          <>
            <VariableQueryField
              allowCustomValue={true}
              value={state.projectName}
              options={[variableOptionGroup, ...state.projects]}
              onChange={(value) => onProjectChange(value)}
              label="Project"
            />
            <VariableQueryField
              value={state.selectedService}
              options={[variableOptionGroup, ...state.services]}
              onChange={(value) => onServiceChange(value)}
              label="Service"
            />
          </>
        );
      case MetricFindQueryTypes.LabelKeys:
      case MetricFindQueryTypes.LabelValues:
      case MetricFindQueryTypes.ResourceTypes:
        return (
          <>
            <VariableQueryField
              allowCustomValue={true}
              value={state.projectName}
              options={[variableOptionGroup, ...state.projects]}
              onChange={(value) => onProjectChange(value)}
              label="Project"
            />
            <VariableQueryField
              value={state.selectedService}
              options={[variableOptionGroup, ...state.services]}
              onChange={(value) => onServiceChange(value)}
              label="Service"
            />
            <VariableQueryField
              value={state.selectedMetricType}
              options={[
                variableOptionGroup,
                ...state.metricTypes.map(({ value, name }) => ({ value, label: name })),
              ]}
              onChange={(value) => onMetricTypeChange(value)}
              label="Metric Type"
            />
            {queryType === MetricFindQueryTypes.LabelValues && (
              <VariableQueryField
                value={state.labelKey}
                options={[variableOptionGroup, ...state.labels.map((l) => ({ value: l, label: l }))]}
                onChange={(value) => onLabelKeyChange(value)}
                label="Label Key"
              />
            )}
          </>
        );
      case MetricFindQueryTypes.Aligners:
      case MetricFindQueryTypes.Aggregations:
        return (
          <>
            <VariableQueryField
              value={state.selectedService}
              options={[variableOptionGroup, ...state.services]}
              onChange={(value) => onServiceChange(value)}
              label="Service"
            />
            <VariableQueryField
              value={state.selectedMetricType}
              options={[
                variableOptionGroup,
                ...state.metricTypes.map(({ value, name }) => ({ value, label: name })),
              ]}
              onChange={(value) => onMetricTypeChange(value)}
              label="Metric Type"
            />
          </>
        );
      case MetricFindQueryTypes.Services:
      case MetricFindQueryTypes.SLOServices:
        return (
          <>
            <VariableQueryField
              allowCustomValue={true}
              value={state.projectName}
              options={[variableOptionGroup, ...state.projects]}
              onChange={(value) => onProjectChange(value)}
              label="Project"
            />
          </>
        );

      case MetricFindQueryTypes.SLO:
        return (
          <>
            <VariableQueryField
              allowCustomValue={true}
              value={state.projectName}
              options={[variableOptionGroup, ...state.projects]}
              onChange={(value) => onProjectChange(value)}
              label="Project"
            />
            <VariableQueryField
              value={state.selectedSLOService}
              options={[variableOptionGroup, ...state.sloServices]}
              onChange={(value) => {
                setState((prev) => ({
                  ...prev,
                  selectedSLOService: value,
                }));
              }}
              label="SLO Service"
            />
          </>
        );
      default:
        return '';
    }
  };

  if (state.loading) {
    return (
      <VariableQueryField
        value={'loading'}
        options={[{ value: 'loading', label: 'Loading...' }]}
        onChange={(value) => null}
        label="Query Type"
      />
    );
  }

  return (
    <>
      <VariableQueryField
        value={state.selectedQueryType}
        options={queryTypes}
        onChange={(value) => onQueryTypeChange(value)}
        label="Query Type"
      />
      {renderQueryTypeSwitch(state.selectedQueryType)}
    </>
  );
});

CloudMonitoringVariableQueryEditor.displayName = 'CloudMonitoringVariableQueryEditor';
