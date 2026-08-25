# AI Agent Instructions for the Capsule Console Plugin

This document provides context and guidelines for AI coding assistants working on this codebase.

## Project Overview

This repository was created from Red Hat's OpenShift Console dynamic plugin template and has
since been instantiated into a concrete, single-purpose plugin: an OpenShift Console UI for
[Capsule](https://capsule.clastix.io), the multi-tenancy operator. It is not the generic
template anymore — routes, components, the Helm chart defaults, and the i18n namespace are
all Capsule-specific. Treat this as a normal application repository, not as a template other
plugins are meant to be generated from.

**Key Technologies:**
- TypeScript + React 17 (pinned to match the React version the target OpenShift Console
  release shares as a module-federation singleton — see "React and react-i18next versions"
  below before changing this)
- PatternFly 6 (UI component library)
- Webpack 5 with Module Federation
- react-i18next for internationalization
- Playwright for e2e testing
- Helm for deployment

**Compatibility:** Requires OpenShift 4.12+ (uses ConsolePlugin CRD v1 API)

## Architecture & Patterns

### Dynamic Plugin System

This plugin uses webpack module federation to load at runtime into the OpenShift Console. Key files:

- `console-extensions.json`: Declares what the plugin adds to console (routes, nav items, etc.)
- `package.json` `consolePlugin` section: Plugin metadata and exposed modules mapping
- `webpack.config.ts`: Configures module federation and build

**Critical:** Any component referenced in `console-extensions.json` must have a corresponding entry in `package.json` under `consolePlugin.exposedModules`.

### Component Structure

- Use functional components with hooks (NO class components)
- All components should be TypeScript (`.tsx`)
- Follow PatternFly component patterns
- Use PatternFly CSS variables instead of hex colors (dark mode compatibility)

### Styling Constraints

**IMPORTANT:** The `.stylelintrc.yaml` enforces strict rules to prevent breaking console:

- **NO hex colors** - use PatternFly CSS variables (e.g., `var(--pf-v6-global-palette--blue-500)`)
- **NO naked element selectors** (like `table`, `div`) - prevents overwriting console styles
- **NO `.pf-` or `.co-` prefixed classes** - these are reserved for PatternFly and console
- **Prefix all custom classes** with plugin name (e.g., `console-plugin-capsule__nice`)

Don't disable these rules without understanding they protect against layout breakage!

## Internationalization (i18n)

**Namespace Convention:** `plugin__<plugin-name>` — this plugin's namespace is
`plugin__console-plugin-capsule`.

### In React Components:
```tsx
const { t } = useTranslation('plugin__console-plugin-capsule');
return <h1>{t('Hello, World!')}</h1>;
```

### In console-extensions.json:
```json
"name": "%plugin__console-plugin-capsule~My Label%"
```

**After adding/changing messages:** Run `yarn i18n` to update locale files in `/locales`

## File Organization

```
src/
  components/          # React components (TenantsPage, TenantNamespacesPage,
                        # GlobalResourceQuotasPage, GlobalResourceQuotaDetailPage,
                        # TenantNamespaceDetailPage, TenantResourcePage, and their
                        # supporting modals/tables)
    *.css            # Component styles (scoped with plugin prefix)
  utils/               # CapsuleClient API client, shared formatting/quota helpers
console-extensions.json # Plugin extension declarations
package.json           # Plugin metadata in consolePlugin section
tsconfig.json          # TypeScript config (strict: true)
webpack.config.ts      # Module federation + build config
locales/               # i18n translation files
charts/                # Helm chart for deployment
integration-tests/     # Playwright e2e tests
```

## Development Workflow

### Local Development
1. `yarn install` - install dependencies
2. `yarn start` - starts webpack dev server on port 9001 with CORS
3. `yarn start-console` - runs OpenShift console in container (requires cluster login)
4. Navigate to http://localhost:9000/capsule-tenants (or another route declared in
   `console-extensions.json`)

### Code Quality
- `yarn lint` - runs eslint, prettier, and stylelint (with --fix)
- Linting is mandatory before commits
- Follow existing code patterns in the repo

### Testing
- `yarn test` - runs Jest unit tests
- `yarn test-e2e` - opens Playwright in headed mode
- `yarn test-e2e-headless` - runs Playwright in headless mode
- Add e2e tests for new pages/features

## TypeScript Configuration

Current config has `strict: true` and enforces:
- `noUnusedLocals: true`
- All files should use `.tsx` extension

## Common Development Tasks

### Adding a New Page
1. Create component in `src/components/MyPage.tsx`
2. Add to `package.json` `exposedModules`: `"MyPage": "./components/MyPage"`
3. Add route in `console-extensions.json`:
   ```json
   {
     "type": "console.page/route",
     "properties": {
       "path": "/my-page",
       "component": { "$codeRef": "MyPage" }
     }
   }
   ```
4. Optional: Add nav item in `console-extensions.json`
5. Run `yarn i18n` if you added translatable strings

