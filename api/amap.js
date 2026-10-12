const REST_API_ORIGIN = 'https://restapi.amap.com/';
const WEB_API_ORIGIN = 'https://webapi.amap.com/';

function resolveUpstreamPath(requestUrl) {
  const configuredPath = requestUrl.searchParams.get('path');
  const pathname = configuredPath || requestUrl.pathname.replace(/^\/api\/amap\/?/, '');
  return pathname.replace(/^\/+/, '');
}

function isSafeUpstreamPath(pathname) {
  return Boolean(pathname) && !pathname.includes('..') && !pathname.includes('://');
}

export default async function handler(request, response) {
  const securityCode = process.env.AMAP_SECURITY_CODE;
  if (!securityCode) {
    response.status(503).json({ info: 'AMAP_SECURITY_CODE is not configured', status: '0' });
    return;
  }

  const requestUrl = new URL(request.url, 'https://localhost');
  const upstreamPath = resolveUpstreamPath(requestUrl);
  if (!isSafeUpstreamPath(upstreamPath)) {
    response.status(400).json({ info: 'Invalid AMap service path', status: '0' });
    return;
  }

  const origin = upstreamPath.startsWith('v4/map/styles') ? WEB_API_ORIGIN : REST_API_ORIGIN;
  const upstreamUrl = new URL(upstreamPath, origin);
  requestUrl.searchParams.delete('path');
  requestUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.append(key, value));
  upstreamUrl.searchParams.set('jscode', securityCode);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: request.headers.accept || '*/*' },
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    });
    response.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    const cacheControl = upstream.headers.get('cache-control');
    if (contentType) response.setHeader('content-type', contentType);
    if (cacheControl) response.setHeader('cache-control', cacheControl);
    response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    response.status(502).json({ info: 'AMap service proxy failed', status: '0' });
  }
}
