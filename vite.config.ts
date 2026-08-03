import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'

export default defineConfig(({ mode }) => ({
  plugins: [
    RubyPlugin(),
  ],
  build: {
    // Every build writes a new content-hashed bundle and vite-plugin-ruby
    // leaves the old ones behind — 92 had piled up here. Harmless on a laptop,
    // dead weight in a deployed image, so the production build starts clean.
    //
    // Production ONLY. In development and test, vite-plugin-ruby autoBuilds on
    // demand, and `bin/rails test` forks a worker per core past 50 tests —
    // each one emptying the shared output directory underneath the others is
    // "Vite Ruby can't find entrypoints/editor.js in the manifests", from a
    // different worker every run.
    emptyOutDir: mode === 'production',
  },
}))
