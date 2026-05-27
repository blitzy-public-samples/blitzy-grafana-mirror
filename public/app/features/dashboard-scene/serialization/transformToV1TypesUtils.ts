import {
  type Action as ActionV1,
  type ActionVariable as ActionVariableV1,
  ActionType as ActionTypeV1,
  ActionVariableType as ActionVariableTypeV1,
  type FetchOptions as FetchOptionsV1,
  type FieldConfigSource as FieldConfigSourceV1,
  HttpRequestMethod as HttpRequestMethodV1,
  type InfinityOptions as InfinityOptionsV1,
  NullValueMode as NullValueModeV1,
  SpecialValueMatch as SpecialValueMatchV1,
  type ThresholdsConfig as ThresholdsConfigV1,
  type ValueMapping as ValueMappingV1,
} from '@grafana/data';
import {
  VariableHide as VariableHideV1,
  VariableRefresh as VariableRefreshV1,
  VariableSort as VariableSortV1,
  DashboardCursorSync as DashboardCursorSyncV1,
  MappingType as MappingTypeV1,
  ThresholdsMode as ThresholdsModeV1,
} from '@grafana/schema';
import {
  type Action,
  type ActionVariable,
  type DashboardCursorSync,
  type FetchOptions,
  type FieldConfigSource,
  type HttpRequestMethod,
  type InfinityOptions,
  type SpecialValueMatch,
  type ThresholdsMode,
  type VariableHide,
  type VariableRefresh,
  type VariableSort,
} from '@grafana/schema/apis/dashboard.grafana.app/v2';

export function transformVariableRefreshToEnumV1(refresh?: VariableRefresh): VariableRefreshV1 {
  switch (refresh) {
    case 'never':
      return VariableRefreshV1.never;
    case 'onDashboardLoad':
      return VariableRefreshV1.onDashboardLoad;
    case 'onTimeRangeChanged':
      return VariableRefreshV1.onTimeRangeChanged;
    default:
      return VariableRefreshV1.never;
  }
}

export function transformVariableHideToEnumV1(hide?: VariableHide): VariableHideV1 {
  switch (hide) {
    case 'dontHide':
      return VariableHideV1.dontHide;
    case 'hideLabel':
      return VariableHideV1.hideLabel;
    case 'hideVariable':
      return VariableHideV1.hideVariable;
    case 'inControlsMenu':
      return VariableHideV1.inControlsMenu;
    default:
      return VariableHideV1.dontHide;
  }
}

export function transformSortVariableToEnumV1(sort?: VariableSort): VariableSortV1 {
  switch (sort) {
    case 'disabled':
      return VariableSortV1.disabled;
    case 'numericalAsc':
      return VariableSortV1.numericalAsc;
    case 'alphabeticalCaseInsensitiveAsc':
      return VariableSortV1.alphabeticalCaseInsensitiveAsc;
    case 'alphabeticalCaseInsensitiveDesc':
      return VariableSortV1.alphabeticalCaseInsensitiveDesc;
    case 'numericalDesc':
      return VariableSortV1.numericalDesc;
    case 'naturalAsc':
      return VariableSortV1.naturalAsc;
    case 'naturalDesc':
      return VariableSortV1.naturalDesc;
    case 'alphabeticalAsc':
      return VariableSortV1.alphabeticalAsc;
    case 'alphabeticalDesc':
      return VariableSortV1.alphabeticalDesc;
    default:
      return VariableSortV1.disabled;
  }
}

export function transformCursorSyncV2ToV1(cursorSync: DashboardCursorSync): DashboardCursorSyncV1 {
  switch (cursorSync) {
    case 'Crosshair':
      return DashboardCursorSyncV1.Crosshair;
    case 'Tooltip':
      return DashboardCursorSyncV1.Tooltip;
    case 'Off':
      return DashboardCursorSyncV1.Off;
    default:
      return DashboardCursorSyncV1.Off;
  }
}

function transformSpecialValueMatchToV1(match: SpecialValueMatch): SpecialValueMatchV1 {
  switch (match) {
    case 'true':
      return SpecialValueMatchV1.True;
    case 'false':
      return SpecialValueMatchV1.False;
    case 'null':
      return SpecialValueMatchV1.Null;
    case 'nan':
      return SpecialValueMatchV1.NaN;
    case 'null+nan':
      return SpecialValueMatchV1.NullAndNaN;
    case 'empty':
      return SpecialValueMatchV1.Empty;
    default:
      throw new Error(`Unknown match type: ${match}`);
  }
}

