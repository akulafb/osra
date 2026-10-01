import { describe, expect, it } from 'vitest';
import { supabaseKeyHeaders } from './readApiKey.mjs';

describe('supabaseKeyHeaders', () => {
  it('sends a publishable or secret key on apikey only: it is not a JWT', () => {
    expect(supabaseKeyHeaders('sb_secret_x')).toEqual({ apikey: 'sb_secret_x' });
    expect(supabaseKeyHeaders('sb_publishable_x')).toEqual({ apikey: 'sb_publishable_x' });
  });

  it('sends a legacy JWT key on apikey and as the bearer', () => {
    expect(supabaseKeyHeaders('eyJ.jwt')).toEqual({ apikey: 'eyJ.jwt', Authorization: 'Bearer eyJ.jwt' });
  });
});
