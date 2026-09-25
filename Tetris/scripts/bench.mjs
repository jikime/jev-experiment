// 봇 벤치마크: 같은 시드들로 봇마다 N피스를 두고 결과를 비교한다.
//   npm run bench -- --seeds 4242,7,777 --pieces 50 --bots heuristic,jev
// Jev 응답은 요청 내용의 해시로 bench-out/cache.jsonl에 저장해, 같은 요청은 다시 돈을 내지 않는다
// (Jev는 같은 요청에 거의 같은 답을 준다 — parallel_questions 쿡북). --no-cache로 끌 수 있다.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JEV_MODEL, ROOT, apiKey, callJev } from './jev-client.mjs';
import { enumerateMoves } from '../src/core/placements.js';
import { HeuristicBrain, rankMoves } from '../src/ai/heuristic.js';
import { GATE_CONFIDENCE, JEV_PRICE_PER_MTOK, JevBrain, JevPlusBrain } from '../src/ai/jev.js';
import { playGame } from '../src/ai/simulate.js';

const OUT_DIR = join(ROOT, 'bench-out');
const TOKENS_PER_CALL_ESTIMATE = 7000;

// ── 인자 ───────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (!arg.startsWith('--')) return pairs;
    const next = all[i + 1];
    pairs.push([arg.slice(2), next && !next.startsWith('--') ? next : true]);
    return pairs;
  }, []),
);
// --seeds 4242,7,777 또는 범위 --seeds 101-112
const seeds = String(args.seeds ?? '4242,7,777')
  .split(',')
  .flatMap((part) => {
    const [from, to] = part.split('-').map(Number);
    return Number.isFinite(to) ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [from];
  });
const pieces = Number(args.pieces ?? 50);
const botNames = String(args.bots ?? 'heuristic,jev').split(',');
const concurrency = Number(args.concurrency ?? 3);
const maxCost = Number(args['max-cost'] ?? 0.5);
const useCache = !args['no-cache'];
const label = args.label ?? new Date().toISOString().replace(/[:.]/g, '-');

// ── Jev 호출(캐시) ─────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const cachePath = join(OUT_DIR, 'cache.jsonl');
const cache = new Map();
if (useCache) {
  try {
    for (const line of readFileSync(cachePath, 'utf8').split('\n')) {
      if (!line) continue;
      const { key, value } = JSON.parse(line);
      cache.set(key, value);
    }
  } catch {
    // 캐시가 아직 없다
  }
}
const spend = { apiCalls: 0, cacheHits: 0, inputTokens: 0 };

async function ask(request) {
  const payload = { state: request.state, questions: request.questions, model: JEV_MODEL };
  const key = createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  if (useCache && cache.has(key)) {
    spend.cacheHits += 1;
    return cache.get(key);
  }
  const result = await callJev(payload);
  if (!result.ok) throw new Error(result.error);
  const value = { ...result.data, requestId: result.requestId, latencyMs: result.upstreamMs };
  spend.apiCalls += 1;
  spend.inputTokens += value.usage?.input_tokens ?? 0;
  if (useCache) {
    cache.set(key, value);
    appendFileSync(cachePath, `${JSON.stringify({ key, value })}\n`);
  }
  return value;
}

// ── 봇 목록 ────────────────────────────────────────────
// 새 변형은 여기에 이름을 붙여 추가한다. usesJev: 비용 추정 대상.
const BOTS = {
  heuristic: { make: () => new HeuristicBrain() },
  'heuristic-look': { make: () => new HeuristicBrain({ lookahead: true }) },
  jev: { usesJev: true, make: () => new JevBrain({ ask }) },
  'jev-gate': { usesJev: true, make: () => new JevBrain({ ask, gate: GATE_CONFIDENCE }) },
  'jev-gate-look': { usesJev: true, make: () => new JevBrain({ ask, gate: GATE_CONFIDENCE, lookahead: 'recheck' }) },
  'jev-gate-look-drop': { usesJev: true, make: () => new JevBrain({ ask, gate: GATE_CONFIDENCE, lookahead: 'recheck', reach: 'drop' }) },
  'jev-group': {
    usesJev: true,
    make: () => new JevBrain({ ask, gate: GATE_CONFIDENCE, lookahead: 'recheck', reach: 'drop', group: true }),
  },
  'jev-plus': { usesJev: true, make: () => new JevPlusBrain({ ask }) },
  'jev-plus-tspin': {
    usesJev: true,
    make: () => new JevPlusBrain({ ask, requestOptions: { policy: { understood: true, tspin: true, risk: 1 } } }),
  },
  'jev-plus-tetris': {
    usesJev: true,
    make: () => new JevPlusBrain({ ask, requestOptions: { policy: { understood: true, tetris: true, well: 'right', risk: 1 } } }),
  },
  // 플레이어가 "오른쪽 끝 한 줄을 비워 두고 테트리스를 노려"라고 말했을 때의 정책(strategy.js가 만드는 값)
  'jev-tetris': {
    usesJev: true,
    make: () =>
      new JevBrain({
        ask,
        gate: GATE_CONFIDENCE,
        lookahead: 'recheck',
        reach: 'drop',
        requestOptions: { policy: { understood: true, tetris: true, well: 'right', risk: 1 } },
      }),
  },
  'jev-look': { usesJev: true, make: () => new JevBrain({ ask, lookahead: 'all' }) },
  'jev-look-gate': { usesJev: true, make: () => new JevBrain({ ask, gate: GATE_CONFIDENCE, lookahead: 'all' }) },
};

