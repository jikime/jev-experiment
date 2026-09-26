// Vercel 함수: GET /api/jev/status — 키가 있는지, 잠겨 있는지, 보낸 비밀번호가 맞는지.
import { statusResponse } from '../../scripts/jev-api.mjs';

export default async function handler(req, res) {
  const { status, body } = await statusResponse(req.headers);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
