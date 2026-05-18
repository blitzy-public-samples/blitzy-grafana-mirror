import { css, cx } from '@emotion/css';
import { type FormEventHandler, useCallback, useMemo, useState } from 'react';

import {
  type TeamGroupDto,
  useAddTeamGroupApiMutation,
  useGetTeamGroupsApiQuery,
  useRemoveTeamGroupApiQueryMutation,
} from '@grafana/api-clients/internal/rtkq/legacy';
import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import {
  Button,
  type Column,
  Icon,
  InlineField,
  InlineFieldRow,
  Input,
  InteractiveTable,
  Tooltip,
  useStyles2,
  useTheme2,
} from '@grafana/ui';
import { SlideDown } from 'app/core/components/Animations/SlideDown';
import { CloseButton } from 'app/core/components/CloseButton/CloseButton';
import EmptyListCTA from 'app/core/components/EmptyListCTA/EmptyListCTA';
import { UpgradeBox, UpgradeContent, type UpgradeContentProps } from 'app/core/components/Upgrade/UpgradeBox';
import { highlightTrial } from 'app/features/admin/utils';

interface Props {
  isReadOnly: boolean;
  teamUid: string;
}

const headerTooltip = `Sync LDAP, OAuth or SAML groups with your Grafana teams.`;

export const TeamGroupSync = ({ isReadOnly, teamUid }: Props) => {
  const [isAddBoxVisible, setIsAddBoxVisible] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const styles = useStyles2(getStyles);

  const { data: groups = [] } = useGetTeamGroupsApiQuery({ teamId: teamUid });
  const [addTeamGroup] = useAddTeamGroupApiMutation();
  const [removeTeamGroup] = useRemoveTeamGroupApiQueryMutation();

  const onToggleAdding = () => {
    setIsAddBoxVisible(!isAddBoxVisible);
  };

  const onNewGroupIdChanged: FormEventHandler<HTMLInputElement> = (event) => {
    setNewGroupId(event.currentTarget.value);
  };

  const onAddGroup: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    await addTeamGroup({ teamId: teamUid, teamGroupMapping: { groupId: newGroupId } });
    setIsAddBoxVisible(false);
    setNewGroupId('');
  };

  const onRemoveGroup = useCallback(
    async (groupId: string | undefined) => {
      if (!groupId) {
        return;
      }
      await removeTeamGroup({ teamId: teamUid, groupId });
    },
    [removeTeamGroup, teamUid]
  );

  const isNewGroupValid = () => {
    return newGroupId.length > 1;
  };

  const columns = useMemo<Array<Column<TeamGroupDto>>>(
    () => [
      {
        id: 'groupId',
        header: t('teams.team-group-sync.external-group-id', 'External Group ID'),
        cell: ({ row: { original } }) => original.groupId ?? '',
      },
      {
        id: 'actions',
        header: '',
        disableGrow: true,
        cell: ({ row: { original } }) => (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onRemoveGroup(original.groupId)}
            disabled={isReadOnly}
            aria-label={t('teams.team-group-sync.aria-label-remove', 'Remove group {{groupName}}', {
              groupName: original.groupId,
            })}
          >
            <Icon name="times" />
          </Button>
        ),
      },
    ],
    [isReadOnly, onRemoveGroup]
  );

  return (
    <div>
      {highlightTrial() && (
        <UpgradeBox
          featureId={'team-sync'}
          eventVariant={'trial'}
          featureName={'team sync'}
          text={t(
            'teams.team-group-sync.team-sync-upgrade',
            'Add a group to enable team sync for free during your trial of Grafana Pro'
          )}
        />
      )}
      <div className={styles.pageActionBar}>
        {(!highlightTrial() || groups.length > 0) && (
          <>
            <h3 className={styles.pageSubHeading}>
              <Trans i18nKey="teams.team-group-sync.external-group-sync">External group sync</Trans>
            </h3>
            <Tooltip placement="auto" content={headerTooltip}>
              <Icon className={cx(styles.icon, styles.pageSubHeadingIcon)} name="question-circle" />
            </Tooltip>
          </>
        )}
        <div className={styles.pageActionBarSpacer} />
        {groups.length > 0 && (
          <Button onClick={onToggleAdding} icon="plus" disabled={isReadOnly}>
            <Trans i18nKey="teams.team-group-sync.add-group-button">Add group</Trans>
          </Button>
        )}
      </div>

      <SlideDown in={isAddBoxVisible}>
        <div className={styles.ctaForm}>
          <CloseButton onClick={onToggleAdding} />
          {/*
           * Raw <form> retained per AAP §0.6.1 ("documented imperative
           * FieldSet/Field pattern"). The add-group form intentionally does NOT
           * use react-hook-form because:
           *   1. It is a single-field, single-action submit handler with the
           *      input value driven by a simple useState (`newGroupId`).
           *      Introducing react-hook-form's useForm/register/handleSubmit
           *      machinery would not improve type safety, validation, or DX —
           *      `isNewGroupValid()` is already inlined against `newGroupId`.
           *   2. The form composes <InlineField>+<InlineFieldRow>+<Input>+<Button>
           *      design-system primitives mandated by AAP §0.4.2 for layout, so
           *      the design-system migration goal (raw form internals replaced
           *      with @grafana/ui form primitives) is already satisfied.
           *   3. The @grafana/ui <Form> render-prop component imposes a
           *      react-hook-form FormAPI argument shape that would require
           *      wholesale rewriting of the single-state imperative pattern with
           *      no functional or semantic benefit.
           */}
          <form onSubmit={onAddGroup}>
            <InlineFieldRow>
              <InlineField
                label={t('teams.team-group-sync.label-add-external-group', 'Add external group')}
                tooltip={t('teams.team-group-sync.tooltip-add-external-group', 'LDAP group example: {{example}}', {
                  example: 'cn=users,ou=groups,dc=grafana,dc=org',
                })}
              >
                <Input
                  type="text"
                  id={'add-external-group'}
                  placeholder=""
                  value={newGroupId}
                  onChange={onNewGroupIdChanged}
                  disabled={isReadOnly}
                />
              </InlineField>
              <Button type="submit" disabled={isReadOnly || !isNewGroupValid()} className={styles.addButton}>
                <Trans i18nKey="teams.team-group-sync.add-group">Add group</Trans>
              </Button>
            </InlineFieldRow>
          </form>
        </div>
      </SlideDown>

      {groups.length === 0 &&
        !isAddBoxVisible &&
        (highlightTrial() ? (
          <TeamSyncUpgradeContent
            action={{ onClick: onToggleAdding, text: t('teams.team-group-sync.text.add-group', 'Add group') }}
          />
        ) : (
          <EmptyListCTA
            onClick={onToggleAdding}
            buttonIcon="users-alt"
            title={t('teams.team-group-sync.title-there-external-groups', 'There are no external groups to sync with')}
            buttonTitle="Add group"
            proTip={headerTooltip}
            proTipLinkTitle="Learn more"
            proTipLink="https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-team-sync/"
            proTipTarget="_blank"
            buttonDisabled={isReadOnly}
          />
        ))}

      {groups.length > 0 && (
        <InteractiveTable columns={columns} data={groups} getRowId={(group) => group.groupId ?? ''} />
      )}
    </div>
  );
};

