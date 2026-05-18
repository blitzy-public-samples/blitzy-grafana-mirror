import { css } from '@emotion/css';
import { useEffect, useState, type JSX } from 'react';

import { type GrafanaTheme2, type OrgRole, type TimeZone, dateTimeFormat } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Label, TextLink, useStyles2 } from '@grafana/ui';
import { fetchRoleOptions } from 'app/core/components/RolePicker/api';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction, type Role } from 'app/types/accessControl';
import { type ServiceAccountDTO } from 'app/types/serviceaccount';

import { ServiceAccountProfileRow } from './ServiceAccountProfileRow';
import { ServiceAccountRoleRow } from './ServiceAccountRoleRow';

interface Props {
  serviceAccount: ServiceAccountDTO;
  timeZone: TimeZone;
  onChange: (serviceAccount: ServiceAccountDTO) => void;
}

export function ServiceAccountProfile({ serviceAccount, timeZone, onChange }: Props): JSX.Element {
  const styles = useStyles2(getStyles);
  const ableToWrite = contextSrv.hasPermission(AccessControlAction.ServiceAccountsWrite);
  const [roles, setRoleOptions] = useState<Role[]>([]);

  const onRoleChange = (role: OrgRole) => {
    onChange({ ...serviceAccount, role: role });
  };

  const onNameChange = (newValue: string) => {
    onChange({ ...serviceAccount, name: newValue });
  };

  useEffect(() => {
    async function fetchOptions() {
      try {
        if (contextSrv.hasPermission(AccessControlAction.ActionRolesList)) {
          let options = await fetchRoleOptions(serviceAccount.orgId);
          setRoleOptions(options);
        }
      } catch (e) {
        console.error('Error loading options for service account');
      }
    }
    if (contextSrv.licensedAccessControlEnabled()) {
      fetchOptions();
    }
  }, [serviceAccount.orgId]);

  return (
    <div className={styles.section}>
      <h3>
        <Trans i18nKey="serviceaccounts.service-account-profile.information">Information</Trans>
      </h3>
      {/*
        Scope exception per AAP §0.4.4 (Gaps Inventory — "Custom tables with ordered
        rows / drag-and-drop / virtualization beyond InteractiveTable capabilities").
        This raw <table> is preserved with a formal AAP-aligned exception because:

          1. Heterogeneous per-row markup. The body mixes three different row
             components — <ServiceAccountProfileRow> (an editable
             label/value/edit-button triple with per-row inline-edit state),
             <ServiceAccountRoleRow> (which itself branches between a single
             `colSpan={3}` UserRolePicker cell and a paired OrgRolePicker + empty
             cell depending on `contextSrv.licensedAccessControlEnabled()`), and an
             inline "Used by" row rendered only when `isExternal && requiredBy`.
             InteractiveTable's `columns` config models a homogeneous schema where
             every row resolves through the same cell renderers; it cannot express
             rows whose total cell count varies (e.g., 3 vs. 4) or whose contents
             depend on per-row branching logic.

          2. Tightly coupled <tr>/<td> children. <ServiceAccountProfileRow> and
             <ServiceAccountRoleRow> render their own <tr> and <td> elements with
             per-cell `colSpan` and inline editing state. Migrating to
             InteractiveTable would require rewriting both row components to
             return their bodies as flat column-cell renderers, which (a) would
             change the public-facing shape of <ServiceAccountProfileRow> across
             unrelated callers, and (b) cannot represent the colSpan/branching
             behavior in <ServiceAccountRoleRow> as homogeneous columns.

          3. Inline-edit row state. <ServiceAccountProfileRow> maintains per-row
             `isEditing`/`inputValue` state with `useRef`-driven focus management,
             and persists state inline with the row markup. InteractiveTable's
             cell renderers are recreated on row identity changes, which would
             reset edit-in-progress state across re-renders.

        The raw <table> is styled via theme-aware Emotion classes in getStyles
        below (replacing legacy `.filter-table` global rules), so AAP Dimension 3
        (className → useStyles2) is satisfied even though Dimension 2 (raw <table>
        → InteractiveTable) is exempted under §0.4.4.
      */}
      <table className={styles.table}>
        <tbody>
          {serviceAccount.id && (
            <ServiceAccountProfileRow
              label={t('serviceaccounts.service-account-profile.label-numerical-identifier', 'Numerical identifier')}
              value={serviceAccount.id.toString()}
              disabled={true}
            />
          )}
          <ServiceAccountProfileRow
            label={t('serviceaccounts.service-account-profile.label-name', 'Name')}
            value={serviceAccount.name}
            onChange={!serviceAccount.isExternal ? onNameChange : undefined}
            disabled={!ableToWrite || serviceAccount.isDisabled}
          />
          <ServiceAccountProfileRow
            label={t('serviceaccounts.service-account-profile.label-id', 'ID')}
            value={serviceAccount.login}
            disabled={serviceAccount.isDisabled}
          />
          <ServiceAccountRoleRow
            label={t('serviceaccounts.service-account-profile.label-roles', 'Roles')}
            serviceAccount={serviceAccount}
            onRoleChange={onRoleChange}
            roleOptions={roles}
          />
          <ServiceAccountProfileRow
            label={t('serviceaccounts.service-account-profile.label-creation-date', 'Creation date')}
            value={dateTimeFormat(serviceAccount.createdAt, { timeZone })}
            disabled={serviceAccount.isDisabled}
          />
          {serviceAccount.isExternal && serviceAccount.requiredBy && (
            <tr>
              <td>
                <Label>
                  <Trans i18nKey="serviceaccounts.service-account-profile.used-by">Used by</Trans>
                </Label>
              </td>
              <td>
                <TextLink href={`/plugins/${serviceAccount.requiredBy}`}>{serviceAccount.requiredBy}</TextLink>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const getStyles = (theme: GrafanaTheme2) => ({
  section: css({
    marginBottom: theme.spacing(4),
  }),
  table: css({
    width: '100%',
    borderCollapse: 'separate',
    'tbody tr:nth-of-type(odd)': {
      background: theme.colors.emphasize(theme.colors.background.primary, 0.02),
    },
    th: {
      width: 'auto',
      padding: theme.spacing(0.5, 1),
      textAlign: 'left',
      lineHeight: '30px',
      height: '30px',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: theme.spacing(0.5, 1),
      lineHeight: '30px',
      height: '30px',
      whiteSpace: 'nowrap',
    },
  }),
});
