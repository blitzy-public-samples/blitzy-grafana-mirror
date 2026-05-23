import { css } from '@emotion/css';
import { type FormEvent, memo, useCallback, useReducer } from 'react';

import { type AnnotationQuery, type DataQuery, type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { type DashboardLink } from '@grafana/schema';
import { useStyles2 } from '@grafana/ui';
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

export const SubMenu = memo(({ dashboard, links, annotations }: Props) => {
  const styles = useStyles2(getStyles);
  // useReducer replaces the legacy `this.forceUpdate()` call. The original
  // PureComponent (now React.memo below) skips re-renders unless props change
  // shallow-equally; when `onAnnotationStateChanged` mutates the dashboard's
  // annotations list in place (because annotations are not yet in Redux),
  // there is no prop change to trigger a re-render. Dispatching the reducer
  // (`forceUpdate()`) bumps an internal counter to force a re-render, matching
  // the original behavior exactly.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // useSelector replaces the legacy `connect(mapStateToProps)` HOC. The inner
  // selector body is byte-identical to the original mapStateToProps body:
  // read uid from dashboard, look up the templating state for that uid, and
  // derive the submenu variables list. Per ESLint no-restricted-imports rule
  // (eslint.config.js lines 71-74), useSelector is sourced from
  // 'app/types/store', NEVER from 'react-redux'.
  const variables = useSelector((state) => {
    const { uid } = dashboard;
    const templatingState = getVariablesState(uid, state);
    return getSubMenuVariables(uid, templatingState.variables);
  });

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
    [dashboard]
  );

  const disableSubmitOnEnter = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  }, []);

  const readOnlyVariables = dashboard.meta.isSnapshot ?? false;

  return (
    <div className={styles.submenu}>
      {/*
       * Design system gap: a raw <form> element is required here to suppress
       * native browser submit-on-Enter behavior across the dashboard's template
       * variable inputs (see `disableSubmitOnEnter`). The form has no submit
       * action — its only purpose is to intercept Enter keypresses globally for
       * all child variable controls via the native HTML form-submit contract.
       * `@grafana/ui`'s `<Form>` render-prop wraps react-hook-form and assumes a
       * controlled submission flow with a typed values object, which does not
       * model the "no-op submit interceptor" use case. Migrating would require
       * either restructuring each variable picker to be react-hook-form-aware
       * (out of scope) or wrapping each control with its own keydown handler
       * (a behavior-changing regression risk). The raw <form> is retained per
       * AAP §0.4.4 / §0.9.2.6 with this inline gap justification.
       */}
      <form
        aria-label={t('dashboard.sub-menu-un-connected.aria-label-template-variables', 'Template variables')}
        className={styles.formStyles}
        onSubmit={disableSubmitOnEnter}
      >
        <SubMenuItems variables={variables} readOnly={readOnlyVariables} />
      </form>
      <Annotations annotations={annotations} onAnnotationChanged={onAnnotationStateChanged} events={dashboard.events} />
      <div className={styles.spacer} />
      {dashboard && <DashboardLinks dashboard={dashboard} links={links} />}
    </div>
  );
});

SubMenu.displayName = 'SubMenu';

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
