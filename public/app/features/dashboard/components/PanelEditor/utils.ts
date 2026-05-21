import { omit } from 'lodash';

import { type FieldConfigSource, type PanelPlugin } from '@grafana/data';
import { GRID_CELL_HEIGHT, GRID_CELL_VMARGIN, GRID_COLUMN_COUNT } from 'app/core/constants';

import { type PanelModel } from '../../state/PanelModel';

import { DisplayMode } from './types';

export function calculatePanelSize(mode: DisplayMode, width: number, height: number, panel: PanelModel) {
  if (mode === DisplayMode.Fill) {
    return { width, height };
  }
  const panelPadding = 8 * 6;
  const sidebarWidth = 60;

  const colWidth = (window.innerWidth - sidebarWidth - GRID_CELL_VMARGIN * 4) / GRID_COLUMN_COUNT;
  const pWidth = colWidth * panel.gridPos.w;
  const pHeight = GRID_CELL_HEIGHT * panel.gridPos.h + panelPadding;
  const scale = Math.min(width / pWidth, height / pHeight);

  if (pWidth <= width && pHeight <= height) {
    return {
      width: pWidth,
      height: pHeight,
    };
  }

  return {
    width: pWidth * scale,
    height: pHeight * scale,
  };
}

export function supportsDataQuery(plugin: PanelPlugin | undefined | null): boolean {
  return plugin?.meta.skipDataQuery === false;
}

export const updateDefaultFieldConfigValue = (
  config: FieldConfigSource,
  name: string,
  value: unknown,
  isCustom?: boolean
) => {
  let defaults = { ...config.defaults };
  const remove = value == null || value === '';

  if (isCustom) {
    if (defaults.custom) {
      if (remove) {
        defaults.custom = omit(defaults.custom, name);
      } else {
        defaults.custom = setOptionImmutably(defaults.custom, name, value);
      }
    } else if (!remove) {
      defaults.custom = setOptionImmutably(defaults.custom, name, value);
    }
  } else if (remove) {
    defaults = omit(defaults, name);
  } else {
    defaults = setOptionImmutably(defaults, name, value);
  }

  return {
    ...config,
    defaults,
  };
};

export function setOptionImmutably<T extends object>(options: T, path: string | string[], value: unknown): T {
  const splat = !Array.isArray(path) ? path.split('.') : path;

  const key = splat.shift()!;
  if (key.endsWith(']')) {
    const idx = key.lastIndexOf('[');
    const index = +key.substring(idx + 1, key.length - 1);
    const propKey = key.substring(0, idx);
    const propValue = (options as Record<string, unknown>)[propKey];
    const arr = Array.isArray(propValue) ? [...propValue] : [];
    let nextValue: unknown = value;
    if (splat.length) {
      const nestedRaw = arr[index];
      const nested: object = nestedRaw != null && typeof nestedRaw === 'object' ? nestedRaw : {};
      nextValue = setOptionImmutably(nested, splat, value);
    }
    arr[index] = nextValue;
    return { ...options, [propKey]: arr };
  }

  if (!splat.length) {
    return { ...options, [key]: value };
  }

  const rawCurrent = (options as Record<string, unknown>)[key];
  const current: object = rawCurrent != null && typeof rawCurrent === 'object' ? rawCurrent : {};

  return { ...options, [key]: setOptionImmutably(current, splat, value) };
}
