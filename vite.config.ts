import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import ElementPlus from 'unplugin-element-plus/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

function createAmapConfigScript(env: Record<string, string>) {
  return `window.__IOV_AMAP_CONFIG__=${JSON.stringify({
    key: env.VITE_AMAP_KEY || '',
    serviceHost: env.VITE_AMAP_SERVICE_HOST || '/_AMapService',
  })};\n`;
}

async function proxyAmapRequest(requestUrl: string, securityCode: string) {
  const parsed = new URL(requestUrl, 'http://localhost');
  const upstreamPath = parsed.pathname.replace(/^\/_AMapService\/?/, '');
  const origin = upstreamPath.startsWith('v4/map/styles') ? 'https://webapi.amap.com/' : 'https://restapi.amap.com/';
  const upstream = new URL(upstreamPath, origin);
  parsed.searchParams.forEach((value, key) => upstream.searchParams.append(key, value));
  upstream.searchParams.set('jscode', securityCode);
  return fetch(upstream);
}

function amapIntegration(env: Record<string, string>): Plugin {
  return {
    name: 'iov-amap-integration',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] === '/demo/amap-config.js') {
          response.setHeader('content-type', 'application/javascript; charset=utf-8');
          response.end(createAmapConfigScript(env));
          return;
        }
        const requestPath = request.url?.split('?')[0];
        if (requestPath !== '/_AMapService' && !requestPath?.startsWith('/_AMapService/')) {
          next();
          return;
        }
        if (!env.AMAP_SECURITY_CODE) {
          response.statusCode = 503;
          response.end(JSON.stringify({ info: 'AMAP_SECURITY_CODE is not configured', status: '0' }));
          return;
        }
        try {
          const upstream = await proxyAmapRequest(request.url, env.AMAP_SECURITY_CODE);
          response.statusCode = upstream.status;
          const contentType = upstream.headers.get('content-type');
          const cacheControl = upstream.headers.get('cache-control');
          if (contentType) response.setHeader('content-type', contentType);
          if (cacheControl) response.setHeader('cache-control', cacheControl);
          response.end(Buffer.from(await upstream.arrayBuffer()));
        } catch {
          response.statusCode = 502;
          response.end(JSON.stringify({ info: 'AMap service proxy failed', status: '0' }));
        }
      });
    },
    async closeBundle() {
      const outputDirectory = fileURLToPath(new URL('./dist/demo/', import.meta.url));
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(`${outputDirectory}amap-config.js`, createAmapConfigScript(env), 'utf8');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mcpProxyHeaders: Record<string, string> = {};

  if (env.MCP_AUTHORIZATION) {
    mcpProxyHeaders.Authorization = env.MCP_AUTHORIZATION;
  }
  if (env.MCP_PROJECT_ID) {
    mcpProxyHeaders['x-szr-projectid'] = env.MCP_PROJECT_ID;
  }

  return {
    base: env.VITE_BASE || '/',
    plugins: [
      amapIntegration(env),
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
      proxy: env.MCP_TARGET
        ? {
            '/mcp-proxy': {
              target: env.MCP_TARGET,
              changeOrigin: true,
              headers: mcpProxyHeaders,
              rewrite: (path) => path.replace(/^\/mcp-proxy/, '/mcp'),
            },
          }
        : undefined,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
