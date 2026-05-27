import { useMemo, useState } from 'react';

import { useTheme2 } from '@grafana/ui';
import { CloseButton } from 'app/core/components/CloseButton/CloseButton';
import { type GeomapLayerHover } from 'app/plugins/panel/geomap/event';

import { DataHoverRows } from './DataHoverRows';
import { DataHoverTabs } from './DataHoverTabs';

export interface Props {
  layers?: GeomapLayerHover[];
  isOpen: boolean;
  onClose: () => void;
}

export const ComplexDataHoverView = ({ layers, onClose, isOpen }: Props) => {
  const theme = useTheme2();
  const closeButtonStyle = useMemo(() => ({ zIndex: theme.zIndex.tooltip }), [theme.zIndex.tooltip]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);

  if (!layers) {
    return null;
  }

  return (
    <>
      {isOpen && <CloseButton style={closeButtonStyle} onClick={onClose} />}
      <DataHoverTabs layers={layers} setActiveTabIndex={setActiveTabIndex} activeTabIndex={activeTabIndex} />
      <DataHoverRows layers={layers} activeTabIndex={activeTabIndex} />
    </>
  );
};
