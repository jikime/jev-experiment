// Node에서 TypeSafe를 부르는 공용 코드: .env 읽기, 키, 재시도. 개발 서버와 벤치마크가 함께 쓴다.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
loadEnv(join(ROOT, '.env'));

export const JEV_BASE = (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/+$/, '');
// 버전을 고정한다: jev-latest는 새 버전이 나오면 가리키는 모델이 바뀌어 봇의 실력이 예고 없이 달라질 수 있다.
// 후보 설명은 jev-1.13.0으로 맞췄다. 새 버전을 시험할 때는 TYPESAFE_DEFAULT_MODEL로 바꾼다.
export const JEV_MODEL = process.env.TYPESAFE_DEFAULT_MODEL || 'jev-1.13.0';
const ATTEMPT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

// KEY=VALUE 줄만 읽는 최소 .env 로더. 이미 설정된 환경변수는 덮어쓰지 않는다.
function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    const quoted = raw.match(/^(['"])(.*)\1$/);
    const value = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function apiKey() {
  return process.env.TYPESAFE_API_KEY?.trim() || '';
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// SDK 기본 재시도 정책과 같게: 408·429·5xx, 최대 2회, 0.5초부터 두 배(최대 5초), 25% 지터, Retry-After 존중.
function backoff(attempt) {
  const base = Math.min(500 * 2 ** attempt, 5000);
  return base - Math.random() * base * 0.25;
}

function retryAfter(headers) {
  const ms = Number(headers.get('retry-after-ms'));
  if (ms > 0) return ms;
  const seconds = Number(headers.get('retry-after'));
  return seconds > 0 ? seconds * 1000 : null;
}

export async function postWithRetry(body, key = apiKey()) {
  const url = `${JEV_BASE}/v1/systemone`;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(backoff(attempt));
      continue;
    }
    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) return res;
    await res.body?.cancel().catch(() => {});
    await sleep(Math.min(retryAfter(res.headers) ?? backoff(attempt), 10_000));
  }
}

function upstreamError(data, status) {
  const detail = data?.error?.message ?? data?.error ?? data?.detail ?? data?.message;
  const text = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : '';
  return `TypeSafe가 ${status}로 응답했어요${text ? `: ${text.slice(0, 300)}` : ''}`;
}

// { state, questions, model? } → { ok, status, data, requestId, upstreamMs }
export async function callJev({ state, questions, model }) {
  const body = JSON.stringify({ state, questions, model: typeof model === 'string' ? model : JEV_MODEL });
  const started = performance.now();
  const res = await postWithRetry(body);
  const requestId = res.headers.get('x-typesafe-request-id') ?? undefined;
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.slice(0, 300) };
  }
  const upstreamMs = Math.round(performance.now() - started);
  if (!res.ok) return { ok: false, status: res.status, error: upstreamError(data, res.status), requestId, upstreamMs };
  return { ok: true, status: res.status, data, requestId, upstreamMs };
}
