import { isLabelValue, isQualifiedName } from './k8sValidation';

describe('isQualifiedName', () => {
  it.each([
    ['app', true],
    ['example.com/app', true],
    ['app.kubernetes.io/part-of', true],
    ['A_b.c', true],
    ['', false],
    ['-app', false],
    ['a/b/c', false],
    ['/app', false],
    ['Example.com/app', false],
    ['has space', false],
    ['a'.repeat(64), false],
  ])('%s → %s', (key, ok) => {
    expect(isQualifiedName(key)).toBe(ok);
  });
});

describe('isLabelValue', () => {
  it.each([
    ['', true],
    ['true', true],
    ['CC-1234', true],
    ['a.b_c-d', true],
    ['-x', false],
    ['x-', false],
    ['has space', false],
    ['a:b', false],
    ['a'.repeat(64), false],
  ])('%p → %s', (value, ok) => {
    expect(isLabelValue(value)).toBe(ok);
  });
});
