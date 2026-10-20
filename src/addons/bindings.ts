import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import type { AddonResource, AddonSlotName, LabelToggleWidget } from './types';

const namespacesClient = new CapsuleClient<AddonResource>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'namespaces',
  apiKindSingle: 'Namespace',
});
const tenantsClient = new CapsuleClient<AddonResource>(CAPSULE_APIS.TENANTS);

/** How a slot's resource is read, patched and permission-checked through the capsule proxy. */
export interface SlotBinding {
  canPatch: (resource: AddonResource) => Promise<boolean>;
  patch: (resource: AddonResource, patch: unknown) => Promise<AddonResource>;
  fetch: (resource: AddonResource) => Promise<AddonResource>;
}

export const SLOT_BINDINGS: Record<AddonSlotName, SlotBinding> = {
  'namespace.detail': {
    // Namespace RBAC is evaluated with the namespace set to the namespace's own name, which is
    // what grants tenant members (and only them) access to their namespaces.
    canPatch: ({ metadata: { name } }) =>
      namespacesClient.authCanI({ verb: 'patch', name, namespace: name }),
    patch: ({ metadata: { name } }, patch) => namespacesClient.patch(name, patch),
    fetch: ({ metadata: { name } }) => namespacesClient.fetch({ name }),
  },
  'tenant.row': {
    canPatch: ({ metadata: { name } }) => tenantsClient.authCanI({ verb: 'patch', name }),
    patch: ({ metadata: { name } }, patch) => tenantsClient.patch(name, patch),
    fetch: ({ metadata: { name } }) => tenantsClient.fetch({ name }),
  },
};

export function isToggleOn(
  widget: LabelToggleWidget,
  labels: Record<string, string> | undefined,
): boolean {
  if (widget.match === 'exists') return labels !== undefined && widget.key in labels;
  return labels?.[widget.key] === toggleOnValue(widget);
}

function toggleOnValue(widget: LabelToggleWidget): string {
  return widget.onValue ?? (widget.match === 'exists' ? '' : 'true');
}

/** Merge patch that switches a label toggle; `null` removes the label. */
export function labelTogglePatch(widget: LabelToggleWidget, turnOn: boolean) {
  const value = turnOn ? toggleOnValue(widget) : (widget.offValue ?? null);
  return { metadata: { labels: { [widget.key]: value } } };
}
