export default function handler(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ error: '当前原型展示模拟轨迹，未开放生产查询' });
  }
  return response.status(200).json([]);
}
