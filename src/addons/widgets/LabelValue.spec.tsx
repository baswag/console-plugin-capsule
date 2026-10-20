import { render, screen } from '@testing-library/react';
import { LabelValue, dateStatus } from './LabelValue';
import type { LabelValueWidget, LoadedWidget } from '../types';
import type { WidgetContext } from './context';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars: Partial<Record<string, string>> = {}) =>
      key.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => vars[name] ?? ''),
    i18n: { language: 'en' },
  }),
}));

const widget: LabelValueWidget & LoadedWidget = {
  type: 'labelValue',
  id: 'expiry',
  slot: 'tenant.row',
  key: 'example.com/expires',
  format: { type: 'date', input: 'YYYY-MM-DD', display: 'DD.MM.YYYY' },
  text: 'Expires {{value}} ({{days}} days)',
  warnDays: 14,
  addon: 'platform',
  baseUrl: '/addons/platform/',
};

const ctx = (labels: Record<string, string>): WidgetContext => ({
  resource: { metadata: { name: 'team-a', creationTimestamp: '', labels } },
  slot: 'tenant.row',
  compact: true,
  canPatch: undefined,
  patchResource: jest.fn(),
  refresh: jest.fn(),
});

const now = new Date('2026-10-20T12:00:00Z');

describe('LabelValue', () => {
  it('renders the formatted date from the label', () => {
    render(
      <LabelValue widget={widget} ctx={ctx({ 'example.com/expires': '2026-12-31' })} now={now} />,
    );
    expect(screen.getByText('Expires 31.12.2026 (72 days)')).toBeInTheDocument();
  });

  it('marks dates that passed for screen readers too', () => {
    render(
      <LabelValue widget={widget} ctx={ctx({ 'example.com/expires': '2026-10-01' })} now={now} />,
    );
    expect(screen.getByText('(Expired)', { exact: false })).toBeInTheDocument();
  });

  it('is hidden when the label is missing and no empty text is configured', () => {
    const { container } = render(<LabelValue widget={widget} ctx={ctx({})} now={now} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty text when configured', () => {
    render(<LabelValue widget={{ ...widget, emptyText: 'No expiry' }} ctx={ctx({})} now={now} />);
    expect(screen.getByText('No expiry')).toBeInTheDocument();
  });

  it('falls back to the raw value when it does not match the format', () => {
    render(<LabelValue widget={widget} ctx={ctx({ 'example.com/expires': 'never' })} now={now} />);
    expect(screen.getByText('Expires never ( days)')).toBeInTheDocument();
  });
});

describe('dateStatus', () => {
  it.each([
    [-1, 14, 'danger'],
    [0, 14, 'warning'],
    [14, 14, 'warning'],
    [15, 14, undefined],
    [3, undefined, undefined],
  ])('%s days with warnDays %s → %s', (days, warnDays, expected) => {
    expect(dateStatus(days, warnDays)).toBe(expected);
  });
});
