import * as React from 'react';
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@patternfly/react-core';
import { useErrorBoundary } from 'react-error-boundary';
import { ConfirmModal } from '../ConfirmModal';
import { getPfIcon } from '../icons';
import { addonProxy } from '../proxy';
import { ADDON_API_VERSION } from '../types';
import type {
  AddonComponentProps,
  AddonHost,
  AddonModuleFactory,
  ConfirmOptions,
  LoadedWidget,
  ModuleWidget as ModuleWidgetConfig,
} from '../types';
import type { WidgetContext } from './context';

type AddonComponent = ComponentType<AddonComponentProps>;
type ModuleLoadedWidget = ModuleWidgetConfig & LoadedWidget;

// One component per widget for the whole session: the module and its factory run only once.
const components = new Map<string, Promise<AddonComponent>>();

function loadComponent(widget: ModuleLoadedWidget, language: string): Promise<AddonComponent> {
  const key = `${widget.addon}/${widget.id}`;
  let pending = components.get(key);
  if (!pending) {
    pending = (async () => {
      const url = `${widget.baseUrl}${widget.module}`;
      const [mod, libs] = await Promise.all([
        // The module lives on the plugin's own origin but outside the webpack build, so the
        // browser's native import() loads it instead of webpack's chunk loader.
        import(/* webpackIgnore: true */ url) as Promise<Record<string, unknown>>,
        import('../hostLibs'),
      ]);
      const exportName = widget.export ?? 'default';
      const factory = mod[exportName];
      if (typeof factory !== 'function') {
        throw new Error(`${url} does not export a function "${exportName}"`);
      }
      const host: AddonHost = {
        apiVersion: ADDON_API_VERSION,
        React,
        PatternFly: libs.PatternFly,
        getIcon: getPfIcon,
        proxy: addonProxy,
        widget: {
          id: widget.id,
          addon: widget.addon,
          baseUrl: widget.baseUrl,
          config: widget.config,
        },
        language,
      };
      return (factory as AddonModuleFactory)(host);
    })();
    // Let a later render retry after a failure (e.g. a transient network error).
    pending.catch(() => components.delete(key));
    components.set(key, pending);
  }
  return pending;
}

interface ModuleWidgetProps {
  widget: ModuleLoadedWidget;
  ctx: WidgetContext;
}

export function ModuleWidget({ widget, ctx }: ModuleWidgetProps) {
  const { t, i18n } = useTranslation('plugin__console-plugin-capsule');
  const { showBoundary } = useErrorBoundary();
  const [Component, setComponent] = useState<AddonComponent | null>(null);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const language = i18n.language || 'en';
  useEffect(() => {
    let active = true;
    loadComponent(widget, language)
      .then((c) => {
        // Functional update: a component is itself a function and would otherwise be called.
        if (active) setComponent(() => c);
      })
      .catch((e: unknown) => {
        if (active) showBoundary(e);
      });
    return () => {
      active = false;
    };
  }, [widget, language, showBoundary]);

  if (!Component) return <Spinner size="sm" aria-label={t('Loading extension')} />;

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  const close = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  return (
    <>
      <Component
        resource={ctx.resource}
        slot={ctx.slot}
        compact={ctx.compact}
        canPatch={ctx.canPatch}
        patchResource={ctx.patchResource}
        refresh={ctx.refresh}
        confirm={confirm}
      />
      {confirmState && (
        <ConfirmModal
          {...confirmState.options}
          onConfirm={() => {
            close(true);
          }}
          onCancel={() => {
            close(false);
          }}
        />
      )}
    </>
  );
}
