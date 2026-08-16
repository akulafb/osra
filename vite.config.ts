import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Say out loud which Supabase project the dev server is on.
 *
 * A dev server quietly pointed at production looks identical to one pointed at
 * dev until you write to it, so the project ref is printed on every start.
 */
function announceSupabaseProject(): Plugin {
  return {
    name: 'osra-announce-supabase-project',
    apply: 'serve',
    configResolved(config) {
      const url = config.env.VITE_SUPABASE_URL as string | undefined
      const ref = url?.match(/^https:\/\/([^.]+)\./)?.[1] ?? '(missing)'
      config.logger.info(`  ➜  Supabase:  ${ref}  (from .env.local)\n`)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  if (command === 'serve') {
    // Vite gives real environment variables priority over .env files, so a
    // VITE_SUPABASE_URL exported in the shell — or inherited from whatever
    // launched the editor — silently overrides .env.local and points local
    // testing at the production database. Dev reads .env.local and nothing
    // else (docs/DEV_VS_PROD_DATABASE.md), so the ambient ones are dropped
    // before Vite loads them. Builds are left alone: Vercel supplies its env
    // exactly this way.
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('VITE_')) delete process.env[key]
    }
  }

  return {
    plugins: [react(), announceSupabaseProject()],
    server: { host: true },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-three': ['three', '@react-three/fiber', '@react-three/drei', 'react-force-graph-3d', 'three-spritetext'],
            'vendor-d3': ['d3-drag', 'd3-hierarchy', 'd3-selection', 'd3-shape', 'd3-zoom'],
            'vendor-motion': ['motion'],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
