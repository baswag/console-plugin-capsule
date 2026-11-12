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

  it('validates when and whenNotMatched', () => {
    const toggle = { type: 'labelToggle', slot: 'namespace.detail', key: 'a' };
    const when = { matchLabels: { tier: 'premium' } };
    const { widgets, errors } = parseManifest(
      'platform',
      base,
      manifest([
        { ...toggle, id: 'ok', when, whenNotMatched: 'disable' },
        { type: 'labelValue', id: 'value', slot: 'tenant.row', key: 'a', when },
        { ...toggle, id: 'badwhen', when: { matchExpressions: [{ key: 'a', operator: 'In' }] } },
        { ...toggle, id: 'badmode', when, whenNotMatched: 'grey' },
        {
          type: 'labelValue',
          id: 'valuedisable',
          slot: 'tenant.row',
          key: 'a',
          when,
          whenNotMatched: 'disable',
        },
      ]),
    );
    expect(widgets.map((w) => w.id)).toEqual(['ok', 'value']);
    expect(errors).toEqual([
      'widget badwhen: "when" "matchExpressions[0]": "In" needs at least one value',
      'widget badmode: "whenNotMatched" must be "hide" or "disable"',
      'widget valuedisable: "whenNotMatched" is only supported for labelToggle',
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

describe('createNamespace widgets', () => {
  const create = { type: 'createNamespace', slot: 'namespaces.toolbar', text: 'Create sandbox' };

  it('accepts preset and input labels/annotations', () => {
    const { widgets, errors } = parseManifest(
      'platform',
      base,
      manifest([
        {
          ...create,
          id: 'sandbox',
          variant: 'primary',
          icon: 'pf:cube',
          description: { en: 'For {{tenant}}', de: 'Für {{tenant}}' },
          honorGlobalForceTenantPrefix: false,
          prefix: 'sbx-{{tenant}}-',
          labels: [
            { key: 'platform.example.com/sandbox', value: 'true' },
            { key: 'owner', value: '{{tenant}}' },
            { key: 'cost-center', title: 'Cost center', example: 'CC-1234', required: true },
          ],
          annotations: [
            { key: 'example.com/purpose', title: { en: 'Purpose' }, help: 'Free text' },
            { key: 'example.com/created-via', value: 'Created via console: sandbox' },
          ],
        },
      ]),
    );
    expect(errors).toEqual([]);
    expect(widgetsForSlot(widgets, 'namespaces.toolbar').map((w) => w.id)).toEqual(['sandbox']);
  });

  it('rejects invalid definitions', () => {
    const { widgets, errors } = parseManifest(
      'platform',
      base,
      manifest([
        { ...create, id: 'wrongslot', slot: 'namespace.detail' },
        { type: 'labelToggle', id: 'toggleintoolbar', slot: 'namespaces.toolbar', key: 'a' },
        { type: 'createNamespace', id: 'notext', slot: 'namespaces.toolbar' },
        { ...create, id: 'badvariant', variant: 'danger' },
        { ...create, id: 'badhonor', honorGlobalForceTenantPrefix: 'yes' },
        { ...create, id: 'badprefix', prefix: 'Sandbox_' },
        { ...create, id: 'badkey', labels: [{ key: 'not a key', value: 'x' }] },
        {
          ...create,
          id: 'tenantlabel',
          labels: [{ key: 'capsule.clastix.io/tenant', value: 'x' }],
        },
        { ...create, id: 'badvalue', labels: [{ key: 'a', value: 'has spaces' }] },
        { ...create, id: 'baddefault', labels: [{ key: 'a', title: 'A', default: '-x' }] },
        { ...create, id: 'both', labels: [{ key: 'a', value: 'x', title: 'A' }] },
        { ...create, id: 'neither', annotations: [{ key: 'a' }] },
        {
          ...create,
          id: 'dup',
          annotations: [
            { key: 'a', value: '1' },
            { key: 'a', value: '2' },
          ],
        },
        { ...create, id: 'presetextra', labels: [{ key: 'a', value: 'x', required: true }] },
        { ...create, id: 'okannotation', annotations: [{ key: 'a', value: 'any value: ok' }] },
      ]),
    );
    expect(widgets.map((w) => w.id)).toEqual(['okannotation']);
    expect(errors).toEqual([
      'widget wrongslot: "createNamespace" needs slot "namespaces.toolbar"',
      'widget toggleintoolbar: slot "namespaces.toolbar" only supports "createNamespace" widgets',
      'widget notext: missing "text"',
      'widget badvariant: "variant" must be "primary" or "secondary"',
      'widget badhonor: "honorGlobalForceTenantPrefix" must be a boolean',
      'widget badprefix: "prefix" must be the start of a valid namespace name (lowercase letters, digits and "-", starting with a letter or digit)',
      'widget badkey: "labels[0]": "key" must be a valid label key',
      'widget tenantlabel: "labels[0]": "capsule.clastix.io/tenant" is set by the plugin',
      'widget badvalue: "labels[0]": "value" is not a valid label value',
      'widget baddefault: "labels[0]": "default" is not a valid label value',
      'widget both: "labels[0]" needs either "value" (preset, hidden) or "title" (shown to the user)',
      'widget neither: "annotations[0]" needs either "value" (preset, hidden) or "title" (shown to the user)',
      'widget dup: "annotations[1]": duplicate key "a"',
      'widget presetextra: "labels[0]": "required" only applies to fields with a "title"',
    ]);
  });
});
