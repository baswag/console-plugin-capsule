import { ADDON_API_VERSION, ADDON_SLOTS } from './types';
import type { AddonWidget, AddonSlotName, LoadedWidget } from './types';

/** Addon directory names, as used for the volume mount and in `addons/index.json`. */
export const ADDON_NAME_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isLocalizedText(v: unknown): boolean {
  return (
    typeof v === 'string' || (isRecord(v) && Object.values(v).every((s) => typeof s === 'string'))
  );
}

/**
 * A path inside the addon directory: relative, no `..` segments, no scheme. Keeps addons from
 * referencing arbitrary origins (which the console's CSP would block anyway).
 */
export function isSafeRelativePath(p: string): boolean {
  return (
    p.length > 0 &&
    !p.startsWith('/') &&
    !p.includes('://') &&
    !p.includes('\\') &&
    !p.split('/').includes('..')
  );
}

function iconError(icon: unknown): string | null {
  if (typeof icon !== 'string') return 'must be a string';
  if (!icon.startsWith('pf:') && !isSafeRelativePath(icon)) {
    return 'must be "pf:<name>" or a relative path inside the addon';
  }
  return null;
}

function validateWidget(w: unknown): string | null {
  if (!isRecord(w)) return 'widget is not an object';
  if (typeof w.id !== 'string' || !w.id) return 'missing "id"';
  if (typeof w.slot !== 'string' || !(ADDON_SLOTS as readonly string[]).includes(w.slot)) {
    return `unknown slot "${String(w.slot)}"`;
  }
  if (w.title !== undefined && !isLocalizedText(w.title)) return '"title" must be text';
  if (w.iconMode !== undefined && w.iconMode !== 'image' && w.iconMode !== 'mask') {
    return '"iconMode" must be "image" or "mask"';
  }
  if (w.icon !== undefined) {
    if (isRecord(w.icon) && w.type === 'labelToggle') {
      const { on, off } = w.icon;
      if (on === undefined && off === undefined) return '"icon" needs "on" and/or "off"';
      for (const [state, icon] of [
        ['on', on],
        ['off', off],
      ] as const) {
        const error = icon === undefined ? null : iconError(icon);
        if (error) return `"icon.${state}" ${error}`;
      }
    } else {
      const error = iconError(w.icon);
      if (error) return `"icon" ${error}`;
    }
  }

  switch (w.type) {
    case 'labelToggle':
      if (typeof w.key !== 'string' || !w.key) return 'missing "key"';
      for (const f of ['onValue', 'offValue'] as const) {
        if (w[f] !== undefined && typeof w[f] !== 'string') return `"${f}" must be a string`;
      }
      if (w.match !== undefined && w.match !== 'value' && w.match !== 'exists') {
        return '"match" must be "value" or "exists"';
      }
      if (w.match === 'exists' && w.offValue !== undefined) {
        // The label would still exist after switching off, so the toggle could never be off.
        return '"offValue" can\'t be combined with "match": "exists"';
      }
      if (w.readOnly !== undefined && typeof w.readOnly !== 'boolean') {
        return '"readOnly" must be a boolean';
      }
      if (w.text !== undefined && !isRecord(w.text)) return '"text" must be an object';
      if (w.confirm !== undefined && w.confirm !== false && !isRecord(w.confirm)) {
        return '"confirm" must be an object or false';
      }
      return null;
    case 'labelValue':
      if (typeof w.key !== 'string' || !w.key) return 'missing "key"';
      if (w.source !== undefined && w.source !== 'label' && w.source !== 'annotation') {
        return '"source" must be "label" or "annotation"';
      }
      for (const f of ['text', 'alt', 'tooltip', 'emptyText'] as const) {
        if (w[f] !== undefined && !isLocalizedText(w[f])) return `"${f}" must be text`;
      }
      if (w.format !== undefined) {
        if (!isRecord(w.format) || w.format.type !== 'date') return '"format.type" must be "date"';
        if (w.format.input !== undefined && typeof w.format.input !== 'string') {
          return '"format.input" must be a string';
        }
        if (
          w.format.display !== undefined &&
          typeof w.format.display !== 'string' &&
          !isRecord(w.format.display)
        ) {
          return '"format.display" must be a pattern string or Intl options object';
        }
        if (
          w.format.timezone !== undefined &&
          w.format.timezone !== 'UTC' &&
          w.format.timezone !== 'local'
        ) {
          return '"format.timezone" must be "UTC" or "local"';
        }
      }
      if (w.warnDays !== undefined && typeof w.warnDays !== 'number') {
        return '"warnDays" must be a number';
      }
      return null;
    case 'module':
      if (typeof w.module !== 'string' || !isSafeRelativePath(w.module)) {
        return '"module" must be a relative path inside the addon';
      }
      if (w.export !== undefined && typeof w.export !== 'string')
        return '"export" must be a string';
      return null;
    default:
      return `unknown type "${String(w.type)}"`;
  }
}

export interface ParseResult {
  widgets: LoadedWidget[];
  errors: string[];
}

/**
 * Validate one addon's manifest. Invalid widgets are dropped with an error message rather than
 * failing the whole addon, so one typo doesn't hide every other widget.
 */
export function parseManifest(addon: string, baseUrl: string, raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { widgets: [], errors: ['manifest is not an object'] };
  if (raw.apiVersion !== ADDON_API_VERSION) {
    return {
      widgets: [],
      errors: [
        `unsupported apiVersion "${String(raw.apiVersion)}", expected "${ADDON_API_VERSION}"`,
      ],
    };
  }
  if (!Array.isArray(raw.widgets)) return { widgets: [], errors: ['"widgets" must be an array'] };

  const seen = new Set<string>();
  const widgets: LoadedWidget[] = [];
  raw.widgets.forEach((w: unknown, idx) => {
    const error = validateWidget(w);
    const label = isRecord(w) && typeof w.id === 'string' ? w.id : `#${String(idx)}`;
    if (error) {
      errors.push(`widget ${label}: ${error}`);
      return;
    }
    const widget = w as AddonWidget;
    if (seen.has(widget.id)) {
      errors.push(`widget ${label}: duplicate id`);
      return;
    }
    seen.add(widget.id);
    widgets.push({ ...widget, addon, baseUrl });
  });
  return { widgets, errors };
}

export function parseIndex(raw: unknown): { addons: string[]; errors: string[] } {
  if (!isRecord(raw) || !Array.isArray(raw.addons)) {
    return { addons: [], errors: ['index.json must look like {"addons": ["<name>", ...]}'] };
  }
  const errors: string[] = [];
  const addons = raw.addons.filter((a: unknown): a is string => {
    const ok = typeof a === 'string' && ADDON_NAME_RE.test(a);
    if (!ok) errors.push(`invalid addon name ${JSON.stringify(a)}`);
    return ok;
  });
  return { addons: addons.filter((a, i) => addons.indexOf(a) === i), errors };
}

export function widgetsForSlot(widgets: LoadedWidget[], slot: AddonSlotName): LoadedWidget[] {
  return widgets.filter((w) => w.slot === slot);
}
