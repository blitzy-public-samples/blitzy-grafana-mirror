import { css } from '@emotion/css';
import { memo } from 'react';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { LoadingPlaceholder, ScrollContainer, useStyles2 } from '@grafana/ui';
import { type Team } from 'app/types/teams';

export interface Props {
  teams: Team[];
  isLoading: boolean;
}

export const UserTeams = memo<Props>(({ isLoading, teams }) => {
  const styles = useStyles2(getStyles);

  if (isLoading) {
    return <LoadingPlaceholder text={t('profile.user-teams.text-loading-teams', 'Loading teams...')} />;
  }

  if (teams.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className={styles.pageSubHeading}>
        <Trans i18nKey="profile.user-teams.teams">Teams</Trans>
      </h3>
      <ScrollContainer overflowY="visible" overflowX="auto" width="100%">
        <table
          className="filter-table form-inline"
          aria-label={t('profile.user-teams.aria-label-user-teams-table', 'User teams table')}
        >
          <thead>
            <tr>
              <th />
              <th>
                <Trans i18nKey="profile.user-teams.name">Name</Trans>
              </th>
              <th>
                <Trans i18nKey="profile.user-teams.email">Email</Trans>
              </th>
              <th>
                <Trans i18nKey="profile.user-teams.members">Members</Trans>
              </th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team: Team, index) => {
              return (
                <tr key={index}>
                  <td className={styles.avatarCell}>
                    <img className="filter-table__avatar" src={team.avatarUrl} alt="" />
                  </td>
                  <td>{team.name}</td>
                  <td>{team.email}</td>
                  <td>{team.memberCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollContainer>
    </div>
  );
});

UserTeams.displayName = 'UserTeams';

const getStyles = (theme: GrafanaTheme2) => ({
  pageSubHeading: css({
    marginBottom: theme.spacing(2),
  }),
  avatarCell: css({
    width: theme.spacing(8),
    textAlign: 'center',
  }),
});

export default UserTeams;
