import { daysUntil, formatDate, parseDate } from './dateFormat';

describe('parseDate', () => {
  it('parses the default YYYY-MM-DD pattern as UTC', () => {
    expect(parseDate('2026-12-31')?.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it.each([
    ['20261231', 'YYYYMMDD', '2026-12-31T00:00:00.000Z'],
    ['31.12.2026', 'DD.MM.YYYY', '2026-12-31T00:00:00.000Z'],
    ['2026-12-31_23-59', 'YYYY-MM-DD_HH-mm', '2026-12-31T23:59:00.000Z'],
    ['1798675200', 'unix', '2026-12-31T00:00:00.000Z'],
    ['2026-12-31T10:00:00+02:00', 'iso', '2026-12-31T08:00:00.000Z'],
  ])('parses %s with %s', (value, input, expected) => {
    expect(parseDate(value, input)?.toISOString()).toBe(expected);
  });

  it.each([
    ['2026-02-31', 'YYYY-MM-DD'],
    ['2026-13-01', 'YYYY-MM-DD'],
    ['2026-12-31', 'DD.MM.YYYY'],
    ['26-12-31', 'YYYY-MM-DD'],
    ['soon', 'unix'],
    ['not a date', 'iso'],
  ])('rejects %s for %s', (value, input) => {
    expect(parseDate(value, input)).toBeNull();
  });

  it('treats regex characters in the pattern literally', () => {
    expect(parseDate('2026x12x31', 'YYYY.MM.DD')).toBeNull();
  });
});

describe('formatDate', () => {
  const date = new Date('2026-03-05T07:08:09Z');

  it('formats token patterns', () => {
    expect(formatDate(date, 'DD.MM.YYYY HH:mm:ss')).toBe('05.03.2026 07:08:09');
  });

  it('formats with Intl options in UTC', () => {
    expect(
      formatDate(date, { year: 'numeric', month: 'long', day: 'numeric' }, { language: 'en-US' }),
    ).toBe('March 5, 2026');
  });

  it('formats relative to now', () => {
    const now = new Date('2026-03-02T23:00:00Z');
    expect(formatDate(date, 'relative', { language: 'en', now })).toBe('in 3 days');
    expect(formatDate(now, 'relative', { language: 'en', now })).toBe('today');
  });
});

describe('daysUntil', () => {
  it('counts calendar days, independent of the time of day', () => {
    const expiry = new Date('2026-10-25T00:00:00Z');
    expect(daysUntil(expiry, new Date('2026-10-20T23:59:00Z'))).toBe(5);
    expect(daysUntil(expiry, new Date('2026-10-25T12:00:00Z'))).toBe(0);
    expect(daysUntil(expiry, new Date('2026-10-26T00:00:01Z'))).toBe(-1);
  });
});
