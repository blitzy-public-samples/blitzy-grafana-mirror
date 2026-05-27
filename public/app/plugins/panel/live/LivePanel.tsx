import { css, cx } from '@emotion/css';
import { memo, useEffect, useRef, useState } from 'react';
import { type Unsubscribable, type PartialObserver } from 'rxjs';

import {
  type GrafanaTheme2,
  type PanelProps,
  type LiveChannelStatusEvent,
  isValidLiveChannelAddress,
  type LiveChannelEvent,
  isLiveChannelStatusEvent,
  isLiveChannelMessageEvent,
  LiveChannelConnectionState,
  type PanelData,
  LoadingState,
  applyFieldOverrides,
  type LiveChannelAddress,
  StreamingDataFrame,
} from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { config, getGrafanaLiveSrv } from '@grafana/runtime';
import { Alert, CustomScrollbar, JSONFormatter, useStyles2 } from '@grafana/ui';

import { TablePanel } from '../table/TablePanel';

import { LivePublish } from './LivePublish';
import { type LivePanelOptions, MessageDisplayMode, MessagePublishMode } from './types';

interface Props extends PanelProps<LivePanelOptions> {}

export const LivePanel = memo(function LivePanel(props: Props) {
  const styles = useStyles2(getStyles);
  // `isValid` is derived from a stable global lookup; computing it on every render is
  // equivalent to the original constructor-time computation because the Grafana Live
  // service availability does not change at runtime once the app boots.
  const isValid = !!getGrafanaLiveSrv();

  const [error, setError] = useState<unknown>(undefined);
  const [addr, setAddr] = useState<LiveChannelAddress | undefined>(undefined);
  const [status, setStatus] = useState<LiveChannelStatusEvent | undefined>(undefined);
  const [message, setMessage] = useState<unknown>(undefined);
  // The `changed` state is preserved verbatim from the original class state to maintain
  // exact behavior parity with the original PureComponent. It is bumped on every status
  // and message event (Date.now()) to guarantee a re-render even when the same event
  // reference is re-emitted. Never read in render — matches the original.
  const [, setChanged] = useState<number>(0);

  const subscriptionRef = useRef<Unsubscribable | undefined>(undefined);

  useEffect(() => {
    const propsChannel = props.options?.channel;

    const cleanup = () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = undefined;
      }
    };

    if (!isValidLiveChannelAddress(propsChannel)) {
      console.log('INVALID', propsChannel);
      cleanup();
      setAddr(undefined);
      return cleanup;
    }

    const live = getGrafanaLiveSrv();
    if (!live) {
      console.log('INVALID', propsChannel);
      cleanup();
      setAddr(undefined);
      return cleanup;
    }

    cleanup();

    console.log('LOAD', propsChannel);

    const streamObserver: PartialObserver<LiveChannelEvent> = {
      next: (event: LiveChannelEvent) => {
        if (isLiveChannelStatusEvent(event)) {
          setStatus(event);
          setChanged(Date.now());
        } else if (isLiveChannelMessageEvent(event)) {
          setMessage(event.message);
          setChanged(Date.now());
        } else {
          console.log('ignore', event);
        }
      },
    };

    // Subscribe to new events
    try {
      subscriptionRef.current = live.getStream(propsChannel).subscribe(streamObserver);
      setAddr(propsChannel);
      setError(undefined);
    } catch (err) {
      setAddr(undefined);
      setError(err);
    }

    return cleanup;
  }, [props.options?.channel]);

  const renderNotEnabled = () => {
    const preformatted = `[feature_toggles]
    enable = live`;
    return (
      <Alert title={t('live.live-panel.title-grafana-live', 'Grafana Live')} severity="info">
        <p>
          <Trans i18nKey="live.live-panel.grafana-requires-feature">Grafana live requires a feature flag to run</Trans>
        </p>

        {/* eslint-disable-next-line @grafana/i18n/no-untranslated-strings */}
        <b>custom.ini:</b>
        <pre>{preformatted}</pre>
      </Alert>
    );
  };

  const renderMessage = (height: number) => {
    const { options } = props;

    if (!message) {
      return (
        <div>
          <h4>
            <Trans i18nKey="live.live-panel.waiting-for-data">Waiting for data:</Trans>
          </h4>
          {options.channel?.scope}/{options.channel?.stream}/{options.channel?.path}
        </div>
      );
    }

    if (options.display === MessageDisplayMode.JSON) {
      return <JSONFormatter json={message} open={5} />;
    }

    if (options.display === MessageDisplayMode.Auto) {
      if (message instanceof StreamingDataFrame) {
        const data: PanelData = {
          series: applyFieldOverrides({
            data: [message],
            theme: config.theme2,
            replaceVariables: (v: string) => v,
            fieldConfig: {
              defaults: {},
              overrides: [],
            },
          }),
          state: LoadingState.Streaming,
        } as PanelData;
        const tableProps: PanelProps = {
          ...props,
          options: { frameIndex: 0, showHeader: true },
        };
        return <TablePanel {...tableProps} data={data} height={height} />;
      }
    }

    return <pre>{JSON.stringify(message)}</pre>;
  };

  const renderPublish = (height: number) => {
    const { options } = props;
    return (
      <LivePublish
        height={height}
        body={options.message}
        mode={options.publish ?? MessagePublishMode.JSON}
        onSave={(message) => props.onOptionsChange({ ...options, message })}
        addr={addr}
      />
    );
  };

  const renderStatus = () => {
    if (status?.state === LiveChannelConnectionState.Connected) {
      return; // nothing
    }

    let statusClass = '';
    if (status) {
      statusClass = styles.status[status.state];
    }
    return <div className={cx(statusClass, styles.statusWrap)}>{status?.state}</div>;
  };

  const renderBody = () => {
    const { options, height } = props;
    const publish = options.publish === MessagePublishMode.JSON || options.publish === MessagePublishMode.Influx;

    if (publish) {
      if (options.display === MessageDisplayMode.None) {
        return renderPublish(height);
      }

      // Both message and publish
      const halfHeight = height / 2;
      return (
        <div>
          <div className={css({ height: halfHeight, overflow: 'hidden' })}>
            <CustomScrollbar autoHeightMin="100%" autoHeightMax="100%">
              {renderMessage(halfHeight)}
            </CustomScrollbar>
          </div>
          <div>{renderPublish(halfHeight)}</div>
        </div>
      );
    }
    if (options.display === MessageDisplayMode.None) {
      return <pre>{JSON.stringify(status)}</pre>;
    }

    // Only message
    return (
      <div className={css({ overflow: 'hidden', height })}>
        <CustomScrollbar autoHeightMin="100%" autoHeightMax="100%">
          {renderMessage(height)}
        </CustomScrollbar>
      </div>
    );
  };

  if (!isValid) {
    return renderNotEnabled();
  }
  if (!addr) {
    return (
      <Alert title={t('live.live-panel.title-grafana-live', 'Grafana Live')} severity="info">
        <Trans i18nKey="live.live-panel.panel-editor-channel">Use the panel editor to pick a channel</Trans>
      </Alert>
    );
  }
  if (error) {
    return (
      <div>
        <h2>
          <Trans i18nKey="live.live-panel.error">Error</Trans>
        </h2>
        <div>{JSON.stringify(error)}</div>
      </div>
    );
  }
  return (
    <>
      {renderStatus()}
      {renderBody()}
    </>
  );
});

const getStyles = (theme: GrafanaTheme2) => ({
  statusWrap: css({
    margin: 'auto',
    position: 'absolute',
    top: 0,
    right: 0,
    background: theme.components.panel.background,
    padding: '10px',
    zIndex: theme.zIndex.modal,
  }),
  status: {
    [LiveChannelConnectionState.Pending]: css({
      border: `1px solid ${theme.v1.palette.orange}`,
    }),
    [LiveChannelConnectionState.Connected]: css({
      border: `1px solid ${theme.colors.success.main}`,
    }),
    [LiveChannelConnectionState.Connecting]: css({
      border: `1px solid ${theme.v1.palette.brandWarning}`,
    }),
    [LiveChannelConnectionState.Disconnected]: css({
      border: `1px solid ${theme.colors.warning.main}`,
    }),
    [LiveChannelConnectionState.Shutdown]: css({
      border: `1px solid ${theme.colors.error.main}`,
    }),
    [LiveChannelConnectionState.Invalid]: css({
      border: '1px solid red',
    }),
  },
});
