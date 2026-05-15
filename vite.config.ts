import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import ElementPlus from 'unplugin-element-plus/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BASE || '/',
    plugins: [
      vue(),
      tailwindcss(),
      ElementPlus({
        format: 'esm',
      }),
    ],
    resolve: {
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.scss', '.css'],
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@packages/icon': fileURLToPath(new URL('./src/packages/icon/index.ts', import.meta.url)),
      },
    },
    server: {
      port: Number(env.VITE_PORT || 5803),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
