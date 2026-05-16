import { css } from '@emotion/css';
import { memo, useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Subscription } from 'rxjs';

import {
  AnnotationChangeEvent,
  type AnnotationEvent,
  AppEvents,
  dateTime,
  dateMath,
  type GrafanaTheme2,
  locationUtil,
  type PanelProps,
} from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { getBackendSrv, locationService } from '@grafana/runtime';
import { Button, ScrollContainer, TagList, useStyles2 } from '@grafana/ui';
import { AbstractList } from '@grafana/ui/internal';
import { appEvents } from 'app/core/app_events';
import { getDashboardSrv } from 'app/features/dashboard/services/DashboardSrv';
import { type DashboardSearchHit } from 'app/features/search/types';

import { AnnotationListItem } from './AnnotationListItem';
import { type Options } from './panelcfg.gen';

interface UserInfo {
  id?: number;
  login?: string;
  email?: string;
}

export interface Props extends PanelProps<Options> {}

// Pure helper hoisted to module scope (was an instance method on the class component).
// Computes an absolute time offset (epoch ms) from a base `time` and a duration string like "10m".
function _timeOffset(time: number, offset: string, subtract = false): number {
  let incr = 5;
  let unit = 'm';
  const parts = /^(\d+)(\w)/.exec(offset);
  if (parts && parts.length === 3) {
    incr = parseInt(parts[1], 10);
    unit = parts[2];
  }

  // Local variable intentionally named `t` to preserve the original implementation verbatim.
  // It shadows the imported `t` translation function only within this function scope.
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const t = dateTime(time);
  if (subtract) {
    incr *= -1;
  }

  if (!dateMath.isDurationUnit(unit)) {
    return 0;
  }

  return t.add(incr, unit).valueOf();
}

