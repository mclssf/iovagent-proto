import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@packages/icon': fileURLToPath(new URL('./src/packages/icon', import.meta.url))
    }
  },
  server: {
    port: 5173
  }
});
