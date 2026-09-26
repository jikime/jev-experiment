// /api/jev 요청 처리: 개발 서버(serve.mjs)와 Vercel 함수(api/jev/)가 함께 쓴다.
// 비밀번호는 환경변수 JEV_PASSWORD에만 둔다(저장소가 공개라 코드에 적으면 누구나 볼 수 있다).
// JEV_PASSWORD가 없으면 잠그지 않는다(로컬 개발 기본). 확인은 반드시 서버에서 한다 — 브라우저 코드는 누구나 받아 본다.
import { createHash, timingSafeEqual } from 'node:crypto';
import { JEV_MODEL, apiKey, callJev } from './jev-client.mjs';

export const PASSWORD_HEADER = 'x-jev-password';

const expectedPassword = () => process.env.JEV_PASSWORD?.trim() || '';

export function passwordRequired() {
  return Boolean(expectedPassword());
}

// 길이가 달라도 걸리는 시간이 같도록 해시끼리 비교한다.
export function isAuthorized(given) {
  const expected = expectedPassword();
  if (!expected) return true;
  if (typeof given !== 'string' || !given) return false;
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

// 틀리면 잠깐 늦게 답해, 여러 번 대입해 보는 걸 느리게 만든다.
async function denied() {
  const delay = Number(process.env.JEV_WRONG_PASSWORD_DELAY_MS ?? 800);
  await new Promise((done) => setTimeout(done, delay));
  return { status: 401, body: { error: '비밀번호가 맞지 않아요.' } };
}

// GET /api/jev/status → { configured, model, locked, authorized }
export async function statusResponse(headers = {}) {
  const given = headers[PASSWORD_HEADER];
  const authorized = isAuthorized(given);
  if (given && !authorized) await denied();
  return { status: 200, body: { configured: Boolean(apiKey()), model: JEV_MODEL, locked: passwordRequired(), authorized } };
}

// POST /api/jev (body: { state, questions, model? })
export async function jevResponse(headers = {}, payload) {
  if (!apiKey()) return { status: 503, body: { error: 'TYPESAFE_API_KEY가 설정되지 않았어요.' } };
  if (!isAuthorized(headers[PASSWORD_HEADER])) return denied();
  if (!payload || typeof payload !== 'object' || payload.state === undefined || typeof payload.questions !== 'object') {
    return { status: 400, body: { error: 'state와 questions가 필요해요.' } };
  }
  try {
    const result = await callJev(payload);
    if (!result.ok) return { status: result.status, body: { error: result.error, requestId: result.requestId } };
    return { status: 200, body: { ...result.data, requestId: result.requestId, upstreamMs: result.upstreamMs } };
  } catch (err) {
    return { status: 502, body: { error: `Jev에 연결하지 못했어요: ${err.message}` } };
  }
}
