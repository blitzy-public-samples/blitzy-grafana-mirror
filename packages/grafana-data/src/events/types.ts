import { type Unsubscribable, type Observable } from 'rxjs';

/**
 * @alpha
 * internal interface
 *
 * @typeParam TPayload - The optional payload type carried by an event. Defaults
 * to `any` to preserve backward compatibility for bare `BusEvent` references
 * that read `event.payload.*` directly without type narrowing (e.g. the legacy
 * emitter bridge in `./EventBus.ts` and the panel-debug consumer
 * `public/app/plugins/panel/debug/CursorView.tsx`). New code SHOULD always
 * supply a concrete `TPayload` (or use a `BusEventWithPayload<T>` subclass)
 * for stronger typing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Default `any` retained for backward compatibility with same-package and downstream consumers that read `bareBusEvent.payload.*` directly. The legacy emitter bridge in `./EventBus.ts` (`on<T>` line ~71) calls `handler(emittedEvent.payload)` where `handler: LegacyEventHandler<T>` requires the payload to be assignable to a generic `T`; switching to `unknown` would break that bridge. External out-of-scope consumers (e.g. `public/app/plugins/panel/debug/CursorView.tsx`, `public/app/plugins/panel/debug/EventBusLogger.tsx`) also read payload properties directly from bare `BusEvent` / `BusEventBase` references. Use an explicit `BusEvent<TPayload>` for new code.
export interface BusEvent<TPayload = any> {
  readonly type: string;
  readonly payload?: TPayload;
  origin?: EventBus;
}

/**
 * @alpha
 * Base event type
 */
export abstract class BusEventBase implements BusEvent {
  readonly type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `BusEventBase.payload` is read directly as a typed value by external out-of-scope consumers (e.g. `public/app/plugins/panel/debug/CursorView.tsx` destructures and reads `payload.point`, `payload.data`, `payload.rowIndex`, `payload.columnIndex` from a `BusEventBase`-typed state field). Switching to `unknown` would force out-of-scope type-assertion edits in those consumers. Concrete subclasses (`BusEventWithPayload<T>`) override this with a strongly-typed `payload: T`.
  readonly payload?: any;
  readonly origin?: EventBus;

  /** @internal */
  tags?: Set<string>;

  constructor() {
    //@ts-ignore
    this.type = this.__proto__.constructor.type;
  }

  /**
   * @internal
   * Tag event for finer-grained filtering in subscribers
   */
  setTags(tags: string[]) {
    this.tags = new Set(tags);
    return this;
  }
}

/**
 * @alpha
 * Base event type with payload
 */
export abstract class BusEventWithPayload<T> extends BusEventBase {
  readonly payload: T;

  constructor(payload: T) {
    super();
    this.payload = payload;
  }
}

/*
 * Interface for an event type constructor
 */
export interface BusEventType<T extends BusEvent> {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeScript construct-signature variance requires `any[]` to allow concrete event subclasses with typed constructor parameters (e.g. `new (payload: P)` for `BusEventWithPayload<P>`-derived classes) to satisfy this interface. Replacing with `unknown[]` or `never[]` would make the construct signature incompatible with all current event-class hierarchies because tuple/rest-array variance is strict for non-`any` types: `unknown[]` is not assignable to `[P]`, and `never[]` (the canonical "any constructor" idiom in some libraries) also fails for constructors that take required parameters.
  new (...args: any[]): T;
}

/**
 * @alpha
 * Event callback/handler type
 */
export interface BusEventHandler<T extends BusEvent> {
  (event: T): void;
}

/**
 * @alpha
 * Main minimal interface
 */
export interface EventFilterOptions {
  onlyLocal: boolean;
}

/**
 * @alpha
 * Main minimal interface
 */
export interface EventBus {
  /**
   * Publish single event
   */
  publish<T extends BusEvent>(event: T): void;

  /**
   * Get observable of events
   */
  getStream<T extends BusEvent>(eventType: BusEventType<T>): Observable<T>;

  /**
   * Subscribe to an event stream
   *
   * This function is a wrapper around the `getStream(...)` function
   */
  subscribe<T extends BusEvent>(eventType: BusEventType<T>, handler: BusEventHandler<T>): Unsubscribable;

  /**
   * Remove all event subscriptions
   */
  removeAllListeners(): void;

  /**
   * Returns a new bus scoped that knows where it exists in a heiarchy
   *
   * @internal -- This is included for internal use only should not be used directly
   */
  newScopedBus(key: string, filter: EventFilterOptions): EventBus;
}

/**
 * @public
 * @deprecated event type
 */
export interface AppEvent<T> {
  readonly name: string;
  payload?: T;
}

/** @public */
export interface LegacyEmitter {
  /**
   * @deprecated use $emit
   */
  emit<T>(event: AppEvent<T> | string, payload?: T): void;

  /**
   * @deprecated use $on
   */
  on<T>(event: AppEvent<T> | string, handler: LegacyEventHandler<T>): void;

  /**
   * @deprecated use $on
   */
  off<T>(event: AppEvent<T> | string, handler: LegacyEventHandler<T>): void;
}

/** @public */
export interface LegacyEventHandler<T> {
  (payload?: T): void;
  wrapper?: (event: BusEvent) => void;
}

/** @alpha */
export interface EventBusExtended extends EventBus, LegacyEmitter {}
