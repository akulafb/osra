import { describe, it, expect } from 'vitest';
import { playTapOn, type TapAudio } from './paperTap';

function recordingAudio(currentTime: number) {
  const gains: number[] = [];
  const played: { start?: number; stop?: number; reachesSpeakers: boolean } = { reachesSpeakers: false };
  const destination = {};
  const param = (record?: number[]) => ({
    setValueAtTime: (value: number) => record?.push(value),
    exponentialRampToValueAtTime: (value: number) => record?.push(value),
  });
  const gain = { gain: param(gains), connect: (to: unknown) => ((played.reachesSpeakers = to === destination), to), disconnect: () => {} };
  const oscillator = {
    type: 'sine',
    frequency: param(),
    connect: () => gain,
    start: (at: number) => (played.start = at),
    stop: (at: number) => (played.stop = at),
    onended: null,
  };
  const audio = { currentTime, destination, createOscillator: () => oscillator, createGain: () => gain };
  return { audio: audio as unknown as TapAudio, gains, played };
}

describe('playTapOn', () => {
  it('plays a short tap, now, to the speakers', () => {
    const { audio, played } = recordingAudio(12.5);
    playTapOn(audio);
    expect(played.start).toBe(12.5);
    expect(played.stop! - played.start!).toBeGreaterThan(0);
    expect(played.stop! - played.start!).toBeLessThanOrEqual(0.15);
    expect(played.reachesSpeakers).toBe(true);
  });

  it('is quiet, and fades to silence before it stops', () => {
    const { audio, gains } = recordingAudio(0);
    playTapOn(audio);
    expect(Math.max(...gains)).toBeLessThanOrEqual(0.1);
    expect(gains[gains.length - 1]).toBeLessThan(0.001);
  });
});
