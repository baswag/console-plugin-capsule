import type { SetFeatureFlag } from '@openshift-console/dynamic-plugin-sdk';
import { getPluginConfig } from './pluginConfig';

/**
 * Console feature flags derived from the plugin's runtime config (`config.json`). Extensions in
 * console-extensions.json are static, so pages that can be switched off per deployment declare
 * `"flags": { "required": [...] }` on their route and nav item instead.
 */
export const TENANT_RESOURCES_FLAG = 'CAPSULE_TENANT_RESOURCES';

/** `console.flag` handler: sets the flags once `config.json` has loaded. */
export const setConfigFlags = (setFeatureFlag: SetFeatureFlag): void => {
  void getPluginConfig().then((config) => {
    setFeatureFlag(TENANT_RESOURCES_FLAG, config.showTenantResources);
  });
};
