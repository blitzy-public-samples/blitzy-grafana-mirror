import Skeleton from 'react-loading-skeleton';

import { Button } from '@grafana/ui';

// This component is used as a fallback for codesplitting, so aim to keep
// the bundle size of it as small as possible :)
export function FolderPickerSkeleton() {
  return (
    <Button variant="secondary" fill="outline" disabled fullWidth>
      <Skeleton width={100} />
    </Button>
  );
}
