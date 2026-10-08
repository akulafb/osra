import { describe, it, expect } from 'vitest';
import { paperEffects } from './paperEffects';

describe('paperEffects', () => {
  it('gives a desktop a soft depth of field and a light grain', () => {
    const desktop = paperEffects(false);
    expect(desktop.depthOfField).not.toBeNull();
    expect(desktop.depthOfField!.bokehScale).toBeGreaterThan(0);
    expect(desktop.depthOfField!.focusRangePerDistance).toBeGreaterThan(0);
    expect(desktop.grain).toBeGreaterThan(0);
    expect(desktop.grain).toBeLessThan(0.5);
  });

  it('gives a phone no depth of field and a lighter grain', () => {
    const phone = paperEffects(true);
    expect(phone.depthOfField).toBeNull();
    expect(phone.grain).toBeGreaterThan(0);
    expect(phone.grain).toBeLessThan(paperEffects(false).grain);
  });
});
