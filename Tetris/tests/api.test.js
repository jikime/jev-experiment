import { test } from 'node:test';
import assert from 'node:assert/strict';

// 비밀번호 잠금 확인(네트워크는 부르지 않는다). 저장소가 공개라 실제 비밀번호 대신 시험용 값만 쓴다.
process.env.TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY || 'test-key';
process.env.JEV_WRONG_PASSWORD_DELAY_MS = '0';
const { isAuthorized, jevResponse, statusResponse } = await import('../scripts/jev-api.mjs');
const { default: jevHandler } = await import('../api/jev/index.js');
const { default: statusHandler } = await import('../api/jev/status.js');

function withPassword(value, run) {
  const before = process.env.JEV_PASSWORD;
  if (value === null) delete process.env.JEV_PASSWORD;
  else process.env.JEV_PASSWORD = value;
  return Promise.resolve(run()).finally(() => {
    if (before === undefined) delete process.env.JEV_PASSWORD;
    else process.env.JEV_PASSWORD = before;
  });
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    },
    get json() {
      return JSON.parse(this.body);
    },
  };
}

test('잠금: JEV_PASSWORD가 없으면 잠그지 않는다(로컬 개발 기본)', () =>
  withPassword(null, async () => {
    const { body } = await statusResponse({});
    assert.equal(body.locked, false);
    assert.equal(body.authorized, true);
    assert.equal(isAuthorized(undefined), true);
  }));

test('잠금: 비밀번호가 없거나 틀리면 거절하고, 맞으면 통과한다', () =>
  withPassword('test-password', async () => {
    assert.deepEqual((await statusResponse({})).body.locked, true);
    assert.equal((await statusResponse({})).body.authorized, false);
    assert.equal((await statusResponse({ 'x-jev-password': 'wrong' })).body.authorized, false);
    assert.equal((await statusResponse({ 'x-jev-password': 'test-password' })).body.authorized, true);

    const payload = { state: 'x', questions: {} };
    assert.equal((await jevResponse({}, payload)).status, 401);
    assert.equal((await jevResponse({ 'x-jev-password': 'test-passwor' }, payload)).status, 401);
    // 맞는 비밀번호면 다음 검사(요청 형식)까지 간다 — 여기서는 일부러 틀린 형식이라 네트워크 없이 400
    assert.equal((await jevResponse({ 'x-jev-password': 'test-password' }, { questions: {} })).status, 400);
  }));

test('Vercel 함수: POST만 받고, 잠겨 있으면 비밀번호 없이 401, 상태는 잠김을 알린다', () =>
  withPassword('test-password', async () => {
    const get = fakeRes();
    await jevHandler({ method: 'GET', headers: {}, body: null }, get);
    assert.equal(get.statusCode, 405);

    const noPassword = fakeRes();
    await jevHandler({ method: 'POST', headers: {}, body: { state: 'x', questions: {} } }, noPassword);
    assert.equal(noPassword.statusCode, 401);
    assert.equal(noPassword.headers['cache-control'], 'no-store');

    const status = fakeRes();
    await statusHandler({ method: 'GET', headers: { 'x-jev-password': 'test-password' } }, status);
    assert.deepEqual([status.json.locked, status.json.authorized], [true, true]);
    assert.ok(!status.body.includes('test-password'), '응답에 비밀번호가 담기지 않는다');
  }));
