import { describe, it, expect } from 'vitest';
import { contrastRatio, hexToRgb, mixOklab, rgbToHex } from './colourBlend';

describe('mixOklab', () => {
  it('returns the start colour at t = 0 and the end colour at t = 1', () => {
    expect(mixOklab('#d44744', '#f7ce50', 0)).toBe('#d44744');
    expect(mixOklab('#d44744', '#f7ce50', 1)).toBe('#f7ce50');
  });

  it('clamps t outside 0..1 to the endpoints', () => {
    expect(mixOklab('#2e675a', '#320b9f', -0.5)).toBe('#2e675a');
    expect(mixOklab('#2e675a', '#320b9f', 1.5)).toBe('#320b9f');
  });

  it('puts the black-to-white midpoint at perceptual mid-grey, darker than the sRGB average', () => {
    expect(mixOklab('#000000', '#ffffff', 0.5)).toBe('#636363');
  });

  it('round-trips a colour blended with itself', () => {
    expect(mixOklab('#320b9f', '#320b9f', 0.37)).toBe('#320b9f');
  });

  it('runs the same path in both directions', () => {
    expect(mixOklab('#d44744', '#f7ce50', 0.25)).toBe(mixOklab('#f7ce50', '#d44744', 0.75));
  });

  it('passes through orange between red and yellow rather than a muddy brown', () => {
    const [r, g, b] = hexToRgb(mixOklab('#d44744', '#f7ce50', 0.5));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeGreaterThan(220);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#d44744', '#d44744')).toBe(1);
  });

  it('matches the WCAG reference value for #777777 on white', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio('#2e675a', '#ecefee')).toBe(contrastRatio('#ecefee', '#2e675a'));
  });
});

describe('hex conversion', () => {
  it('parses and prints #rrggbb', () => {
    expect(hexToRgb('#C8361D')).toEqual([200, 54, 29]);
    expect(rgbToHex([200, 54, 29])).toBe('#c8361d');
  });

  it('rejects anything that is not #rrggbb', () => {
    expect(() => hexToRgb('rgb(0,0,0)')).toThrow();
  });
});
