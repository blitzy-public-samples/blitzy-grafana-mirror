import { memo, useEffect, useMemo, useState } from 'react';

import { type PreferencesSpec as UserPreferencesDTO } from '@grafana/api-clients/rtkq/preferences/v1alpha1';
import { FeatureState } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t, Trans } from '@grafana/i18n';
import { config, reportInteraction } from '@grafana/runtime';
import {
  Button,
  Field,
  FieldSet,
  Label,
  TimeZonePicker,
  WeekStartPicker,
  FeatureBadge,
  Combobox,
  type ComboboxOption,
  TextLink,
  type WeekStart,
  isWeekStart,
} from '@grafana/ui';
import { DashboardPicker } from 'app/core/components/Select/DashboardPicker';
import { PreferencesService } from 'app/core/services/PreferencesService';
import { changeTheme } from 'app/core/services/theme';

import { getSelectableThemes } from '../ThemeSelector/getSelectableThemes';

import {
  getLanguageOptions,
  getRegionalFormatOptions,
  getStyles,
  getTranslatedThemeName,
  type Props,
  type State,
} from './utils';

export const SharedPreferences = memo((props: Props) => {
  const [state, setState] = useState<UserPreferencesDTO & State>({
    isLoading: false,
    isSubmitting: false,
    theme: '',
    timezone: '',
    weekStart: '',
    language: '',
    regionalFormat: '',
    queryHistory: { homeTab: '' },
    navbar: { bookmarkUrls: [] },
  });

  const service = useMemo(() => new PreferencesService(props.resourceUri), [props.resourceUri]);

  const themes = getSelectableThemes();

  // Options are translated, so must be called after init but call them
  // in constructor to avoid memo-break of array changing every render
  const themeOptions: ComboboxOption[] = themes.map((theme) => ({
    value: theme.id,
    label: getTranslatedThemeName(theme),
    group: theme.isExtra ? t('shared-preferences.theme.experimental', 'Experimental') : undefined,
  }));
  const languageOptions: ComboboxOption[] = getLanguageOptions();
  const regionalFormatOptions: ComboboxOption[] = getRegionalFormatOptions();

  // Add default option
  themeOptions.unshift({ value: '', label: t('shared-preferences.theme.default-label', 'Default') });

  useEffect(() => {
    const loadPreferences = async () => {
      setState((prev) => ({ ...prev, isLoading: true }));
      const prefs = await service.load();
      setState((prev) => ({
        ...prev,
        isLoading: false,
        homeDashboardUID: prefs.homeDashboardUID,
        theme: prefs.theme,
        timezone: prefs.timezone,
        weekStart: prefs.weekStart,
        language: prefs.language,
        regionalFormat: prefs.regionalFormat,
        queryHistory: prefs.queryHistory,
        navbar: prefs.navbar,
      }));
    };
    loadPreferences();
  }, [service]);

  const onSubmitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const confirmationResult = props.onConfirm ? await props.onConfirm() : true;

    if (confirmationResult) {
      const { homeDashboardUID, theme, timezone, weekStart, language, regionalFormat, queryHistory, navbar } = state;
      reportInteraction('grafana_preferences_save_button_clicked', {
        preferenceType: props.preferenceType,
        theme,
        language,
      });
      setState((prev) => ({ ...prev, isSubmitting: true }));
      await service
        .update({
          homeDashboardUID,
          theme,
          timezone,
          weekStart,
          language,
          regionalFormat,
          queryHistory,
          navbar,
        })
        .finally(() => {
          setState((prev) => ({ ...prev, isSubmitting: false }));
        });
      window.location.reload();
    }
  };

  const onThemeChanged = (value: ComboboxOption<string>) => {
    setState((prev) => ({ ...prev, theme: value.value }));
    reportInteraction('grafana_preferences_theme_changed', {
      toTheme: value.value,
      preferenceType: props.preferenceType,
    });

    if (value.value) {
      changeTheme(value.value, true);
    }
  };

  const onTimeZoneChanged = (timezone?: string) => {
    if (typeof timezone !== 'string') {
      return;
    }
    setState((prev) => ({ ...prev, timezone }));
  };

  const onWeekStartChanged = (weekStart?: WeekStart) => {
    setState((prev) => ({ ...prev, weekStart: weekStart ?? '' }));
  };

  const onHomeDashboardChanged = (dashboardUID: string) => {
    setState((prev) => ({ ...prev, homeDashboardUID: dashboardUID }));
  };

  const onLanguageChanged = (language: string) => {
    setState((prev) => ({ ...prev, language }));

    reportInteraction('grafana_preferences_language_changed', {
      toLanguage: language,
      preferenceType: props.preferenceType,
    });
  };

  const onLocaleChanged = (regionalFormat: string) => {
    setState((prev) => ({ ...prev, regionalFormat }));

    reportInteraction('grafana_preferences_regional_format_changed', {
      toRegionalFormat: regionalFormat,
      preferenceType: props.preferenceType,
    });
  };

  const { theme, timezone, weekStart, homeDashboardUID, language, isLoading, isSubmitting, regionalFormat } = state;
  const { disabled } = props;
  const styles = getStyles();
  const currentThemeOption = themeOptions.find((x) => x.value === theme) ?? themeOptions[0];

  return (
    // Design system gap: this form manages state imperatively via useState rather than the
    // deprecated react-hook-form-based @grafana/ui <Form> wrapper. Raw <form> with internal
    // FieldSet+Field composition is the documented design system pattern for forms with
    // custom submit logic (see @grafana/ui Form.tsx JSDoc and AAP §0.4.2).
    <form onSubmit={onSubmitForm} className={styles.form}>
      <FieldSet label={<Trans i18nKey="shared-preferences.title">Preferences</Trans>} disabled={disabled}>
        <Field
          loading={isLoading}
          disabled={isLoading}
          label={t('shared-preferences.fields.theme-label', 'Interface theme')}
          description={
            config.featureToggles.grafanaconThemes && config.feedbackLinksEnabled ? (
              <Trans i18nKey="shared-preferences.fields.theme-description">
                Enjoying the experimental themes? Tell us what you'd like to see{' '}
                <TextLink
                  variant="bodySmall"
                  external
                  href="https://docs.google.com/forms/d/e/1FAIpQLSeRKAY8nUMEVIKSYJ99uOO-dimF6Y69_If1Q1jTLOZRWqK1cw/viewform?usp=dialog"
                >
                  here.
                </TextLink>
              </Trans>
            ) : undefined
          }
        >
          <Combobox
            options={themeOptions}
            value={currentThemeOption.value}
            onChange={onThemeChanged}
            id="shared-preferences-theme-select"
          />
        </Field>

        <Field
          loading={isLoading}
          disabled={isLoading}
          label={
            <Label htmlFor="home-dashboard-select">
              <span className={styles.labelText}>
                <Trans i18nKey="shared-preferences.fields.home-dashboard-label">Home Dashboard</Trans>
              </span>
            </Label>
          }
          data-testid="User preferences home dashboard drop down"
        >
          <DashboardPicker
            value={homeDashboardUID}
            onChange={(v) => onHomeDashboardChanged(v?.uid ?? '')}
            defaultOptions={true}
            isClearable={true}
            placeholder={t('shared-preferences.fields.home-dashboard-placeholder', 'Default dashboard')}
            inputId="home-dashboard-select"
          />
        </Field>

        <Field
          loading={isLoading}
          disabled={isLoading}
          label={t('shared-dashboard.fields.timezone-label', 'Timezone')}
          data-testid={selectors.components.TimeZonePicker.containerV2}
        >
          <TimeZonePicker
            includeInternal={true}
            value={timezone}
            onChange={onTimeZoneChanged}
            inputId="shared-preferences-timezone-picker"
          />
        </Field>

        <Field
          loading={isLoading}
          disabled={isLoading}
          label={t('shared-preferences.fields.week-start-label', 'Week start')}
          data-testid={selectors.components.WeekStartPicker.containerV2}
        >
          <WeekStartPicker
            value={weekStart && isWeekStart(weekStart) ? weekStart : undefined}
            onChange={onWeekStartChanged}
            inputId="shared-preferences-week-start-picker"
          />
        </Field>

        <Field
          loading={isLoading}
          disabled={isLoading}
          label={
            <Label htmlFor="language-preference-select">
              <span className={styles.labelText}>
                <Trans i18nKey="shared-preferences.fields.language-preference-label">Language</Trans>
              </span>
              <FeatureBadge featureState={FeatureState.preview} />
            </Label>
          }
          data-testid="User preferences language drop down"
        >
          <Combobox
            value={languageOptions.find((lang) => lang.value === language)?.value || ''}
            onChange={(lang: ComboboxOption | null) => onLanguageChanged(lang?.value ?? '')}
            options={languageOptions}
            placeholder={t('shared-preferences.fields.language-preference-placeholder', 'Choose language')}
            id="language-preference-select"
          />
        </Field>
        {config.featureToggles.localeFormatPreference && (
          <Field
            loading={isLoading}
            disabled={isLoading}
            label={
              <Label htmlFor="locale-preference">
                <span className={styles.labelText}>
                  <Trans i18nKey="shared-preferences.fields.locale-preference-label">Region format</Trans>
                </span>
                <FeatureBadge featureState={FeatureState.preview} />
              </Label>
            }
            description={t(
              'shared-preferences.fields.locale-preference-description',
              'Choose your region to see the corresponding date, time, and number format'
            )}
            data-testid="User preferences locale drop down"
          >
            <Combobox
              value={regionalFormatOptions.find((loc) => loc.value === regionalFormat)?.value || ''}
              onChange={(locale: ComboboxOption | null) => onLocaleChanged(locale?.value ?? '')}
              options={regionalFormatOptions}
              placeholder={t('shared-preferences.fields.locale-preference-placeholder', 'Choose region')}
              id="locale-preference-select"
            />
          </Field>
        )}
      </FieldSet>
      <Button
        disabled={isSubmitting}
        type="submit"
        variant="primary"
        data-testid={selectors.components.UserProfile.preferencesSaveButton}
      >
        <Trans i18nKey="shared-preferences.save">Save preferences</Trans>
      </Button>
    </form>
  );
});

SharedPreferences.displayName = 'SharedPreferences';

export default SharedPreferences;
