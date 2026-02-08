import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin to stub out Node.js modules
const stubNodeModules = (): Plugin => ({
  name: 'stub-node-modules',
  enforce: 'pre',
  resolveId(id, importer) {
    // Handle both direct imports and imports from densing
    if (id === 'fs' || id === 'path' || id === 'node:module') {
      return '\0' + id;
    }
    // Also handle when these are imported from within densing
    if (importer?.includes('node_modules/densing')) {
      if (id === 'fs' || id === 'path' || id === 'node:module') {
        return '\0' + id;
      }
    }
  },
  load(id) {
    if (id === '\0fs') {
      return 'export const writeFileSync = () => {}; export default {};';
    }
    if (id === '\0path') {
      return 'export const resolve = (...args) => args.join("/"); export default {};';
    }
    if (id === '\0node:module') {
      return 'export const createRequire = () => ({}); export default {};';
    }
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [stubNodeModules(), react()],
  base: '/densing-ui/',
  optimizeDeps: {
    esbuildOptions: {
      // Define shims for Node.js globals
      define: {
        global: 'globalThis'
      },
    },
  },
})
