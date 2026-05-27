import memoize from 'micro-memoize';

/**
 * @public
 * @deprecated use useStyles hook
 *  Creates memoized version of styles creator
 * @param stylesCreator function accepting dependencies based on which styles are created
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `stylesFactory` is a publicly-exported `@grafana/ui` SDK helper marked `@public` and consumed by plugin authors who pass arbitrary styles-creator functions. The generic constraint `extends (...newArgs: any[]) => ReturnType<ResultFn>` is the historical contract — it accepts ANY function signature including those with required parameters. Tightening to `(...newArgs: never[]) => ReturnType<ResultFn>` REJECTS functions that require any arguments (because `never[]` is the empty supertype of all parameter lists, but at the call-site level the constraint may reject otherwise-valid stylesCreator functions in stricter consumer codebases). Per AAP §0.9.1 ("Maintain all public API contracts") and §0.8.7 ("Public API Surface Preservation Analysis"), retain the historical `any[]` constraint with this inline justification.
export function stylesFactory<ResultFn extends (...newArgs: any[]) => ReturnType<ResultFn>>(stylesCreator: ResultFn) {
  return memoize(stylesCreator);
}
