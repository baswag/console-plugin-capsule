import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddonSlot } from './AddonSlot';
import type { AddonResource, LoadedWidget } from './types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars: Partial<Record<string, string>> = {}) =>
      key.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => vars[name] ?? ''),
    i18n: { language: 'en' },
  }),
}));

// Stand-in for the capsule proxy: permission granted, patches applied to the labels in place.
jest.mock('./bindings', () => {
  const actual = jest.requireActual<Record<string, unknown>>('./bindings');
  const binding = {
    canPatch: () => Promise.resolve(true),
    patch: (
      resource: AddonResource,
      patch: { metadata: { labels: Record<string, string | null> } },
    ) => {
      const labels = { ...resource.metadata.labels };
      for (const [k, v] of Object.entries(patch.metadata.labels)) {
        if (v === null) Reflect.deleteProperty(labels, k);
        else labels[k] = v;
      }
      return Promise.resolve({ ...resource, metadata: { ...resource.metadata, labels } });
    },
    fetch: (resource: AddonResource) => Promise.resolve(resource),
  };
  return { ...actual, SLOT_BINDINGS: { 'namespace.detail': binding, 'tenant.row': binding } };
});

const base = { slot: 'namespace.detail', addon: 'platform', baseUrl: '/' } as const;
const widgets: LoadedWidget[] = [
  {
    ...base,
    type: 'labelToggle',
    id: 'premium',
    key: 'tier',
    onValue: 'premium',
    confirm: false,
    text: { on: { alt: 'Premium on' }, off: { alt: 'Premium off' } },
  },
  {
    ...base,
    type: 'labelToggle',
    id: 'gpu',
    key: 'gpu',
    when: { matchLabels: { tier: 'premium' } },
    text: { on: { alt: 'GPU on' }, off: { alt: 'GPU off' } },
  },
];

function Page() {
  const [ns, setNs] = useState<AddonResource>({
    metadata: { name: 'team-a-dev', creationTimestamp: '', labels: {} },
  });
  return <AddonSlot slot="namespace.detail" resource={ns} widgets={widgets} onUpdated={setNs} />;
}

describe('AddonSlot', () => {
  it('shows a widget as soon as another widget makes its selector match', async () => {
    render(<Page />);
    expect(screen.queryByRole('button', { name: 'GPU off' })).not.toBeInTheDocument();

    const premium = screen.getByRole('button', { name: 'Premium off' });
    // Toggles stay disabled until the (mocked) permission check has resolved.
    await waitFor(() => {
      expect(premium).not.toHaveAttribute('aria-disabled', 'true');
    });
    await userEvent.click(premium);

    expect(await screen.findByRole('button', { name: 'GPU off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Premium on' })).toBeInTheDocument();
  });
});
