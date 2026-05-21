import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { Spinner, Stack } from '@grafana/ui';
import { Page } from 'app/core/components/Page/Page';
import { type Resource } from 'app/features/apiserver/types';
import { getDashboardAPI } from 'app/features/dashboard/api/dashboard_api';
import {
  type DecoratedRevisionModel,
  type RevisionModel,
  VERSIONS_FETCH_LIMIT,
} from 'app/features/dashboard/types/revisionModels';
import { VersionsHistoryButtons } from 'app/features/dashboard-scene/settings/version-history/VersionHistoryButtons';
import { VersionHistoryHeader } from 'app/features/dashboard-scene/settings/version-history/VersionHistoryHeader';

import { VersionHistoryComparison } from '../VersionHistory/VersionHistoryComparison';
import { VersionHistoryTable } from '../VersionHistory/VersionHistoryTable';

import { type SettingsPageProps } from './types';

interface Props extends SettingsPageProps {}

const transformToRevisionModels = (items: Array<Resource<unknown>>): RevisionModel[] => {
  return items.map(
    (item): RevisionModel => ({
      id: item.metadata.generation ?? 0,
      checked: false,
      uid: item.metadata.name,
      version: item.metadata.generation ?? 0,
      created: item.metadata.creationTimestamp ?? new Date().toISOString(),
      createdBy: item.metadata.annotations?.['grafana.app/updatedBy'] ?? '',
      message: item.metadata.annotations?.['grafana.app/message'] ?? '',
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      data: item.spec as object,
    })
  );
};

export const VersionsSettings = memo(function VersionsSettings({ dashboard, sectionNav }: Props) {
  const [versions, setVersions] = useState<DecoratedRevisionModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAppending, setIsAppending] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'compare'>('list');
  const [diffData, setDiffData] = useState<{ lhs: object; rhs: object }>({ lhs: {}, rhs: {} });
  const [newInfo, setNewInfo] = useState<DecoratedRevisionModel | undefined>(undefined);
  const [baseInfo, setBaseInfo] = useState<DecoratedRevisionModel | undefined>(undefined);
  const [isNewLatest, setIsNewLatest] = useState(false);

  // Per AAP Rule T1: instance variable that is not state → useRef.
  // The original `this.continueToken: string` was a mutable instance variable used to
  // chain pagination requests; useRef preserves the same "stable mutable handle" semantics.
  const continueTokenRef = useRef('');

  // Stable decorator helper, referenced by getVersions.
  const decorateVersions = useCallback(
    (vs: RevisionModel[]) =>
      vs.map((version) => ({
        ...version,
        createdDateString: dashboard.formatDate(version.created),
        ageString: dashboard.getRelativeTime(version.created),
        checked: false,
      })),
    [dashboard]
  );

  // The fetch callback — used by both componentDidMount-equivalent and the
  // "Show more versions" button via VersionsHistoryButtons.getVersions.
  const getVersions = useCallback(
    (append = false) => {
      setIsAppending(append);

      const options = append
        ? { limit: VERSIONS_FETCH_LIMIT, continueToken: continueTokenRef.current }
        : { limit: VERSIONS_FETCH_LIMIT };

      getDashboardAPI()
        .then(async (api) => {
          // `DashboardModel.uid` is `string | null`; coerce to empty-string for the API call.
          const result = await api.listDashboardHistory(dashboard.uid ?? '', options);
          const fetched = transformToRevisionModels(result.items);
          setIsLoading(false);
          setVersions((prev) => [...(prev ?? []), ...decorateVersions(fetched)]);
          // Update the continueToken for the next request, if available
          continueTokenRef.current = result.metadata.continue ?? '';
        })
        .catch((err) => console.log(err))
        .finally(() => setIsAppending(false));
    },
    [dashboard, decorateVersions]
  );

  // componentDidMount equivalent (AAP Rule T1: componentDidMount → useEffect(fn, [])).
  // Empty deps preserve the original lifecycle — fetch happens exactly once on mount and
  // never re-runs when props change. The original class did not refetch on prop changes.
  useEffect(() => {
    getVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLastPage = () => {
    return (
      versions.find((rev) => rev.version === 1) ||
      versions.length % VERSIONS_FETCH_LIMIT !== 0 ||
      continueTokenRef.current === ''
    );
  };

  const onCheck = (ev: FormEvent<HTMLInputElement>, versionId: number) => {
    setVersions((prev) =>
      prev.map((version) =>
        version.id === versionId ? { ...version, checked: ev.currentTarget.checked } : version
      )
    );
  };

  const getDiff = () => {
    const selectedVersions = versions.filter((version) => version.checked);
    const [selectedNew, selectedBase] = selectedVersions;
    const selectedIsNewLatest = selectedNew.version === dashboard.version;

    // Use the already-loaded data from listDashboardHistory - no need for another API call
    setBaseInfo(selectedBase);
    setIsLoading(false);
    setIsNewLatest(selectedIsNewLatest);
    setNewInfo(selectedNew);
    setViewMode('compare');
    setDiffData({ lhs: selectedBase.data, rhs: selectedNew.data });
  };

  const reset = () => {
    continueTokenRef.current = '';
    setBaseInfo(undefined);
    setDiffData({ lhs: {}, rhs: {} });
    setIsNewLatest(false);
    setNewInfo(undefined);
    setVersions((prev) => prev.map((version) => ({ ...version, checked: false })));
    setViewMode('list');
  };

  const canCompare = versions.filter((version) => version.checked).length === 2;
  const showButtons = versions.length > 1;
  const hasMore = versions.length >= VERSIONS_FETCH_LIMIT;
  const pageNav = sectionNav.node.parentItem;

  if (viewMode === 'compare') {
    return (
      <Page navModel={sectionNav} pageNav={pageNav}>
        <VersionHistoryHeader
          onClick={reset}
          baseVersion={baseInfo?.version}
          newVersion={newInfo?.version}
          isNewLatest={isNewLatest}
        />
        {isLoading ? (
          <VersionsHistorySpinner msg="Fetching changes&hellip;" />
        ) : (
          <VersionHistoryComparison
            newInfo={newInfo!}
            baseInfo={baseInfo!}
            isNewLatest={isNewLatest}
            diffData={diffData}
          />
        )}
      </Page>
    );
  }

  return (
    <Page navModel={sectionNav} pageNav={pageNav}>
      {isLoading ? (
        <VersionsHistorySpinner msg="Fetching history list&hellip;" />
      ) : (
        <VersionHistoryTable versions={versions} onCheck={onCheck} canCompare={canCompare} />
      )}
      {isAppending && <VersionsHistorySpinner msg="Fetching more entries&hellip;" />}
      {showButtons && (
        <VersionsHistoryButtons
          hasMore={hasMore}
          canCompare={canCompare}
          getVersions={getVersions}
          getDiff={getDiff}
          isLastPage={!!isLastPage()}
        />
      )}
    </Page>
  );
});

export const VersionsHistorySpinner = ({ msg }: { msg: string }) => (
  <Stack>
    <Spinner />
    <em>{msg}</em>
  </Stack>
);
