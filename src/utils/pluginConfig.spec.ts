import { DEFAULT_PLUGIN_CONFIG, loadPluginConfig, parsePluginConfig } from './pluginConfig';

describe('parsePluginConfig', () => {
  it('reads forceTenantPrefix', () => {
    expect(parsePluginConfig({ forceTenantPrefix: true })).toEqual({
      ...DEFAULT_PLUGIN_CONFIG,
      forceTenantPrefix: true,
    });
  });

  it('reads showTenantResources', () => {
    expect(parsePluginConfig({ showTenantResources: false })).toEqual({
      ...DEFAULT_PLUGIN_CONFIG,
      showTenantResources: false,
    });
  });

  it('reads showTenantOwners', () => {
    expect(parsePluginConfig({ showTenantOwners: false })).toEqual({
      ...DEFAULT_PLUGIN_CONFIG,
      showTenantOwners: false,
    });
  });

  it('shows tenant owners by default', () => {
    expect(DEFAULT_PLUGIN_CONFIG.showTenantOwners).toBe(true);
  });

  it('shows Tenant Resources by default', () => {
    expect(DEFAULT_PLUGIN_CONFIG.showTenantResources).toBe(true);
  });

  it.each([
    null,
    'x',
    [],
    {},
    { forceTenantPrefix: 'true' },
    { showTenantResources: 'no' },
    { showTenantOwners: 0 },
  ])('falls back to defaults for %p', (raw) => {
    expect(parsePluginConfig(raw)).toEqual(DEFAULT_PLUGIN_CONFIG);
  });
});

describe('loadPluginConfig', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('loads config.json', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ forceTenantPrefix: true }),
    });
    await expect(loadPluginConfig('/config.json')).resolves.toEqual({
      ...DEFAULT_PLUGIN_CONFIG,
      forceTenantPrefix: true,
    });
  });

  it('uses defaults when config.json is missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    await expect(loadPluginConfig('/config.json')).resolves.toEqual(DEFAULT_PLUGIN_CONFIG);
  });

  it('uses defaults when the request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(loadPluginConfig('/config.json')).resolves.toEqual(DEFAULT_PLUGIN_CONFIG);
  });
});
