import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin to stub out Node.js modules
const stubNodeModules = (): Plugin => ({
  name: 'stub-node-modules',
  enforce: 'pre',
  resolveId(id, importer) {
    // Intercept all imports of these Node.js modules
    if (id === 'fs' || id === 'path' || id === 'node:module' || 
        id === 'node:fs' || id === 'node:path') {
      // Return a virtual module ID
      return '\0stub-' + id.replace(':', '-');
    }
  },
  load(id) {
    // Provide stub implementations for virtual modules
    if (id === '\0stub-fs' || id === '\0stub-node-fs') {
      return 'export const writeFileSync = () => {}; export const readFileSync = () => ""; export default {};';
    }
    if (id === '\0stub-path' || id === '\0stub-node-path') {
      return 'export const resolve = (...args) => args.join("/"); export const join = (...args) => args.join("/"); export default {};';
    }
    if (id === '\0stub-node-module' || id === '\0stub-node:module') {
      return 'export const createRequire = () => (() => ({})); export default {};';
    }
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [stubNodeModules(), react()],
  base: '/densing-ui/',
  optimizeDeps: {
    // Don't pre-bundle densing so our plugin can intercept its imports
    exclude: ['densing'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
    },
  },
})
