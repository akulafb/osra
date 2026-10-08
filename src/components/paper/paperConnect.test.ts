import { describe, it, expect } from 'vitest';
import { paperConnectEmphasis } from './paperConnect';

describe('paperConnectEmphasis: Connect Mode in ink', () => {
  const ids = ['source', 'candidate', 'other', 'second'];
  const candidates = new Set(['candidate', 'second']);

  it('keeps the source focused and the candidates in full ink, and fades everyone else', () => {
    expect(Object.fromEntries(paperConnectEmphasis(ids, 'source', candidates, null, null))).toEqual({
      source: 'focused',
      candidate: 'normal',
      other: 'ghost',
      second: 'normal',
    });
  });

  it('marks the candidate under the pointer', () => {
    expect(paperConnectEmphasis(ids, 'source', candidates, 'candidate', null).get('candidate')).toBe('hovered');
  });

  it('does not mark a Person under the pointer who cannot be a target', () => {
    expect(paperConnectEmphasis(ids, 'source', candidates, 'other', null).get('other')).toBe('ghost');
  });

  it('keeps the picked target marked after the pointer leaves it for the picker', () => {
    const emphasis = paperConnectEmphasis(ids, 'source', candidates, null, 'second');
    expect(emphasis.get('second')).toBe('hovered');
    expect(emphasis.get('candidate')).toBe('normal');
  });
});
