import { assets, demoEvidence } from './generated-assets.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method)) {
      return Response.json({ error: '此原型仅提供演示数据，不执行生产查询' }, { status: 405 });
    }
    if (url.pathname.startsWith('/_AMapService/')) {
      if (!env.AMAP_SECURITY_CODE) return Response.json({ status: '0', info: '地图服务尚未配置' }, { status: 503 });
      const path = url.pathname.slice('/_AMapService/'.length);
      if (!path || path.includes('..') || path.includes('://')) return new Response('Invalid path', { status: 400 });
      const upstream = new URL(path, path.startsWith('v4/map/styles') ? 'https://webapi.amap.com/' : 'https://restapi.amap.com/');
      url.searchParams.forEach((value, key) => upstream.searchParams.append(key, value));
      upstream.searchParams.set('jscode', env.AMAP_SECURITY_CODE);
      try {
        const result = await fetch(upstream, {
          method: request.method,
          headers: { Referer: `${url.origin}/`, Accept: request.headers.get('accept') || '*/*' },
          signal: AbortSignal.timeout(15000),
        });
        const headers = new Headers();
        for (const key of ['content-type', 'cache-control']) if (result.headers.has(key)) headers.set(key, result.headers.get(key));
        return new Response(result.body, { status: result.status, headers });
      } catch {
        return Response.json({ status: '0', info: '地图服务暂不可用' }, { status: 502 });
      }
    }
    if (url.pathname === '/api/company-openapi/risk-check') return Response.json(demoEvidence);
    if (url.pathname === '/api/company-openapi/telemetry') return Response.json([]);
    if (url.pathname.startsWith('/api/')) return Response.json({ error: '原型未开放此接口' }, { status: 404 });
    const pathname = decodeURIComponent(url.pathname);
    const asset = assets[pathname] || (!pathname.split('/').pop().includes('.') ? assets['/index.html'] : undefined);
    if (!asset) return new Response('Not found', { status: 404 });
    const bytes = Uint8Array.from(atob(asset.data), char => char.charCodeAt(0));
    return new Response(request.method === 'HEAD' ? null : bytes, {
      headers: { 'Content-Type': asset.type, 'Cache-Control': pathname.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' },
    });
  },
};
