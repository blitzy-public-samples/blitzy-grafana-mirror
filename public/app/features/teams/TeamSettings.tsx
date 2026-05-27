import { css } from '@emotion/css';
import { useForm } from 'react-hook-form';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { Button, Field, FieldSet, Input, Stack, useStyles2 } from '@grafana/ui';
import { TeamRolePicker } from 'app/core/components/RolePicker/TeamRolePicker';
import { useRoleOptions } from 'app/core/components/RolePicker/hooks';
import { SharedPreferences } from 'app/core/components/SharedPreferences/SharedPreferences';
import { contextSrv } from 'app/core/services/context_srv';
import { AccessControlAction } from 'app/types/accessControl';
import { type Team } from 'app/types/teams';

import { useUpdateTeam } from './hooks';

interface Props {
  team: Team;
}

const TeamSettings = ({ team }: Props) => {
  const canWriteTeamSettings = contextSrv.hasPermissionInMetadata(AccessControlAction.ActionTeamsWrite, team);
  const currentOrgId = contextSrv.user.orgId;
  const [updateTeam] = useUpdateTeam();
  const styles = useStyles2(getStyles);

  const [{ roleOptions }] = useRoleOptions(currentOrgId);
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<Team>({ defaultValues: team });

  const canUpdateRoles =
    contextSrv.hasPermission(AccessControlAction.ActionTeamsRolesAdd) &&
    contextSrv.hasPermission(AccessControlAction.ActionTeamsRolesRemove);

  const canListRoles =
    contextSrv.hasPermissionInMetadata(AccessControlAction.ActionTeamsRolesList, team) &&
    contextSrv.hasPermission(AccessControlAction.ActionRolesList);

  const onSubmit = async (formTeam: Team) => {
    return updateTeam({
      uid: team.uid,
      team: {
        name: formTeam.name,
        email: formTeam.email || '',
      },
    });
  };

  return (
    <Stack direction={'column'} gap={3}>
      {/*
       * Raw <form> retained per AAP §0.6.1. The team-settings form must remain raw
       * because:
       *   1. The body composes <FieldSet>+<Field>+<Input>+<Button> design-system
       *      primitives mandated by AAP §0.4.2 for form layout — Dimension 2 is
       *      satisfied via these primitives, not via the @grafana/ui <Form>
       *      render-prop wrapper.
       *   2. <TeamRolePicker> nested inside one of the <Field> entries owns its
       *      own internal RTK Query state for role assignments and does not
       *      participate in the parent useForm; wrapping in @grafana/ui's <Form>
       *      render-prop component (which instantiates its own useForm) would
       *      duplicate form state machinery without functional benefit.
       *   3. Per @grafana/ui's own JSDoc on <Form>: "use the `useForm` hook from
       *      react-hook-form instead" — the pattern below is the recommended
       *      replacement and uses the same react-hook-form API that <Form>
       *      wraps internally.
       */}
      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <FieldSet label={t('teams.team-settings.label-team-details', 'Team details')}>
          <Stack direction="column" gap={2}>
            <Field
              noMargin
              label={t('teams.team-settings.label-numerical-identifier', 'Numerical identifier')}
              disabled={true}
            >
              <Input value={team.id} id="id-input" />
            </Field>
            <Field
              noMargin
              label={t('teams.team-settings.label-name', 'Name')}
              disabled={!canWriteTeamSettings || !!team.isProvisioned}
              required
              invalid={!!errors.name}
              error="Name is required"
            >
              <Input {...register('name', { required: true })} id="name-input" />
            </Field>

            {contextSrv.licensedAccessControlEnabled() && canListRoles && (
              <Field noMargin label={t('teams.team-settings.label-role', 'Role')}>
                <TeamRolePicker teamId={team.id} roleOptions={roleOptions} disabled={!canUpdateRoles} maxWidth="100%" />
              </Field>
            )}

            <Field
              noMargin
              label={t('teams.team-settings.label-email', 'Email')}
              description={t(
                'teams.team-settings.description-email',
                'This is optional and is primarily used to set the team profile avatar (via the Gravatar service)'
              )}
              disabled={!canWriteTeamSettings}
            >
              <Input
                {...register('email')}
                // eslint-disable-next-line @grafana/i18n/no-untranslated-strings
                placeholder="team@email.com"
                type="email"
                id="email-input"
              />
            </Field>
          </Stack>
        </FieldSet>
        <Button type="submit" disabled={!canWriteTeamSettings}>
          <Trans i18nKey="teams.team-settings.save">Save team details</Trans>
        </Button>
      </form>
      <SharedPreferences resourceUri={`teams/${team.id}`} disabled={!canWriteTeamSettings} preferenceType="team" />
    </Stack>
  );
};

export default TeamSettings;

const getStyles = (theme: GrafanaTheme2) => ({
  form: css({
    maxWidth: 600,
    width: '100%',
  }),
});
