export const config = { path: ['/_AMapService', '/_AMapService/*'], preferStatic: false };

export default async function handler(request) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const securityCode = process.env.AMAP_SECURITY_CODE;
  if (!securityCode) {
    return Response.json({ info: 'AMAP_SECURITY_CODE is not configured', status: '0' }, { status: 503 });
  }
  const incoming = new URL(request.url);
  const path = incoming.pathname.replace(/^\/_AMapService\/?/, '');
  if (!path || path.includes('..') || path.includes('://') || path.startsWith('/')) {
    return Response.json({ info: 'Invalid AMap service path', status: '0' }, { status: 400 });
  }
  const origin = path.startsWith('v4/map/styles') ? 'https://webapi.amap.com/' : 'https://restapi.amap.com/';
  const upstream = new URL(path, origin);
  incoming.searchParams.forEach((value, key) => upstream.searchParams.append(key, value));
  upstream.searchParams.set('jscode', securityCode);
  try {
    const result = await fetch(upstream, {
      method: request.method,
      headers: { Accept: request.headers.get('accept') || '*/*' },
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    const headers = new Headers();
    for (const name of ['content-type', 'cache-control']) {
      if (result.headers.has(name)) headers.set(name, result.headers.get(name));
    }
    return new Response(request.method === 'HEAD' ? null : result.body, { status: result.status, headers });
  } catch {
    return Response.json({ info: 'AMap service proxy failed', status: '0' }, { status: 502 });
  }
}
