import { useEffect, useReducer, useRef } from 'react';
import { type PartialObserver, type Unsubscribable } from 'rxjs';

import {
  type BusEvent,
  CircularVector,
  DataHoverEvent,
  DataHoverClearEvent,
  DataSelectEvent,
  type EventBus,
} from '@grafana/data';
import { CustomScrollbar } from '@grafana/ui';

interface Props {
  eventBus: EventBus;
}

interface BusEventEx {
  key: number;
  type: string;
  path: unknown;
  payload: unknown;
}
let counter = 100;

export function EventBusLoggerPanel({ eventBus }: Props) {
  // History buffer of recent bus events. useRef preserves identity across renders
  // (matches the class instance-field semantics) so the rolling capacity-40 buffer
  // accumulates entries identically to the original PureComponent implementation.
  const historyRef = useRef(new CircularVector<BusEventEx>({ capacity: 40, append: 'head' }));
  // Forced re-render mechanism. The class component called `this.setState({ counter })`
  // to trigger a re-render whenever a new event arrived. The functional equivalent uses
  // useReducer with an incrementing counter to produce the same re-render trigger with
  // a stable dispatch identity (no need to list `forceUpdate` in effect deps).
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const eventObserver: PartialObserver<BusEvent> = {
      next: (event: BusEvent) => {
        // `event.origin` is typed as `EventBus | undefined`. The `path` field is internal
        // to ScopedEventBus (a private class implementing EventBus, see
        // packages/grafana-data/src/events/EventBus.ts:110: `public path: string[]`).
        // Narrow with the `in` operator (no type assertions) — within the truthy branch
        // TypeScript widens origin to include `path` as `unknown`.
        const origin = event.origin;
        const path = origin && 'path' in origin ? origin.path : undefined;
        historyRef.current.add({
          key: counter++,
          type: event.type,
          path,
          payload: event.payload,
        });
        forceUpdate();
      },
    };

    const subs: Unsubscribable[] = [];
    subs.push(eventBus.getStream(DataHoverEvent).subscribe(eventObserver));
    subs.push(eventBus.getStream(DataHoverClearEvent).subscribe(eventObserver));
    subs.push(eventBus.getStream(DataSelectEvent).subscribe(eventObserver));

    return () => {
      for (const sub of subs) {
        sub.unsubscribe();
      }
    };
  }, [eventBus]);

  return (
    <CustomScrollbar autoHeightMin="100%" autoHeightMax="100%">
      {historyRef.current.map((v, idx) => {
        // Narrow the `unknown` payload at the read site using `typeof` + `in` operator
        // (no type assertions). Runtime payloads from DataHoverEvent/DataSelectEvent are
        // record-shaped (`DataHoverPayload`); for DataHoverClearEvent the payload is
        // undefined. JSON.stringify accepts the `unknown` field values returned by the
        // narrowed access (undefined renders as the literal string "undefined" in the
        // JSON.stringify return — identical to absent field rendering).
        const payload = v.payload;
        const x = payload && typeof payload === 'object' && 'x' in payload ? payload.x : undefined;
        const y = payload && typeof payload === 'object' && 'y' in payload ? payload.y : undefined;
        return (
          // eslint-disable-next-line @grafana/i18n/no-untranslated-strings
          <div key={v.key}>
            {JSON.stringify(v.path)} {v.type} / X:{JSON.stringify(x)} / Y:{JSON.stringify(y)}
          </div>
        );
      })}
    </CustomScrollbar>
  );
}
