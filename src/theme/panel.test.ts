import { describe, it, expect } from 'vitest';
import { cosmosPanel } from './panel';

describe('cosmosPanel', () => {
  it('keeps the light secondary and success colours MUI derived before', () => {
    expect(cosmosPanel.role.secondaryLight).toBe('rgb(150, 97, 240)');
    expect(cosmosPanel.role.successLight).toBe('rgb(63, 199, 154)');
  });
});
