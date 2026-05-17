import { css, cx } from '@emotion/css';
import { sortBy } from 'lodash';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import * as React from 'react';
import { FixedSizeList } from 'react-window';

import { type CoreApp, type GrafanaTheme2, type TimeRange } from '@grafana/data';
import { reportInteraction } from '@grafana/runtime';
import {
  Button,
  type HighlightPart,
  Input,
  Label,
  LoadingPlaceholder,
  useTheme2,
  BrowserLabel as LokiLabel,
  fuzzyMatch,
  Stack,
} from '@grafana/ui';

import type LokiLanguageProvider from '../LanguageProvider';
import { escapeLabelValueInExactSelector, escapeLabelValueInRegexSelector } from '../languageUtils';

// Hard limit on labels to render
const MAX_LABEL_COUNT = 1000;
const MAX_VALUE_COUNT = 10000;
const MAX_AUTO_SELECT = 4;
const EMPTY_SELECTOR = '{}';
const collator = new Intl.Collator('en', { sensitivity: 'accent' });

export interface BrowserProps {
  languageProvider: LokiLanguageProvider;
  onChange: (selector: string) => void;
  theme: GrafanaTheme2;
  app?: CoreApp;
  autoSelect?: number;
  timeRange?: TimeRange;
  hide?: () => void;
  lastUsedLabels: string[];
  storeLastUsedLabels: (labels: string[]) => void;
  deleteLastUsedLabels: () => void;
}

interface FacettableValue {
  name: string;
  selected?: boolean;
  highlightParts?: HighlightPart[];
  order?: number;
}

export interface SelectableLabel {
  name: string;
  selected?: boolean;
  loading?: boolean;
  values?: FacettableValue[];
  hidden?: boolean;
  facets?: number;
}

export function buildSelector(labels: SelectableLabel[]): string {
  const selectedLabels = [];
  for (const label of labels) {
    if (label.selected && label.values && label.values.length > 0) {
      const selectedValues = label.values
        .filter((value) => value.selected)
        .map((value) => value.name)
        .sort(collator.compare); // sort selected values alphabetically
      if (selectedValues.length > 1) {
        selectedLabels.push(`${label.name}=~"${selectedValues.map(escapeLabelValueInRegexSelector).join('|')}"`);
      } else if (selectedValues.length === 1) {
        selectedLabels.push(`${label.name}="${escapeLabelValueInExactSelector(selectedValues[0])}"`);
      }
    }
  }
  return ['{', selectedLabels.join(','), '}'].join('');
}

export function facetLabels(
  labels: SelectableLabel[],
  possibleLabels: Record<string, string[]>,
  lastFacetted?: string
): SelectableLabel[] {
  return labels.map((label) => {
    const possibleValues = possibleLabels[label.name];
    if (possibleValues) {
      let existingValues: FacettableValue[];
      if (label.name === lastFacetted && label.values) {
        // Facetting this label, show all values
        existingValues = label.values;
      } else {
        // Keep selection in other facets
        const selectedValues: Set<string> = new Set(
          label.values?.filter((value) => value.selected).map((value) => value.name) || []
        );
        // Values for this label have not been requested yet, let's use the facetted ones as the initial values
        existingValues = possibleValues
          .slice()
          .sort(collator.compare) // sort raw label values alphabetically
          .map((value) => ({
            name: value,
            selected: selectedValues.has(value),
          }));
      }
      return { ...label, loading: false, values: existingValues, facets: existingValues.length };
    }

    // Label is facetted out, hide all values
    return { ...label, loading: false, hidden: !possibleValues, values: undefined, facets: 0 };
  });
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    backgroundColor: theme.colors.background.secondary,
    width: '100%',
  }),
  wrapperPadding: css({
    padding: theme.spacing(2),
  }),
  list: css({
    marginTop: theme.spacing(1),
    display: 'flex',
    flexWrap: 'wrap',
    maxHeight: '200px',
    overflow: 'auto',
  }),
  section: css({
    '& + &': {
      margin: theme.spacing(2, 0),
    },

    position: 'relative',
  }),
  footerSectionStyles: css({
    padding: theme.spacing(1),
    backgroundColor: theme.colors.background.primary,
    position: 'sticky',
    bottom: theme.spacing(-3) /* offset the padding on modal */,
    left: 0,
  }),
  selector: css({
    fontFamily: theme.typography.fontFamilyMonospace,
    marginBottom: theme.spacing(1),
    width: '100%',
  }),
  status: css({
    marginBottom: theme.spacing(1),
    color: theme.colors.text.secondary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    [theme.transitions.handleMotion('no-preference', 'reduce')]: {
      transition: 'opacity 100ms linear',
    },
    opacity: 0,
    fontSize: theme.typography.bodySmall.fontSize,
    height: `calc(${theme.typography.bodySmall.fontSize} + 10px)`,
  }),
  statusShowing: css({
    opacity: 1,
  }),
  error: css({
    color: theme.colors.error.main,
  }),
  valueList: css({
    marginRight: theme.spacing(1),
    resize: 'horizontal',
  }),
  valueListWrapper: css({
    borderLeft: `1px solid ${theme.colors.border.medium}`,
    margin: theme.spacing(1, 0),
    padding: theme.spacing(1, 0, 1, 1),
  }),
  valueListArea: css({
    display: 'flex',
    flexWrap: 'wrap',
    marginTop: theme.spacing(1),
  }),
  valueTitle: css({
    marginLeft: theme.spacing(-0.5),
    marginBottom: theme.spacing(1),
  }),
  validationStatus: css({
    padding: theme.spacing(0.5),
    marginBottom: theme.spacing(1),
    color: theme.colors.text.maxContrast,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
});

