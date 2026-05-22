import { clone, each, map } from 'lodash';

// Structural shape required for the `part` argument to `new QueryPart(...)`.
// The runtime path mutates `part.params`, so it must be optional unknown[].
interface QueryPartLike {
  type: string;
  params?: unknown[];
}

// Signature shared by every exported renderer (functionRenderer, suffixRenderer,
// identityRenderer, quotedIdentityRenderer) and by any consumer-supplied renderer
// passed via QueryPartDefOptions.renderer.
type QueryPartRenderer = (part: QueryPart, innerExpr: string) => string;

// Options accepted by `new QueryPartDef(...)`. All fields except `type` are
// optional because existing callers (e.g., alertDef.ts, influxdb/query_part.ts)
// omit several of them. Defaults applied in the constructor preserve runtime
// safety for fields the caller did not provide.
interface QueryPartDefOptions {
  type: string;
  // `params` accepts any iterable of param descriptors. The constructor copies
  // it verbatim into `QueryPartDef.params` (which is `any[]` for downstream
  // narrowing-safety reasons documented on that field).
  params?: unknown[];
  defaultParams?: unknown[];
  renderer?: QueryPartRenderer;
  category?: unknown;
  addStrategy?: unknown;
}

export class QueryPartDef {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see QueryPartDefOptions.params justification: the downstream out-of-scope influxdb consumer (partListUtils.tsx) accesses `def.params[i].options` inside a closure and assigns it to a `() => Promise<string[]>` slot, requiring the array element to be `any` so the closure's reference to `options` widens to `any`.
  params: any[];
  defaultParams: unknown[];
  renderer: QueryPartRenderer;
  category: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- The downstream out-of-scope influxdb consumer (influx_query_model.ts:141) invokes `partModel.def.addStrategy(selectParts, partModel, this)` directly without a null check or function-type annotation. Narrowing this field to `unknown` makes the call non-callable; narrowing to a function type fails contravariance against the InfluxQueryPartRegisterOptions.addStrategy signature (its 3rd param is the narrower InfluxQueryPartQuery, not `unknown`).
  addStrategy: any;

  constructor(options: QueryPartDefOptions) {
    this.type = options.type;
    // The `?? []` / `?? identityRenderer` defaults bridge the optional fields
    // of QueryPartDefOptions to the required-shape class fields. Behavior is
    // byte-identical for existing callers: alertDef.ts and influxdb's
    // register() always provide every field they rely on at .render() time, so
    // the defaults are never actually invoked at runtime.
    this.params = options.params ?? [];
    this.defaultParams = options.defaultParams ?? [];
    this.renderer = options.renderer ?? identityRenderer;
    this.category = options.category;
    this.addStrategy = options.addStrategy;
  }
}

export class QueryPart {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Downstream out-of-scope influxdb consumer (influx_query_model.ts lines 78-88) pushes `partModel.part` directly into the `InfluxQueryPart[]` array `this.target.groupBy`. Narrowing this field to `QueryPartLike` (with `params?: unknown[]`) breaks that assignment under strict mode because `unknown[]` is not assignable to `Array<string | number>`.
  part: any;
  def: QueryPartDef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Downstream out-of-scope influxdb consumers constrain this field: (a) aliasRenderer/fieldRenderer in influxdb/query_part.ts declare `{params: string[]}` as their parameter type; (b) influx_query_model.ts:50 returns `{type, params: part.params}` typed against InfluxQueryPart whose `params` is `Array<string | number>`. Narrowing this field to `unknown[]` fails contravariance against both sites.
  params: any[];
  text: string;

  constructor(part: QueryPartLike, def: QueryPartDef) {
    this.part = part;
    this.def = def;
    if (!this.def) {
      throw { message: 'Could not find query part ' + part.type };
    }

    part.params = part.params || clone(this.def.defaultParams);
    this.params = part.params;
    this.text = '';
    this.updateText();
  }

  render(innerExpr: string) {
    return this.def.renderer(this, innerExpr);
  }

  hasMultipleParamsInString(strValue: string, index: number) {
    if (strValue.indexOf(',') === -1) {
      return false;
    }

    return this.def.params[index + 1] && this.def.params[index + 1].optional;
  }

  updateParam(strValue: string, index: number) {
    // handle optional parameters
    // if string contains ',' and next param is optional, split and update both
    if (this.hasMultipleParamsInString(strValue, index)) {
      each(strValue.split(','), (partVal, idx) => {
        this.updateParam(partVal.trim(), idx);
      });
      return;
    }

    if (strValue === '' && this.def.params[index].optional) {
      this.params.splice(index, 1);
    } else {
      this.params[index] = strValue;
    }

    this.part.params = this.params;
    this.updateText();
  }

  updateText() {
    if (this.params.length === 0) {
      this.text = this.def.type + '()';
      return;
    }

    let text = this.def.type + '(';
    text += this.params.join(', ');
    text += ')';
    this.text = text;
  }
}

export function functionRenderer(part: QueryPart, innerExpr: string) {
  const str = part.def.type + '(';
  const parameters = map(part.params, (value, index) => {
    const paramType = part.def.params[index];
    if (paramType.type === 'time') {
      if (value === 'auto') {
        value = '$__interval';
      }
    }
    if (paramType.quote === 'single') {
      return "'" + value + "'";
    } else if (paramType.quote === 'double') {
      return '"' + value + '"';
    }

    return value;
  });

  if (innerExpr) {
    parameters.unshift(innerExpr);
  }
  return str + parameters.join(', ') + ')';
}

export function suffixRenderer(part: QueryPart, innerExpr: string) {
  return innerExpr + ' ' + part.params[0];
}

export function identityRenderer(part: QueryPart, innerExpr: string) {
  // String coercion via '' + value preserves the implicit stringification
  // that downstream concatenation already performs; required for the explicit
  // QueryPartRenderer return type of `string`.
  return '' + part.params[0];
}

export function quotedIdentityRenderer(part: QueryPart, innerExpr: string) {
  return '"' + part.params[0] + '"';
}
