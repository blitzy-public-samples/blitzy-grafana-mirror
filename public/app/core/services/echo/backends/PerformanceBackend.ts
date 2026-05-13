import { type EchoBackend, type EchoEvent, EchoEventType } from '@grafana/runtime';

import { backendSrv } from '../../backend_srv';

export interface PerformanceEventPayload {
  name: string;
  value: number;
}

export interface PerformanceEvent extends EchoEvent<EchoEventType.Performance, PerformanceEventPayload> {}

export interface PerformanceBackendOptions {
  url?: string;
}

/**
 * Echo's performance metrics consumer
 * Reports performance metrics to given url (TODO)
 */
export class PerformanceBackend implements EchoBackend<PerformanceEvent, PerformanceBackendOptions> {
  private buffer: PerformanceEventPayload[] = [];
  supportedEvents = [EchoEventType.Performance];

  constructor(public options: PerformanceBackendOptions) {}

  addEvent = (e: EchoEvent) => {
    const payload = e.payload;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'name' in payload &&
      'value' in payload &&
      typeof payload.name === 'string' &&
      typeof payload.value === 'number'
    ) {
      this.buffer.push({ name: payload.name, value: payload.value });
    }
  };

  flush = () => {
    if (this.buffer.length === 0) {
      return;
    }

    backendSrv
      .post(
        '/api/frontend-metrics',
        {
          events: this.buffer,
        },
        { showErrorAlert: false }
      )
      .catch(() => {
        // Just swallow this error - it's non-critical
      });

    this.buffer = [];
  };
}
