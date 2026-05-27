import { css } from '@emotion/css';
import debounce from 'debounce-promise';
import { isNil } from 'lodash';
import { useState, useEffect, useMemo } from 'react';

import { type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { t } from '@grafana/i18n';
import { getBackendSrv } from '@grafana/runtime';
import { AsyncSelect, useStyles2 } from '@grafana/ui';
import { type Team } from 'app/types/teams';

export interface Props {
  onSelected: (team: SelectableValue<Team>) => void;
  className?: string;
  teamId?: number;
}

export const TeamPicker = ({ onSelected, className, teamId }: Props) => {
  const styles = useStyles2(getStyles);
  const [isLoading, setIsLoading] = useState(false);
  const [value, setValue] = useState<SelectableValue<Team> | undefined>();

  useEffect(() => {
    if (!teamId) {
      return;
    }

    getBackendSrv()
      .get<Team>(`/api/teams/${teamId}`)
      .then((team) => {
        setValue({
          value: team,
          label: team.name,
          imgUrl: team.avatarUrl,
        });
      });
  }, [teamId]);

  const search = useMemo(
    () =>
      debounce(
        async (query?: string) => {
          setIsLoading(true);

          if (isNil(query)) {
            query = '';
          }

          return getBackendSrv()
            .get<{ teams: Team[] }>(`/api/teams/search?perpage=100&page=1&query=${query}`)
            .then((result) => {
              const teams: Array<SelectableValue<Team>> = result.teams.map((team) => {
                return {
                  value: team,
                  label: team.name,
                  imgUrl: team.avatarUrl,
                };
              });

              setIsLoading(false);
              return teams;
            });
        },
        300,
        { leading: true }
      ),
    []
  );

  return (
    <div className={styles.wrapper} data-testid="teamPicker">
      <AsyncSelect
        isLoading={isLoading}
        defaultOptions={true}
        loadOptions={search}
        value={value}
        onChange={onSelected}
        className={className}
        placeholder={t('team-picker.select-placeholder', 'Select a team')}
        noOptionsMessage={t('team-picker.noOptionsMessage-no-teams-found', 'No teams found')}
        aria-label={t('team-picker.select-aria-label', 'Team picker')}
      />
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({}),
});
