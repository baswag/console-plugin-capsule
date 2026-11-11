import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@patternfly/react-core';
import type { GlobalResourceQuota, Quantity } from '../utils/capsule';
import { parseResourceValue } from '../utils/common';
import './Gauges.css';

// Namespace colours, in this fixed order. Base palette tokens on purpose: unlike the
// --pf-t--chart--color--* tokens, which PatternFly remaps in dark mode, these resolve to the
// same colours in both themes, and that exact set was checked with a colour-vision-deficiency
// validator against the light and dark card surfaces. Only four PatternFly hues pass (teal reads
// as grey; green/yellow/orange collapse for deuteranopes), so further namespaces reuse them
// with a fill pattern on top: solid, then stripes, then grid, then dots.
const NAMESPACE_COLORS = [
  'var(--pf-t--color--blue--40)',
  'var(--pf-t--color--green--50)',
  'var(--pf-t--color--purple--40)',
  'var(--pf-t--color--orange--50)',
];
const PATTERN_COUNT = 4;
const MAX_NAMED_SERIES = NAMESPACE_COLORS.length * PATTERN_COUNT;
/** Tooltip lines listed for a grouped segment before the rest are summarised. */
const MAX_BREAKDOWN_LINES = 12;

type SeriesKind = 'namespace' | 'other' | 'outside';

interface Series {
  key: string;
  label: string;
  kind: SeriesKind;
  color?: string;
  /** 0 = solid; 1–3 = the stripes / grid / dots overlays. */
  pattern?: number;
  /** Namespaces that make up this series (one for a named namespace). */
  namespaces: string[];
}

function seriesStyle(series: Series): CSSProperties | undefined {
  return series.color ? { backgroundColor: series.color } : undefined;
}

function seriesClass(series: Series, base: string): string {
  if (series.kind === 'other') return `${base} ${base}--other`;
  if (series.kind === 'outside') return `${base} ${base}--outside`;
  return series.pattern
    ? `${base} console-plugin-capsule__stack-pattern--${String(series.pattern)}`
    : base;
}

/**
 * One stacked horizontal bar per quota resource: the whole bar is the hard limit, each segment
 * one namespace's usage and the empty remainder is what's still free. Namespace colours are
 * fixed per quota (not per bar), so a namespace looks the same in every resource's bar.
 *
 * The 16 namespaces using the most get their own segment; any beyond that are grouped into
 * "Other namespaces", whose tooltip lists them individually.
 */
