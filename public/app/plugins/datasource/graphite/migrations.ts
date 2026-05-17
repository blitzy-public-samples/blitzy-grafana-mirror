type LegacyAnnotation = {
  target?: string;
  tags?: string;
};

// this becomes the target in the migrated annotations
const migrateLegacyAnnotation = (json: LegacyAnnotation) => {
  // return the target annotation
  if (typeof json.target === 'string' && json.target) {
    return {
      fromAnnotations: true,
      target: json.target,
      textEditor: true,
    };
  }

  // return the tags annotation
  return {
    queryType: 'tags',
    tags: (json.tags || '').split(' '),
    fromAnnotations: true,
  };
};

// Shape of the incoming annotation payload passed to `prepareAnnotation` by Grafana's
// annotation migration framework. The framework's `AnnotationSupport.prepareAnnotation`
// contract types this argument as an open-shape JSON object; locally we describe only
// the fields this migration touches (`target` and `tags`) and use a
// `[key: string]: unknown` index signature to retain the open-shape semantics of the
// upstream contract without resorting to an explicit `any` annotation.
//
// `target` is intentionally typed as `unknown` because legacy annotations stored a
// query string here, while new annotations store a structured object — the body
// narrows the value via `typeof` before treating it as a string.
type AnnotationJson = {
  target?: unknown;
  tags?: string;
  [key: string]: unknown;
};

// eslint-ignore-next-line
// The function is generic over `T extends AnnotationJson` so that whatever concrete
// annotation shape the caller passes in flows through to the return type. This
// preserves the upstream `AnnotationSupport<TQuery>['prepareAnnotation']` contract
// — which accepts an open-shape input and returns an `AnnotationQuery<TQuery>` —
// by letting TypeScript instantiate `T` to the caller's expected return type at the
// assignment site, making this function structurally assignable without introducing
// an explicit `any` annotation here.
export const prepareAnnotation = <T extends AnnotationJson>(json: T): T => {
  // annotation attributes are either 'tags' or 'target'(a graphite query string)
  // because the new annotations will also have a target attribute, {}
  // we need to handle the ambiguous 'target' when migrating legacy annotations
  // so, to migrate legacy annotations
  // we check that target is a string
  // or
  // there is a tags attribute with no target
  //
  // `migrateLegacyAnnotation` only reads `target` and `tags` from its input, so we
  // pass a `LegacyAnnotation`-shaped view derived from `json`. Building this view
  // via an object literal (rather than a type assertion) keeps us compliant with
  // the repo's `@typescript-eslint/consistent-type-assertions: 'never'` ESLint rule
  // and preserves the original behavior — `migrateLegacyAnnotation` produces the
  // same output for any input with the same `target`/`tags` field values.
  const legacyView: LegacyAnnotation = {
    target: typeof json.target === 'string' ? json.target : undefined,
    tags: json.tags,
  };
  const resultingTarget =
    json.target && typeof json.target !== 'string' ? json.target : migrateLegacyAnnotation(legacyView);

  // Mutate the underlying object via an `AnnotationJson`-typed alias (no runtime
  // copy — `mutableView` and `json` reference the same object). Because
  // `AnnotationJson.target` is typed as `unknown`, this assignment accepts the
  // union of possible `resultingTarget` values without a type assertion and
  // preserves the original `json.target = resultingTarget;` semantics.
  const mutableView: AnnotationJson = json;
  mutableView.target = resultingTarget;

  return json;
};
