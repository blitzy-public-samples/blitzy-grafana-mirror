import { useEffect, useState } from 'react';
import { Subscription } from 'rxjs';

import {
  type EventBus,
  LegacyGraphHoverEvent,
  LegacyGraphHoverClearEvent,
  DataHoverEvent,
  DataHoverClearEvent,
  type BusEventBase,
} from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { CustomScrollbar } from '@grafana/ui';
import { DataHoverView } from 'app/features/visualization/data-hover/DataHoverView';

interface Props {
  eventBus: EventBus;
}

export function CursorView({ eventBus }: Props) {
  const [event, setEvent] = useState<BusEventBase | undefined>(undefined);

  useEffect(() => {
    const subscription = new Subscription();

    subscription.add(
      eventBus.subscribe(DataHoverEvent, (e) => {
        setEvent(e);
      })
    );

    subscription.add(
      eventBus.subscribe(DataHoverClearEvent, (e) => {
        setEvent(e);
      })
    );

    subscription.add(
      eventBus.subscribe(LegacyGraphHoverEvent, (e) => {
        setEvent(e);
      })
    );

    subscription.add(
      eventBus.subscribe(LegacyGraphHoverClearEvent, (e) => {
        setEvent(e);
      })
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [eventBus]);

  if (!event) {
    return (
      <div>
        <Trans i18nKey="debug.cursor-view.no-events-yet">No events yet</Trans>
      </div>
    );
  }

  const { type, payload, origin } = event;
  // `origin` is typed as the public `EventBus` interface but at runtime is a
  // `ScopedEventBus` (see packages/grafana-data/src/events/EventBus.ts) which carries
  // a `path: string[]` field that is not part of the public interface. Narrow via the
  // `in` operator + `Array.isArray` instead of a type assertion so the access is type-safe.
  const originPath = origin !== undefined && 'path' in origin && Array.isArray(origin.path) ? origin.path : undefined;

  return (
    <CustomScrollbar autoHeightMin="100%" autoHeightMax="100%">
      {/* eslint-disable-next-line @grafana/i18n/no-untranslated-strings */}
      <h3>event.origin: {originPath}</h3>
      {/* eslint-disable-next-line @grafana/i18n/no-untranslated-strings */}
      <span>event.type: {type}</span>
      {Boolean(payload) && (
        <>
          <pre>{JSON.stringify(payload.point, null, '  ')}</pre>
          {payload.data && (
            <DataHoverView data={payload.data} rowIndex={payload.rowIndex} columnIndex={payload.columnIndex} />
          )}
        </>
      )}
    </CustomScrollbar>
  );
}