export const UnthemedLokiLabelBrowser = (props: BrowserProps) => {
  const [labels, setLabels] = useState<SelectableLabel[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [status, setStatus] = useState<string>('Ready');
  const [error, setError] = useState<string>('');
  const [validationStatus, setValidationStatus] = useState<string>('');

  // Mirror of the `labels` state used by async callbacks to read the latest
  // snapshot after `await` completions. This implements the AAP §0.8.2 Subtlety 6
  // pattern: "The Blitzy platform resolves this with `useRef` mirrors of
  // frequently-updating values when the callback cannot practically be recreated."
  // The class implementation relied on `this.state.labels` returning the current
  // store; the functional rewrite preserves that semantic via this ref.
  const labelsRef = useRef<SelectableLabel[]>([]);
  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  const { languageProvider, timeRange } = props;

  // Helper that updates a specific label's fields, sets status/error/validationStatus,
  // and optionally invokes a follow-on callback after React schedules the state update.
  // This preserves the original `setState((state) => ({...}), cb)` semantics: the callback
  // observes the JUST-updated labels array via the `nextLabels` argument that is computed
  // synchronously inside the functional setter. We use `queueMicrotask` to defer the
  // callback to after React has applied the state update, matching the class behavior
  // where the second `setState` argument fires post-commit.
  const updateLabelState = useCallback(
    (
      name: string,
      updatedFields: Partial<SelectableLabel>,
      newStatus = '',
      cb?: (nextLabels: SelectableLabel[]) => void
    ) => {
      setLabels((currentLabels) => {
        const nextLabels = currentLabels.map((label) => (label.name === name ? { ...label, ...updatedFields } : label));
        if (cb) {
          queueMicrotask(() => cb(nextLabels));
        }
        return nextLabels;
      });
      setStatus(newStatus);
      // New status overrides errors (matches original behavior).
      if (newStatus) {
        setError('');
      }
      setValidationStatus('');
    },
    []
  );

  // Async fetcher for label values. After the `await`, the current labels snapshot
  // is read from `labelsRef.current` (kept in sync by the effect above). This matches
  // the class implementation, which read `this.state.labels` post-await — always
  // returning the latest committed state. AAP §0.8.2 Subtlety 6 prescribes this
  // useRef pattern as the canonical fix for stale-closure issues in async callbacks.
  const fetchValues = useCallback(
    async (name: string, selector: string) => {
      updateLabelState(name, { loading: true }, `Fetching values for ${name}`);
      try {
        let rawValues = await languageProvider.fetchLabelValues(name, { timeRange });
        // Read the latest labels snapshot via the ref to compute the current selector.
        const currentSelector = buildSelector(labelsRef.current);
        // If selector changed, clear loading state and discard result by returning early
        if (selector !== currentSelector) {
          updateLabelState(name, { loading: false }, '');
          return;
        }
        if (rawValues.length > MAX_VALUE_COUNT) {
          const errorMsg = `Too many values for ${name} (showing only ${MAX_VALUE_COUNT} of ${rawValues.length})`;
          rawValues = rawValues.slice(0, MAX_VALUE_COUNT);
          setError(errorMsg);
        }
        const values: FacettableValue[] = rawValues.map((value) => ({ name: value }));
        updateLabelState(name, { values, loading: false });
      } catch (err) {
        console.error(err);
      }
    },
    [languageProvider, timeRange, updateLabelState]
  );

  // Async fetcher for facetted series labels. Same useRef-mirror pattern as
  // `fetchValues` — reads `labelsRef.current` post-await to capture the latest
  // labels snapshot for the facetLabels merge. AAP §0.8.2 Subtlety 6.
  const fetchSeries = useCallback(
    async (selector: string, lastFacetted?: string) => {
      if (lastFacetted) {
        updateLabelState(lastFacetted, { loading: true }, `Loading labels for ${selector}`);
      }
      try {
        const possibleLabels = await languageProvider.fetchSeriesLabels(selector, { timeRange });
        // Read the latest labels snapshot via the ref.
        const currentLabelsSnapshot = labelsRef.current;
        const currentSelector = buildSelector(currentLabelsSnapshot);
        // If selector changed, clear loading state and discard result by returning early
        if (selector !== currentSelector) {
          if (lastFacetted) {
            updateLabelState(lastFacetted, { loading: false });
          }
          return;
        }
        if (Object.keys(possibleLabels).length === 0) {
          setError(`Empty results, no matching label for ${selector}`);
          return;
        }
        const newLabels: SelectableLabel[] = facetLabels(currentLabelsSnapshot, possibleLabels, lastFacetted);
        setLabels(newLabels);
        setError('');
        if (lastFacetted) {
          updateLabelState(lastFacetted, { loading: false });
        }
      } catch (err) {
        console.error(err);
      }
    },
    [languageProvider, timeRange, updateLabelState]
  );

  // doFacetting reads the latest labels snapshot via the functional setLabels pattern
  // because it is invoked from queued microtasks where the closure may be stale.
  // Side-effects (fetchValues/fetchSeries) are scheduled with queueMicrotask so they
  // run AFTER React commits the state update returned from the setter.
  const doFacetting = useCallback(
    (lastFacetted?: string) => {
      setLabels((currentLabels) => {
        const selector = buildSelector(currentLabels);
        if (selector === EMPTY_SELECTOR) {
          // Clear up facetting
          const cleared: SelectableLabel[] = currentLabels.map((label) => ({
            ...label,
            facets: 0,
            values: undefined,
            hidden: false,
          }));
          // Schedule fetchValues for all selected labels after state update
          queueMicrotask(() => {
            cleared.forEach((label) => {
              if (label.selected) {
                fetchValues(label.name, selector);
              }
            });
          });
          return cleared;
        } else {
          // Do facetting via fetchSeries — defer to microtask so callers can chain.
          queueMicrotask(() => {
            fetchSeries(selector, lastFacetted);
          });
          return currentLabels;
        }
      });
    },
    [fetchValues, fetchSeries]
  );

  // doFacettingForLabel — invoked from the `updateLabelState` callback in onClickLabel.
  // It reads the latest labels through functional setLabels (since the chain runs from
  // a microtask) and decides whether to refetch the values or to re-facet.
  const doFacettingForLabel = useCallback(
    (name: string) => {
      setLabels((currentLabels) => {
        const label = currentLabels.find((l) => l.name === name);
        if (!label) {
          return currentLabels;
        }
        const selectedLabels = currentLabels.filter((l) => l.selected).map((l) => l.name);
        props.storeLastUsedLabels(selectedLabels);
        if (label.selected) {
          // Refetch values for newly selected label...
          if (!label.values) {
            queueMicrotask(() => fetchValues(name, buildSelector(currentLabels)));
          }
        } else {
          // Only need to facet when deselecting labels
          queueMicrotask(() => doFacetting());
        }
        return currentLabels;
      });
    },
    [props, fetchValues, doFacetting]
  );

  const onChangeSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  }, []);

  const onClickRunLogsQuery = useCallback(() => {
    reportInteraction('grafana_loki_label_browser_closed', {
      app: props.app,
      closeType: 'showLogsButton',
    });
    const selector = buildSelector(labels);
    props.onChange(selector);
  }, [props, labels]);

  const onClickRunMetricsQuery = useCallback(() => {
    reportInteraction('grafana_loki_label_browser_closed', {
      app: props.app,
      closeType: 'showLogsRateButton',
    });
    const selector = buildSelector(labels);
    const query = `rate(${selector}[$__auto])`;
    props.onChange(query);
  }, [props, labels]);

  const onClickClear = useCallback(() => {
    setLabels((currentLabels) =>
      currentLabels.map((label) => ({
        ...label,
        values: undefined,
        selected: false,
        loading: false,
        hidden: false,
        facets: undefined,
      }))
    );
    setSearchTerm('');
    setStatus('');
    setError('');
    setValidationStatus('');
    props.deleteLastUsedLabels();
  }, [props]);

  const onClickLabel = useCallback(
    (name: string, value: string | undefined, event: React.MouseEvent<HTMLElement>) => {
      const label = labels.find((l) => l.name === name);
      if (!label) {
        return;
      }
      // Toggle selected state
      const selected = !label.selected;
      let nextValue: Partial<SelectableLabel> = { selected };
      if (label.values && !selected) {
        // Deselect all values if label was deselected
        const values = label.values.map((v) => ({ ...v, selected: false }));
        nextValue = { ...nextValue, facets: 0, values };
      }
      // Resetting search to prevent empty results
      setSearchTerm('');
      updateLabelState(name, nextValue, '', () => doFacettingForLabel(name));
    },
    [labels, updateLabelState, doFacettingForLabel]
  );

  const onClickValue = useCallback(
    (name: string, value: string | undefined, event: React.MouseEvent<HTMLElement>) => {
      const label = labels.find((l) => l.name === name);
      if (!label || !label.values) {
        return;
      }
      // Resetting search to prevent empty results
      setSearchTerm('');
      // Toggling value for selected label, leaving other values intact
      const values = label.values.map((v) => ({ ...v, selected: v.name === value ? !v.selected : v.selected }));
      updateLabelState(name, { values }, '', () => doFacetting(name));
    },
    [labels, updateLabelState, doFacetting]
  );

  const validateSelector = useCallback(
    async (selector: string) => {
      setValidationStatus(`Validating selector ${selector}`);
      setError('');
      const streams = await languageProvider.fetchSeries(selector, { timeRange });
      setValidationStatus(`Selector is valid (${streams.length} streams found)`);
    },
    [languageProvider, timeRange]
  );

  const onClickValidate = useCallback(() => {
    const selector = buildSelector(labels);
    validateSelector(selector);
  }, [labels, validateSelector]);

  // componentDidMount equivalent — runs once on mount with initial props.
  // The original componentDidMount only ran once at mount time, so we use an empty
  // dependency array. This is the canonical Class→Functional translation per AAP §0.8.2
  // (Subtlety 1) and §0.8.5: the eslint-disable for exhaustive-deps is justified by the
  // explicit one-shot lifecycle semantics of componentDidMount.
  useEffect(() => {
    const { languageProvider, autoSelect = MAX_AUTO_SELECT, lastUsedLabels, timeRange } = props;
    if (languageProvider) {
      const selectedLabels: string[] = lastUsedLabels;
      languageProvider.start(timeRange).then(() => {
        let rawLabels: string[] = languageProvider.getLabelKeys();
        if (rawLabels.length > MAX_LABEL_COUNT) {
          const errorMsg = `Too many labels found (showing only ${MAX_LABEL_COUNT} of ${rawLabels.length})`;
          rawLabels = rawLabels.slice(0, MAX_LABEL_COUNT);
          setError(errorMsg);
        }
        // Auto-select all labels if label list is small enough
        const initialLabels: SelectableLabel[] = rawLabels.map((label, i, arr) => ({
          name: label,
          selected: (arr.length <= autoSelect && selectedLabels.length === 0) || selectedLabels.includes(label),
          loading: false,
        }));
        setLabels(initialLabels);
        // Pre-fetch values for selected labels — defer so setLabels commits first.
        queueMicrotask(() => {
          initialLabels.forEach((label) => {
            if (label.selected) {
              fetchValues(label.name, EMPTY_SELECTOR);
            }
          });
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render body — preserves the original render method's logic verbatim.
  const { theme } = props;
  if (labels.length === 0) {
    return <LoadingPlaceholder text="Loading labels..." />;
  }
  const styles = getStyles(theme);
  const selector = buildSelector(labels);
  const empty = selector === EMPTY_SELECTOR;

  let selectedLabels = labels.filter((label) => label.selected && label.values);
  if (searchTerm) {
    selectedLabels = selectedLabels.map((label) => {
      const searchResults = label.values!.filter((value) => {
        // Always return selected values
        if (value.selected) {
          value.highlightParts = undefined;
          return true;
        }
        const fuzzyMatchResult = fuzzyMatch(value.name.toLowerCase(), searchTerm.toLowerCase());
        if (fuzzyMatchResult.found) {
          value.highlightParts = fuzzyMatchResult.ranges;
          value.order = fuzzyMatchResult.distance;
          return true;
        } else {
          return false;
        }
      });
      return {
        ...label,
        values: sortBy(searchResults, (value) => (value.selected ? -Infinity : value.order)),
      };
    });
  } else {
    // Clear highlight parts when searchTerm is cleared
    selectedLabels = labels
      .filter((label) => label.selected && label.values)
      .map((label) => ({
        ...label,
        values: label?.values ? label.values.map((value) => ({ ...value, highlightParts: undefined })) : [],
      }));
  }

  return (
    <>
      <div className={styles.wrapper}>
        <div className={cx(styles.section, styles.wrapperPadding)}>
          <Label description="Which labels would you like to consider for your search?">
            1. Select labels to search in
          </Label>
          <div className={styles.list}>
            {labels.map((label) => (
              <LokiLabel
                key={label.name}
                name={label.name}
                loading={label.loading}
                active={label.selected}
                hidden={label.hidden}
                facets={label.facets}
                onClick={onClickLabel}
              />
            ))}
          </div>
        </div>
        <div className={cx(styles.section, styles.wrapperPadding)}>
          <Label description="Choose the label values that you would like to use for the query. Use the search field to find values across selected labels.">
            2. Find values for the selected labels
          </Label>
          <div>
            <Input
              onChange={onChangeSearch}
              aria-label="Filter expression for values"
              value={searchTerm}
              placeholder={'Enter a label value'}
            />
          </div>
          <div className={styles.valueListArea}>
            {selectedLabels.map((label) => (
              <div role="list" key={label.name} className={styles.valueListWrapper}>
                <div className={styles.valueTitle} aria-label={`Values for ${label.name}`}>
                  <LokiLabel
                    name={label.name}
                    loading={label.loading}
                    active={label.selected}
                    hidden={label.hidden}
                    //If no facets, we want to show number of all label values
                    facets={label.facets || label.values?.length}
                    onClick={onClickLabel}
                  />
                </div>
                <FixedSizeList
                  height={200}
                  itemCount={label.values?.length || 0}
                  itemSize={28}
                  itemKey={(i) => label.values?.[i].name ?? i}
                  width={200}
                  className={styles.valueList}
                >
                  {({ index, style }) => {
                    const value = label.values?.[index];
                    if (!value) {
                      return null;
                    }
                    return (
                      <div style={style}>
                        <LokiLabel
                          name={label.name}
                          value={value?.name}
                          active={value?.selected}
                          highlightParts={value?.highlightParts}
                          onClick={onClickValue}
                          searchTerm={searchTerm}
                        />
                      </div>
                    );
                  }}
                </FixedSizeList>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.footerSectionStyles}>
        <Label>3. Resulting selector</Label>
        <pre aria-label="selector" className={styles.selector}>
          {selector}
        </pre>
        {validationStatus && <div className={styles.validationStatus}>{validationStatus}</div>}
        <div className={cx(styles.status, (status || error) && styles.statusShowing)}>
          <span className={error ? styles.error : ''}>{error || status}</span>
        </div>
        <Stack gap={1}>
          <Button aria-label="Use selector as logs button" disabled={empty} onClick={onClickRunLogsQuery}>
            Show logs
          </Button>
          <Button
            aria-label="Use selector as metrics button"
            variant="secondary"
            disabled={empty}
            onClick={onClickRunMetricsQuery}
          >
            Show logs rate
          </Button>
          <Button aria-label="Validate submit button" variant="secondary" disabled={empty} onClick={onClickValidate}>
            Validate selector
          </Button>
          <Button aria-label="Selector clear button" variant="secondary" onClick={onClickClear}>
            Clear
          </Button>
        </Stack>
      </div>
    </>
  );
};

// Themed wrapper that supplies the GrafanaTheme2 via the `useTheme2()` hook and
// forwards it through `props.theme`. This preserves the public API of the original
// `withTheme2(UnthemedLokiLabelBrowser)` HOC composition: callers of `LokiLabelBrowser`
// continue to pass props that do NOT include `theme`, and `BrowserProps` retains its
// `theme: GrafanaTheme2` field (required by tests that pass `theme: createTheme()`
// directly to `UnthemedLokiLabelBrowser`).
export const LokiLabelBrowser = (props: Omit<BrowserProps, 'theme'>) => {
  const theme = useTheme2();
  return <UnthemedLokiLabelBrowser {...props} theme={theme} />;
};
