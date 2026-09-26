// Vercel 함수: POST /api/jev — 비밀번호를 확인하고 TypeSafe로 넘긴다(처리는 scripts/jev-api.mjs).
// Vercel 환경변수: TYPESAFE_API_KEY(필수), JEV_PASSWORD(설정하면 비밀번호를 아는 사람만 Jev를 쓴다).
import { jevResponse } from '../../scripts/jev-api.mjs';

export default async function handler(req, res) {
  let payload = req.body;
  if (req.method !== 'POST') return send(res, 405, { error: 'POST로만 부를 수 있어요.' });
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return send(res, 400, { error: 'JSON 형식이 아니에요.' });
    }
  }
  const { status, body } = await jevResponse(req.headers, payload);
  return send(res, status, body);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