export const AnnoListPanel = memo((props: Props): JSX.Element => {
  const { options, timeRange, renderCounter, eventBus } = props;
  const styles = useStyles2(getStyles);

  const [annotations, setAnnotations] = useState<AnnotationEvent[]>([]);
  const [timeInfo, setTimeInfo] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [queryUser, setQueryUser] = useState<UserInfo | undefined>(undefined);
  const [queryTags, setQueryTags] = useState<string[]>([]);
  // requestId is generated once on mount and remains stable across re-renders.
  // Format `anno-list-panel-${Math.random()}` matches the test regex `/^anno-list-panel-\d\.\d+/`.
  const [requestId] = useState(() => `anno-list-panel-${Math.random()}`);

  const tagListRef = useRef<HTMLUListElement>(null);
  // Holds the next tag element to receive focus after a removal — replaces the
  // class component's `setState({ queryTags }, () => nextTag?.focus())` callback pattern.
  const pendingFocusRef = useRef<HTMLElement | null>(null);

  // Live refs to the latest props/state values consumed by stable callbacks (doSearch,
  // event-bus subscription handlers). Without these refs, closures would capture stale values.
  const propsRef = useRef(props);
  propsRef.current = props;
  const queryUserRef = useRef(queryUser);
  queryUserRef.current = queryUser;
  const queryTagsRef = useRef(queryTags);
  queryTagsRef.current = queryTags;

  // doSearch is referentially stable (deps = [requestId], and requestId is stable for the
  // panel's lifetime). The subscription effect can safely capture it without restarting.
  const doSearch = useCallback(async () => {
    // http://docs.grafana.org/http_api/annotations/
    // https://github.com/grafana/grafana/blob/main/public/app/core/services/backend_srv.ts
    // https://github.com/grafana/grafana/blob/main/public/app/features/annotations/annotations_srv.ts
    const { options, timeRange, replaceVariables } = propsRef.current;
    const currentQueryUser = queryUserRef.current;
    const currentQueryTags = queryTagsRef.current;

    const params: {
      tags: typeof options.tags;
      limit: typeof options.limit;
      type: string;
    } & Record<string, unknown> = {
      tags: options.tags,
      limit: options.limit,
      type: 'annotation', // Skip the Annotations that are really alerts.  (Use the alerts panel!)
    };

    if (options.onlyFromThisDashboard) {
      params.dashboardUID = getDashboardSrv().getCurrent()?.uid;
    }

    let nextTimeInfo = '';
    if (options.onlyInTimeRange) {
      params.from = timeRange.from.valueOf();
      params.to = timeRange.to.valueOf();
    } else {
      nextTimeInfo = 'All Time';
    }

    if (currentQueryUser) {
      params.userId = currentQueryUser.id;
    }

    if (options.tags && options.tags.length) {
      params.tags = options.tags.map((tag) => replaceVariables(tag));
    }

    if (currentQueryTags.length) {
      params.tags = params.tags ? [...params.tags, ...currentQueryTags] : currentQueryTags;
    }

    const next = await getBackendSrv().get<AnnotationEvent[]>('/api/annotations', params, requestId);

    setAnnotations(next);
    setTimeInfo(nextTimeInfo);
    setLoaded(true);
  }, [requestId]);

  // Suppress unused-state lint: timeInfo is set above for parity with the class component's
  // State.timeInfo field; the field is retained verbatim per AAP §0.9.2.12 minimal-change.
  void timeInfo;

  // Effect: subscribe to AnnotationChangeEvent for this dashboard's panel.
  // Matches the original componentDidMount + componentWillUnmount lifecycle.
  //
  // We use an rxjs Subscription wrapper (mirroring the original `this.subs = new Subscription()`
  // pattern) so that even if a downstream observable's `.subscribe()` returns a falsy value
  // (some test fakes / EventBus mocks do this), `subs.add(undefined)` is a no-op rather than
  // a TypeError on cleanup. This preserves byte-equivalent behavior with the prior class form.
  useEffect(() => {
    const subs = new Subscription();
    subs.add(
      eventBus.getStream(AnnotationChangeEvent).subscribe({
        next: () => {
          doSearch();
        },
      })
    );
    return () => subs.unsubscribe();
  }, [eventBus, doSearch]);

  // componentDidMount + componentDidUpdate equivalent: re-run the search when any of the
  // observed dependencies change. The mount triggers an initial call.
  //
  // The original componentDidUpdate guard `(options.onlyInTimeRange && timeRange !== prevProps.timeRange)`
  // is preserved via the conditional `timeRangeDep`: when onlyInTimeRange is false the dep is `null`
  // (stable across renders, no re-fire on timeRange changes); when true, the dep is `timeRange`
  // (re-fires whenever the time range reference changes).
  const timeRangeDep = options.onlyInTimeRange ? timeRange : null;
  useEffect(() => {
    doSearch();
  }, [options, queryTags, queryUser, renderCounter, timeRangeDep, doSearch]);

  // Side-effect mirror of `setState({ queryTags }, () => nextTag?.focus())`.
  // After queryTags updates, transfer focus to the pending target if one was queued by onTagClick.
  useEffect(() => {
    if (pendingFocusRef.current) {
      pendingFocusRef.current.focus();
      pendingFocusRef.current = null;
    }
  }, [queryTags]);

  const onAnnoClick = useCallback(async (anno: AnnotationEvent) => {
    if (!anno.time) {
      return;
    }

    const { options } = propsRef.current;
    const dashboardSrv = getDashboardSrv();
    const current = dashboardSrv.getCurrent();

    const params = {
      from: _timeOffset(anno.time, options.navigateBefore, true),
      to: _timeOffset(anno.timeEnd ?? anno.time, options.navigateAfter, false),
      viewPanel: options.navigateToPanel && anno.panelId ? anno.panelId : undefined,
    };

    if (!anno.dashboardUID || current?.uid === anno.dashboardUID) {
      locationService.partial(params);
      return;
    }

    const result = await getBackendSrv().get<DashboardSearchHit[]>('/api/search', {
      dashboardUIDs: anno.dashboardUID,
    });
    if (result && result.length && result[0].uid === anno.dashboardUID) {
      const dash = result[0];
      const url = new URL(dash.url, window.location.origin);
      url.searchParams.set('from', String(params.from));
      url.searchParams.set('to', String(params.to));
      locationService.push(locationUtil.stripBaseFromUrl(url.toString()));
      return;
    }
    appEvents.emit(AppEvents.alertWarning, ['Unknown Dashboard: ' + anno.dashboardUID]);
  }, []);

  const onTagClick = useCallback((tag: string, remove?: boolean) => {
    const currentQueryTags = queryTagsRef.current;
    if (!remove && currentQueryTags.includes(tag)) {
      return;
    }

    const nextQueryTags = remove
      ? currentQueryTags.filter((item) => item !== tag)
      : [...currentQueryTags, tag];

    // Logic to ensure keyboard focus isn't lost when the currently focused tag is removed.
    let nextTag: HTMLElement | undefined = undefined;
    if (remove) {
      const focusedTag = document.activeElement;
      const dataTagId = focusedTag?.getAttribute('data-tag-id');
      if (tagListRef.current?.contains(focusedTag) && dataTagId) {
        const parsedTagId = Number.parseInt(dataTagId, 10);
        const possibleNextTag =
          tagListRef.current.querySelector(`[data-tag-id="${parsedTagId + 1}"]`) ??
          tagListRef.current.querySelector(`[data-tag-id="${parsedTagId - 1}"]`);
        if (possibleNextTag instanceof HTMLElement) {
          nextTag = possibleNextTag;
        }
      }
    }

    // Queue the focus transfer for the queryTags effect (replaces the class component's
    // `this.setState({ queryTags }, () => nextTag?.focus())` callback pattern).
    pendingFocusRef.current = nextTag ?? null;
    setQueryTags(nextQueryTags);
  }, []);

  const onUserClick = useCallback((anno: AnnotationEvent) => {
    setQueryUser({
      id: anno.userId,
      login: anno.login,
      email: anno.email,
    });
  }, []);

  const onClearUser = useCallback(() => {
    setQueryUser(undefined);
  }, []);

  const renderItem = useCallback(
    (anno: AnnotationEvent, _index: number): JSX.Element => {
      const { options } = propsRef.current;
      const dashboard = getDashboardSrv().getCurrent();
      if (!dashboard) {
        return <></>;
      }

      return (
        <AnnotationListItem
          annotation={anno}
          formatDate={dashboard.formatDate}
          onClick={onAnnoClick}
          onAvatarClick={onUserClick}
          onTagClick={onTagClick}
          options={options}
        />
      );
    },
    [onAnnoClick, onUserClick, onTagClick]
  );

  if (!loaded) {
    return (
      <div>
        <Trans i18nKey="annolist.anno-list-panel.loading">Loading...</Trans>
      </div>
    );
  }

  // Previously we showed inidication that it covered all time
  // { timeInfo && (
  //   <span className="panel-time-info">
  //     <Icon name="clock-nine" /> {timeInfo}
  //   </span>
  // )}

  const hasFilter = queryUser || queryTags.length > 0;
  return (
    <ScrollContainer minHeight="100%">
      {hasFilter && (
        <div className={styles.filter}>
          <b>
            <Trans i18nKey="annolist.anno-list-panel.filter">Filter:</Trans>
          </b>
          {queryUser && (
            <Button
              size="sm"
              variant="secondary"
              fill="text"
              onClick={onClearUser}
              aria-label={t(
                'annolist.anno-list-panel.aria-label-remove-filter',
                'Remove filter: {{filterToRemove}}',
                { filterToRemove: queryUser.email }
              )}
            >
              {queryUser.email}
            </Button>
          )}
          {queryTags.length > 0 && (
            <TagList
              icon="times"
              tags={queryTags}
              onClick={(tag) => onTagClick(tag, true)}
              getAriaLabel={(name) => `Remove ${name} tag`}
              className={styles.tagList}
              ref={tagListRef}
            />
          )}
        </div>
      )}

      {annotations.length < 1 && (
        <div className={styles.noneFound}>
          <Trans i18nKey="annolist.anno-list-panel.no-annotations-found">No annotations found</Trans>
        </div>
      )}

      <AbstractList items={annotations} renderItem={renderItem} getItemKey={(item) => `${item.id}`} />
    </ScrollContainer>
  );
});

AnnoListPanel.displayName = 'AnnoListPanel';

const getStyles = (theme: GrafanaTheme2) => ({
  noneFound: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 'calc(100% - 30px)',
  }),
  filter: css({
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.5),
  }),
  tagList: css({
    justifyContent: 'flex-start',
    'li > button': {
      paddingLeft: '3px',
    },
  }),
});
