// /api/jev 요청 처리: 개발 서버(serve.mjs)와 Vercel 함수(api/jev/)가 함께 쓴다.
// 비밀번호는 환경변수 JEV_PASSWORD에만 둔다(저장소가 공개라 코드에 적으면 누구나 볼 수 있다).
// JEV_PASSWORD가 없으면 잠그지 않는다(로컬 개발 기본). 확인은 반드시 서버에서 한다 — 브라우저 코드는 누구나 받아 본다.
// 방문자가 자기 TypeSafe 키(x-typesafe-key)를 보내면 비밀번호 없이 그 키로 부르고, 서버 키는 쓰지 않는다
// (요금은 그 키의 계정에 나간다). 방문자 키는 TypeSafe로 넘기기만 하고 저장하거나 로그에 남기지 않는다.
import { createHash, timingSafeEqual } from 'node:crypto';
import { JEV_MODEL, apiKey, callJev } from './jev-client.mjs';

export const PASSWORD_HEADER = 'x-jev-password';
export const USER_KEY_HEADER = 'x-typesafe-key';
// 헤더에 실을 수 있는 글자(공백 없는 ASCII)만 받는다. 브라우저도 같은 규칙으로 먼저 거른다.
export const USER_KEY_PATTERN = /^[\x21-\x7e]{8,256}$/;

const expectedPassword = () => process.env.JEV_PASSWORD?.trim() || '';

function userKey(headers) {
  const value = headers[USER_KEY_HEADER];
  return typeof value === 'string' ? value.trim() : '';
}

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

// 방문자 키 확인: 가장 작은 요청을 한 번 보내 본다(입력 수백 토큰 — 그 계정에 $0.0001도 안 나간다).
const KEY_CHECK = {
  state: 'connection check',
  questions: { ping: { type: 'noul', instructions: 'Is this a connection check?' } },
};

async function checkUserKey(key) {
  if (!USER_KEY_PATTERN.test(key)) return { authorized: false, keyStatus: 400, keyError: 'TypeSafe 키 형식이 아니에요.' };
  try {
    const result = await callJev(KEY_CHECK, key);
    return result.ok ? { authorized: true } : { authorized: false, keyStatus: result.status, keyError: result.error };
  } catch (err) {
    return { authorized: false, keyStatus: 502, keyError: `TypeSafe에 연결하지 못했어요: ${err.message}` };
  }
}

// GET /api/jev/status → { configured, model, locked, authorized, keySource?, keyStatus?, keyError? }
// configured·locked는 서버 설정이다. 방문자 키가 오면 keySource: 'user'와 그 키로 부를 수 있는지(authorized)를 알려 준다.
export async function statusResponse(headers = {}) {
  const server = { configured: Boolean(apiKey()), model: JEV_MODEL, locked: passwordRequired() };
  const key = userKey(headers);
  if (key) return { status: 200, body: { ...server, keySource: 'user', ...(await checkUserKey(key)) } };
  const given = headers[PASSWORD_HEADER];
  const authorized = isAuthorized(given);
  if (given && !authorized) await denied();
  return { status: 200, body: { ...server, authorized } };
}

// POST /api/jev (body: { state, questions, model? })
export async function jevResponse(headers = {}, payload) {
  const key = userKey(headers);
  if (key) {
    if (!USER_KEY_PATTERN.test(key)) return { status: 400, body: { error: 'TypeSafe 키 형식이 아니에요.' } };
  } else {
    if (!apiKey()) return { status: 503, body: { error: 'TYPESAFE_API_KEY가 설정되지 않았어요.' } };
    if (!isAuthorized(headers[PASSWORD_HEADER])) return denied();
  }
  if (!payload || typeof payload !== 'object' || payload.state === undefined || typeof payload.questions !== 'object') {
    return { status: 400, body: { error: 'state와 questions가 필요해요.' } };
  }
  try {
    const result = await callJev(payload, key || apiKey());
    if (!result.ok) return { status: result.status, body: { error: result.error, requestId: result.requestId } };
    return { status: 200, body: { ...result.data, requestId: result.requestId, upstreamMs: result.upstreamMs } };
  } catch (err) {
    return { status: 502, body: { error: `Jev에 연결하지 못했어요: ${err.message}` } };
  }
}
