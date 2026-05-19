export interface UsageGaugeProps {
  resource: string;
  used: string | undefined;
  hard: string | undefined;
}

function parseResourceValue(val: string): number {
  if (!val) return 0;
  const s = val.trim();
  if (s.endsWith('m')) return parseFloat(s) / 1000;
  if (s.endsWith('Ki')) return parseFloat(s) * 1024;
  if (s.endsWith('Mi')) return parseFloat(s) * 1024 ** 2;
  if (s.endsWith('Gi')) return parseFloat(s) * 1024 ** 3;
  if (s.endsWith('Ti')) return parseFloat(s) * 1024 ** 4;
  if (s.endsWith('K')) return parseFloat(s) * 1000;
  if (s.endsWith('M')) return parseFloat(s) * 1000 ** 2;
  if (s.endsWith('G')) return parseFloat(s) * 1000 ** 3;
  if (s.endsWith('T')) return parseFloat(s) * 1000 ** 4;
  return parseFloat(s) || 0;
}

export function UsageGauge({ resource, used, hard }: UsageGaugeProps) {
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
      ? 'var(--pf-v5-global--danger-color--100)'
      : pct > 70
        ? 'var(--pf-v5-global--warning-color--100)'
        : 'var(--pf-v5-global--info-color--100)';

  return (
    <div className="console-plugin-capsule__gauge">
      <span className="console-plugin-capsule__gauge-title">{resource}</span>
      <div className="console-plugin-capsule__gauge-ring">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            style={{
              fill: 'none',
              stroke: 'var(--pf-v5-global--BorderColor--100)',
              strokeWidth: `${strokeWidth}`,
            }}
          />
          {pct > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              style={{
                fill: 'none',
                stroke: strokeColor,
                strokeWidth: `${strokeWidth}`,
                strokeDasharray: `${progressLen} ${circumference}`,
                strokeLinecap: 'round',
              }}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )}
        </svg>
        <div className="console-plugin-capsule__gauge-center">
          <span className="console-plugin-capsule__gauge-pct">{pct}&nbsp;%</span>
          <span className="console-plugin-capsule__gauge-used-label">used</span>
        </div>
      </div>
      <span className="console-plugin-capsule__gauge-subtext">
        {used ?? '0'} of {hard ?? '0'}
      </span>
    </div>
  );
}
