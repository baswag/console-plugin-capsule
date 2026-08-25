import { useTranslation } from 'react-i18next';
import type { GlobalResourceQuotaCondition, ResourceQuantity, Tenant } from './capsule';

export function tenantNamespaceCount(status: Tenant['status']): number {
  return status?.size ?? status?.namespaces?.length ?? 0;
}

export function grqNamespaceCount(
  status: { namespaceCount?: number; namespaces?: string[] } | undefined,
): number {
  return status?.namespaceCount ?? status?.namespaces?.length ?? 0;
}

export function formatQuantity(q: ResourceQuantity | undefined): string {
  if (!q) return '—';
  return Object.entries(q)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

export function readyConditionStatus(
  conditions: GlobalResourceQuotaCondition[] | undefined,
): GlobalResourceQuotaCondition['status'] | undefined {
  return conditions?.find((c) => c.type === 'Ready')?.status;
}

export interface UsageGaugeProps {
  resource: string;
  used: string | undefined;
  hard: string | undefined;
}

export function parseResourceValue(val: string): number {
  if (!val) return 0;
  const s = val.trim();
  if (s.endsWith('m')) return parseFloat(s) / 1000;
  if (s.endsWith('Ki')) return parseFloat(s) * 1024;
  if (s.endsWith('Mi')) return parseFloat(s) * 1024 ** 2;
  if (s.endsWith('Gi')) return parseFloat(s) * 1024 ** 3;
  if (s.endsWith('Ti')) return parseFloat(s) * 1024 ** 4;
  if (s.endsWith('Pi')) return parseFloat(s) * 1024 ** 5;
  if (s.endsWith('Ei')) return parseFloat(s) * 1024 ** 6;
  if (s.endsWith('K')) return parseFloat(s) * 1000;
  if (s.endsWith('M')) return parseFloat(s) * 1000 ** 2;
  if (s.endsWith('G')) return parseFloat(s) * 1000 ** 3;
  if (s.endsWith('T')) return parseFloat(s) * 1000 ** 4;
  if (s.endsWith('P')) return parseFloat(s) * 1000 ** 5;
  if (s.endsWith('E')) return parseFloat(s) * 1000 ** 6;
  return parseFloat(s) || 0;
}

// Object-count quotas (count/pods, count/deployments.apps, etc.) are count resources shown
// as "X of Y", even when the resource name itself contains a dot. Everything else with a dot
// (limits.cpu, requests.memory, etc.) is a compute resource shown as a percentage.
export function isCountResource(resource: string): boolean {
  if (resource.startsWith('count/')) return true;
  return !resource.includes('.');
}

export function UsageGauge({ resource, used, hard }: UsageGaugeProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const usedNum = parseResourceValue(used ?? '0');
  const hardNum = parseResourceValue(hard ?? '0');
  const pct = hardNum > 0 ? Math.min(100, Math.round((usedNum / hardNum) * 100)) : 0;

  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 52;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * r;
  const progressLen = (pct / 100) * circumference;

  const strokeColor =
    pct > 90
      ? 'var(--pf-t--global--color--status--danger--default)'
      : pct > 70
        ? 'var(--pf-t--global--color--status--warning--default)'
        : 'var(--pf-t--global--color--status--info--default)';

  const count = isCountResource(resource);
  const usedOfHard = t('{{used}} of {{hard}}', { used: used ?? '0', hard: hard ?? '0' });
  const centerLabel = count ? usedOfHard : t('{{pct}} %', { pct });

  return (
    <div className="console-plugin-capsule__gauge">
      <span className="console-plugin-capsule__gauge-title">{resource}</span>
      <div className="console-plugin-capsule__gauge-ring">
        <svg width={size} height={size} viewBox={`0 0 ${String(size)} ${String(size)}`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            strokeWidth={strokeWidth}
            className="console-plugin-capsule__gauge-track"
          />
          {pct > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              strokeWidth={strokeWidth}
              className="console-plugin-capsule__gauge-progress"
              style={{
                stroke: strokeColor,
                strokeDasharray: `${String(progressLen)} ${String(circumference)}`,
              }}
              transform={`rotate(-90 ${String(cx)} ${String(cy)})`}
            />
          )}
        </svg>
        <div className="console-plugin-capsule__gauge-center">
          <span className="console-plugin-capsule__gauge-pct">{centerLabel}</span>
          <span className="console-plugin-capsule__gauge-used-label">{t('used')}</span>
        </div>
      </div>
      {!count && <span className="console-plugin-capsule__gauge-subtext">{usedOfHard}</span>}
    </div>
  );
}
