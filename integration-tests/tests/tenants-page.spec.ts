import { execSync } from 'child_process';
import { test, expect } from '@playwright/test';
import { checkErrors } from '../support';

const PLUGIN_NAME = 'console-plugin-capsule';
// Defined in openshift/release ci-operator config as CYPRESS_PLUGIN_TEMPLATE_PULL_SPEC
const PLUGIN_PULL_SPEC =
  process.env.PLUGIN_TEMPLATE_PULL_SPEC ?? process.env.CYPRESS_PLUGIN_TEMPLATE_PULL_SPEC ?? '';

const isLocalDevEnvironment = (process.env.BRIDGE_BASE_ADDRESS ?? 'http://localhost:9000').includes(
  'localhost',
);

function exec(command: string, timeoutMs = 360000) {
  try {
    return execSync(command, { timeout: timeoutMs, encoding: 'utf-8' });
  } catch (e) {
    console.error('Command failed:', command, e);
    return '';
  }
}

function installHelmChart(helmPath: string) {
  // The chart takes the image as two separate values (plugin.image.registry and
  // plugin.image.version), so a "registry/path:tag" pull spec is split on the last colon.
  const separatorIndex = PLUGIN_PULL_SPEC.lastIndexOf(':');
  const registry =
    separatorIndex === -1 ? PLUGIN_PULL_SPEC : PLUGIN_PULL_SPEC.slice(0, separatorIndex);
  const version = separatorIndex === -1 ? 'latest' : PLUGIN_PULL_SPEC.slice(separatorIndex + 1);

  const result = exec(
    `${helmPath} upgrade -i ${PLUGIN_NAME} charts/openshift-console-plugin -n ${PLUGIN_NAME} --create-namespace --set plugin.image.registry=${registry} --set plugin.image.version=${version}`,
  );
  console.log('Helm install:', result);

  exec(`oc rollout status -n ${PLUGIN_NAME} deploy/${PLUGIN_NAME} -w --timeout=300s`);
  exec('oc rollout status -w deploy/console -n openshift-console --timeout=300s');
}

function deleteHelmChart(helmPath: string) {
  const result = exec(
    `${helmPath} uninstall ${PLUGIN_NAME} -n ${PLUGIN_NAME} && oc delete namespaces ${PLUGIN_NAME}`,
  );
  console.log('Helm uninstall:', result);
}

test.describe('Capsule console plugin', () => {
  test.beforeAll(() => {
    if (!isLocalDevEnvironment) {
      console.log('this is not a local env, installing helm');
      exec('./install_helm.sh');
      installHelmChart('/tmp/helm');
    } else {
      console.log('this is a local env, not installing helm');
      installHelmChart('helm');
    }
  });

  test.afterEach(async ({ page }) => {
    await checkErrors(page);
  });

  test.afterAll(() => {
    if (!isLocalDevEnvironment) {
      deleteHelmChart('/tmp/helm');
    } else {
      deleteHelmChart('helm');
    }
  });

  test('Verify the Tenants page loads', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-quickstart-id="qs-nav-home"]').click();
    await page.getByTestId('nav').getByText('Tenants').click();
    await expect(page).toHaveURL(/\/capsule-tenants/);
    await expect(page).toHaveTitle(/Tenants/);
  });

  test('Shows an Extensions column when an addon targets tenant rows', async ({ page }) => {
    const addonsUrl = '**/api/plugins/console-plugin-capsule/addons';
    await page.route(`${addonsUrl}/index.json`, (route) =>
      route.fulfill({ json: { addons: ['e2e'] } }),
    );
    await page.route(`${addonsUrl}/e2e/manifest.json`, (route) =>
      route.fulfill({
        json: {
          apiVersion: 'console-plugin-capsule/addons/v1',
          widgets: [
            {
              type: 'labelValue',
              id: 'expiry',
              slot: 'tenant.row',
              key: 'e2e.example.com/expires',
              format: { type: 'date' },
              emptyText: 'No expiry',
            },
          ],
        },
      }),
    );

    await page.goto('/capsule-tenants');
    await expect(page.getByRole('columnheader', { name: 'Extensions' })).toBeVisible();
  });

  test('Tenant overview shows owners, namespace quota, namespaces and quotas', async ({ page }) => {
    const proxy = '**/api/proxy/plugin/console-plugin-capsule/capsule';
    const meta = (name: string) => ({ name, creationTimestamp: '2026-01-01T00:00:00Z' });
    await page.route(`${proxy}/apis/capsule.clastix.io/v1beta2/tenants/e2e`, (route) =>
      route.fulfill({
        json: {
          metadata: meta('e2e'),
          spec: { namespaceOptions: { quota: 2 } },
          status: {
            state: 'Active',
            size: 2,
            namespaces: ['e2e-a', 'e2e-b'],
            owners: [
              { kind: 'User', name: 'alice' },
              { kind: 'Group', name: 'e2e-admins' },
            ],
          },
        },
      }),
    );
    await page.route(`${proxy}/api/v1/namespaces/?labelSelector=*`, (route) =>
      route.fulfill({
        json: {
          items: ['e2e-a', 'e2e-b'].map((name) => ({ metadata: meta(name), status: {} })),
        },
      }),
    );
    await page.route(`${proxy}/apis/capsule.clastix.io/v1beta2/globalresourcequotas`, (route) =>
      route.fulfill({
        json: {
          items: [
            {
              metadata: meta('e2e-grq'),
              spec: { quota: { hard: { pods: 10 } } },
              status: { namespaces: ['e2e-a', 'other'], total: { hard: { pods: 10 }, used: {} } },
            },
            {
              metadata: meta('unrelated-grq'),
              spec: { quota: { hard: { pods: 10 } } },
              status: { namespaces: ['other'] },
            },
          ],
        },
      }),
    );

    await page.goto('/capsule-tenants/e2e');
    await expect(page).toHaveTitle(/Tenant: e2e/);
    await expect(page.getByTestId('tenant-owners')).toContainText('alice');
    await expect(page.getByTestId('tenant-owners')).toContainText('e2e-admins');
    await expect(page.getByTestId('tenant-namespace-quota')).toContainText('2 of 2');
    await expect(page.getByRole('button', { name: 'e2e-b' })).toBeVisible();
    // Quota reached: creating another namespace is blocked.
    await expect(page.getByTestId('create-namespace')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('tenant-grq-e2e-grq')).toBeVisible();
    await expect(page.getByTestId('tenant-grq-unrelated-grq')).toHaveCount(0);
  });
});
