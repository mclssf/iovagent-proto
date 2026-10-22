import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import ElementPlus from 'unplugin-element-plus/vite';
import { defineConfig } from 'vite';

// 离线交付独立构建，不读取本机环境文件及服务凭据。
export default defineConfig({
  envDir: false,
  base: '/',
  define: { 'import.meta.env.VITE_AMAP_KEY': JSON.stringify('') },
  plugins: [
    {
      name: 'v260-offline-assets',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('/src/')) return;
        let result = code;
        if (id.endsWith('.vue')) result = result.replaceAll('V1.1', 'V260');
        if (id.endsWith('/views/AgentWork/views/agent.view.vue')) {
          result = result.replace(/logoUrl: 'https?:\/\/[^']+'/g, `logoUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"%3E%3Crect width="32" height="32" rx="6" fill="%23e9eef5"/%3E%3Cpath d="M8 22L16 8L24 22Z" fill="%23526987"/%3E%3C/svg%3E'`);
        }
        return result === code ? undefined : { code: result, map: null };
      },
      transformIndexHtml(html) {
        return html.replace(/<script async src="https:\/\/devops-sec\.sinoiov\.com[^>]+><\/script>/g, '').replace('<title>物流数字化产品服务</title>', '<title>物流数字人 V260 离线演示</title>');
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'demo/amap-config.js', source: 'window.__IOV_AMAP_CONFIG__={key:"",serviceHost:"/_AMapService"};\n' });
      },
    },
    vue(), tailwindcss(), ElementPlus({ format: 'esm' }),
  ],
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.scss', '.css'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@packages/icon': fileURLToPath(new URL('./src/packages/icon/index.ts', import.meta.url)),
    },
  },
  build: { outDir: '../../outputs/v260-demo/V260-demo/site', emptyOutDir: true },
});
