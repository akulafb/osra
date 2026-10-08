let hasWebGL: boolean | undefined;

/** Probes once per page and gives the probe's context back, so mode switches never pile up WebGL contexts. */
export function browserHasWebGL(): boolean {
  if (hasWebGL !== undefined) return hasWebGL;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    hasWebGL = !!gl;
  } catch {
    hasWebGL = false;
  }
  return hasWebGL;
}
