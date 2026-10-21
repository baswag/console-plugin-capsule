import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@patternfly/react-core';
import { isToggleOn, labelTogglePatch } from '../bindings';
import { ConfirmModal } from '../ConfirmModal';
import { AddonIcon } from '../icons';
import { matchesSelector } from '../selector';
import { renderText } from '../text';
import type { LabelToggleWidget, LoadedWidget } from '../types';
import type { WidgetContext } from './context';

interface LabelToggleProps {
  widget: LabelToggleWidget & LoadedWidget;
  ctx: WidgetContext;
}

export function LabelToggle({ widget, ctx }: LabelToggleProps) {
  const { t, i18n } = useTranslation('plugin__console-plugin-capsule');
  const lang = i18n.language || 'en';
  const name = ctx.resource.metadata.name;
  const on = isToggleOn(widget, ctx.resource.metadata.labels);

  const [modal, setModal] = useState<{ error: string | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const title = renderText(widget.title, lang, { name }) ?? widget.key;
  const vars = { name, title };
  const stateText = on ? widget.text?.on : widget.text?.off;
  const alt =
    renderText(stateText?.alt, lang, vars) ??
    (on ? t('{{title}}: enabled', vars) : t('{{title}}: disabled', vars));
  const tooltip = renderText(stateText?.tooltip, lang, vars) ?? alt;

  let blockedReason: string | undefined;
  if (!matchesSelector(widget.when, ctx.resource.metadata.labels)) {
    // Only reached with whenNotMatched: "disable"; otherwise AddonSlot hides the widget.
    blockedReason =
      renderText(widget.text?.notMatched, lang, vars) ?? t('Not available for {{name}}.', vars);
  } else if (widget.readOnly) {
    blockedReason = renderText(widget.text?.readOnly, lang, vars);
  } else if (ctx.canPatch === undefined) {
    blockedReason = t('Checking permissions…');
  } else if (!ctx.canPatch) {
    blockedReason =
      renderText(widget.text?.noPermission, lang, vars) ??
      t('You do not have permission to change this.');
  }

  const apply = () => {
    setSaving(true);
    ctx
      .patchResource(labelTogglePatch(widget, !on))
      .then(() => {
        setModal(null);
      })
      .catch((e: unknown) => {
        setModal({ error: e instanceof Error ? e.message : t('Failed to update {{title}}', vars) });
      })
      .finally(() => {
        setSaving(false);
      });
  };

  const onClick = () => {
    if (blockedReason !== undefined || widget.readOnly || saving) return;
    if (widget.confirm === false) apply();
    else setModal({ error: null });
  };

  // With a dedicated off icon the icon itself shows the state, so it isn't dimmed and struck
  // through on top (aria-pressed and the On/Off text still carry it).
  const stateIcons = typeof widget.icon === 'object' ? widget.icon : undefined;
  const icon = stateIcons
    ? on
      ? (stateIcons.on ?? stateIcons.off)
      : (stateIcons.off ?? stateIcons.on)
    : (widget.icon as string | undefined);
  const decorateOff = !on && stateIcons?.off === undefined;

  const stateClass = [
    'console-plugin-capsule__addon-toggle',
    `console-plugin-capsule__addon-toggle--${on ? 'on' : 'off'}`,
    decorateOff && 'console-plugin-capsule__addon-toggle--decorated',
    ctx.compact && 'console-plugin-capsule__addon-toggle--compact',
  ]
    .filter(Boolean)
    .join(' ');

  // Laid out by our own flex container: PatternFly's Button wraps its children in a text span,
  // so flex/gap on the button itself would only see that one span.
  const content = (
    <span className="console-plugin-capsule__addon-toggle-content">
      <span className="console-plugin-capsule__addon-toggle-icon">
        <AddonIcon icon={icon} baseUrl={widget.baseUrl} mode={widget.iconMode} />
      </span>
      {!ctx.compact && (
        <>
          <span className="console-plugin-capsule__addon-toggle-title">{title}</span>
          <span className="console-plugin-capsule__addon-toggle-state" aria-hidden>
            {on ? t('On') : t('Off')}
          </span>
        </>
      )}
    </span>
  );

  const tooltipContent = (
    <div>
      <div>{tooltip}</div>
      {blockedReason && <div>{blockedReason}</div>}
    </div>
  );

  const confirmTemplate = widget.confirm === false ? undefined : widget.confirm;
  const confirmBody =
    renderText(on ? confirmTemplate?.disable : confirmTemplate?.enable, lang, vars) ??
    (on ? t('Disable {{title}} for {{name}}?', vars) : t('Enable {{title}} for {{name}}?', vars));

  return (
    <>
      <Tooltip content={tooltipContent}>
        {widget.readOnly ? (
          // Display only: not a control, but focusable so keyboard users get the tooltip.
          <span className={stateClass} role="img" aria-label={alt} tabIndex={0}>
            {content}
          </span>
        ) : (
          <Button
            variant="plain"
            className={stateClass}
            aria-label={alt}
            aria-pressed={on}
            isAriaDisabled={blockedReason !== undefined}
            isLoading={saving && !modal}
            onClick={onClick}
            data-test={`addon-toggle-${widget.addon}-${widget.id}`}
          >
            {content}
          </Button>
        )}
      </Tooltip>
      {modal && (
        <ConfirmModal
          title={on ? t('Disable {{title}}', vars) : t('Enable {{title}}', vars)}
          body={confirmBody}
          confirmLabel={on ? t('Disable') : t('Enable')}
          variant={on ? 'danger' : 'primary'}
          error={modal.error}
          busy={saving}
          onConfirm={apply}
          onCancel={() => {
            setModal(null);
          }}
        />
      )}
    </>
  );
}
