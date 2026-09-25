import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { createGrid } from '../src/core/board.js';
import { COLS, ROWS } from '../src/core/constants.js';
import { PIECE_TYPES } from '../src/core/pieces.js';
import { boardStats, enumerateMoves } from '../src/core/placements.js';
import { seededRandom } from '../src/core/random.js';
import { HeuristicBrain, rankMoves } from '../src/ai/heuristic.js';
import { JevBrain, JevPlusBrain, QUESTION_ID, buildJevRequest, describeMove, groupByDescription } from '../src/ai/jev.js';
import { BotDriver, applyAction } from '../src/ai/driver.js';
import { policyFrom, policyLabel } from '../src/ai/strategy.js';

const sorted = (cells) => cells.map(([x, y]) => `${x},${y}`).sort();

// 들쭉날쭉한 스택(가끔 구멍 포함)을 만든다. 꽉 찬 줄은 만들지 않는다.
function randomStack(rng, maxHeight = 8) {
  const grid = createGrid();
  for (let x = 0; x < COLS; x++) {
    const height = Math.floor(rng() * (maxHeight + 1));
    for (let y = ROWS - height; y < ROWS; y++) if (rng() > 0.12) grid[y][x] = 'Z';
  }
  for (let y = 0; y < ROWS; y++) if (grid[y].every(Boolean)) grid[y][Math.floor(rng() * COLS)] = null;
  return grid;
}

// 후보의 actions를 실제 게임에 그대로 입력했을 때 고정되는 칸.
function replay(snapshot, move) {
  const game = new Game({ rng: seededRandom(1) });
  game.grid = snapshot.grid.map((row) => row.slice());
  game.state = 'playing';
  game.holdType = snapshot.holdType;
  game.queue = [...snapshot.next];
  game.fillQueue();
  game.spawn(snapshot.type);
  let locked = null;
  let clear = null;
  game.on('lock', (e) => (locked = e.cells));
  game.on('clear', (e) => (clear = e));
  for (const action of move.actions) applyAction(game, action);
  return { cells: locked, tspin: clear?.tspin ?? 'none', clear };
}

async function flush() {
  await new Promise((done) => setImmediate(done));
}

test('착지 후보: 빈 보드에서 피스마다 서로 다른 자리 수가 맞다', () => {
  const expected = { I: 17, J: 34, L: 34, O: 9, S: 17, T: 34, Z: 17 };
  for (const type of PIECE_TYPES) {
    const moves = enumerateMoves({ grid: createGrid(), type, holdUsed: true });
    assert.equal(moves.length, expected[type], type);
    assert.equal(new Set(moves.map((m) => sorted(m.cells).join(' '))).size, moves.length, `${type} 중복`);
  }
});

