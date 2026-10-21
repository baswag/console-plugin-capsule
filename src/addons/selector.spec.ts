import { matchesSelector, selectorError, visibleWidgets } from './selector';
import type { LoadedWidget } from './types';

describe('matchesSelector', () => {
  const labels = { tier: 'premium', env: 'dev', empty: '' };

  it('matches everything without a selector', () => {
    expect(matchesSelector(undefined, undefined)).toBe(true);
  });

  it('requires every matchLabels entry', () => {
    expect(matchesSelector({ matchLabels: { tier: 'premium' } }, labels)).toBe(true);
    expect(matchesSelector({ matchLabels: { tier: 'premium', env: 'prod' } }, labels)).toBe(false);
    expect(matchesSelector({ matchLabels: { empty: '' } }, labels)).toBe(true);
    expect(matchesSelector({ matchLabels: { missing: '' } }, labels)).toBe(false);
  });

  it.each([
    ['In', ['dev', 'test'], 'env', true],
    ['In', ['prod'], 'env', false],
    ['In', ['dev'], 'missing', false],
    ['NotIn', ['prod'], 'env', true],
    ['NotIn', ['dev'], 'env', false],
    ['NotIn', ['dev'], 'missing', true],
    ['Exists', undefined, 'empty', true],
    ['Exists', undefined, 'missing', false],
    ['DoesNotExist', undefined, 'missing', true],
    ['DoesNotExist', undefined, 'env', false],
  ] as const)('%s %j on %s → %s', (operator, values, key, expected) => {
    expect(
      matchesSelector(
        { matchExpressions: [{ key, operator, values: values ? [...values] : undefined }] },
        labels,
      ),
    ).toBe(expected);
  });

  it('ANDs matchLabels and all expressions', () => {
    const selector = {
      matchLabels: { tier: 'premium' },
      matchExpressions: [{ key: 'legacy', operator: 'DoesNotExist' as const }],
    };
    expect(matchesSelector(selector, labels)).toBe(true);
    expect(matchesSelector(selector, { ...labels, legacy: 'true' })).toBe(false);
  });

  it('does not treat inherited object properties as labels', () => {
    expect(
      matchesSelector({ matchExpressions: [{ key: 'toString', operator: 'Exists' }] }, {}),
    ).toBe(false);
  });
});

describe('selectorError', () => {
  it.each([
    [{ matchLabels: { a: 'b' } }, null],
    [{ matchExpressions: [{ key: 'a', operator: 'Exists' }] }, null],
    ['x', 'must be an object'],
    [{}, 'needs "matchLabels" and/or "matchExpressions"'],
    [{ matchLabels: { a: 1 } }, '"matchLabels" must map label keys to string values'],
    [{ matchExpressions: {} }, '"matchExpressions" must be an array'],
    [{ matchExpressions: [{ operator: 'Exists' }] }, '"matchExpressions[0]" needs a "key"'],
    [
      { matchExpressions: [{ key: 'a', operator: 'Gt' }] },
      '"matchExpressions[0]": "operator" must be one of In, NotIn, Exists, DoesNotExist',
    ],
    [
      { matchExpressions: [{ key: 'a', operator: 'In' }] },
      '"matchExpressions[0]": "In" needs at least one value',
    ],
    [
      { matchExpressions: [{ key: 'a', operator: 'Exists', values: ['x'] }] },
      '"matchExpressions[0]": "Exists" takes no values',
    ],
    [
      { matchExpressions: [{ key: 'a', operator: 'In', values: [1] }] },
      '"matchExpressions[0]": "values" must be a list of strings',
    ],
  ])('%j → %s', (selector, expected) => {
    expect(selectorError(selector)).toBe(expected);
  });
});

describe('visibleWidgets', () => {
  const base = { slot: 'namespace.detail', key: 'k', addon: 'a', baseUrl: '/' } as const;
  const when = { matchLabels: { tier: 'premium' } };
  const widgets: LoadedWidget[] = [
    { ...base, type: 'labelToggle', id: 'always' },
    { ...base, type: 'labelToggle', id: 'hidden', when },
    { ...base, type: 'labelToggle', id: 'disabled', when, whenNotMatched: 'disable' },
    { ...base, type: 'labelValue', id: 'value', when },
  ];

  it('hides non-matching widgets unless they are disable-on-mismatch toggles', () => {
    expect(visibleWidgets(widgets, {}).map((w) => w.id)).toEqual(['always', 'disabled']);
    expect(visibleWidgets(widgets, { tier: 'premium' }).map((w) => w.id)).toEqual([
      'always',
      'hidden',
      'disabled',
      'value',
    ]);
  });
});
