/**
 * Describes a empty value matcher option.
 * @public
 */
export interface ValueMatcherOptions {}

/**
 * Describes a basic value matcher option that has a single value.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `T = any` preserved for back-compat per AAP §0.8.7 (public API preservation): BasicValueMatcherOptions is re-exported via @grafana/data (packages/grafana-data/src/index.ts) and consumed at out-of-scope call sites in public/app/features/transformers/FilterByValueTransformer/ValueMatchers/{Basic,Regex}MatcherEditor.tsx where React.FC<ValueMatcherUIProps<BasicValueMatcherOptions>> uses the bare form; narrowing the default to `unknown` causes FC variance errors at those call sites
export interface BasicValueMatcherOptions<T = any> extends ValueMatcherOptions {
  value: T;
}

/**
 * Describes a range value matcher option that has a to and a from value to
 * be able to match a range.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `T = any` preserved for back-compat per AAP §0.8.7 (public API preservation): RangeValueMatcherOptions is re-exported via @grafana/data and consumed at out-of-scope call sites in public/app/features/transformers/FilterByValueTransformer/ValueMatchers/RangeMatcherEditor.tsx where Array<ValueMatcherUIRegistryItem<RangeValueMatcherOptions>> uses the bare form; narrowing the default to `unknown` causes FC variance errors
export interface RangeValueMatcherOptions<T = any> extends ValueMatcherOptions {
  from: T;
  to: T;
}