test('착지 후보: actions를 실제 엔진에 입력하면 정확히 그 칸에, 같은 T-스핀 판정으로 고정된다 (월킥·홀드·비틀어 넣기 포함)', () => {
  const rng = seededRandom(2024);
  let checked = 0;
  for (let round = 0; round < 12; round++) {
    const grid = randomStack(rng, round < 6 ? 8 : 16);
    for (const type of PIECE_TYPES) {
      const snapshot = { grid, type, holdType: round % 2 ? 'I' : null, holdUsed: false, next: ['O', 'T', 'S'] };
      for (const move of enumerateMoves(snapshot)) {
        const played = replay(snapshot, move);
        assert.deepEqual(sorted(played.cells), sorted(move.cells), `${type} ${move.actions.join(',')}`);
        assert.equal(played.tspin, move.features.tspin, `${type} ${move.actions.join(',')} T-스핀`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 2000, `검사한 후보 ${checked}개`);
});

test('착지 후보: 오버행 아래 T-스핀 더블 자리를 스스로 찾아내고, 그대로 두면 1200점이다', () => {
  const grid = createGrid();
  for (let x = 0; x < COLS; x++) if (x !== 4) grid[ROWS - 1][x] = 'Z';
  for (let x = 0; x < COLS; x++) if (![3, 4, 5].includes(x)) grid[ROWS - 2][x] = 'Z';
  grid[ROWS - 3][3] = 'Z'; // 왼쪽 오버행
  grid[ROWS - 3][6] = 'Z';
  const snapshot = { grid, type: 'T', holdType: null, holdUsed: true, next: [] };
  const moves = enumerateMoves(snapshot);
  const tsd = moves.find((m) => m.features.tspin === 'full' && m.features.lines === 2);
  assert.ok(tsd, 'T-스핀 더블 후보가 있어야 한다');
  assert.ok(tsd.actions.includes('down'), '한 칸씩 내려 오버행 밑으로 들어간다');
  const played = replay(snapshot, tsd);
  assert.deepEqual([played.clear.tspin, played.clear.lines, played.clear.points], ['full', 2, 1200]);
  // 빠른 방식(드롭만)으로는 이 자리에 닿지 못한다.
  assert.ok(!enumerateMoves(snapshot, { reach: 'drop' }).some((m) => m.features.tspin !== 'none'));
});

test('착지 후보: 줄 삭제·새 구멍 수를 계산한다', () => {
  const well = createGrid();
  for (let y = ROWS - 4; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) well[y][x] = 'Z';
  const tetris = enumerateMoves({ grid: well, type: 'I', holdUsed: true }).find((m) => m.features.lines === 4);
  assert.ok(tetris, '오른쪽 우물에 I를 세우면 4줄');
  assert.deepEqual(tetris.columns, [9, 9]);
  assert.equal(tetris.features.maxHeight, 0);

  const flat = enumerateMoves({ grid: createGrid(), type: 'T', holdUsed: true });
  assert.ok(flat.filter((m) => m.rot === 0).every((m) => m.features.newHoles === 0), 'T 평평한 면이 아래면 구멍 없음');
  assert.ok(flat.filter((m) => m.rot === 2).every((m) => m.features.newHoles === 2), 'T를 뒤집어 놓으면 구멍 2개');
  assert.deepEqual(boardStats(createGrid()), { heights: Array(COLS).fill(0), holes: 0, bumpiness: 0, aggregateHeight: 0, maxHeight: 0 });
});

test('착지 후보: 홀드를 이미 썼으면 홀드 후보가 없고, 아니면 들어올 피스로 만든다', () => {
  const noHold = enumerateMoves({ grid: createGrid(), type: 'T', holdType: null, holdUsed: true, next: ['I'] });
  assert.ok(noHold.every((m) => !m.hold));
  const withHold = enumerateMoves({ grid: createGrid(), type: 'T', holdType: null, holdUsed: false, next: ['I'] });
  const held = withHold.filter((m) => m.hold);
  assert.equal(held.length, 17);
  assert.ok(held.every((m) => m.type === 'I' && m.actions[0] === 'hold'));
  assert.deepEqual(withHold.map((m) => m.id), withHold.map((_, i) => `move_${i}`));
});

test('착지 후보: 놓기 전 보드와 비교한 값(놓이는 높이·높이 변화·표면 변화)을 준다', () => {
  const grid = createGrid();
  for (let x = 0; x < 5; x++) for (let y = ROWS - 3; y < ROWS; y++) grid[y][x] = 'Z'; // 왼쪽 반만 3줄
  const moves = enumerateMoves({ grid, type: 'O', holdUsed: true });
  const low = moves.find((m) => m.columns[0] === 5);
  const high = moves.find((m) => m.columns[0] === 0);
  assert.deepEqual([low.features.landing, low.features.lowestColumn, low.features.highestColumn], [0, 0, 3]);
  assert.equal(low.features.heightGain, 0); // 오른쪽 바닥에 놓으면 가장 높은 열은 그대로
  assert.equal(high.features.landing, 3);
  assert.equal(high.features.heightGain, 2); // 왼쪽 탑 위에 놓으면 두 줄 높아진다
  assert.equal(describeMove(low).lands_on, 'the lowest part of the board');
  assert.equal(describeMove(high).lands_on, 'on top of the highest part of the stack');
});

test('휴리스틱: 테트리스를 노릴 수 있으면 우물에 I를 세운다', () => {
  const well = createGrid();
  for (let y = ROWS - 4; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) well[y][x] = 'Z';
  const decision = new HeuristicBrain().decide({ grid: well, type: 'I', holdType: null, holdUsed: true, next: [] });
  assert.equal(decision.move.features.lines, 4);
  const ranked = rankMoves(enumerateMoves({ grid: well, type: 'O', holdUsed: true }));
  assert.ok(ranked[0].score >= ranked.at(-1).score);
});

test('Jev 요청: 후보 하나당 선택지 하나, 모든 설명이 같은 필드를 쓴다', () => {
  const rng = seededRandom(9);
  for (const type of PIECE_TYPES) {
    const snapshot = { grid: randomStack(rng), type, holdType: null, holdUsed: false, next: ['I', 'O', 'T', 'S'] };
    const moves = enumerateMoves(snapshot);
    const request = buildJevRequest(snapshot, moves);
    const question = request.questions[QUESTION_ID];
    assert.equal(question.type, 'choice');
    assert.deepEqual(Object.keys(question.criteria), moves.map((m) => m.id));
    assert.ok(moves.length <= 255, 'Choice 선택지는 255개까지');
    const fields = Object.keys(describeMove(moves[0]));
    for (const description of Object.values(question.criteria)) assert.deepEqual(Object.keys(description), fields);
    assert.equal(request.state.board, undefined, '기본은 보드 격자를 보내지 않는다');
    assert.deepEqual(request.state.next_pieces, ['I', 'O', 'T']);
    const withBoard = buildJevRequest(snapshot, moves, { board: true }).state.board;
    assert.equal(withBoard.length, 20);
    assert.ok(withBoard.every((row) => /^[#.]{10}$/.test(row)));
  }
});

test('Jev 두뇌: 고른 후보를 두고, 실패하면 휴리스틱 수로 대신 둔다', async () => {
  const snapshot = { grid: createGrid(), type: 'T', holdType: null, holdUsed: true, next: ['I'] };
  const picked = await new JevBrain({
    ask: async () => ({
      model: 'jev-test',
      answers: { [QUESTION_ID]: { type: 'choice', choice: 'move_3', confidence: 0.7, probabilities: { move_3: 0.8, move_1: 0.2 } } },
      usage: { input_tokens: 1000, output_tokens: 10 },
      latencyMs: 250,
    }),
  }).decide(snapshot);
  assert.equal(picked.source, 'jev');
  assert.equal(picked.move.id, 'move_3');
  assert.equal(picked.confidence, 0.7);
  assert.deepEqual(picked.alternatives.map((a) => a.move.id), ['move_3', 'move_1']);

  const failed = await new JevBrain({
    ask: async () => {
      throw new Error('boom');
    },
  }).decide(snapshot);
  assert.equal(failed.source, 'fallback');
  assert.equal(failed.error, 'boom');
  assert.equal(failed.move.id, new HeuristicBrain().decide(snapshot).move.id);
});

test('봇 운전: 답이 늦게 와도(네트워크 지연) 결과는 즉답과 똑같다 — 생각하는 동안 중력이 멈춘다', async () => {
  async function play(delayMs) {
    const game = new Game({ rng: seededRandom(11), pieceLimit: 30 });
    const brain = new HeuristicBrain();
    const slow = { decide: (snap) => new Promise((done) => setTimeout(() => done(brain.decide(snap)), delayMs)) };
    const driver = new BotDriver(game, delayMs ? slow : brain, { stepMs: 0 });
    game.start();
    const started = Date.now();
    while (game.state !== 'finished' && game.state !== 'over' && Date.now() - started < 10_000) {
      driver.update(16); // 지연되는 동안에도 프레임은 계속 흐른다
      await new Promise((done) => setTimeout(done, 1));
    }
    return { state: game.state, score: game.score, lines: game.lines, grid: game.grid.map((row) => row.join()).join('|') };
  }
  const instant = await play(0);
  const delayed = await play(25);
  assert.equal(instant.state, 'finished');
  assert.deepEqual(delayed, instant);
});

test('봇 운전: 휴리스틱 봇이 같은 시드로 100피스를 끝까지 둔다', async () => {
  const game = new Game({ rng: seededRandom(7), pieceLimit: 100 });
  let decisions = 0;
  const driver = new BotDriver(game, new HeuristicBrain(), { stepMs: 0, onDecision: () => (decisions += 1) });
  game.start();
  for (let i = 0; i < 5000 && game.state !== 'finished' && game.state !== 'over'; i++) {
    driver.update(16);
    await flush();
  }
  assert.equal(game.state, 'finished');
  assert.equal(game.stats.pieces, 100);
  assert.equal(decisions, 100);
  assert.ok(game.lines >= 30, `지운 줄 ${game.lines}`);
});

// 실제 jev-1.13.0이 한국어 문장에 준 답(2026-09-26 녹화)으로 정책 변환을 확인한다. API는 부르지 않는다.
test('전략: 한국어 문장에 대한 Jev 답을 정책으로 바꾼다 (반반인 값은 켜지 않는다)', () => {
  const answers = (strategy, tetris, side, sideConf, risk, riskConf) => ({
    is_strategy: { noul: strategy },
    wants_tetris: { noul: tetris },
    well_side: { choice: side, confidence: sideConf },
    risk: { score: risk, confidence: riskConf },
  });
  const pick = ({ understood, tetris, well, risk }) => ({ understood, tetris, well, risk });
  // "오른쪽 끝 한 줄을 비워 두고 테트리스를 노려" — 위험은 말하지 않았다(확신 0.34) → 균형
  assert.deepEqual(pick(policyFrom(answers(0.93, 0.76, 'right', 0.98, 1.56, 0.34))), { understood: true, tetris: true, well: 'right', risk: 1 });
  // "4줄 한 번에 지우는 걸 노려줘. 왼쪽 벽 쪽을 비워 둬"
  assert.deepEqual(pick(policyFrom(answers(0.96, 0.91, 'left', 1, 1.35, 0.19))), { understood: true, tetris: true, well: 'left', risk: 1 });
  // "안전하게, 최대한 낮게 쌓아"
  assert.deepEqual(pick(policyFrom(answers(0.85, 0.11, 'none', 0.98, 0, 1))), { understood: true, tetris: false, well: null, risk: 0 });
  // "과감하게 높이 쌓아서 크게 터뜨려" — 테트리스 여부가 정확히 반반 → 켜지 않는다
  assert.deepEqual(pick(policyFrom(answers(0.82, 0.5, 'none', 0.98, 2, 1))), { understood: true, tetris: false, well: null, risk: 2 });
  // "오늘 점심 뭐 먹지?"
  assert.equal(policyFrom(answers(0, 0.01, 'none', 0.98, 0.29, 0.56)).understood, false);
  assert.equal(policyLabel(policyFrom(answers(0.93, 0.76, 'right', 0.98, 1.56, 0.34))), '테트리스 노리기 · 오른쪽 끝 줄 비우기 · 균형 있게');
});

test('전략: 우물 쪽이 정해지면 모든 후보에 edge_column이 붙고, 우선순위에 우물 규칙이 들어간다', () => {
  const snapshot = { grid: createGrid(), type: 'I', holdType: null, holdUsed: true, next: ['O'] };
  const moves = enumerateMoves(snapshot, { reach: 'drop' });
  const policy = { understood: true, tetris: true, well: 'right', risk: 1 };
  const request = buildJevRequest(snapshot, moves, { policy });
  const criteria = Object.values(request.questions[QUESTION_ID].criteria);
  assert.ok(criteria.every((d) => typeof d.edge_column === 'string'));
  const right = moves.find((m) => m.columns[1] === COLS - 1);
  assert.match(describeMove(right, policy).edge_column, /puts blocks into the right edge column/);
  assert.ok(request.questions[QUESTION_ID].instructions.priorities_in_order.some((p) => p.includes('right edge column empty')));
  // 전략이 없으면 우물 규칙도 edge_column도 없다
  const plain = buildJevRequest(snapshot, moves);
  assert.ok(Object.values(plain.questions[QUESTION_ID].criteria).every((d) => !('edge_column' in d)));
});

test('후보 묶기: 위치를 뺀 설명이 같으면 한 선택지로 묶고, 대표는 묶음에서 휴리스틱 1등, 순서는 원래대로', () => {
  const snapshot = { grid: createGrid(), type: 'O', holdType: null, holdUsed: true, next: ['T'] };
  const moves = enumerateMoves(snapshot, { reach: 'drop' });
  const ranked = rankMoves(moves);
  const options = groupByDescription(moves, ranked);
  assert.ok(options.length < moves.length, `${moves.length}개 → ${options.length}개`);
  const key = (m) => JSON.stringify(describeMove(m, null, { position: false }));
  assert.equal(new Set(options.map(key)).size, options.length, '선택지끼리는 설명이 모두 다르다');
  for (const option of options) {
    const bestInGroup = ranked.find(({ move }) => key(move) === key(option)).move;
    assert.equal(option.id, bestInGroup.id);
  }
  const order = options.map((m) => moves.indexOf(m));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), '휴리스틱 순위가 순서로 새지 않는다');
});

test('Jev+: 휴리스틱 상위 5수 중 Jev가 고른 수를 두고, 확신이 낮으면 휴리스틱 1순위를 둔다', async () => {
  const snapshot = { grid: createGrid(), type: 'T', holdType: null, holdUsed: true, next: ['I'] };
  let asked = null;
  const answer = (confidence) => async (request) => {
    asked = request;
    const ids = Object.keys(request.questions[QUESTION_ID].criteria);
    return { model: 'jev-test', answers: { [QUESTION_ID]: { type: 'choice', choice: ids[2], confidence, probabilities: { [ids[2]]: 0.6, [ids[0]]: 0.4 } } }, usage: { input_tokens: 900 } };
  };
  const sure = await new JevPlusBrain({ ask: answer(0.5) }).decide(snapshot);
  const options = Object.keys(asked.questions[QUESTION_ID].criteria);
  assert.equal(options.length, 5, '선택지는 상위 5개');
  assert.equal(sure.move.id, options[2]);
  assert.equal(sure.deferred, false);
  assert.ok(Object.values(asked.questions[QUESTION_ID].criteria).every((d) => 'next_piece' in d), '다음 피스 정보가 붙는다');
  const unsure = await new JevPlusBrain({ ask: answer(0.1) }).decide(snapshot);
  assert.equal(unsure.deferred, true);
  assert.equal(unsure.jevChoice, options[2]);
  assert.equal(unsure.move.id, options[0], '휴리스틱 1순위');
});

test('전략: T-스핀·홀드 요청도 정책으로 읽는다 (jev-1.13.0 녹화 답)', () => {
  const answers = (tspin, hold, tetris, side, sideConf, risk, riskConf) => ({
    is_strategy: { noul: 0.95 },
    wants_tetris: { noul: tetris },
    wants_tspin: { noul: tspin },
    wants_hold: { noul: hold },
    well_side: { choice: side, confidence: sideConf },
    risk: { score: risk, confidence: riskConf },
  });
  // "T-스핀을 최대한 많이 해봐"
  const tspin = policyFrom(answers(0.97, 0.04, 0.06, 'none', 0.99, 1.7, 0.55));
  assert.deepEqual([tspin.tspin, tspin.hold, tspin.tetris, tspin.well], [true, false, false, null]);
  // "I 블록은 홀드에 모아 뒀다가 오른쪽 우물에 넣어서 테트리스"
  const hold = policyFrom(answers(0.03, 0.97, 0.78, 'right', 0.65, 1.48, 0.22));
  assert.deepEqual([hold.tspin, hold.hold, hold.tetris, hold.well, hold.risk], [false, true, true, 'right', 1]);
  assert.equal(policyLabel(hold), '테트리스 노리기 · 홀드 적극 사용 · 오른쪽 끝 줄 비우기 · 균형 있게');
});
