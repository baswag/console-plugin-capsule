import { useEffect, useState } from 'react';

/**
 * Deployment-wide settings, served as `config.json` next to the plugin's assets. The Helm
 * chart renders it from `plugin.config`; without it (e.g. local dev) the defaults apply.
 */
export interface PluginConfig {
  /**
   * Require new namespaces to be prefixed with `<tenant>-` for every tenant, regardless of the
   * tenant's own `spec.forceTenantPrefix`. Mirrors Capsule's global `forceTenantPrefix` option.
   */
  forceTenantPrefix: boolean;
}

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  forceTenantPrefix: false,
};

const FALLBACK_PUBLIC_PATH = '/api/plugins/console-plugin-capsule/';

/** URL the plugin's own assets are served from, with a trailing slash. */
export function pluginBaseUrl(): string {
  const publicPath =
    typeof __webpack_public_path__ === 'string' && __webpack_public_path__
      ? __webpack_public_path__
      : FALLBACK_PUBLIC_PATH;
  return publicPath.endsWith('/') ? publicPath : `${publicPath}/`;
}

/** Validates raw `config.json` content, falling back to defaults for missing/invalid keys. */
export function parsePluginConfig(raw: unknown): PluginConfig {
  const config = { ...DEFAULT_PLUGIN_CONFIG };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return config;
  const { forceTenantPrefix } = raw as Record<string, unknown>;
  if (typeof forceTenantPrefix === 'boolean') config.forceTenantPrefix = forceTenantPrefix;
  return config;
}

export async function loadPluginConfig(
  url = `${pluginBaseUrl()}config.json`,
): Promise<PluginConfig> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-cache' });
    if (!res.ok) return { ...DEFAULT_PLUGIN_CONFIG };
    return parsePluginConfig(await res.json());
  } catch {
    return { ...DEFAULT_PLUGIN_CONFIG };
  }
}

let cache: Promise<PluginConfig> | null = null;

/** Loaded once per console session; reload the browser tab to pick up changes. */
export function getPluginConfig(): Promise<PluginConfig> {
  cache ??= loadPluginConfig();
  return cache;
}

export function resetPluginConfigCacheForTests() {
  cache = null;
}

/** Returns the defaults until `config.json` has loaded. */
export function usePluginConfig(): PluginConfig {
  const [config, setConfig] = useState<PluginConfig>(DEFAULT_PLUGIN_CONFIG);
  useEffect(() => {
    let active = true;
    void getPluginConfig().then((loaded) => {
      if (active) setConfig(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return config;
}
