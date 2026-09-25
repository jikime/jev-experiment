import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { Bag } from '../src/core/bag.js';
import { SHAPES, PIECE_TYPES } from '../src/core/pieces.js';
import { gravityInterval, scoreClear } from '../src/core/scoring.js';
import { COLS, HIDDEN_ROWS, LOCK_DELAY, ROWS } from '../src/core/constants.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newGame(opts = {}) {
  return new Game({ rng: seeded(7), ...opts });
}

// 행 y를 채우되 holes 열은 비운다.
function fillRow(game, y, holes = []) {
  for (let x = 0; x < COLS; x++) game.grid[y][x] = holes.includes(x) ? null : 'Z';
}

function sorted(cells) {
  return cells.map(([x, y]) => `${x},${y}`).sort();
}

function collect(game, type) {
  const events = [];
  game.on(type, (e) => events.push(e));
  return events;
}

test('7-bag: 매 봉지마다 7종이 정확히 한 번씩 나온다', () => {
  const bag = new Bag(seeded(42));
  for (let round = 0; round < 5; round++) {
    const drawn = Array.from({ length: 7 }, () => bag.next());
    assert.deepEqual([...drawn].sort(), [...PIECE_TYPES].sort());
  }
});

test('SRS 회전 형태: T는 오른쪽, I는 3번째 열로 선다', () => {
  assert.deepEqual(sorted(SHAPES.T[1]), sorted([[1, 0], [1, 1], [2, 1], [1, 2]]));
  assert.deepEqual(sorted(SHAPES.I[1]), sorted([[2, 0], [2, 1], [2, 2], [2, 3]]));
  assert.deepEqual(SHAPES.O[0], SHAPES.O[3]);
});

test('스폰: 보이는 필드 바로 위에서 나타나 한 칸 내려온다', () => {
  const game = newGame();
  game.start();
  game.spawn('T');
  const rows = game.cellsOf(game.piece).map(([, y]) => y);
  assert.equal(Math.max(...rows), HIDDEN_ROWS); // 아랫줄이 첫 번째 보이는 줄
  assert.deepEqual([...new Set(game.cellsOf(game.piece).map(([x]) => x))].sort(), [3, 4, 5]);
  game.spawn('O');
  assert.deepEqual([...new Set(game.cellsOf(game.piece).map(([x]) => x))].sort(), [4, 5]);
});

test('월킥: 왼쪽 벽에 붙은 T가 반시계 회전하면 오른쪽으로 밀려난다', () => {
  const game = newGame();
  game.start();
  game.piece = { type: 'T', rot: 1, x: -1, y: 30 };
  assert.equal(game.rotate(-1), true);
  assert.equal(game.piece.rot, 0);
  assert.equal(game.piece.x, 0);
  assert.equal(game.lastKick, 1);
});

test('회전 불가: 모든 킥 위치가 막히면 회전하지 않는다', () => {
  const game = newGame();
  game.start();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) game.grid[y][x] = 'Z';
  for (const [x, y] of [[4, 30], [3, 31], [4, 31], [5, 31]]) game.grid[y][x] = null;
  game.piece = { type: 'T', rot: 0, x: 3, y: 30 };
  assert.equal(game.rotate(1), false);
  assert.equal(game.piece.rot, 0);
});

test('점수: 테트리스 800, 연속 테트리스는 B2B ×1.5 + 콤보', () => {
  const game = newGame();
  game.start();
  const clears = collect(game, 'clear');
  const dropTetris = () => {
    for (let y = 36; y < 40; y++) fillRow(game, y, [0]);
    game.grid[35][5] = 'Z'; // 퍼펙트 클리어가 되지 않도록 남겨 둘 블록
    game.piece = { type: 'I', rot: 1, x: -2, y: 30 };
    game.hardDrop();
    game.update(1000); // 줄 삭제 연출 종료 → 다음 피스
  };
  dropTetris();
  assert.equal(clears[0].points, 800);
  const afterFirst = game.score;
  dropTetris();
  assert.equal(clears[1].b2b, true);
  assert.equal(clears[1].combo, 1);
  assert.equal(clears[1].points, 1200 + 50);
  assert.equal(game.lines, 8);
  assert.ok(game.score > afterFirst);
});

test('T-스핀 더블: 1200점, 이동이 끼면 T-스핀이 아니다', () => {
  const setup = () => {
    const game = newGame();
    game.start();
    fillRow(game, 39, [4]);
    fillRow(game, 38, [3, 4, 5]);
    game.grid[37][3] = 'Z'; // 오버행
    game.piece = { type: 'T', rot: 2, x: 3, y: 37 };
    return game;
  };

  const spun = setup();
  const clears = collect(spun, 'clear');
  spun.lastAction = 'rotate';
  spun.lastKick = 0;
  spun.hardDrop();
  assert.equal(clears[0].tspin, 'full');
  assert.equal(clears[0].lines, 2);
  assert.equal(clears[0].points, 1200);

  const slid = setup();
  const plain = collect(slid, 'clear');
  slid.lastAction = 'move';
  slid.hardDrop();
  assert.equal(plain[0].tspin, 'none');
  assert.equal(plain[0].points, 300);
});

test('T-스핀 더블(실제 회전): 월킥으로 오버행 아래 슬롯에 들어간다', () => {
  const game = newGame();
  game.start();
  const clears = collect(game, 'clear');
  fillRow(game, 39, [4]);
  fillRow(game, 38, [3, 4, 5]);
  game.grid[37][3] = 'Z'; // 왼쪽 오버행
  game.grid[37][6] = 'Z'; // 제자리 회전을 막아 킥을 유도
  game.piece = { type: 'T', rot: 3, x: 4, y: 36 };
  assert.equal(game.rotate(-1), true);
  assert.deepEqual({ rot: game.piece.rot, x: game.piece.x, y: game.piece.y }, { rot: 2, x: 3, y: 37 });
  assert.equal(game.lastKick, 2);
  game.hardDrop();
  assert.equal(clears[0].tspin, 'full');
  assert.equal(clears[0].lines, 2);
  assert.equal(clears[0].points, 1200);
});

