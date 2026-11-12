import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { consoleFetchJSON } from '@openshift-console/dynamic-plugin-sdk';
import { CreateNamespaceActions } from './CreateNamespaceActions';
import type { LoadedWidget } from './types';
import type { Tenant } from '../utils/capsule';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars: Partial<Record<string, string>> = {}) =>
      key.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => vars[name] ?? ''),
    i18n: { language: 'en' },
  }),
}));

const mockWidgets: LoadedWidget[] = [];
jest.mock('./registry', () => ({
  useAddonWidgets: () => ({ widgets: mockWidgets, loaded: true }),
}));

const base = {
  type: 'createNamespace',
  slot: 'namespaces.toolbar',
  addon: 'platform',
  baseUrl: '/',
} as const;

const tenant = (labels: Record<string, string> = {}, forceTenantPrefix = false) =>
  ({
    metadata: { name: 'team-a', creationTimestamp: '', labels },
    spec: { forceTenantPrefix },
  }) as unknown as Tenant;

const post = jest.spyOn(consoleFetchJSON, 'post');

beforeEach(() => {
  mockWidgets.length = 0;
  post.mockClear();
  post.mockResolvedValue({});
});

it('creates a namespace with preset and user-entered labels and annotations', async () => {
  mockWidgets.push({
    ...base,
    id: 'sandbox',
    text: 'Create sandbox for {{tenant}}',
    description: 'Sandboxes are deleted after 30 days.',
    labels: [
      { key: 'example.com/sandbox', value: 'true' },
      { key: 'cost-center', title: 'Cost center', example: 'CC-1234', required: true },
      { key: 'team', title: 'Team', default: '{{tenant}}' },
    ],
    annotations: [
      { key: 'example.com/owner', value: '{{tenant}} admins' },
      { key: 'example.com/purpose', title: 'Purpose' },
    ],
  });
  const onCreated = jest.fn();
  render(
    <CreateNamespaceActions
      tenant={tenant()}
      globalForceTenantPrefix={false}
      onCreated={onCreated}
    />,
  );

  await userEvent.click(screen.getByRole('button', { name: 'Create sandbox for team-a' }));
  expect(screen.getByText('Sandboxes are deleted after 30 days.')).toBeInTheDocument();
  expect(screen.queryByText(/example\.com\/sandbox/)).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('e.g. CC-1234')).toBeInTheDocument();
  expect(screen.getByLabelText(/^Team/)).toHaveValue('team-a');

  const create = screen.getByRole('button', { name: 'Create' });
  await userEvent.type(screen.getByLabelText(/^Name/), 'sandbox-1');
  // The required cost center is still empty.
  expect(create).toBeDisabled();
  await userEvent.type(screen.getByLabelText(/^Cost center/), 'CC 1');
  expect(create).toBeDisabled();
  await userEvent.clear(screen.getByLabelText(/^Cost center/));
  await userEvent.type(screen.getByLabelText(/^Cost center/), 'CC-1');
  expect(create).toBeEnabled();
  await userEvent.click(create);

  await waitFor(() => {
    expect(onCreated).toHaveBeenCalledWith('sandbox-1');
  });
  expect(post).toHaveBeenCalledWith(expect.stringContaining('/namespaces'), {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: 'sandbox-1',
      labels: {
        'example.com/sandbox': 'true',
        'cost-center': 'CC-1',
        team: 'team-a',
        'capsule.clastix.io/tenant': 'team-a',
      },
      // The empty optional "purpose" field is left out.
      annotations: { 'example.com/owner': 'team-a admins' },
    },
  });
});

it('honors the global prefix setting unless the widget opts out', async () => {
  mockWidgets.push(
    { ...base, id: 'prefixed', text: 'Prefixed' },
    { ...base, id: 'free', text: 'Free', honorGlobalForceTenantPrefix: false },
  );
  render(
    <CreateNamespaceActions tenant={tenant()} globalForceTenantPrefix onCreated={jest.fn()} />,
  );

  await userEvent.click(screen.getByRole('button', { name: 'Prefixed' }));
  expect(screen.getByText('team-a-')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  await userEvent.click(screen.getByRole('button', { name: 'Free' }));
  expect(screen.queryByText('team-a-')).not.toBeInTheDocument();
});

it("always honors the tenant's own forceTenantPrefix", async () => {
  mockWidgets.push({ ...base, id: 'free', text: 'Free', honorGlobalForceTenantPrefix: false });
  render(
    <CreateNamespaceActions
      tenant={tenant({}, true)}
      globalForceTenantPrefix={false}
      onCreated={jest.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Free' }));
  expect(screen.getByText('team-a-')).toBeInTheDocument();
});

it('uses the widget prefix unless a tenant prefix is forced', async () => {
  mockWidgets.push({ ...base, id: 'sbx', text: 'Sandbox', prefix: 'sbx-{{tenant}}-' });
  const onCreated = jest.fn();
  const { unmount } = render(
    <CreateNamespaceActions
      tenant={tenant()}
      globalForceTenantPrefix={false}
      onCreated={onCreated}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sandbox' }));
  expect(screen.getByText('sbx-team-a-')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/^Name/), 'one');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => {
    expect(onCreated).toHaveBeenCalledWith('sbx-team-a-one');
  });
  unmount();

  render(
    <CreateNamespaceActions
      tenant={tenant({}, true)}
      globalForceTenantPrefix={false}
      onCreated={jest.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sandbox' }));
  expect(screen.getByText('team-a-')).toBeInTheDocument();
  expect(screen.queryByText('sbx-team-a-')).not.toBeInTheDocument();
});

it('only shows buttons whose selector matches the tenant labels', () => {
  mockWidgets.push(
    { ...base, id: 'premium', text: 'Premium', when: { matchLabels: { tier: 'premium' } } },
    { ...base, id: 'all', text: 'All' },
  );
  render(
    <CreateNamespaceActions
      tenant={tenant({ tier: 'basic' })}
      globalForceTenantPrefix={false}
      onCreated={jest.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Premium' })).not.toBeInTheDocument();
});