export function QuotaStackedBars({
  grq,
  tenantNamespaces,
}: {
  grq: GlobalResourceQuota;
  /**
   * When viewing one tenant: its namespaces. Usage from any other namespaces is then shown as a
   * single "Outside this tenant" segment. Omit to show every namespace.
   */
  tenantNamespaces?: Set<string>;
}) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const hard = grq.status?.total?.hard ?? grq.spec.quota.hard;
  const resources = Object.keys(hard);
  const usage = grq.status?.namespaceUsage ?? {};

  if (resources.length === 0) {
    return <span>{t('No resource limits defined.')}</span>;
  }

  const share = (ns: string, resource: string): number => {
    const hardNum = parseResourceValue(hard[resource]);
    const used = usage[ns].used?.[resource];
    return hardNum > 0 && used !== undefined ? parseResourceValue(used) / hardNum : 0;
  };
  // Rank namespaces by their overall share of the quota, so the plain colours (and the named
  // slots) go to the namespaces that matter most; ties fall back to name for a stable order.
  const weight = (ns: string) => resources.reduce((sum, r) => sum + share(ns, r), 0);
  const isOwn = (ns: string) => !tenantNamespaces || tenantNamespaces.has(ns);
  const ownUsers = Object.keys(usage)
    .filter((ns) => isOwn(ns) && weight(ns) > 0)
    .sort((a, b) => weight(b) - weight(a) || a.localeCompare(b));
  const outsideUsers = Object.keys(usage).filter((ns) => !isOwn(ns) && weight(ns) > 0);

  const series: Series[] = ownUsers.slice(0, MAX_NAMED_SERIES).map((ns, i) => ({
    key: ns,
    label: ns,
    kind: 'namespace',
    color: NAMESPACE_COLORS[i % NAMESPACE_COLORS.length],
    pattern: Math.floor(i / NAMESPACE_COLORS.length),
    namespaces: [ns],
  }));
  const rest = ownUsers.slice(MAX_NAMED_SERIES);
  if (rest.length > 0) {
    series.push({
      key: '__other',
      label: t('Other namespaces ({{number}})', { number: String(rest.length) }),
      kind: 'other',
      namespaces: rest,
    });
  }
  if (outsideUsers.length > 0) {
    series.push({
      key: '__outside',
      label: t('Outside this tenant'),
      kind: 'outside',
      namespaces: outsideUsers,
    });
  }

  const formatShare = (fraction: number) =>
    fraction > 0 && fraction < 0.01 ? '<1' : String(Math.round(fraction * 100));

  const tooltipFor = (s: Series, resource: string, fraction: number): ReactNode => {
    if (s.kind === 'namespace') {
      return t('{{name}}: {{used}} ({{pct}} % of the quota)', {
        name: s.label,
        used: String(usage[s.namespaces[0]].used?.[resource] ?? 0),
        pct: formatShare(fraction),
      });
    }
    // Grouped segment: the total, then each member's usage of this resource, largest first.
    const members = s.namespaces
      .filter((ns) => share(ns, resource) > 0)
      .sort((a, b) => share(b, resource) - share(a, resource));
    const hidden = members.length - MAX_BREAKDOWN_LINES;
    return (
      <div className="console-plugin-capsule__stack-tooltip">
        <div>
          {t('{{name}}: {{pct}} % of the quota', { name: s.label, pct: formatShare(fraction) })}
        </div>
        <ul className="console-plugin-capsule__stack-tooltip-list">
          {members.slice(0, MAX_BREAKDOWN_LINES).map((ns) => (
            <li key={ns}>
              {t('{{name}}: {{used}} ({{pct}} %)', {
                name: ns,
                used: String(usage[ns].used?.[resource] ?? 0),
                pct: formatShare(share(ns, resource)),
              })}
            </li>
          ))}
          {hidden > 0 && <li>{t('and {{number}} more', { number: String(hidden) })}</li>}
        </ul>
      </div>
    );
  };

  return (
    <div className="console-plugin-capsule__stack">
      {series.length > 0 ? (
        <ul className="console-plugin-capsule__stack-legend" aria-label={t('Legend')}>
          {series.map((s) => (
            <li key={s.key} className="console-plugin-capsule__stack-legend-item">
              <span
                className={seriesClass(s, 'console-plugin-capsule__stack-swatch')}
                style={seriesStyle(s)}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : (
        <span className="console-plugin-capsule__muted-text">
          {t('Nothing is using this quota yet.')}
        </span>
      )}
      {resources.map((resource) => {
        const hardQ: Quantity = hard[resource];
        const usedQ = grq.status?.total?.used?.[resource] ?? 0;
        const availableQ = grq.status?.total?.available?.[resource];
        const totalShare = Object.keys(usage).reduce((sum, ns) => sum + share(ns, resource), 0);
        const segments = series
          .map((s) => ({
            series: s,
            fraction: s.namespaces.reduce((sum, ns) => sum + share(ns, resource), 0),
          }))
          .filter((seg) => seg.fraction > 0);
        const summary =
          availableQ !== undefined
            ? t('{{used}} of {{hard}} used, {{available}} free', {
                used: String(usedQ),
                hard: String(hardQ),
                available: String(availableQ),
              })
            : t('{{used}} of {{hard}} used', { used: String(usedQ), hard: String(hardQ) });

        return (
          <div key={resource} className="console-plugin-capsule__stack-row">
            <span className="console-plugin-capsule__stack-resource">{resource}</span>
            <div
              className="console-plugin-capsule__stack-bar"
              role="img"
              aria-label={`${resource}: ${summary}`}
            >
              {segments.map(({ series: s, fraction }) => (
                <Tooltip key={s.key} content={tooltipFor(s, resource, fraction)}>
                  <span
                    className={seriesClass(s, 'console-plugin-capsule__stack-segment')}
                    // Over-committed quotas can exceed 100 %; scale so the bar never overflows.
                    style={{
                      ...seriesStyle(s),
                      width: `${String((fraction / Math.max(1, totalShare)) * 100)}%`,
                    }}
                    tabIndex={0}
                    aria-label={t('{{name}}: {{pct}} % of the quota', {
                      name: s.label,
                      pct: formatShare(fraction),
                    })}
                  />
                </Tooltip>
              ))}
              {totalShare < 1 && <span className="console-plugin-capsule__stack-free" />}
            </div>
            <span className="console-plugin-capsule__stack-summary">{summary}</span>
          </div>
        );
      })}
    </div>
  );
}
