import evidence from '../../src/data/demoWarehouseCoordinates.json' with { type: 'json' };

// This hosted prototype serves warehouse coordinates, never local credentials
// or customer vehicle telemetry. Production verification is a separate service.
export default function handler(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ error: '当前原型仅提供演示数据' });
  }
  response.setHeader('Cache-Control', 'public, max-age=300');
  return response.status(200).json(evidence);
}
