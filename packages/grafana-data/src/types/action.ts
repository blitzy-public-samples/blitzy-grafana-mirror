import { type CSSProperties, type ReactNode } from 'react';

import { type SelectableValue } from './select';

export enum ActionType {
  Fetch = 'fetch',
  Infinity = 'infinity',
}

type ActionButtonCssProperties = Pick<CSSProperties, 'backgroundColor'>;

export interface Action {
  type: ActionType;
  title: string;
  [ActionType.Fetch]?: FetchOptions;
  [ActionType.Infinity]?: InfinityOptions;
  confirmation?: string;
  oneClick?: boolean;
  variables?: ActionVariable[];
  style?: ActionButtonCssProperties;
}

/**
 * Processed Action Model. The values are ready to use
 */
export interface ActionModel<T = unknown> {
  title: string;
  type?: ActionType;
  // When a click handler is invoked, this is passed the raw mouse|react event and the origin value (typically a Field or null).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rollback per AAP §0.9.2.11 trigger: (1) `event: unknown` broke contravariant assignment for handlers declared as `(evt: MouseEvent, ...) => void` in public/app/features/actions/utils.ts, (2) `origin?: T` introduced contravariant failures where `ActionModel<Field<any>>` is no longer assignable to `ActionModel<unknown>` and call sites that pass `null` for origin (e.g., `action.onClick(new MouseEvent('click'), null, actionVars)` in ActionButton.tsx and canvas/runtime/element.tsx) no longer typecheck. Generic parameter T preserved as `unknown` default for public API back-compat; callback retains `any` for heterogeneous DOM/React event types and nullable origin values.
  onClick: (event: any, origin?: any, actionVars?: ActionVariableInput) => void;
  confirmation: (actionVars?: ActionVariableInput) => ReactNode;
  oneClick?: boolean;
  style: ActionButtonCssProperties;
  variables?: ActionVariable[];
}

export type ActionVariable = {
  key: string;
  name: string;
  type: ActionVariableType;
};

export enum ActionVariableType {
  String = 'string',
}

export interface FetchOptions {
  method: HttpRequestMethod;
  url: string;
  body?: string;
  queryParams?: Array<[string, string]>;
  headers?: Array<[string, string]>;
}

export interface InfinityOptions extends FetchOptions {
  datasourceUid: string;
}

export enum HttpRequestMethod {
  POST = 'POST',
  PUT = 'PUT',
  GET = 'GET',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
}

export const httpMethodOptions: SelectableValue[] = [
  { label: HttpRequestMethod.POST, value: HttpRequestMethod.POST },
  { label: HttpRequestMethod.GET, value: HttpRequestMethod.GET },
];

export const contentTypeOptions: SelectableValue[] = [
  { label: 'application/json', value: 'application/json' },
  { label: 'text/plain', value: 'text/plain' },
  { label: 'application/xml', value: 'application/xml' },
  { label: 'application/x-www-form-urlencoded', value: 'application/x-www-form-urlencoded' },
];

export const defaultActionConfig: Action = {
  type: ActionType.Fetch,
  title: '',
  [ActionType.Fetch]: {
    url: '',
    method: HttpRequestMethod.POST,
    body: '{}',
    queryParams: [],
    headers: [['Content-Type', 'application/json']],
  },
};

export type ActionVariableInput = { [key: string]: string };
