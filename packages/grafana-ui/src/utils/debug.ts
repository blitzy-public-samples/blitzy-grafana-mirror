import { type Logger } from './logger';

/**
 * Allows debug helpers attachement to the window object
 * @internal
 */
export function attachDebugger(key: string, thebugger?: unknown, logger?: Logger) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';
  let completeDebugger: Record<string, unknown> = isRecord(thebugger) ? { ...thebugger } : {};

  if (logger !== undefined) {
    completeDebugger = { ...completeDebugger, enable: () => logger.enable(), disable: () => logger.disable() };
  }

  // @ts-ignore
  let debugGlobal = (typeof window !== 'undefined' && window['_debug']) ?? {};
  debugGlobal[key] = completeDebugger;
  if (typeof window !== 'undefined') {
    // @ts-ignore
    window['_debug'] = debugGlobal;
  }
}
