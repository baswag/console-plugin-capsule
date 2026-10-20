import { useEffect, useState } from 'react';
import { parseIndex, parseManifest, widgetsForSlot } from './manifest';
import type { AddonSlotName, LoadedWidget } from './types';

const FALLBACK_PUBLIC_PATH = '/api/plugins/console-plugin-capsule/';

/** URL of the `addons/` directory served next to the plugin's own assets. */
export function addonsBaseUrl(): string {
  const publicPath =
    typeof __webpack_public_path__ === 'string' && __webpack_public_path__
      ? __webpack_public_path__
      : FALLBACK_PUBLIC_PATH;
  return `${publicPath.endsWith('/') ? publicPath : `${publicPath}/`}addons/`;
}

async function fetchJSON(url: string): Promise<unknown> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  return res.json() as Promise<unknown>;
}

const warn = (msg: string) => {
  console.warn(`[console-plugin-capsule addons] ${msg}`);
};

export async function loadAddons(baseUrl = addonsBaseUrl()): Promise<LoadedWidget[]> {
  let index: unknown;
  try {
    index = await fetchJSON(`${baseUrl}index.json`);
  } catch {
    // No index (e.g. chart without addons, or local dev): run without addons.
    return [];
  }
  const { addons, errors } = parseIndex(index);
  errors.forEach(warn);

  const perAddon = await Promise.all(
    addons.map(async (addon) => {
      const addonUrl = `${baseUrl}${addon}/`;
      try {
        const result = parseManifest(addon, addonUrl, await fetchJSON(`${addonUrl}manifest.json`));
        result.errors.forEach((e) => {
          warn(`${addon}: ${e}`);
        });
        return result.widgets;
      } catch (e) {
        warn(
          `${addon}: failed to load manifest.json: ${e instanceof Error ? e.message : String(e)}`,
        );
        return [];
      }
    }),
  );
  return perAddon.flat();
}

let cache: Promise<LoadedWidget[]> | null = null;

/** Addons are loaded once per console session; reload the browser tab to pick up changes. */
export function getAddons(): Promise<LoadedWidget[]> {
  cache ??= loadAddons();
  return cache;
}

export function resetAddonCacheForTests() {
  cache = null;
}

export function useAddonWidgets(slot: AddonSlotName): {
  widgets: LoadedWidget[];
  loaded: boolean;
} {
  const [state, setState] = useState<{ widgets: LoadedWidget[]; loaded: boolean }>({
    widgets: [],
    loaded: false,
  });
  useEffect(() => {
    let active = true;
    void getAddons().then((all) => {
      if (active) setState({ widgets: widgetsForSlot(all, slot), loaded: true });
    });
    return () => {
      active = false;
    };
  }, [slot]);
  return state;
}
