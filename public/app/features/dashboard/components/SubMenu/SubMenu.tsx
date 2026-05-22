import { css } from '@emotion/css';
import { memo, useCallback } from 'react';

import { type AnnotationQuery, type DataQuery, type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { type DashboardLink } from '@grafana/schema';
import { Form, useForceUpdate, useStyles2 } from '@grafana/ui';
import { useSelector } from 'app/types/store';

import { getSubMenuVariables, getVariablesState } from '../../../variables/state/selectors';
import { type DashboardModel } from '../../state/DashboardModel';

import { Annotations } from './Annotations';
import { DashboardLinks } from './DashboardLinks';
import { SubMenuItems } from './SubMenuItems';

interface Props {
  dashboard: DashboardModel;
  links: DashboardLink[];
  annotations: AnnotationQuery[];
}

const SubMenuInternal = ({ dashboard, links, annotations }: Props) => {
  // useSelector replaces connect(mapStateToProps) — pull the per-dashboard
  // template-variable list from the variables slice using the dashboard UID as
  // the key. `dashboard.uid` flows through toStateKey() inside the variable
  // selectors which correctly handles null/undefined sentinel mapping.
  const variables = useSelector((state) => {
    const { uid } = dashboard;
    const templatingState = getVariablesState(uid, state);
    return getSubMenuVariables(uid, templatingState.variables);
  });

  // The class's render-side mutation + this.forceUpdate() pattern relied on
  // class-instance re-render semantics. The functional equivalent is the
  // useForceUpdate hook (a shared utility in app/core/hooks) which returns
  // a stable callback that triggers a re-render. We preserve the direct
  // mutation of dashboard.annotations.list because annotations are not yet
  // in Redux (per the original code's comment).
  const forceUpdate = useForceUpdate();

  const onAnnotationStateChanged = useCallback(
    (updatedAnnotation: AnnotationQuery<DataQuery>) => {
      // we're mutating dashboard state directly here until annotations are in Redux.
      for (let index = 0; index < dashboard.annotations.list.length; index++) {
        const annotation = dashboard.annotations.list[index];
        if (annotation.name === updatedAnnotation.name) {
          annotation.enable = !annotation.enable;
          break;
        }
      }
      dashboard.startRefresh();
      forceUpdate();
    },
    [dashboard, forceUpdate]
  );

  const styles = useStyles2(getStyles);
  const readOnlyVariables = dashboard.meta.isSnapshot ?? false;

  return (
    <div className={styles.submenu}>
      {/*
       * The original class wrapped the variable picker in a raw <form> with a
       * no-op onSubmit handler to: (a) provide an accessible group with
       * aria-label for screen readers, and (b) ensure that pressing Enter in
       * any variable picker did not bubble up and submit a containing form
       * (e.g., the dashboard settings form). We migrate to the @grafana/ui
       * Form composition: react-hook-form's internal handleSubmit always
       * invokes event.preventDefault() before calling onSubmit, which
       * preserves the "block submit-on-Enter" behavior. The no-op onSubmit
       * matches the original's lack of submit action.
       */}
      <Form<EmptyFormValues>
        onSubmit={noopOnSubmit}
        aria-label={t('dashboard.sub-menu-un-connected.aria-label-template-variables', 'Template variables')}
        className={styles.formStyles}
        maxWidth="none"
      >
        {() => <SubMenuItems variables={variables} readOnly={readOnlyVariables} />}
      </Form>
      <Annotations
        annotations={annotations}
        onAnnotationChanged={onAnnotationStateChanged}
        events={dashboard.events}
      />
      <div className={styles.spacer} />
      {dashboard && <DashboardLinks dashboard={dashboard} links={links} />}
    </div>
  );
};

// SubMenu's Form is a semantic wrapper for the variable picker — it has no
// form fields, so its data shape is the empty object. Declared as a named
// type here (rather than an inline `{}`) to satisfy
// `@typescript-eslint/ban-types` style guidance and keep the Form generic
// argument self-documenting.
type EmptyFormValues = Record<string, never>;

// Module-scope no-op handler so its identity is stable across renders; passing
// a fresh inline arrow each render would not trigger re-renders, but module
// scope makes the intent (no-action submit handler) explicit.
const noopOnSubmit = () => {};

const getStyles = (theme: GrafanaTheme2) => ({
  formStyles: css({
    display: 'contents',
    flexWrap: 'wrap',
  }),
  submenu: css({
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    alignItems: 'flex-start',
    gap: `${theme.spacing(1)} ${theme.spacing(2)}`,
    padding: `0 0 ${theme.spacing(1)} 0`,
  }),
  spacer: css({
    flexGrow: 1,
  }),
});

// Preserve the original PureComponent shallow-skip optimization with React.memo
// (default shallowEqual). SubMenu is re-rendered each time the parent
// DashboardPage updates, so referential-equality skip is important to avoid
// re-rendering the variable picker on every dashboard render.
export const SubMenu = memo(SubMenuInternal);

SubMenu.displayName = 'SubMenu';