// V2 `HttpRequestMethod` is a string literal union (`"GET" | "PUT" | "POST" | "DELETE" | "PATCH"`)
// while V1 `HttpRequestMethod` is the `HttpRequestMethodV1` enum whose string values match. Convert
// explicitly so the result satisfies V1 typing without requiring a type assertion.
function transformHttpRequestMethodToV1(method: HttpRequestMethod): HttpRequestMethodV1 {
  switch (method) {
    case 'POST':
      return HttpRequestMethodV1.POST;
    case 'PUT':
      return HttpRequestMethodV1.PUT;
    case 'GET':
      return HttpRequestMethodV1.GET;
    case 'DELETE':
      return HttpRequestMethodV1.DELETE;
    case 'PATCH':
      return HttpRequestMethodV1.PATCH;
    default:
      return HttpRequestMethodV1.GET;
  }
}

// V2 stores fetch/infinity query params and headers as `string[][]` (2D string arrays — the schema
// generator cannot emit a 2-tuple) while V1 declares them as `Array<[string, string]>` tuples. The
// runtime payload is the same key/value pair list; convert each sub-array to an explicitly-typed
// 2-tuple so the result satisfies V1's `FetchOptions`/`InfinityOptions` typing.
function transformKeyValuePairsToV1(pairs: string[][] | undefined): Array<[string, string]> | undefined {
  if (!pairs) {
    return undefined;
  }
  return pairs.map((pair): [string, string] => [pair[0], pair[1]]);
}

function transformFetchOptionsToV1(options: FetchOptions): FetchOptionsV1 {
  return {
    method: transformHttpRequestMethodToV1(options.method),
    url: options.url,
    body: options.body,
    queryParams: transformKeyValuePairsToV1(options.queryParams),
    headers: transformKeyValuePairsToV1(options.headers),
  };
}

function transformInfinityOptionsToV1(options: InfinityOptions): InfinityOptionsV1 {
  return {
    method: transformHttpRequestMethodToV1(options.method),
    url: options.url,
    body: options.body,
    queryParams: transformKeyValuePairsToV1(options.queryParams),
    headers: transformKeyValuePairsToV1(options.headers),
    datasourceUid: options.datasourceUid,
  };
}

// V2 `ActionVariable.type` is the literal `"string"` while V1 declares it via the
// `ActionVariableTypeV1` enum whose only member is `String = 'string'`. Map explicitly.
function transformActionVariableToV1(variable: ActionVariable): ActionVariableV1 {
  return {
    key: variable.key,
    name: variable.name,
    type: ActionVariableTypeV1.String,
  };
}

// V2 `Action.type` is the union `"fetch" | "infinity"` and V1 uses the `ActionTypeV1` enum whose
// values are the same strings (`Fetch = 'fetch'`, `Infinity = 'infinity'`). Build a V1 Action whose
// computed `[ActionTypeV1.Fetch]` / `[ActionTypeV1.Infinity]` payload keys (`'fetch'` / `'infinity'`)
// continue to map to the original V2 `fetch` / `infinity` properties, preserving runtime semantics.
function transformActionToV1(action: Action): ActionV1 {
  const result: ActionV1 = {
    type: action.type === 'fetch' ? ActionTypeV1.Fetch : ActionTypeV1.Infinity,
    title: action.title,
    confirmation: action.confirmation,
    oneClick: action.oneClick,
    variables: action.variables?.map(transformActionVariableToV1),
    style: action.style,
  };
  if (action.fetch) {
    result[ActionTypeV1.Fetch] = transformFetchOptionsToV1(action.fetch);
  }
  if (action.infinity) {
    result[ActionTypeV1.Infinity] = transformInfinityOptionsToV1(action.infinity);
  }
  return result;
}

