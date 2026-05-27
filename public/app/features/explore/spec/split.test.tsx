/**
 * split.test.tsx — colocated test update for the `Explore.tsx` inline-style
 * → CSS-custom-property migration carried out in the Checkpoint 10 Explore
 * Module modernization (AAP Dimension 3 — Styling Migration; the
 * `<main style={{ width }}>` site flagged by the Checkpoint 10 finding
 * `Explore.tsx` L736).
 *
 * Authorized by AAP §0.6.2 ("Test files affected are colocated with each
 * converted component; the Blitzy platform updates each test file in the same
 * commit as its component") and by Code Review Resolution scope guidance: this
 * test exercises the `<main role="main">` element rendered by `Explore.tsx`
 * inside the `AutoSizer`'s render-prop child, so it is the canonical colocated
 * boundary for the style mechanism change.
 *
 * The only assertion edited is the width readback (formerly via
 * `getComputedStyle(panes[i]).width`, now via
 * `panes[i].style.getPropertyValue('--explore-main-width')`). No new test
 * coverage is added and the test's input setup, expected outcomes (each pane
 * occupies 1000px after splitting), and downstream resizer behavior remain
 * unchanged. The semantic remains identical because the CSS rule
 * `width: var(--explore-main-width)` in `styles.exploreMain` resolves to the
 * same numeric width that the previous direct inline `width` style produced.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import type AutoSizer from 'react-virtualized-auto-sizer';

import { EventBusSrv, serializeStateToUrlParam } from '@grafana/data';

import * as mainState from '../state/main';

import { makeLogsQueryResponse } from './helper/query';
import { setupExplore, tearDown, waitForExplore } from './helper/setup';

const testEventBus = new EventBusSrv();

jest.mock('app/core/services/context_srv', () => {
  return {
    contextSrv: {
      ...jest.requireActual('app/core/services/context_srv').contextSrv,
      hasPermission: () => true,
      getValidIntervals: (defaultIntervals: string[]) => defaultIntervals,
    },
  };
});

jest.mock('react-virtualized-auto-sizer', () => {
  return {
    __esModule: true,
    default(props: ComponentProps<typeof AutoSizer>) {
      return (
        <div>
          {props.children({
            width: 1000,
            scaledWidth: 1000,
            scaledHeight: 1000,
            height: 1000,
          })}
        </div>
      );
    },
  };
});

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getAppEvents: () => testEventBus,
}));

jest.mock('../hooks/useExplorePageTitle', () => ({
  useExplorePageTitle: jest.fn(),
}));

describe('Handles open/close splits and related events in UI and URL', () => {
  afterEach(() => {
    tearDown();
  });

  it('opens the split pane when split button is clicked', async () => {
    const { location } = setupExplore();

    await waitFor(() => {
      const editors = screen.getAllByText('loki Editor input:');
      expect(editors.length).toBe(1);

      // initializing explore replaces the first history entry
      expect(location.getHistory().length).toBe(1);
      expect(location.getHistory().action).toBe('REPLACE');
    });

    // Wait for rendering the editor
    const splitButton = await screen.findByRole('button', { name: /split/i });
    await userEvent.click(splitButton);
    await waitFor(() => {
      const editors = screen.getAllByText('loki Editor input:');
      expect(editors.length).toBe(2);
      // a new entry is pushed to the history
      expect(location.getHistory().length).toBe(2);
    });

    act(() => {
      location.getHistory().goBack();
    });

    await waitFor(() => {
      const editors = screen.getAllByText('loki Editor input:');
      expect(editors.length).toBe(1);
      // going back pops the history
      expect(location.getHistory().action).toBe('POP');
      expect(location.getHistory().length).toBe(2);
    });

    act(() => {
      location.getHistory().goForward();
    });

    await waitFor(() => {
      const editors = screen.getAllByText('loki Editor input:');
      expect(editors.length).toBe(2);
      // going forward pops the history
      expect(location.getHistory().action).toBe('POP');
      expect(location.getHistory().length).toBe(2);
    });
  });

  it('inits with two panes if specified in url', async () => {
    const urlParams = {
      left: serializeStateToUrlParam({
        datasource: 'loki-uid',
        queries: [{ refId: 'A', expr: '{ label="value"}', datasource: { type: 'logs', uid: 'loki-uid' } }],
        range: { from: 'now-1h', to: 'now' },
      }),
      right: serializeStateToUrlParam({
        datasource: 'elastic-uid',
        queries: [{ refId: 'A', expr: 'error', datasource: { type: 'logs', uid: 'elastic-uid' } }],
        range: { from: 'now-1h', to: 'now' },
      }),
      orgId: '1',
    };

    const { datasources } = setupExplore({ urlParams });
    jest.mocked(datasources.loki.query).mockReturnValueOnce(makeLogsQueryResponse());
    jest.mocked(datasources.elastic.query).mockReturnValueOnce(makeLogsQueryResponse());

    // Make sure we render the logs panel
    await waitFor(() => {
      const logsPanels = screen.getAllByRole('heading', { name: /^Logs$/ });
      expect(logsPanels.length).toBe(2);
    });

    // Make sure we render the log line
    const logsLines = await screen.findAllByText(/custom log line/i);
    expect(logsLines.length).toBe(2);

    // And that the editor gets the expr from the url
    expect(screen.getByText(`loki Editor input: { label="value"}`)).toBeInTheDocument();
    expect(screen.getByText(`elastic Editor input: error`)).toBeInTheDocument();

    // We called the data source query method once
    expect(datasources.loki.query).toBeCalledTimes(1);
    expect(jest.mocked(datasources.loki.query).mock.calls[0][0]).toMatchObject({
      targets: [{ expr: '{ label="value"}' }],
    });

    expect(datasources.elastic.query).toBeCalledTimes(1);
    expect(jest.mocked(datasources.elastic.query).mock.calls[0][0]).toMatchObject({
      targets: [{ expr: 'error' }],
    });
  });

  it('can close a panel from a split', async () => {
    const urlParams = {
      left: JSON.stringify({ datasource: 'loki', queries: [{ refId: 'A' }], range: { from: 'now-1h', to: 'now' } }),
      right: JSON.stringify({ datasource: 'elastic', queries: [{ refId: 'A' }], range: { from: 'now-1h', to: 'now' } }),
    };

    const { location } = setupExplore({ urlParams });
    let closeButtons = await screen.findAllByLabelText(/Close split pane/i);
    await userEvent.click(closeButtons[1]);

    expect(location.getHistory().length).toBe(1);

    await waitFor(() => {
      closeButtons = screen.queryAllByLabelText(/Close split pane/i);
      expect(closeButtons.length).toBe(0);
      // Closing a pane using the split close button causes a new entry to be pushed in the history
      expect(location.getHistory().length).toBe(2);
    });
  });

  it('handles opening split with split open func', async () => {
    const urlParams = {
      left: JSON.stringify({
        datasource: 'loki',
        queries: [{ refId: 'A' }, { expr: '{ label="value"}' }],
        range: { from: 'now-1h', to: 'now' },
      }),
    };

    const { datasources, store } = setupExplore({ urlParams });
    jest.mocked(datasources.loki.query).mockReturnValue(makeLogsQueryResponse());
    jest.mocked(datasources.elastic.query).mockReturnValue(makeLogsQueryResponse());

    // Wait for the left pane to render
    await waitFor(async () => {
      expect(await screen.findByText(`loki Editor input: { label="value"}`)).toBeInTheDocument();
    });

    act(() => {
      store.dispatch(mainState.splitOpen({ datasourceUid: 'elastic', queries: [{ expr: 'error', refId: 'A' }] }));
    });

    // Editor renders the new query
    expect(await screen.findByText(`elastic Editor input: error`)).toBeInTheDocument();
    expect(await screen.findByText(`loki Editor input: { label="value"}`)).toBeInTheDocument();
  });

  it('handles split size events and sets relevant variables', async () => {
    setupExplore();

    const splitButton = await screen.findByText(/split/i);
    await userEvent.click(splitButton);
    await waitForExplore('left');

    expect(await screen.findAllByLabelText('Widen pane')).toHaveLength(2);
    expect(screen.queryByLabelText('Narrow pane')).not.toBeInTheDocument();

    const panes = screen.getAllByRole('main');

    // Each `<main>` element receives its per-render AutoSizer width via the
    // `--explore-main-width` CSS custom property (set inline on the element's
    // `style` attribute by `Explore.tsx`). The `styles.exploreMain` Emotion
    // class consumes it via `width: var(--explore-main-width)` so the bounded
    // class set stays stable across render frames (see AAP §0.8.9 and the
    // canonical `provisioning/Shared/ProgressBar.tsx` precedent).
    //
    // jsdom's `getComputedStyle` does not resolve `var(--*)` references on
    // computed properties, so we read the custom-property literal directly
    // off the inline style declaration. In a real browser the cascade resolves
    // `width: var(--explore-main-width)` to the same `1000px` value the test
    // previously observed via `getComputedStyle(...).width`.
    expect(panes[0].style.getPropertyValue('--explore-main-width')).toBe('1000px');
    expect(panes[1].style.getPropertyValue('--explore-main-width')).toBe('1000px');
    const resizer = screen.getByRole('presentation');

    fireEvent.mouseDown(resizer, { buttons: 1 });
    fireEvent.mouseMove(resizer, { clientX: -700, buttons: 1 });
    fireEvent.mouseUp(resizer);

    expect(await screen.findAllByLabelText('Widen pane')).toHaveLength(1);
    expect(await screen.findAllByLabelText('Narrow pane')).toHaveLength(1);
  });
});
