import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');

// No VITE_* from the shell, and no .env file is read (envDir below), so the
// app cannot learn a real Supabase URL.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];

const swaps: Record<string, string> = {
  'src/lib/supabaseConfig': 'stubs/supabaseConfig.ts',
  'src/lib/supabase': 'stubs/supabase.ts',
  'src/contexts/AuthContext': 'stubs/AuthContext.tsx',
};

/** Swaps the three modules that reach Supabase for the harness stubs; every other import is the real code. */
function swapSupabase(): Plugin {
  return {
    name: 'canvas-5000-swap-supabase',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const abs = path.resolve(path.dirname(importer), source).replace(/\.(tsx?|jsx?)$/, '');
      const key = path.relative(root, abs);
      return swaps[key] ? path.join(here, swaps[key]) : null;
    },
  };
}

export default defineConfig({
  root,
  envDir: here,
  plugins: [swapSupabase(), react()],
  server: { host: '127.0.0.1', fs: { allow: [root] } },
  optimizeDeps: { entries: [path.join(here, 'harness.html')] },
});
