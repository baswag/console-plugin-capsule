import { readFileSync } from 'fs';
import * as path from 'path';
import { isSafeRelativePath, parseIndex, parseManifest, widgetsForSlot } from './manifest';
import { ADDON_API_VERSION } from './types';

const base = 'https://console.example/api/plugins/console-plugin-capsule/addons/platform/';

const manifest = (widgets: unknown[]) => ({ apiVersion: ADDON_API_VERSION, widgets });

describe('parseManifest', () => {
  it('accepts valid widgets and attaches addon metadata', () => {
    const { widgets, errors } = parseManifest(
      'platform',
      base,
      manifest([
        { type: 'labelToggle', id: 'backup', slot: 'namespace.detail', key: 'example.com/backup' },
        {
          type: 'labelValue',
          id: 'expiry',
          slot: 'tenant.row',
          key: 'example.com/expires',
          format: { type: 'date', input: 'YYYYMMDD', display: { dateStyle: 'short' } },
          warnDays: 14,
        },
        { type: 'module', id: 'custom', slot: 'namespace.detail', module: 'index.js' },
      ]),
    );
    expect(errors).toEqual([]);
    expect(widgets.map((w) => [w.addon, w.id, w.baseUrl])).toEqual([
      ['platform', 'backup', base],
      ['platform', 'expiry', base],
      ['platform', 'custom', base],
    ]);
    expect(widgetsForSlot(widgets, 'tenant.row').map((w) => w.id)).toEqual(['expiry']);
  });

  it('drops invalid widgets but keeps the valid ones', () => {
    const { widgets, errors } = parseManifest(
      'platform',
      base,
      manifest([
        { type: 'labelToggle', id: 'ok', slot: 'namespace.detail', key: 'a' },
        { type: 'labelToggle', id: 'ok', slot: 'namespace.detail', key: 'b' },
        { type: 'labelToggle', id: 'nokey', slot: 'namespace.detail' },
        { type: 'labelToggle', id: 'badslot', slot: 'nowhere', key: 'a' },
        { type: 'fancy', id: 'badtype', slot: 'namespace.detail' },
        { type: 'module', id: 'escape', slot: 'namespace.detail', module: '../other/index.js' },
        {
          type: 'labelValue',
          id: 'badtz',
          slot: 'tenant.row',
          key: 'a',
          format: { type: 'date', timezone: 'Europe/Berlin' },
        },
        {
          type: 'labelToggle',
          id: 'badicon',
          slot: 'namespace.detail',
          key: 'a',
          icon: 'https://evil/x.svg',
        },
        { type: 'labelToggle', id: 'badro', slot: 'namespace.detail', key: 'a', readOnly: 'yes' },
      ]),
    );
    expect(widgets.map((w) => w.id)).toEqual(['ok']);
    expect(errors).toEqual([
      'widget ok: duplicate id',
      'widget nokey: missing "key"',
      'widget badslot: unknown slot "nowhere"',
      'widget badtype: unknown type "fancy"',
      'widget escape: "module" must be a relative path inside the addon',
      'widget badtz: "format.timezone" must be "UTC" or "local"',
      'widget badicon: "icon" must be "pf:<name>" or a relative path inside the addon',
      'widget badro: "readOnly" must be a boolean',
    ]);
  });

  it('validates match, iconMode and per-state icons', () => {
    const toggle = { type: 'labelToggle', slot: 'namespace.detail', key: 'a' };
    const { widgets, errors } = parseManifest(
      'platform',
      base,
      manifest([
        {
          ...toggle,
          id: 'ok',
          match: 'exists',
          iconMode: 'mask',
          icon: { on: 'on.svg', off: 'pf:lock' },
        },
        { ...toggle, id: 'onlyon', icon: { on: 'on.svg' } },
        { ...toggle, id: 'badmatch', match: 'regex' },
        { ...toggle, id: 'existsoff', match: 'exists', offValue: 'no' },
        { ...toggle, id: 'badmode', iconMode: 'svg' },
        { ...toggle, id: 'emptyicons', icon: {} },
        { ...toggle, id: 'badstate', icon: { off: '../x.svg' } },
        {
          type: 'labelValue',
          id: 'valueicons',
          slot: 'tenant.row',
          key: 'a',
          icon: { on: 'x.svg' },
        },
      ]),
    );
    expect(widgets.map((w) => w.id)).toEqual(['ok', 'onlyon']);
    expect(errors).toEqual([
      'widget badmatch: "match" must be "value" or "exists"',
      'widget existsoff: "offValue" can\'t be combined with "match": "exists"',
      'widget badmode: "iconMode" must be "image" or "mask"',
      'widget emptyicons: "icon" needs "on" and/or "off"',
      'widget badstate: "icon.off" must be "pf:<name>" or a relative path inside the addon',
      'widget valueicons: "icon" must be a string',
    ]);
  });

  it('rejects unknown apiVersions', () => {
    const { widgets, errors } = parseManifest('platform', base, { apiVersion: 'v0', widgets: [] });
    expect(widgets).toEqual([]);
    expect(errors[0]).toMatch(/unsupported apiVersion/);
  });
});

describe('parseIndex', () => {
  it('keeps valid, unique addon names', () => {
    expect(parseIndex({ addons: ['a', 'b-1', 'a', 'Bad', '../x', 3] })).toEqual({
      addons: ['a', 'b-1'],
      errors: ['invalid addon name "Bad"', 'invalid addon name "../x"', 'invalid addon name 3'],
    });
  });

  it('reports a malformed index', () => {
    expect(parseIndex(['a']).addons).toEqual([]);
  });
});

describe('isSafeRelativePath', () => {
  it.each([
    ['icon.svg', true],
    ['img/icon.svg', true],
    ['/etc/passwd', false],
    ['../x.js', false],
    ['a/../../x.js', false],
    ['https://example.com/x.js', false],
    ['', false],
  ])('%s → %s', (p, ok) => {
    expect(isSafeRelativePath(p)).toBe(ok);
  });
});

describe('examples/addons', () => {
  const dir = path.resolve(__dirname, '../../examples/addons');
  const readJSON = (file: string): unknown =>
    JSON.parse(readFileSync(path.join(dir, file), 'utf-8'));

  it('has only valid manifests', () => {
    const { addons, errors } = parseIndex(readJSON('index.json'));
    expect(errors).toEqual([]);
    for (const addon of addons) {
      expect(parseManifest(addon, base, readJSON(`${addon}/manifest.json`)).errors).toEqual([]);
    }
  });
});
