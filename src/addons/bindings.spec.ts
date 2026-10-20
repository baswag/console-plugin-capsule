import { isToggleOn, labelTogglePatch } from './bindings';
import type { LabelToggleWidget } from './types';

const widget: LabelToggleWidget = {
  type: 'labelToggle',
  id: 'backup',
  slot: 'namespace.detail',
  key: 'example.com/backup',
};

describe('label toggles', () => {
  it('is on only for the configured value', () => {
    expect(isToggleOn(widget, { 'example.com/backup': 'true' })).toBe(true);
    expect(isToggleOn(widget, { 'example.com/backup': 'false' })).toBe(false);
    expect(isToggleOn(widget, undefined)).toBe(false);
    expect(isToggleOn({ ...widget, onValue: 'enabled' }, { 'example.com/backup': 'enabled' })).toBe(
      true,
    );
  });

  it('sets the on value and removes the label when switched off', () => {
    expect(labelTogglePatch(widget, true)).toEqual({
      metadata: { labels: { 'example.com/backup': 'true' } },
    });
    expect(labelTogglePatch(widget, false)).toEqual({
      metadata: { labels: { 'example.com/backup': null } },
    });
  });

  it('writes the off value when configured', () => {
    expect(labelTogglePatch({ ...widget, offValue: 'disabled' }, false)).toEqual({
      metadata: { labels: { 'example.com/backup': 'disabled' } },
    });
  });

  describe('match: exists', () => {
    const exists: LabelToggleWidget = { ...widget, match: 'exists' };

    it('is on whenever the label is present, whatever its value', () => {
      expect(isToggleOn(exists, { 'example.com/backup': '' })).toBe(true);
      expect(isToggleOn(exists, { 'example.com/backup': 'anything' })).toBe(true);
      expect(isToggleOn(exists, { other: '' })).toBe(false);
      expect(isToggleOn(exists, undefined)).toBe(false);
    });

    it('writes an empty value by default, or onValue, and removes the label when off', () => {
      expect(labelTogglePatch(exists, true)).toEqual({
        metadata: { labels: { 'example.com/backup': '' } },
      });
      expect(labelTogglePatch({ ...exists, onValue: 'yes' }, true)).toEqual({
        metadata: { labels: { 'example.com/backup': 'yes' } },
      });
      expect(labelTogglePatch(exists, false)).toEqual({
        metadata: { labels: { 'example.com/backup': null } },
      });
    });
  });
});
