import saveAs from 'file-saver';

import { dateTimeFormat, formattedValueToString, getValueFormat, type SelectableValue } from '@grafana/data';
import { t } from '@grafana/i18n';
import { sceneGraph, type SceneObject, type VizPanel } from '@grafana/scenes';
import { StateManagerBase } from 'app/core/services/StateManagerBase';

import { transformSaveModelToScene } from '../../serialization/transformSaveModelToScene';

import { type Randomize } from './randomizer';
import { getDebugDashboard, getGithubMarkdown } from './utils';

interface SupportSnapshotState {
  currentTab: SnapshotTab;
  showMessage: ShowMessage;
  options: Array<SelectableValue<ShowMessage>>;
  snapshotText: string;
  markdownText: string;
  snapshotSize?: string;
  randomize: Randomize;
  loading?: boolean;
  error?: {
    title: string;
    message: string;
  };
  panel: VizPanel;
  panelTitle: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Out-of-scope colocated test (SupportSnapshotService.test.ts) accesses state.snapshot.panels[0].targets[0] via deep property paths without null guards; strict typing breaks tsc per AAP §0.9.2.11.
  snapshot?: any;
  snapshotUpdate: number;
  scene?: SceneObject;
}

export enum SnapshotTab {
  Support,
  Data,
}

export enum ShowMessage {
  PanelSnapshot,
  GithubComment,
}

export class SupportSnapshotService extends StateManagerBase<SupportSnapshotState> {
  constructor(panel: VizPanel) {
    super({
      panel,
      panelTitle: sceneGraph.interpolate(panel, panel.state.title, {}, 'text'),
      currentTab: SnapshotTab.Support,
      showMessage: ShowMessage.GithubComment,
      snapshotText: '',
      markdownText: '',
      randomize: {},
      snapshotUpdate: 0,
      options: [
        {
          label: t('dashboard-scene.support-snapshot-service.label.git-hub-comment', 'GitHub comment'),
          description: 'Copy and paste this message into a GitHub issue or comment',
          value: ShowMessage.GithubComment,
        },
        {
          label: t('dashboard-scene.support-snapshot-service.label.panel-support-snapshot', 'Panel support snapshot'),
          description: t(
            'dashboard-scene.support-snapshot-service.description.dashboard-troubleshoot-visualization-issues',
            'Dashboard JSON used to help troubleshoot visualization issues'
          ),
          value: ShowMessage.PanelSnapshot,
        },
      ],
    });
  }

  async buildDebugDashboard() {
    const { panel, randomize, snapshotUpdate } = this.state;
    const snapshot = await getDebugDashboard(panel, randomize, sceneGraph.getTimeRange(panel).state.value);
    const snapshotText = JSON.stringify(snapshot, null, 2);
    const markdownText = getGithubMarkdown(panel, snapshotText);
    const snapshotSize = formattedValueToString(getValueFormat('bytes')(snapshotText?.length ?? 0));

    let scene: SceneObject | undefined = undefined;
    if (snapshot) {
      try {
        // The narrowed EmbeddedDashboard shape returned by getDebugDashboard does not declare
        // the `uid` and `title` fields that DashboardDataDTO requires. Both are inert for the
        // embedded debug dashboard: DashboardModel resolves an empty uid to `null` and the
        // title is overridden upstream. Spreading here satisfies the typed contract without
        // mutating the snapshot (which is JSON-serialized above for snapshotText).
        const dash = transformSaveModelToScene({
          dashboard: { ...snapshot, uid: '', title: snapshot.title ?? '' },
          meta: { isEmbedded: true },
        });
        scene = dash.state.body; // skip the wrappers
      } catch (ex) {
        console.log('Error creating scene:', ex);
      }
    }

    this.setState({ snapshot, snapshotText, markdownText, snapshotSize, snapshotUpdate: snapshotUpdate + 1, scene });
  }

  onCurrentTabChange = (value: SnapshotTab) => {
    this.setState({ currentTab: value });
  };

  onShowMessageChange = (value: SelectableValue<ShowMessage>) => {
    this.setState({ showMessage: value.value! });
  };

  onGetMarkdownForClipboard = () => {
    const { markdownText } = this.state;
    const maxLen = Math.pow(1024, 2) * 1.5; // 1.5MB

    if (markdownText.length > maxLen) {
      this.setState({
        error: {
          title: t(
            'dashboard-scene.support-snapshot-service.title.copy-to-clipboard-failed',
            'Copy to clipboard failed'
          ),
          message: 'Snapshot is too large, consider download and attaching a file instead',
        },
      });

      return '';
    }

    return markdownText;
  };

  onDownloadDashboard = () => {
    const { snapshotText, panelTitle } = this.state;
    const blob = new Blob([snapshotText], {
      type: 'text/plain',
    });
    const fileName = `debug-${panelTitle}-${dateTimeFormat(new Date())}.json.txt`;
    saveAs(blob, fileName);
  };

  onSetSnapshotText = (snapshotText: string) => {
    this.setState({ snapshotText });
  };

  onToggleRandomize = (k: keyof Randomize) => {
    const { randomize } = this.state;
    this.setState({ randomize: { ...randomize, [k]: !randomize[k] } });
  };
}
