import useAsyncFn from 'react-use/lib/useAsyncFn';

import { t } from '@grafana/i18n';
import { type FetchErrorDataProps, isFetchError } from '@grafana/runtime';
import { useAppNotification } from 'app/core/copy/appNotification';
import { type PanelModel } from 'app/features/dashboard/state/PanelModel';

import { saveAndRefreshLibraryPanel } from '../utils';

export const usePanelSave = () => {
  const notifyApp = useAppNotification();

  const [state, saveLibraryPanel] = useAsyncFn(async (panel: PanelModel, folderUid: string) => {
    try {
      const libEl = await saveAndRefreshLibraryPanel(panel, folderUid);
      notifyApp.success(t('library-panels.save.success', 'Library panel saved'));
      return libEl;
    } catch (err) {
      // Narrow with the canonical fetch-error body so `err.data.message` is typed.
      if (isFetchError<FetchErrorDataProps>(err)) {
        err.isHandled = true;
        notifyApp.error(
          t('library-panels.save.error', 'Error saving library panel: "{{errorMsg}}"', {
            errorMsg: err.message ?? err.data.message,
          })
        );
      }
      throw err;
    }
  }, []);

  return { state, saveLibraryPanel };
};
