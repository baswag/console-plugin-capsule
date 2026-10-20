import type { DateDisplayFormat, DateFormat } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_RE = /YYYY|MM|DD|HH|mm|ss/g;

type Timezone = NonNullable<DateFormat['timezone']>;

interface Parts {
  YYYY: number;
  MM: number;
  DD: number;
  HH: number;
  mm: number;
  ss: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fromParts(p: Parts, tz: Timezone): Date | null {
  const date =
    tz === 'local'
      ? new Date(p.YYYY, p.MM - 1, p.DD, p.HH, p.mm, p.ss)
      : new Date(Date.UTC(p.YYYY, p.MM - 1, p.DD, p.HH, p.mm, p.ss));
  // Reject overflowing values like 2026-02-31 instead of silently rolling them over.
  const back = toParts(date, tz);
  return (Object.keys(p) as (keyof Parts)[]).every((k) => back[k] === p[k]) ? date : null;
}

function toParts(d: Date, tz: Timezone): Parts {
  return tz === 'local'
    ? {
        YYYY: d.getFullYear(),
        MM: d.getMonth() + 1,
        DD: d.getDate(),
        HH: d.getHours(),
        mm: d.getMinutes(),
        ss: d.getSeconds(),
      }
    : {
        YYYY: d.getUTCFullYear(),
        MM: d.getUTCMonth() + 1,
        DD: d.getUTCDate(),
        HH: d.getUTCHours(),
        mm: d.getUTCMinutes(),
        ss: d.getUTCSeconds(),
      };
}

/**
 * Parse a label/annotation value. `input` is a token pattern (`YYYY`, `MM`, `DD`, `HH`, `mm`,
 * `ss`; everything else is a literal), `"unix"` (seconds since epoch) or `"iso"` (anything
 * `Date.parse` accepts). Returns `null` for values that don't match.
 */
export function parseDate(value: string, input = 'YYYY-MM-DD', tz: Timezone = 'UTC'): Date | null {
  const v = value.trim();
  if (input === 'unix') {
    if (!/^\d+$/.test(v)) return null;
    return new Date(Number(v) * 1000);
  }
  if (input === 'iso') {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : new Date(ms);
  }

  const tokens: (keyof Parts)[] = [];
  let source = '';
  let last = 0;
  const tokenRe = new RegExp(TOKEN_RE.source, 'g');
  for (let m = tokenRe.exec(input); m; m = tokenRe.exec(input)) {
    source += escapeRegExp(input.slice(last, m.index));
    source += m[0] === 'YYYY' ? '(\\d{4})' : '(\\d{2})';
    tokens.push(m[0] as keyof Parts);
    last = m.index + m[0].length;
  }
  source += escapeRegExp(input.slice(last));
  const match = new RegExp(`^${source}$`).exec(v);
  if (!match) return null;

  const parts: Parts = { YYYY: 1970, MM: 1, DD: 1, HH: 0, mm: 0, ss: 0 };
  tokens.forEach((tok, i) => {
    parts[tok] = Number(match[i + 1]);
  });
  return fromParts(parts, tz);
}

/** Whole calendar days from `now` until `date` (negative once the day has passed). */
export function daysUntil(date: Date, now: Date, tz: Timezone = 'UTC'): number {
  const dayIndex = (d: Date) => {
    const p = toParts(d, tz);
    return Math.round(Date.UTC(p.YYYY, p.MM - 1, p.DD) / DAY_MS);
  };
  return dayIndex(date) - dayIndex(now);
}

export function formatDate(
  date: Date,
  display: DateDisplayFormat = { dateStyle: 'medium' },
  options: { language?: string; tz?: Timezone; now?: Date } = {},
): string {
  const tz = options.tz ?? 'UTC';
  if (display === 'relative') {
    const rtf = new Intl.RelativeTimeFormat(options.language, { numeric: 'auto' });
    return rtf.format(daysUntil(date, options.now ?? new Date(), tz), 'day');
  }
  if (typeof display === 'string') {
    const p = toParts(date, tz);
    return display.replace(TOKEN_RE, (tok) =>
      String(p[tok as keyof Parts]).padStart(tok === 'YYYY' ? 4 : 2, '0'),
    );
  }
  return new Intl.DateTimeFormat(options.language, {
    ...display,
    ...(tz === 'UTC' ? { timeZone: 'UTC' } : {}),
  }).format(date);
}