export function transformMappingsToV1(fieldConfig: FieldConfigSource): FieldConfigSourceV1 {
  const getThresholdsMode = (mode: ThresholdsMode): ThresholdsModeV1 => {
    switch (mode) {
      case 'absolute':
        return ThresholdsModeV1.Absolute;
      case 'percentage':
        return ThresholdsModeV1.Percentage;
      default:
        return ThresholdsModeV1.Absolute;
    }
  };

  // V2 `NullValueMode` is a string literal union (`'null' | 'connected' | 'null as zero'`) while V1
  // `NullValueMode` is the `NullValueModeV1` enum whose string values match. Convert explicitly so the
  // result satisfies V1 typing without requiring a type assertion.
  const transformNullValueModeToV1 = (mode: FieldConfigSource['defaults']['nullValueMode']): NullValueModeV1 | undefined => {
    switch (mode) {
      case 'null':
        return NullValueModeV1.Null;
      case 'connected':
        return NullValueModeV1.Ignore;
      case 'null as zero':
        return NullValueModeV1.AsZero;
      default:
        return undefined;
    }
  };

  // Separate the V2 fields that are structurally incompatible with V1 (`mappings`, `thresholds`,
  // `nullValueMode`, `actions`) from the V1-compatible remainder so the spread/return below can be
  // fully type-checked against V1 without any `any` annotation or type assertion.
  // - V2 `ValueMapping.type` is a string literal union; V1 uses the `MappingTypeV1` numeric enum.
  // - V2 `Threshold.value` is `number | null`; V1 requires `number`.
  // - V2 `NullValueMode` is a string union; V1 is an enum (same underlying string values).
  // - V2 `Action.type` / `ActionVariable.type` / `HttpRequestMethod` are string-literal unions; V1
  //   uses enums (`ActionTypeV1`, `ActionVariableTypeV1`, `HttpRequestMethodV1`) and V2's
  //   `queryParams` / `headers` are `string[][]` while V1 expects `Array<[string, string]>`.
  // Note: V2 `links` (`{title, url, targetBlank?}`) is a structural subset of V1's `DataLink<T>` (all
  // additional V1 fields are optional), so it passes through unchanged via `v1CompatibleDefaults`.
  const {
    mappings: v2Mappings,
    thresholds: v2Thresholds,
    nullValueMode: v2NullValueMode,
    actions: v2Actions,
    ...v1CompatibleDefaults
  } = fieldConfig.defaults;

  // Convert V2 mappings -> V1 mappings by mapping each entry's string-tag `type` to the V1 numeric enum
  // value while preserving runtime payload semantics. The result is V1-typed `ValueMapping[]`.
  let mappings: ValueMappingV1[] | undefined;
  if (v2Mappings) {
    mappings = v2Mappings.map<ValueMappingV1>((mapping) => {
      switch (mapping.type) {
        case 'value':
          return {
            ...mapping,
            type: MappingTypeV1.ValueToText,
          };
        case 'range':
          return {
            ...mapping,
            type: MappingTypeV1.RangeToText,
          };
        case 'regex':
          return {
            ...mapping,
            type: MappingTypeV1.RegexToText,
          };
        case 'special':
          return {
            ...mapping,
            options: {
              ...mapping.options,
              match: transformSpecialValueMatchToV1(mapping.options.match),
            },
            type: MappingTypeV1.SpecialValue,
          };
        default:
          return mapping;
      }
    });
  }

  // Convert V2 thresholds -> V1 thresholds. The mode string literal becomes the V1 numeric enum, and any
  // `null` step value is coerced to `Number.NEGATIVE_INFINITY` because V1's `Threshold.value` is `number`
  // and V1 convention treats the first step's value as `-Infinity` (see
  // `packages/grafana-data/src/types/thresholds.ts` and `packages/grafana-data/src/field/scale.ts`).
  let thresholds: ThresholdsConfigV1 | undefined;
  if (v2Thresholds) {
    thresholds = {
      mode: getThresholdsMode(v2Thresholds.mode),
      steps: v2Thresholds.steps.map((step) => ({
        ...step,
        value: step.value ?? Number.NEGATIVE_INFINITY,
      })),
    };
  }

  // Convert V2 actions -> V1 actions. The runtime payload is preserved verbatim; only the
  // string-literal/tuple typing is bridged into V1's enum/tuple shape via `transformActionToV1`.
  const actions: ActionV1[] | undefined = v2Actions ? v2Actions.map(transformActionToV1) : undefined;

  return {
    ...fieldConfig,
    defaults: {
      ...v1CompatibleDefaults,
      mappings,
      thresholds,
      nullValueMode: transformNullValueModeToV1(v2NullValueMode),
      actions,
    },
  };
}
