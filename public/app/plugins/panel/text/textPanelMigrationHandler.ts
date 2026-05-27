import { type PanelModel } from '@grafana/data';

import { TextMode, type Options } from './panelcfg.gen';

interface LegacyTextPanel {
  content?: string;
  // The legacy Angular text panel supported 'html' | 'markdown' | 'text' modes;
  // the obsolete 'text' value is normalized to TextMode.Markdown by the migration logic below.
  mode?: 'html' | 'markdown' | 'text';
}

// Type predicate that narrows `panel` to also include the legacy Angular text-panel fields
// (top-level `content` and `mode`) when both are present on the object. Using a predicate
// instead of a type assertion satisfies the @typescript-eslint/consistent-type-assertions
// rule while preserving the original `hasOwnProperty` runtime check semantics.
function hasLegacyTextFields(
  panel: PanelModel<Options>
): panel is PanelModel<Options> & LegacyTextPanel {
  return panel.hasOwnProperty('content') && panel.hasOwnProperty('mode');
}

export const textPanelMigrationHandler = (panel: PanelModel<Options>): Partial<Options> => {
  const previousVersion = parseFloat(panel.pluginVersion || '6.1');
  let options: Partial<Options> = panel.options;

  // Migrates old Angular based text panel props to new props
  if (hasLegacyTextFields(panel)) {
    const content = panel.content;
    const legacyMode = panel.mode;
    // Map the legacy mode string to the corresponding TextMode enum value. The obsolete
    // legacy `'text'` value (and any unknown legacy value) becomes `undefined` here and is
    // subsequently normalized to TextMode.Markdown by the mode-validation block below —
    // preserving the original behavior in which `oldTextPanel.mode` was assigned through
    // `any` and then sanitized by the downstream `modes.find` normalization.
    const mode =
      legacyMode === 'html' ? TextMode.HTML : legacyMode === 'markdown' ? TextMode.Markdown : undefined;

    delete panel.content;
    delete panel.mode;

    if (previousVersion < 7.1) {
      options = { content, mode };
    }
  }

  // The 'text' mode has been removed so we need to update any panels still using it to markdown
  const modes = [TextMode.Code, TextMode.HTML, TextMode.Markdown];
  if (!modes.find((f) => f === options.mode)) {
    options = { ...options, mode: TextMode.Markdown };
  }

  return options;
};
