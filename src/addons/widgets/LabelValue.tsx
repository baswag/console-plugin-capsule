import { useTranslation } from 'react-i18next';
import { Label, Tooltip } from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { daysUntil, formatDate, parseDate } from '../dateFormat';
import { AddonIcon } from '../icons';
import { renderText } from '../text';
import type { LabelValueWidget, LoadedWidget } from '../types';
import type { WidgetContext } from './context';

interface LabelValueProps {
  widget: LabelValueWidget & LoadedWidget;
  ctx: WidgetContext;
  /** Injectable for tests. */
  now?: Date;
}

export type DateStatus = 'danger' | 'warning' | undefined;

export function dateStatus(days: number, warnDays: number | undefined): DateStatus {
  if (days < 0) return 'danger';
  if (warnDays !== undefined && days <= warnDays) return 'warning';
  return undefined;
}

export function LabelValue({ widget, ctx, now = new Date() }: LabelValueProps) {
  const { t, i18n } = useTranslation('plugin__console-plugin-capsule');
  const lang = i18n.language || 'en';
  const { metadata } = ctx.resource;
  const name = metadata.name;
  const title = renderText(widget.title, lang, { name });
  const raw = (widget.source === 'annotation' ? metadata.annotations : metadata.labels)?.[
    widget.key
  ];

  if (raw === undefined) {
    const empty = renderText(widget.emptyText, lang, { name, title: title ?? '' });
    if (empty === undefined) return null;
    return (
      <Label
        color="grey"
        isCompact={ctx.compact}
        icon={<AddonIcon icon={widget.icon} baseUrl={widget.baseUrl} mode={widget.iconMode} />}
      >
        {empty}
      </Label>
    );
  }

  let value = raw;
  let days: number | undefined;
  let status: DateStatus;
  let parseError: string | undefined;
  if (widget.format?.type === 'date') {
    const tz = widget.format.timezone ?? 'UTC';
    const input = widget.format.input ?? 'YYYY-MM-DD';
    const date = parseDate(raw, input, tz);
    if (date) {
      value = formatDate(date, widget.format.display, { language: lang, tz, now });
      days = daysUntil(date, now, tz);
      status = dateStatus(days, widget.warnDays);
    } else {
      parseError = t('"{{raw}}" does not match the date format {{format}}', {
        raw,
        format: input,
      });
    }
  }

  const vars = { name, value, raw, title: title ?? '', days: days ?? '' };
  const text = renderText(widget.text, lang, vars) ?? (title ? `${title}: ${value}` : value);
  const statusText =
    status === 'danger' ? t('Expired') : status === 'warning' ? t('Expires soon') : undefined;
  const tooltip =
    parseError ??
    renderText(widget.tooltip, lang, vars) ??
    (statusText ? `${text} (${statusText})` : undefined);
  const alt = renderText(widget.alt, lang, vars);

  const label = (
    <Label
      status={parseError ? 'warning' : status}
      color={!status && !parseError ? 'grey' : undefined}
      isCompact={ctx.compact}
      icon={
        parseError ? (
          <ExclamationTriangleIcon />
        ) : (
          <AddonIcon icon={widget.icon} baseUrl={widget.baseUrl} mode={widget.iconMode} />
        )
      }
      aria-label={alt}
      tabIndex={tooltip ? 0 : undefined}
      data-test={`addon-value-${widget.addon}-${widget.id}`}
    >
      {text}
      {statusText && <span className="pf-v6-screen-reader"> ({statusText})</span>}
    </Label>
  );

  return tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : label;
}
