import { renderMarkdown } from '@grafana/data';
import { Drawer } from '@grafana/ui';
import { FALLBACK_DOCS_LINK } from 'app/features/transformers/docs/constants';

import { useQueryEditorUIContext } from './QueryEditorContext';

/**
 * Displays transformation help in a drawer when toggled from the actions menu.
 */
export function TransformationHelpDisplay() {
  const { selectedTransformation, transformToggles } = useQueryEditorUIContext();

  if (!transformToggles.showHelp || !selectedTransformation?.registryItem) {
    return null;
  }

  const {
    transformation: { name },
    help,
  } = selectedTransformation.registryItem;

  const helpContent = help ?? FALLBACK_DOCS_LINK;
  const helpHtml = renderMarkdown(helpContent);

  return (
    <Drawer title={name} subtitle="Transformation help" onClose={transformToggles.toggleHelp}>
      {/* Design system gap: markdown-html is a complex multi-selector global style block defined in packages/grafana-ui/src/themes/GlobalStyles/markdownStyles.ts that styles markdown HTML rendered via dangerouslySetInnerHTML (img, ul/ol, table, th, td, a, p selectors with theme-aware spacing/colors). Migration would require duplicating the full selector tree per call site; kept per refactor protocol per AAP §0.4.4. */}
      <div className="markdown-html" dangerouslySetInnerHTML={{ __html: helpHtml }} />
    </Drawer>
  );
}
