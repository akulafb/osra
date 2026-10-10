import { describe, it, expect } from 'vitest';
import { connectAimTarget, pickerChoiceTint, pickerConfirmInk } from './connectLook';

describe('connectAimTarget', () => {
  it('asks Cosmos to aim at a glowing planet', () => {
    expect(connectAimTarget('cosmos')).toBe('a glowing planet');
  });

  it('asks Paper to aim at a person', () => {
    expect(connectAimTarget('paper')).toBe('a person');
  });
});

describe('pickerChoiceTint', () => {
  it('tints a Cosmos choice with its own accent at 20%', () => {
    expect(pickerChoiceTint('cosmos', '#c084fc', '#38bdf8')).toBe('rgba(192, 132, 252, 0.2)');
  });

  it('tints a Paper choice with the connect accent, mixed so CSS-variable colours work', () => {
    expect(pickerChoiceTint('paper', 'var(--choice)', 'var(--connect)')).toBe(
      'color-mix(in srgb, var(--connect) 20%, transparent)'
    );
  });
});

describe('pickerConfirmInk', () => {
  const inks = { onAccent: '#fff', strong: '#eee' };

  it('writes Establish Link in strong ink in Cosmos', () => {
    expect(pickerConfirmInk('cosmos', inks)).toBe('#eee');
  });

  it('writes Establish Link in on-accent ink in Paper', () => {
    expect(pickerConfirmInk('paper', inks)).toBe('#fff');
  });
});
