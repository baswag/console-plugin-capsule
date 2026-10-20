import { interpolate, localize } from './text';

describe('localize', () => {
  const text = { en: 'Backup', de: 'Sicherung', 'de-AT': 'Sicherung (AT)' };

  it('prefers the exact language, then the base language, then English', () => {
    expect(localize(text, 'de-AT')).toBe('Sicherung (AT)');
    expect(localize(text, 'de-CH')).toBe('Sicherung');
    expect(localize(text, 'fr')).toBe('Backup');
    expect(localize({ ja: 'バックアップ' }, 'fr')).toBe('バックアップ');
  });

  it('passes plain strings through', () => {
    expect(localize('Backup', 'de')).toBe('Backup');
    expect(localize(undefined, 'de')).toBeUndefined();
  });
});

describe('interpolate', () => {
  it('replaces known placeholders and leaves unknown ones', () => {
    expect(interpolate('{{ name }} expires {{value}} {{other}}', { name: 'ns', value: 3 })).toBe(
      'ns expires 3 {{other}}',
    );
  });
});