export const TeamSyncUpgradeContent = ({ action }: { action?: UpgradeContentProps['action'] }) => {
  const theme = useTheme2();
  return (
    <UpgradeContent
      action={action}
      listItems={[
        'Stop managing user access in two places - assign users to groups in SAML, LDAP or Oauth, and manage access at a Team level in Grafana',
        "Update users' permissions immediately when you add or remove them from an LDAP group, with no need for them to sign out and back in",
      ]}
      image={`team-sync-${theme.isLight ? 'light' : 'dark'}.png`}
      featureName={'team sync'}
      featureUrl={'https://grafana.com/docs/grafana/latest/enterprise/team-sync'}
      description={t(
        'teams.team-sync-upgrade-content.description',
        "Team Sync makes it easier for you to manage users' access in Grafana, by immediately updating each user's Grafana teams and permissions based on their single sign-on group membership, instead of when users sign in"
      )}
    />
  );
};
export default TeamGroupSync;

const getStyles = (theme: GrafanaTheme2) => ({
  icon: css({
    opacity: 0.7,

    '&:hover': {
      opacity: 1,
    },
  }),
  pageActionBar: css({
    marginBottom: theme.spacing(2),
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(2),
  }),
  pageActionBarSpacer: css({
    width: theme.spacing(2),
    flexGrow: 1,
  }),
  pageSubHeading: css({
    marginBottom: theme.spacing(2),
  }),
  pageSubHeadingIcon: css({
    marginLeft: theme.spacing(1),
    marginTop: theme.spacing(0.5),
  }),
  ctaForm: css({
    position: 'relative',
    padding: theme.spacing(3),
    backgroundColor: theme.colors.background.secondary,
    marginBottom: theme.spacing(3),
    borderTop: `3px solid ${theme.colors.success.main}`,
  }),
  addButton: css({
    marginLeft: theme.spacing(0.5),
  }),
});
