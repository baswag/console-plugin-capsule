# OpenShift Console Plugin for Capsule

This plugin adds Capsule multi-tenancy management to the OpenShift web console.
[Capsule](https://capsule.clastix.io) adds multi-tenancy and policy control to Kubernetes and
OpenShift. The plugin lets a cluster administrator view and manage Capsule tenants directly in
the OpenShift Console.

The plugin is an
[OpenShift Console dynamic plugin](https://github.com/openshift/console/tree/main/frontend/packages/console-dynamic-plugin-sdk).
A dynamic plugin adds custom pages to the console at runtime. Console loads the plugin through
[webpack module federation](https://webpack.js.org/concepts/module-federation/). A cluster
administrator registers the plugin with a `ConsolePlugin` custom resource and enables it in the
console operator config.

The plugin sends requests to the cluster through the `capsule-proxy` service. `capsule-proxy` is
a component of Capsule. You must install Capsule and `capsule-proxy` on the cluster before you
use this plugin.

## Features

The plugin adds a **Capsule** section to the Administrator perspective of the OpenShift Console.
The section contains these pages:

| Page | Route | Description |
| --- | --- | --- |
| Tenants | `/capsule-tenants` | Lists Capsule tenants, with their state, namespace count, and owners. |
| Tenant Namespaces | `/capsule-namespaces` | Lists namespaces that belong to tenants. Creates and deletes tenant namespaces. |
| Tenant Namespace detail | `/capsule-namespaces/:name` | Shows namespace metadata, a labels and annotations editor, and resource quota usage. |
| Global Resource Quotas | `/capsule-global-resource-quotas` | Lists Capsule `GlobalResourceQuota` resources and their status. |
| Global Resource Quota detail | `/capsule-global-resource-quotas/:name` | Shows quota usage for each namespace in a `GlobalResourceQuota`. |
| Tenant Resources | `/capsule-tenant-resources` | Lists Capsule `TenantResource` resources for each tenant. |

## Requirements

- An OpenShift cluster at version 4.20, or a compatible version.
- [Capsule](https://projectcapsule.dev) and `capsule-proxy` installed on the cluster.
- [Node.js](https://nodejs.org/en/) and [yarn](https://yarnpkg.com) to build the plugin.
- [Docker](https://www.docker.com) or [podman 3.2.0+](https://podman.io), and
  [oc](https://console.redhat.com/openshift/downloads), to run the console in a container.

## Development

### Option 1: Local

Open one terminal window and run these commands:

1. `yarn install`
2. `yarn run start`

Open a second terminal window and run these commands:

1. `oc login` (log in to an OpenShift cluster that has Capsule installed)
2. `yarn run start-console` (requires Docker or podman 3.2.0+)

These commands start the OpenShift Console in a container. The container connects to the
cluster you logged into. The plugin HTTP server runs on port 9001, with CORS enabled. Go to
<http://localhost:9000/capsule-tenants> to see the plugin.

#### Run start-console with Apple silicon and podman

If you use podman on a Mac with Apple silicon hardware, `yarn run start-console` can fail. The
command runs an amd64 image. Use
[qemu-user-static](https://github.com/multiarch/qemu-user-static) to solve this problem. Run
these commands:

```bash
podman machine ssh
sudo -i
rpm-ostree install qemu-user-static
systemctl reboot
```

### Option 2: Docker + VS Code Remote Container

Install the
[Remote Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
extension in VS Code. This method uses Docker Compose. One container runs the OpenShift
Console. The other container runs the plugin. You need access to an OpenShift cluster that has
Capsule installed. After the first build, the containers start in a few seconds.

1. Create a `dev.env` file in the `.devcontainer` folder. Add the correct values for your
   cluster:

   ```bash
   OC_PLUGIN_NAME=console-plugin-capsule
   OC_URL=https://api.example.com:6443
   OC_USER=kubeadmin
   OC_PASS=<password>
   ```

2. Press `Ctrl+Shift+P` and select `Remote Containers: Open Folder in Container...`.
3. Run `yarn run start`.
4. Go to <http://localhost:9000/capsule-tenants>.

## Docker image

Build an image and push it to an image registry before you deploy the plugin to a cluster.

1. Build the image:

   ```sh
   docker build -t ghcr.io/baswag/console-plugin-capsule:latest .
   ```

2. Run the image:

   ```sh
   docker run -it --rm -d -p 9001:80 ghcr.io/baswag/console-plugin-capsule:latest
   ```

3. Push the image:

   ```sh
   docker push ghcr.io/baswag/console-plugin-capsule:latest
   ```

NOTE: On a Mac with Apple silicon hardware, add the flag `--platform=linux/amd64` when you
build the image. This flag targets the correct platform for the cluster.

## Deployment on cluster

A [Helm](https://helm.sh) chart deploys the plugin to an OpenShift cluster.

The `plugin.image.registry` and `plugin.image.version` parameters are required. Together they
form the location of the image that you pushed in the previous step.

The chart connects to `capsule-proxy` at `capsule-proxy.capsule-system:9001` by default. Set
`capsule.proxy.serviceName`, `capsule.proxy.serviceNamespace`, and `capsule.proxy.servicePort`
if your cluster uses a different location.

See the chart [values file](charts/openshift-console-plugin/values.yaml) for the full list of
parameters.

### Install the Helm chart

Run this command to install the chart:

```shell
helm upgrade -i console-plugin-capsule charts/openshift-console-plugin \
  -n console-plugin-capsule --create-namespace \
  --set plugin.image.registry=ghcr.io/baswag/console-plugin-capsule \
  --set plugin.image.version=0.0.6
```

## i18n

The plugin uses [react-i18next](https://react.i18next.com/) to translate messages. The i18n
namespace must match the name of the `ConsolePlugin` resource, with a `plugin__` prefix. This
plugin uses the `plugin__console-plugin-capsule` namespace. Use the `useTranslation` hook with
this namespace:

```tsx
const Header: React.FC = () => {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  return <h1>{t('Tenants')}</h1>;
};
```

For labels in `console-extensions.json`, use the format
`%plugin__console-plugin-capsule~My Label%`. Console replaces the value with the message for
the current language, from the `plugin__console-plugin-capsule` namespace. For example:

```json
{
  "type": "console.navigation/href",
  "properties": {
    "id": "capsule-tenants",
    "name": "%plugin__console-plugin-capsule~Tenants%",
    "href": "/capsule-tenants",
    "perspective": "admin",
    "section": "capsule"
  }
}
```

Run `yarn i18n` to update the JSON files in the `locales` folder after you add or change
messages.

## Linting

This project uses prettier, eslint, and stylelint. Run `yarn run lint` to check and fix the
code.

The stylelint config does not allow hex colors, because hex colors break dark mode. Use
[PatternFly semantic tokens](https://www.patternfly.org/tokens/all-patternfly-tokens) for
colors instead.

The stylelint config also does not allow naked element selectors, such as `table`, and does not
allow `.pf-` or `.co-` prefixed classes. This rule stops the plugin from overwriting default
console styles and breaking the layout of other pages. Prefix your CSS class names with the
plugin name to avoid conflicts. Do not disable these rules unless you understand how they can
break the console styles.

## Testing

Run `yarn test` to run the Jest unit tests.

Run `yarn test-e2e-headless` to run the Playwright end-to-end tests in headless mode. Run
`yarn test-e2e` to run the same tests in headed mode.

Playwright writes an HTML report to `integration-tests/results/html` and a JUnit report to
`integration-tests/results/junit-results.xml`.

## References

- [Capsule](https://projectcapsule.dev)
- [Capsule GitHub repository](https://github.com/clastix/capsule)
- [Console Plugin SDK README](https://github.com/openshift/console/tree/main/frontend/packages/console-dynamic-plugin-sdk)
- [Dynamic Plugin Enhancement Proposal](https://github.com/openshift/enhancements/blob/master/enhancements/console/dynamic-plugins.md)