for (const name of botNames) {
  if (!BOTS[name]) {
    console.error(`모르는 봇: ${name} (가능: ${Object.keys(BOTS).join(', ')})`);
    process.exit(1);
  }
}
const jevGames = botNames.filter((name) => BOTS[name].usesJev).length * seeds.length;
const estimate = (jevGames * pieces * TOKENS_PER_CALL_ESTIMATE * JEV_PRICE_PER_MTOK) / 1e6;
if (jevGames) {
  if (!apiKey()) {
    console.error('Jev 봇을 돌리려면 Tetris/.env에 TYPESAFE_API_KEY가 필요해요.');
    process.exit(1);
  }
  console.log(`Jev 판 ${jevGames}개 × ${pieces}피스 · 모델 ${JEV_MODEL} · 예상 비용 최대 $${estimate.toFixed(3)} (캐시에 있으면 무료)`);
  if (estimate > maxCost && !args.yes) {
    console.error(`예상 비용이 --max-cost $${maxCost}를 넘어요. 괜찮으면 --yes를 붙이세요.`);
    process.exit(1);
  }
}

// ── 실행 ───────────────────────────────────────────────
const placementKey = (move) => `${move.cells.map(([x, y]) => `${x},${y}`).sort().join(' ')}|${move.features.tspin}`;

async function runOne(name, seed) {
  const decisions = [];
  const started = performance.now();
  const result = await playGame(BOTS[name].make(), {
    seed,
    pieces,
    onDecision(decision, snapshot) {
      if (!decision) return;
      // 같은 보드에서 휴리스틱이 매긴 순위와 비교: 1이면 휴리스틱과 같은 수.
      const ranked = rankMoves(enumerateMoves(snapshot));
      const best = ranked[0].move.features;
      const f = decision.move.features;
      decisions.push({
        source: decision.source,
        confidence: decision.firstConfidence ?? decision.confidence ?? null, // 첫 질문의 확신도
        finalConfidence: decision.confidence ?? null,
        // 후보 번호는 찾는 방식에 따라 달라지므로 놓이는 칸과 T-스핀으로 맞춘다.
        rank: ranked.findIndex((r) => placementKey(r.move) === placementKey(decision.move)) + 1,
        candidates: ranked.length,
        avoidableHole: f.newHoles > best.newHoles,
        higherThanBest: f.maxHeight > best.maxHeight,
        lines: f.lines,
        tspin: f.tspin ?? 'none',
        ms: decision.ms,
        passes: decision.passes ?? (decision.source === 'jev' ? 1 : 0),
        tokens: decision.usage?.input_tokens ?? 0,
      });
    },
  });
  return { bot: name, seed, ...result, wallMs: Math.round(performance.now() - started), decisions };
}

const jobs = botNames.flatMap((name) => seeds.map((seed) => () => runOne(name, seed)));
const runs = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const run = await job();
      runs.push(run);
      console.log(`  ${run.bot.padEnd(14)} seed ${String(run.seed).padEnd(6)} ${run.state === 'finished' ? '완주' : `게임 오버(${run.pieces})`} 줄 ${run.lines} 점수 ${run.score}`);
    }
  }),
);

// ── 요약 ───────────────────────────────────────────────
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x) => `${Math.round(x * 100)}%`;
const summary = botNames.map((name) => {
  const mine = runs.filter((r) => r.bot === name);
  const moves = mine.flatMap((r) => r.decisions);
  const judged = moves.filter((d) => d.confidence !== null);
  return {
    bot: name,
    runs: mine.length,
    finished: mine.filter((r) => r.state === 'finished').length,
    lines: mean(mine.map((r) => r.lines)),
    score: mean(mine.map((r) => r.score)),
    tetrises: mine.reduce((s, r) => s + r.tetrises, 0),
    tspins: mine.reduce((s, r) => s + r.tspins, 0),
    holes: mean(mine.map((r) => r.holes)),
    peak: mean(mine.map((r) => r.peak)),
    sameAsHeuristic: mean(moves.map((d) => (d.rank === 1 ? 1 : 0))),
    avoidableHolesPerGame: mine.length ? moves.filter((d) => d.avoidableHole).length / mine.length : 0,
    confidence: judged.length ? mean(judged.map((d) => d.finalConfidence)) : null,
    rechecks: moves.filter((d) => d.passes === 2).length,
    jevCalls: moves.reduce((s, d) => s + d.passes, 0),
    fallbacks: moves.filter((d) => d.source === 'fallback').length,
    msPerMove: mean(moves.map((d) => d.ms)),
  };
});