test('T-스핀 미니 싱글: 앞 코너가 하나만 막히면 미니(200점)', () => {
  const game = newGame();
  game.start();
  const clears = collect(game, 'clear');
  fillRow(game, 39, [0, 1, 2]);
  game.grid[38][0] = 'Z';
  game.piece = { type: 'T', rot: 0, x: 0, y: 38 };
  game.lastAction = 'rotate';
  game.lastKick = 0;
  game.hardDrop();
  assert.equal(clears[0].tspin, 'mini');
  assert.equal(clears[0].points, 200);
});

test('퍼펙트 클리어: 싱글 100 + 보너스 800', () => {
  const game = newGame();
  game.start();
  const clears = collect(game, 'clear');
  fillRow(game, 39, [0, 1, 2, 3]);
  game.piece = { type: 'I', rot: 0, x: 0, y: 38 };
  game.hardDrop();
  assert.equal(clears[0].perfectClear, true);
  assert.equal(clears[0].points, 900);
});

test('하드 드롭 2점/칸, 소프트 드롭 1점/칸', () => {
  const game = newGame();
  game.start();
  game.piece = { type: 'O', rot: 0, x: 3, y: 20 };
  const dist = game.hardDrop();
  assert.equal(dist, 18);
  assert.equal(game.score, 36);

  const soft = newGame();
  soft.start();
  const y0 = soft.piece.y;
  soft.setSoftDrop(true);
  soft.update(200);
  assert.ok(soft.piece.y > y0);
  assert.equal(soft.score, soft.piece.y - y0);
});

test('홀드: 피스 하나당 한 번만 가능하다', () => {
  const game = newGame();
  game.start();
  const first = game.piece.type;
  const upcoming = game.queue[0];
  assert.equal(game.hold(), true);
  assert.equal(game.holdType, first);
  assert.equal(game.piece.type, upcoming);
  assert.equal(game.hold(), false);
  game.hardDrop();
  assert.equal(game.hold(), true);
  assert.equal(game.piece.type, first);
});

test('락 딜레이: 바닥에서 0.5초 뒤 고정되고, 이동하면 타이머가 리셋된다', () => {
  const game = newGame();
  game.start();
  game.piece = { type: 'T', rot: 0, x: 3, y: 38 };
  game.lockState = { timer: 0, resets: 0, lowestY: 38, touched: false };
  game.update(LOCK_DELAY - 100);
  assert.equal(game.stats.pieces, 0);
  assert.equal(game.move(1), true);
  game.update(LOCK_DELAY - 100);
  assert.equal(game.stats.pieces, 0);
  game.update(101);
  assert.equal(game.stats.pieces, 1);
});

test('락 딜레이: 리셋은 15회까지, 이후 바닥에 닿으면 즉시 고정', () => {
  const game = newGame();
  game.start();
  game.piece = { type: 'T', rot: 0, x: 3, y: 38 };
  game.lockState = { timer: 0, resets: 0, lowestY: 38, touched: false };
  for (let i = 0; i < 15; i++) {
    game.update(100);
    assert.equal(game.stats.pieces, 0, `move ${i}`);
    game.move(i % 2 === 0 ? 1 : -1);
  }
  game.update(1);
  assert.equal(game.stats.pieces, 1);
});

test('게임 오버: 스폰 자리가 막히면 Block Out, 필드 위에서 고정되면 Lock Out', () => {
  const blocked = newGame();
  for (let y = HIDDEN_ROWS - 2; y < ROWS; y++) for (let x = 3; x < 7; x++) blocked.grid[y][x] = 'Z';
  blocked.start();
  assert.equal(blocked.state, 'over');
  assert.equal(blocked.overReason, 'blockout');

  const locked = newGame();
  for (let y = HIDDEN_ROWS; y < ROWS; y++) for (let x = 3; x < 7; x++) locked.grid[y][x] = 'Z';
  locked.start();
  assert.equal(locked.state, 'playing');
  locked.hardDrop();
  assert.equal(locked.state, 'over');
  assert.equal(locked.overReason, 'lockout');
});

test('레벨: 10줄마다 오르고, 중력은 가이드라인 공식을 따른다', () => {
  assert.equal(gravityInterval(1), 1000);
  assert.ok(Math.abs(gravityInterval(2) - 793) < 1);
  assert.ok(gravityInterval(20) < 1);
  assert.equal(gravityInterval(25), gravityInterval(20));

  const game = newGame({ startLevel: 3 });
  game.start();
  const ups = collect(game, 'levelup');
  for (let i = 0; i < 3; i++) {
    for (let y = 36; y < 40; y++) fillRow(game, y, [0]);
    game.grid[35][5] = 'Z';
    game.piece = { type: 'I', rot: 1, x: -2, y: 30 };
    game.hardDrop();
    game.update(1000);
  }
  assert.equal(game.lines, 12);
  assert.equal(game.level, 4);
  assert.deepEqual(ups, [{ level: 4 }]);
});

test('scoreClear: 점수 없는 T-스핀은 B2B를 깨지도 쌓지도 않는다', () => {
  const r = scoreClear({ lines: 0, tspin: 'full', level: 2, b2bActive: true, combo: -1, perfectClear: false });
  assert.equal(r.points, 800);
  assert.equal(r.b2b, false);
  assert.equal(r.difficult, false);
});
