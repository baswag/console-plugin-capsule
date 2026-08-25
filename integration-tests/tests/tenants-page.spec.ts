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
});