console.log(`\n${pieces}피스 × 시드 [${seeds.join(', ')}]`);
console.log('봇              완주  평균줄  평균점수  테트리스 T스핀  남은구멍  최고높이  휴리스틱과같은수  피할수있던구멍/판  확신도  호출 재질문');
for (const s of summary) {
  console.log(
    `${s.bot.padEnd(14)} ${`${s.finished}/${s.runs}`.padStart(5)} ${s.lines.toFixed(1).padStart(7)} ${Math.round(s.score).toString().padStart(9)} ${String(s.tetrises).padStart(8)} ${String(s.tspins).padStart(5)} ${s.holes.toFixed(1).padStart(9)} ${s.peak.toFixed(1).padStart(9)} ${pct(s.sameAsHeuristic).padStart(16)} ${s.avoidableHolesPerGame.toFixed(1).padStart(17)} ${s.confidence === null ? '     —' : s.confidence.toFixed(2).padStart(7)} ${String(s.jevCalls).padStart(5)} ${String(s.rechecks).padStart(5)}`,
  );
}

// 첫 질문의 확신도 구간별로 실수가 몰리는지(확신도로 거를 가치가 있는지, 다시 묻기가 고쳤는지) 본다.
for (const name of botNames) {
  const judgedMoves = runs.filter((r) => r.bot === name).flatMap((r) => r.decisions.filter((d) => d.confidence !== null));
  if (!judgedMoves.length) continue;
  console.log(`\n[${name}] 첫 확신도   수   다시 물음   휴리스틱과 같은 수   피할 수 있던 구멍`);
  for (const [lo, hi] of [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]]) {
    const bucket = judgedMoves.filter((d) => d.confidence >= lo && d.confidence < hi);
    if (!bucket.length) continue;
    const rate = (key) => pct(bucket.filter(key).length / bucket.length);
    console.log(
      `${`${lo.toFixed(1)}–${Math.min(hi, 1).toFixed(1)}`.padEnd(16)} ${String(bucket.length).padStart(4)} ${rate((d) => d.passes === 2).padStart(10)} ${rate((d) => d.rank === 1).padStart(18)} ${rate((d) => d.avoidableHole).padStart(18)}`,
    );
  }
}

// 짝지은 비교: 같은 시드에서 (봇 − 첫 번째 봇)의 차이를 시드 단위로 재표집(부트스트랩)해 95% 신뢰구간을 낸다.
// 구간이 0을 넘지 않으면(양쪽이 같은 부호) 우연이라 보기 어려운 차이로 표시한다(*).
function bootstrapCI(diffs, rounds = 4000) {
  let state = 12345; // 결과가 매번 같도록 고정 시드
  const rand = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const means = [];
  for (let r = 0; r < rounds; r++) {
    let sum = 0;
    for (let i = 0; i < diffs.length; i++) sum += diffs[Math.floor(rand() * diffs.length)];
    means.push(sum / diffs.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(rounds * 0.025)], means[Math.floor(rounds * 0.975)]];
}

const METRICS = [
  ['지운 줄', (r) => r.lines],
  ['점수', (r) => r.score],
  ['남은 구멍', (r) => r.holes],
  ['최고 높이', (r) => r.peak],
  ['피할 수 있던 구멍', (r) => r.decisions.filter((d) => d.avoidableHole).length],
];
if (botNames.length > 1 && seeds.length > 2) {
  const base = botNames[0];
  console.log(`\n짝지은 비교 (${base} 대비, 시드 ${seeds.length}개, 95% 신뢰구간, * = 우연으로 보기 어려운 차이)`);
  for (const name of botNames.slice(1)) {
    const cells = METRICS.map(([metric, value]) => {
      const diffs = seeds.map((seed) => {
        const a = runs.find((r) => r.bot === base && r.seed === seed);
        const b = runs.find((r) => r.bot === name && r.seed === seed);
        return value(b) - value(a);
      });
      const [lo, hi] = bootstrapCI(diffs);
      const sure = lo > 0 || hi < 0 ? '*' : ' ';
      const fmt = (x) => (Math.abs(x) >= 100 ? Math.round(x).toString() : x.toFixed(1));
      return `${metric} ${mean(diffs) >= 0 ? '+' : ''}${fmt(mean(diffs))} [${fmt(lo)}, ${fmt(hi)}]${sure}`;
    });
    console.log(`  ${name.padEnd(16)} ${cells.join('  ')}`);
  }
}

const cost = (spend.inputTokens / 1e6) * JEV_PRICE_PER_MTOK;
console.log(`\nJev API 호출 ${spend.apiCalls}회(캐시 ${spend.cacheHits}회) · 입력 ${spend.inputTokens.toLocaleString('en-US')}토큰 · 이번 실행 비용 $${cost.toFixed(4)}`);
const file = join(OUT_DIR, `${label}.json`);
writeFileSync(file, JSON.stringify({ label, model: JEV_MODEL, pieces, seeds, summary, runs, spend }, null, 2));
console.log(`결과 저장: ${file}`);
