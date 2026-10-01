import { describe, expect, it } from 'vitest';
import { nextUaeMidnight, uaeDay } from './limits.ts';

describe('the UAE day', () => {
  it('is still the same day at 23:59 UAE time (19:59 UTC)', () => {
    expect(uaeDay(new Date('2026-10-01T19:59:00Z'))).toBe('2026-10-01');
  });

  it('is the next day at 00:01 UAE time (20:01 UTC)', () => {
    expect(uaeDay(new Date('2026-10-01T20:01:00Z'))).toBe('2026-10-02');
  });

  it('starts exactly at midnight UAE time', () => {
    expect(uaeDay(new Date('2026-10-01T19:59:59.999Z'))).toBe('2026-10-01');
    expect(uaeDay(new Date('2026-10-01T20:00:00Z'))).toBe('2026-10-02');
  });

  it('crosses months and years', () => {
    expect(uaeDay(new Date('2026-12-31T20:30:00Z'))).toBe('2027-01-01');
  });

  it('resets at the next UAE midnight', () => {
    expect(nextUaeMidnight(new Date('2026-10-01T10:00:00Z')).toISOString()).toBe(
      '2026-10-01T20:00:00.000Z',
    );
    expect(nextUaeMidnight(new Date('2026-10-01T20:01:00Z')).toISOString()).toBe(
      '2026-10-02T20:00:00.000Z',
    );
  });
});
