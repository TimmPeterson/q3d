import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: (id) => id.includes('node_modules') && id.includes('three') ? 'three' : undefined,
      },
    },
  },
});
