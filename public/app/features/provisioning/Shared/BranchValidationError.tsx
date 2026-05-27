import { css } from '@emotion/css';

import { type GrafanaTheme2 } from '@grafana/data';
import { Trans } from '@grafana/i18n';
import { useStyles2 } from '@grafana/ui';

export function BranchValidationError() {
  const styles = useStyles2(getStyles);
  return (
    <>
      <Trans i18nKey="dashboard-scene.branch-validation-error.invalid-branch-name">Invalid branch name.</Trans>
      <ul className={styles.list}>
        <li>
          <Trans i18nKey="dashboard-scene.branch-validation-error.cannot-start-with">
            It cannot start with '/' or end with '/', '.', or whitespace.
          </Trans>
        </li>
        <li>
          <Trans i18nKey="dashboard-scene.branch-validation-error.it-cannot-contain-or">
            It cannot contain '//' or '..'.
          </Trans>
        </li>
        <li>
          <Trans i18nKey="dashboard-scene.branch-validation-error.cannot-contain-invalid-characters">
            It cannot contain invalid characters: '~', '^', ':', '?', '*', '[', '\\', or ']'.
          </Trans>
        </li>
        <li>
          <Trans i18nKey="dashboard-scene.branch-validation-error.least-valid-character">
            It must have at least one valid character.
          </Trans>
        </li>
      </ul>
    </>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  // Migrated from inline style={{ padding: '0 20px' }} per AAP Dimension 3
  // (inline-style → useStyles2). 20px ≈ theme.spacing(2.5) — matches the
  // original list indentation used to surface the validation rules.
  list: css({
    padding: theme.spacing(0, 2.5),
  }),
});