### Adding a Navigation Item
```json
{
  "type": "console.navigation/href",
  "properties": {
    "id": "my-nav-item",
    "name": "%plugin__console-plugin-capsule~My Page%",
    "href": "/my-page",
    "perspective": "admin",
    "section": "home"
  }
}
```

### Updating Plugin Name

This plugin has already been renamed from the generic template to `console-plugin-capsule`.
For reference, renaming a plugin (this one, or a fresh instance of the upstream template)
touches all of the following, which must stay consistent:
1. `package.json` - `name` and `consolePlugin.name`
2. `package.json` - `consolePlugin.displayName` and `description`
3. All i18n namespace references (`plugin__<name>`)
4. CSS class prefixes
5. Helm chart values

## Build & Deployment

### Building Image
```bash
docker build -t ghcr.io/baswag/console-plugin-capsule:latest .
# For Apple Silicon: add --platform=linux/amd64
```

### Deploying via Helm
```bash
helm upgrade -i console-plugin-capsule charts/openshift-console-plugin \
  -n console-plugin-capsule \
  --create-namespace \
  --set plugin.image.registry=ghcr.io/baswag/console-plugin-capsule \
  --set plugin.image.version=0.0.6
```
`plugin.image` is a map (`registry` + `version`), not a single string — see the chart's
[values.yaml](charts/openshift-console-plugin/values.yaml).

**Note:** OpenShift 4.10 requires `--set plugin.securityContext.enabled=false`

## Important Constraints & Gotchas

1. **i18n namespace must match ConsolePlugin resource name** with `plugin__` prefix
2. **CSS class prefixes prevent style conflicts** - always prefix with plugin name
3. **Module federation requires exact module mapping** - `exposedModules` must match `$codeRef` values
4. **PatternFly CSS variables only** - hex colors break dark mode
5. **No webpack HMR for extensions** - changes to `console-extensions.json` require restart
6. **React 17** - see "React and react-i18next versions" below before touching this

## React and react-i18next versions

`react`, `react-dom`, and `react-i18next` are devDependencies here, but at runtime the
plugin doesn't bundle its own copies of them — OpenShift Console loads them once and shares
them with every plugin via webpack module federation. `ConsoleRemotePlugin` (from
`@openshift-console/dynamic-plugin-sdk-webpack`) checks this automatically: `yarn build` /
`yarn build-dev` prints a warning like `Console provides shared module react ^17.0.1 but
plugin uses version 18.3.1` whenever a locally declared version drifts from what the
target OpenShift Console release actually shares.

**Always run a build after changing any of these three packages** and confirm no such
warning appears. As of OpenShift Console 4.20 (this plugin's target, per
`consolePlugin.dependencies["@console/pluginAPI"]`), the shared versions are React 17 and
react-i18next ~11.12 — noticeably older than their current upstream majors. That's
intentional pinning, not a stale dependency: bumping either one without also confirming the
target console release shares a matching version will build fine locally but can break or
duplicate React at runtime once the plugin is federated into a real console.

`@testing-library/react` is pinned to `^12.1.5` for the same reason — it's the last major
that supports React 17.

## Extension Points

See [Console Plugin SDK README](https://github.com/openshift/console/tree/master/frontend/packages/console-dynamic-plugin-sdk) for available extension types:

- `console.page/route` - add new pages
- `console.navigation/href` - add nav items
- `console.navigation/section` - add nav sections
- `console.tab` - add tabs to resource pages
- `console.action/provider` - add actions to resources
- `console.flag` - feature flags
- Many more...

## Code Style Preferences

- Functional components with hooks (NO classes)
- TypeScript for all new files
- Use PatternFly components whenever possible
- Keep components focused and composable
- Prefer named exports for components
- Use `React.FC` or explicit return types
- CSS-in-files (not CSS-in-JS)

## Testing Strategy

- **E2E tests (Playwright):** For user flows and page rendering
- **Unit tests (Jest):** For component logic and plugin metadata
- **Test data attributes:** Use `data-test` attributes for selectors (`testIdAttribute` is configured in `playwright.config.ts`)
- Run tests locally before opening PRs

## References

- [Console Plugin SDK](https://github.com/openshift/console/tree/master/frontend/packages/console-dynamic-plugin-sdk)
- [PatternFly React](https://www.patternfly.org/get-started/develop)
- [Dynamic Plugin Enhancement Proposal](https://github.com/openshift/enhancements/blob/master/enhancements/console/dynamic-plugins.md)

## Quick Decision Guide

**When should I...**

- **Add a page?** Update console-extensions.json + exposedModules + create component
- **Style something?** Use PatternFly components and CSS variables, prefix custom classes
- **Add translations?** Use `t()` function, run `yarn i18n` after
- **Test changes?** Run locally with `yarn start` + `yarn start-console`, add Playwright tests
- **Deploy?** Build image, push to registry, install via Helm chart
