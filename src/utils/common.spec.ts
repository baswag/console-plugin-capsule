import {
  formatQuantity,
  isCountResource,
  parseResourceValue,
  readyConditionStatus,
} from './common';

describe('formatQuantity', () => {
  it('returns an em dash when no quantity is given', () => {
    expect(formatQuantity(undefined)).toBe('—');
  });

  it('joins each resource and value', () => {
    expect(formatQuantity({ cpu: '2', memory: '4Gi' })).toBe('cpu: 2, memory: 4Gi');
  });
});

describe('readyConditionStatus', () => {
  it('returns undefined when there are no conditions', () => {
    expect(readyConditionStatus(undefined)).toBeUndefined();
  });

  it('returns the status of the Ready condition', () => {
    expect(
      readyConditionStatus([
        {
          type: 'Ready',
          status: 'True',
          reason: 'Reconciled',
          message: '',
          lastTransitionTime: '2024-01-01T00:00:00Z',
        },
      ]),
    ).toBe('True');
  });
});

describe('parseResourceValue', () => {
  it('parses plain numbers', () => {
    expect(parseResourceValue('4')).toBe(4);
  });

  it('parses milli values', () => {
    expect(parseResourceValue('500m')).toBe(0.5);
  });

  it('parses binary suffixes up to exabytes', () => {
    expect(parseResourceValue('1Ki')).toBe(1024);
    expect(parseResourceValue('1Pi')).toBe(1024 ** 5);
    expect(parseResourceValue('1Ei')).toBe(1024 ** 6);
  });

  it('parses decimal suffixes up to exabytes', () => {
    expect(parseResourceValue('1P')).toBe(1000 ** 5);
    expect(parseResourceValue('1E')).toBe(1000 ** 6);
  });
});

describe('isCountResource', () => {
  it('treats plain resource names as count resources', () => {
    expect(isCountResource('pods')).toBe(true);
  });

  it('treats dotted compute resources as percentage resources', () => {
    expect(isCountResource('limits.cpu')).toBe(false);
  });

  it('treats count/ object-count quotas as count resources even with a dot', () => {
    expect(isCountResource('count/deployments.apps')).toBe(true);
  });
});
