import assert from 'node:assert/strict';
import handler from '../api/amap.js';

const originalFetch = globalThis.fetch;
const originalCode = process.env.AMAP_SECURITY_CODE;
const calls = [];
process.env.AMAP_SECURITY_CODE = 'test-only-security-code';
globalThis.fetch = async (url, options) => {
  calls.push({ url: new URL(url), options });
  return new Response('{"status":"1"}', { status: 200, headers: { 'content-type': 'application/json' } });
};
const response = () => ({ statusCode: 0, body: undefined, status(code) { this.statusCode = code; return this; }, setHeader() {}, send(body) { this.body = body; }, json(body) { this.body = body; } });
try {
  const referer = 'https://proto.aicoach.cn/index/daily-tasks';
  const first = response();
  await handler({ url: '/api/amap?path=v3/direction/driving&key=test-key', method: 'GET', headers: { accept: 'application/json', referer, cookie: 'private-session', authorization: 'private-auth' } }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(calls[0].options.headers.Referer, referer, 'forward the actual browser Referer, never substitute a whitelisted host');
  assert.equal(calls[0].url.searchParams.get('jscode'), 'test-only-security-code');
  assert.equal(calls[0].url.origin, 'https://restapi.amap.com');
  assert.equal(calls[0].options.headers.cookie, undefined);
  assert.equal(calls[0].options.headers.authorization, undefined);
  await handler({ url: '/api/amap?path=v4/map/styles&key=test-key', method: 'HEAD', headers: {} }, response());
  assert.equal(calls[1].url.origin, 'https://webapi.amap.com');
  assert.equal(calls[1].options.headers.Referer, undefined, 'absent Referer is not forged');
  assert.equal(calls[1].options.method, 'HEAD');
  console.log('PASS: AMap proxy preserves the real Referer for domain validation, keeps absent headers absent, excludes cookies/auth and preserves API routing.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalCode === undefined) delete process.env.AMAP_SECURITY_CODE; else process.env.AMAP_SECURITY_CODE = originalCode;
}
