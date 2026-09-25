// 의존성 없는 정적 파일 서버 + Jev 프록시. dist/tetris.js는 요청마다 src/에서 새로 묶어 준다.
// API 키는 서버(.env)에만 두고, 브라우저는 /api/jev를 거쳐서만 TypeSafe를 부른다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { OUT, writeBundle } from './build.mjs';
import { JEV_MODEL, ROOT as root, apiKey, callJev } from './jev-client.mjs';

const port = Number(process.env.PORT) || 5173;
// 기본은 이 컴퓨터에서만 접속: IPv4·IPv6 루프백 둘 다 연다(macOS는 localhost를 ::1로 먼저 풀기도 한다).
// 같은 와이파이의 휴대폰으로 열려면 HOST=0.0.0.0 (Jev 프록시도 함께 열린다).
const hosts = process.env.HOST ? [process.env.HOST] : ['127.0.0.1', '::1'];
const MAX_BODY = 512 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

async function proxyJev(req, res) {
  const key = apiKey();
  if (!key) return sendJson(res, 503, { error: 'Tetris/.env에 TYPESAFE_API_KEY가 없어요.' });

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, err.status ?? 400, { error: err.status === 413 ? '요청이 너무 커요.' : 'JSON 형식이 아니에요.' });
  }
  if (!payload || typeof payload !== 'object' || payload.state === undefined || typeof payload.questions !== 'object') {
    return sendJson(res, 400, { error: 'state와 questions가 필요해요.' });
  }

  try {
    const result = await callJev(payload);
    console.log(`[jev] ${result.status} ${result.upstreamMs}ms${result.requestId ? ` ${result.requestId}` : ''}`);
    if (!result.ok) return sendJson(res, result.status, { error: result.error, requestId: result.requestId });
    sendJson(res, 200, { ...result.data, requestId: result.requestId, upstreamMs: result.upstreamMs });
  } catch (err) {
    console.log(`[jev] 연결 실패: ${err.message}`);
    sendJson(res, 502, { error: `Jev에 연결하지 못했어요: ${err.message}` });
  }
}

async function handle(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/jev/status') {
    return sendJson(res, 200, { configured: Boolean(apiKey()), model: JEV_MODEL });
  }
  if (pathname === '/api/jev') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST로만 부를 수 있어요.' });
    return proxyJev(req, res);
  }

  let path;
  try {
    path = normalize(decodeURIComponent(pathname));
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  // .env 같은 점(.) 파일·폴더는 절대 내려주지 않는다.
  if (path.split(/[\\/]/).some((part) => part.startsWith('.'))) {
    res.writeHead(404).end('Not found');
    return;
  }
  if (path.endsWith('/') || path.endsWith(sep)) path += 'index.html';
  const file = join(root, path);
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = file === OUT ? await writeBundle() : await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

function announce() {
  const everywhere = hosts.some((h) => h === '0.0.0.0' || h === '::');
  console.log(`테트리스 → http://localhost:${port}`);
  console.log(apiKey() ? `Jev 준비됨 (모델: ${JEV_MODEL})` : 'Jev 꺼짐: Tetris/.env에 TYPESAFE_API_KEY를 넣으면 대결에 참가해요.');
  if (everywhere) console.log('주의: 같은 네트워크의 다른 기기도 접속할 수 있어요 (Jev 프록시 포함).');
}

let opened = 0;
for (const host of hosts) {
  const server = createServer(handle);
  server.on('error', (err) => {
    // IPv6가 꺼진 컴퓨터에서는 ::1을 건너뛰고 IPv4만 쓴다.
    if (host === '::1' && ['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(err.code)) return;
    if (err.code === 'EADDRINUSE') {
      console.error(`포트 ${port}을(를) 다른 프로그램이 쓰고 있어요. 다른 포트로 여세요: PORT=5174 npm start`);
    } else {
      console.error(`서버를 열지 못했어요 (${host}:${port}): ${err.message}`);
    }
    process.exit(1);
  });
  server.listen(port, host, () => {
    if (++opened === 1) announce();
  });
}
