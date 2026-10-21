import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { ErrorBoundary } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';
import { SLOT_BINDINGS } from './bindings';
import { useAddonWidgets } from './registry';
import { visibleWidgets } from './selector';
import type { AddonResource, AddonSlotName, LoadedWidget } from './types';
import { LabelToggle } from './widgets/LabelToggle';
import { LabelValue } from './widgets/LabelValue';
import { ModuleWidget } from './widgets/ModuleWidget';
import type { WidgetContext } from './widgets/context';
import './Addons.css';

function needsPatchPermission(widgets: LoadedWidget[]): boolean {
  return widgets.some((w) => (w.type === 'labelToggle' && !w.readOnly) || w.type === 'module');
}

function WidgetError({ error, widget }: FallbackProps & { widget: LoadedWidget }) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const message = t('Extension {{addon}}/{{id}} failed: {{message}}', {
    addon: widget.addon,
    id: widget.id,
    message: error instanceof Error ? error.message : String(error),
  });
  return (
    <Tooltip content={message}>
      <span
        className="console-plugin-capsule__addon-error"
        role="img"
        aria-label={message}
        tabIndex={0}
      >
        <ExclamationTriangleIcon />
      </span>
    </Tooltip>
  );
}

function renderWidget(widget: LoadedWidget, ctx: WidgetContext) {
  switch (widget.type) {
    case 'labelToggle':
      return <LabelToggle widget={widget} ctx={ctx} />;
    case 'labelValue':
      return <LabelValue widget={widget} ctx={ctx} />;
    case 'module':
      return <ModuleWidget widget={widget} ctx={ctx} />;
  }
}

interface AddonSlotProps<R extends AddonResource> {
  slot: AddonSlotName;
  resource: R;
  /** Called with the updated object after a widget changed it. */
  onUpdated: (updated: R) => void;
  /** Table-cell layout: icons only. */
  compact?: boolean;
  /** Pre-loaded widgets for this slot (avoids one registry lookup per table row). */
  widgets?: LoadedWidget[];
}

export function AddonSlot<R extends AddonResource>({
  slot,
  resource,
  onUpdated,
  compact = false,
  widgets: givenWidgets,
}: AddonSlotProps<R>) {
  const loaded = useAddonWidgets(slot);
  const widgets = visibleWidgets(givenWidgets ?? loaded.widgets, resource.metadata.labels);
  const binding = SLOT_BINDINGS[slot];
  const name = resource.metadata.name;
  const needsPermission = needsPatchPermission(widgets);

  // Fail closed: toggles stay disabled until the server confirms the user may patch this
  // object. The API server (and Capsule's webhooks) still enforce it on the actual patch.
  const [canPatch, setCanPatch] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!needsPermission) return;
    let active = true;
    setCanPatch(undefined);
    binding
      .canPatch(resource)
      .then((allowed) => {
        if (active) setCanPatch(allowed);
      })
      .catch(() => {
        if (active) setCanPatch(false);
      });
    return () => {
      active = false;
    };
    // Only re-check when the object identity (name) changes, not on every label update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding, name, needsPermission]);

  const patchResource = useCallback(
    async (patch: unknown) => {
      const updated = (await binding.patch(resource, patch)) as R;
      onUpdated(updated);
      return updated;
    },
    [binding, resource, onUpdated],
  );
  const refresh = useCallback(async () => {
    onUpdated((await binding.fetch(resource)) as R);
  }, [binding, resource, onUpdated]);

  if (widgets.length === 0) return null;

  const ctx: WidgetContext = { resource, slot, compact, canPatch, patchResource, refresh };
  return (
    <div
      className={`console-plugin-capsule__addons${
        compact ? ' console-plugin-capsule__addons--compact' : ''
      }`}
      data-test={`addon-slot-${slot}`}
    >
      {widgets.map((widget) => (
        <ErrorBoundary
          key={`${widget.addon}/${widget.id}`}
          fallbackRender={(props) => <WidgetError {...props} widget={widget} />}
          resetKeys={[resource]}
        >
          {renderWidget(widget, ctx)}
        </ErrorBoundary>
      ))}
    </div>
  );
}
