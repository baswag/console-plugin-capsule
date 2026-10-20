import type { LocalizedText } from './types';

/**
 * Pick the best match for `language` (e.g. `de-AT` → `de-AT`, `de`, then `en`, then the first
 * entry) from a localized manifest string.
 */
export function localize(text: LocalizedText | undefined, language: string): string | undefined {
  if (text === undefined || typeof text === 'string') return text;
  const map = text as Partial<Record<string, string>>;
  const base = language.split('-')[0];
  return map[language] ?? map[base] ?? map.en ?? Object.values(map)[0];
}

/** Replace `{{var}}` placeholders; unknown placeholders are left as-is. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function renderText(
  text: LocalizedText | undefined,
  language: string,
  vars: Record<string, string | number>,
): string | undefined {
  const s = localize(text, language);
  return s === undefined ? undefined : interpolate(s, vars);
}
