import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from 'react-error-boundary';
import { ModuleWidget } from './ModuleWidget';
import type {
  AddonComponentProps,
  AddonHost,
  LoadedWidget,
  ModuleWidget as Config,
} from '../types';
import type { WidgetContext } from './context';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

// Stands in for a module mounted at addons/<addon>/<module>; jest resolves the native
// import() through its module registry.
const factory = jest.fn((host: AddonHost) => {
  const h = host.React.createElement;
  return function Example({ resource, confirm, patchResource }: AddonComponentProps) {
    return h(
      host.PatternFly.Button,
      {
        onClick: () => {
          void confirm({ title: 'Sure?' }).then((ok) =>
            ok ? patchResource({ metadata: { labels: { x: 'y' } } }) : undefined,
          );
        },
      },
      `${String(host.widget.config)} ${resource.metadata.name}`,
    );
  };
});
jest.mock('/addons/demo/index.js', () => ({ default: factory }), { virtual: true });
jest.mock('/addons/demo/broken.js', () => ({ notAFunction: 1 }), { virtual: true });

const widget = (module: string): Config & LoadedWidget => ({
  type: 'module',
  id: module,
  slot: 'namespace.detail',
  module,
  config: 'hello',
  addon: 'demo',
  baseUrl: '/addons/demo/',
});

const ctx: WidgetContext = {
  resource: { metadata: { name: 'team-a-dev', creationTimestamp: '' } },
  slot: 'namespace.detail',
  compact: false,
  canPatch: true,
  patchResource: jest.fn(() => Promise.resolve(ctx.resource)),
  refresh: jest.fn(() => Promise.resolve()),
};

describe('ModuleWidget', () => {
  it('passes the host and props to the module, and wires confirm()', async () => {
    render(
      <ErrorBoundary fallback={<p>failed</p>}>
        <ModuleWidget widget={widget('index.js')} ctx={ctx} />
      </ErrorBoundary>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'hello team-a-dev' }));
    expect(factory).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Sure?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(ctx.patchResource).toHaveBeenCalledWith({ metadata: { labels: { x: 'y' } } });
  });

  it('reports modules without the expected export to the error boundary', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary fallbackRender={({ error }) => <p>{(error as Error).message}</p>}>
        <ModuleWidget widget={widget('broken.js')} ctx={ctx} />
      </ErrorBoundary>,
    );
    expect(
      await screen.findByText('/addons/demo/broken.js does not export a function "default"'),
    ).toBeInTheDocument();
  });
});
