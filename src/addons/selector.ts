import type { LabelSelector, LoadedWidget } from './types';

const OPERATORS = ['In', 'NotIn', 'Exists', 'DoesNotExist'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Kubernetes label selector semantics: every `matchLabels` entry and expression must hold. */
export function matchesSelector(
  selector: LabelSelector | undefined,
  labels: Record<string, string> | undefined,
): boolean {
  if (!selector) return true;
  const l = labels ?? {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(l, key);
  const labelsMatch = Object.entries(selector.matchLabels ?? {}).every(
    ([key, value]) => has(key) && l[key] === value,
  );
  return (
    labelsMatch &&
    (selector.matchExpressions ?? []).every(({ key, operator, values = [] }) => {
      switch (operator) {
        case 'In':
          return has(key) && values.includes(l[key]);
        // Like Kubernetes: a missing label is "not in" any set.
        case 'NotIn':
          return !has(key) || !values.includes(l[key]);
        case 'Exists':
          return has(key);
        case 'DoesNotExist':
          return !has(key);
      }
    })
  );
}

/** Returns an error message for an invalid selector, or `null`. */
export function selectorError(v: unknown): string | null {
  if (!isRecord(v)) return 'must be an object';
  const { matchLabels, matchExpressions } = v;
  if (matchLabels === undefined && matchExpressions === undefined) {
    return 'needs "matchLabels" and/or "matchExpressions"';
  }
  if (matchLabels !== undefined) {
    if (!isRecord(matchLabels) || !Object.values(matchLabels).every((x) => typeof x === 'string')) {
      return '"matchLabels" must map label keys to string values';
    }
  }
  if (matchExpressions !== undefined) {
    if (!Array.isArray(matchExpressions)) return '"matchExpressions" must be an array';
    for (let i = 0; i < matchExpressions.length; i++) {
      const e: unknown = matchExpressions[i];
      const at = `"matchExpressions[${String(i)}]"`;
      if (!isRecord(e) || typeof e.key !== 'string' || !e.key) return `${at} needs a "key"`;
      if (!(OPERATORS as readonly unknown[]).includes(e.operator)) {
        return `${at}: "operator" must be one of ${OPERATORS.join(', ')}`;
      }
      const values = e.values;
      if (
        values !== undefined &&
        (!Array.isArray(values) || !values.every((x) => typeof x === 'string'))
      ) {
        return `${at}: "values" must be a list of strings`;
      }
      const hasValues = Array.isArray(values) && values.length > 0;
      if ((e.operator === 'In' || e.operator === 'NotIn') && !hasValues) {
        return `${at}: "${e.operator}" needs at least one value`;
      }
      if ((e.operator === 'Exists' || e.operator === 'DoesNotExist') && hasValues) {
        return `${at}: "${e.operator}" takes no values`;
      }
    }
  }
  return null;
}

/**
 * Widgets to render for an object: those whose `when` matches its labels, plus toggles that
 * stay visible (disabled) when it doesn't.
 */
export function visibleWidgets(
  widgets: LoadedWidget[],
  labels: Record<string, string> | undefined,
): LoadedWidget[] {
  return widgets.filter(
    (w) =>
      (w.type === 'labelToggle' && w.whenNotMatched === 'disable') ||
      matchesSelector(w.when, labels),
  );
}
