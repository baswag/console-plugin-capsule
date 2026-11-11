import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionListItem, Button } from '@patternfly/react-core';
import CreateNamespaceModal from '../components/CreateNamespaceModal';
import type { NamespaceMetadataField } from '../components/CreateNamespaceModal';
import type { Tenant } from '../utils/capsule';
import { AddonIcon } from './icons';
import { useAddonWidgets } from './registry';
import { matchesSelector } from './selector';
import { interpolate, renderText } from './text';
import type { CreateNamespaceWidget, LoadedWidget, MetadataEntry } from './types';

type Widget = CreateNamespaceWidget & LoadedWidget;

interface CreateNamespaceActionsProps {
  /** The selected tenant; no buttons are shown until it's known. */
  tenant: Tenant | undefined;
  /** Deployment-wide `forceTenantPrefix` (plugin config). */
  globalForceTenantPrefix: boolean;
  onCreated: (name: string) => void;
}

function splitEntries(
  kind: NamespaceMetadataField['kind'],
  entries: MetadataEntry[] = [],
  lang: string,
  vars: Record<string, string>,
): { presets: Record<string, string>; fields: NamespaceMetadataField[] } {
  const presets: Record<string, string> = {};
  const fields: NamespaceMetadataField[] = [];
  for (const e of entries) {
    if ('value' in e) {
      presets[e.key] = interpolate(e.value, vars);
    } else {
      fields.push({
        kind,
        key: e.key,
        title: renderText(e.title, lang, vars) ?? e.key,
        example: renderText(e.example, lang, vars),
        help: renderText(e.help, lang, vars),
        default: e.default === undefined ? undefined : interpolate(e.default, vars),
        required: e.required ?? false,
      });
    }
  }
  return { presets, fields };
}

/** Extra "create namespace" buttons from addons (`createNamespace` widgets), as `ActionListItem`s. */
export function CreateNamespaceActions({
  tenant,
  globalForceTenantPrefix,
  onCreated,
}: CreateNamespaceActionsProps) {
  const { i18n } = useTranslation('plugin__console-plugin-capsule');
  const lang = i18n.language || 'en';
  const { widgets } = useAddonWidgets('namespaces.toolbar');
  const [open, setOpen] = useState<Widget | null>(null);

  if (!tenant) return null;
  const tenantName = tenant.metadata.name;
  const vars = { tenant: tenantName };
  const visible = widgets.filter(
    (w): w is Widget =>
      w.type === 'createNamespace' && matchesSelector(w.when, tenant.metadata.labels),
  );
  if (visible.length === 0) return null;

  const modal = (() => {
    if (!open) return null;
    const text = renderText(open.text, lang, vars);
    const labels = splitEntries('label', open.labels, lang, vars);
    const annotations = splitEntries('annotation', open.annotations, lang, vars);
    const forceTenantPrefix =
      (tenant.spec.forceTenantPrefix ?? false) ||
      ((open.honorGlobalForceTenantPrefix ?? true) && globalForceTenantPrefix);
    return (
      <CreateNamespaceModal
        tenant={tenantName}
        forceTenantPrefix={forceTenantPrefix}
        title={renderText(open.title, lang, vars) ?? text}
        description={renderText(open.description, lang, vars)}
        presetLabels={labels.presets}
        presetAnnotations={annotations.presets}
        fields={[...labels.fields, ...annotations.fields]}
        onClose={() => {
          setOpen(null);
        }}
        onCreated={(name) => {
          setOpen(null);
          onCreated(name);
        }}
      />
    );
  })();

  return (
    <>
      {visible.map((w) => (
        <ActionListItem key={`${w.addon}/${w.id}`}>
          <Button
            variant={w.variant ?? 'secondary'}
            icon={
              w.icon ? <AddonIcon icon={w.icon} baseUrl={w.baseUrl} mode={w.iconMode} /> : undefined
            }
            onClick={() => {
              setOpen(w);
            }}
            data-test={`addon-create-namespace-${w.addon}-${w.id}`}
          >
            {renderText(w.text, lang, vars)}
          </Button>
        </ActionListItem>
      ))}
      {modal}
    </>
  );
}
