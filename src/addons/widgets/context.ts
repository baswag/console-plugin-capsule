import type { AddonResource, AddonSlotName } from '../types';

/** What a widget gets from the slot it's rendered in. */
export interface WidgetContext {
  resource: AddonResource;
  slot: AddonSlotName;
  compact: boolean;
  /** `undefined` while the permission check is pending (or wasn't needed). */
  canPatch: boolean | undefined;
  patchResource: (patch: unknown) => Promise<AddonResource>;
  refresh: () => Promise<void>;
}
