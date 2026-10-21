import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LabelToggle } from './LabelToggle';
import type { LabelToggleWidget, LoadedWidget } from '../types';
import type { WidgetContext } from './context';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars: Partial<Record<string, string>> = {}) =>
      key.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => vars[name] ?? ''),
    i18n: { language: 'en' },
  }),
}));

const widget: LabelToggleWidget & LoadedWidget = {
  type: 'labelToggle',
  id: 'backup',
  slot: 'namespace.detail',
  title: 'Backup',
  key: 'example.com/backup',
  icon: 'pf:database',
  text: {
    on: { alt: 'Backup enabled', tooltip: 'Nightly backups for {{name}}' },
    off: { alt: 'Backup disabled' },
    readOnly: 'Managed by the platform team',
    noPermission: 'Not allowed',
  },
  addon: 'platform',
  baseUrl: '/addons/platform/',
};

function makeCtx(labels: Record<string, string>, overrides: Partial<WidgetContext> = {}) {
  const ctx: WidgetContext = {
    resource: { metadata: { name: 'team-a-dev', creationTimestamp: '', labels } },
    slot: 'namespace.detail',
    compact: false,
    canPatch: true,
    patchResource: jest.fn(() => Promise.resolve(ctx.resource)),
    refresh: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
  return ctx;
}

describe('LabelToggle', () => {
  it('exposes the state-specific alt text and pressed state', () => {
    const { rerender } = render(
      <LabelToggle widget={widget} ctx={makeCtx({ 'example.com/backup': 'true' })} />,
    );
    expect(screen.getByRole('button', { name: 'Backup enabled' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    rerender(<LabelToggle widget={widget} ctx={makeCtx({})} />);
    expect(screen.getByRole('button', { name: 'Backup disabled' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('asks for confirmation and patches the label', async () => {
    const ctx = makeCtx({});
    render(<LabelToggle widget={widget} ctx={ctx} />);

    await userEvent.click(screen.getByRole('button', { name: 'Backup disabled' }));
    expect(screen.getByText('Enable Backup for team-a-dev?')).toBeInTheDocument();
    expect(ctx.patchResource).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    expect(ctx.patchResource).toHaveBeenCalledWith({
      metadata: { labels: { 'example.com/backup': 'true' } },
    });
    await waitFor(() => {
      expect(screen.queryByText('Enable Backup for team-a-dev?')).not.toBeInTheDocument();
    });
  });

  it('shows patch errors in the dialog', async () => {
    const ctx = makeCtx(
      { 'example.com/backup': 'true' },
      { patchResource: jest.fn(() => Promise.reject(new Error('denied by webhook'))) },
    );
    render(<LabelToggle widget={widget} ctx={ctx} />);

    await userEvent.click(screen.getByRole('button', { name: 'Backup enabled' }));
    await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(await screen.findByText('denied by webhook')).toBeInTheDocument();
  });

  it('patches immediately when confirmation is disabled', async () => {
    const ctx = makeCtx({});
    render(<LabelToggle widget={{ ...widget, confirm: false }} ctx={ctx} />);
    await userEvent.click(screen.getByRole('button', { name: 'Backup disabled' }));
    expect(ctx.patchResource).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['denied', false],
    ['pending', undefined],
  ])('is not clickable while permission is %s', async (_state, canPatch) => {
    const ctx = makeCtx({}, { canPatch });
    render(<LabelToggle widget={widget} ctx={ctx} />);
    const button = screen.getByRole('button', { name: 'Backup disabled' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(ctx.patchResource).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders read-only widgets as an image, not a control', () => {
    render(
      <LabelToggle
        widget={{ ...widget, readOnly: true }}
        ctx={makeCtx({ 'example.com/backup': 'true' })}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Backup enabled' })).toBeInTheDocument();
  });

  describe('icons', () => {
    const iconOf = () => {
      const button = screen.getByRole('button');
      return {
        button,
        img: within(button).queryByTestId('addon-icon-img'),
        mask: within(button).queryByTestId('addon-icon-mask'),
      };
    };

    it('draws image files as-is by default and dims + strikes the off state', () => {
      render(<LabelToggle widget={{ ...widget, icon: 'backup.svg' }} ctx={makeCtx({})} />);
      const { button, img } = iconOf();
      expect(img).toHaveAttribute('src', '/addons/platform/backup.svg');
      expect(img).toHaveAttribute('alt', '');
      expect(button).toHaveClass('console-plugin-capsule__addon-toggle--decorated');
    });

    it('draws image files as a currentColor mask with iconMode "mask"', () => {
      render(
        <LabelToggle
          widget={{ ...widget, icon: 'backup.svg', iconMode: 'mask' }}
          ctx={makeCtx({ 'example.com/backup': 'true' })}
        />,
      );
      const { img, mask } = iconOf();
      expect(img).toBeNull();
      expect(mask?.style.getPropertyValue('--console-plugin-capsule-addon-icon')).toBe(
        'url("/addons/platform/backup.svg")',
      );
    });

    it('uses a separate icon per state and skips the off decoration when one is given', () => {
      const stateWidget = { ...widget, icon: { on: 'on.svg', off: 'off.svg' } };
      const { rerender } = render(
        <LabelToggle widget={stateWidget} ctx={makeCtx({ 'example.com/backup': 'true' })} />,
      );
      expect(iconOf().img).toHaveAttribute('src', '/addons/platform/on.svg');

      rerender(<LabelToggle widget={stateWidget} ctx={makeCtx({})} />);
      const { button, img } = iconOf();
      expect(img).toHaveAttribute('src', '/addons/platform/off.svg');
      expect(button).not.toHaveClass('console-plugin-capsule__addon-toggle--decorated');
    });

    it('falls back to the other state icon and keeps the off decoration', () => {
      render(<LabelToggle widget={{ ...widget, icon: { on: 'on.svg' } }} ctx={makeCtx({})} />);
      const { button, img } = iconOf();
      expect(img).toHaveAttribute('src', '/addons/platform/on.svg');
      expect(button).toHaveClass('console-plugin-capsule__addon-toggle--decorated');
    });
  });

  describe('when (disable mode)', () => {
    const conditional = {
      ...widget,
      when: { matchLabels: { tier: 'premium' } },
      whenNotMatched: 'disable' as const,
    };

    it('is disabled with the configured reason when the selector does not match', async () => {
      const ctx = makeCtx({});
      render(
        <LabelToggle
          widget={{ ...conditional, text: { ...conditional.text, notMatched: 'Premium only' } }}
          ctx={ctx}
        />,
      );
      const button = screen.getByRole('button', { name: 'Backup disabled' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      await userEvent.hover(button);
      expect(await screen.findByText('Premium only')).toBeInTheDocument();
      await userEvent.click(button);
      expect(ctx.patchResource).not.toHaveBeenCalled();
    });

    it('is enabled when the selector matches', () => {
      render(<LabelToggle widget={conditional} ctx={makeCtx({ tier: 'premium' })} />);
      expect(screen.getByRole('button', { name: 'Backup disabled' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });
  });
});
