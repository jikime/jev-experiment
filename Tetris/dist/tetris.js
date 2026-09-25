/* 자동 생성 파일입니다. src/를 고친 뒤 `npm run build`로 다시 만드세요. */
(() => {
'use strict';
// ── src/core/constants.js ──
const __src_core_constants_js = (() => {
// Tetris Guideline 규격값. 좌표계는 y가 아래로 증가하고, 보드는 숨김 20줄 + 보이는 20줄.
const COLS = 10;
const ROWS = 40;
const VISIBLE_ROWS = 20;
const HIDDEN_ROWS = ROWS - VISIBLE_ROWS;

// 스폰: 3칸 폭 피스는 3~5열, I·O는 가운데 열. 보이는 필드 바로 위(21~22행)에 나타난다.
const SPAWN_X = 3;
const SPAWN_Y = HIDDEN_ROWS - 2;

const NEXT_COUNT = 5;
const LOCK_DELAY = 500; // ms
const MAX_LOCK_RESETS = 15; // Extended Placement: 바닥 접촉 후 이동·회전 15회까지 락 타이머 리셋
const LINE_CLEAR_DELAY = 320; // ms, 줄 삭제 연출 시간
const SOFT_DROP_FACTOR = 20; // 소프트 드롭 = 중력 20배
const LINES_PER_LEVEL = 10;
const MAX_GRAVITY_LEVEL = 20; // 레벨 20부터 20G(즉시 낙하), 레벨 자체는 계속 오른다
return { COLS, ROWS, VISIBLE_ROWS, HIDDEN_ROWS, SPAWN_X, SPAWN_Y, NEXT_COUNT, LOCK_DELAY, MAX_LOCK_RESETS, LINE_CLEAR_DELAY, SOFT_DROP_FACTOR, LINES_PER_LEVEL, MAX_GRAVITY_LEVEL };
})();

// ── src/core/pieces.js ──
const __src_core_pieces_js = (() => {
// SRS(Super Rotation System) 테트로미노 정의와 월킥 테이블.
const PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

// 스폰 방향(상태 0). J·L·T는 평평한 면이 아래로 오도록 스폰한다.
const SPAWN_SHAPES = {
  I: ['....', 'XXXX', '....', '....'],
  J: ['X..', 'XXX', '...'],
  L: ['..X', 'XXX', '...'],
  O: ['.XX.', '.XX.', '....', '....'],
  S: ['.XX', 'XX.', '...'],
  T: ['.X.', 'XXX', '...'],
  Z: ['XX.', '.XX', '...'],
};

function parse(rows) {
  const cells = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === 'X') cells.push([x, y]);
    });
  });
  return cells;
}

// n×n 경계 상자 안에서 시계 방향 90° 회전.
function rotateCW(cells, n) {
  return cells.map(([x, y]) => [n - 1 - y, x]);
}

function buildRotations(type) {
  const rows = SPAWN_SHAPES[type];
  const base = parse(rows);
  if (type === 'O') return [base, base, base, base];
  const n = rows.length;
  const states = [base];
  for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1], n));
  return states;
}

// SHAPES[type][rotation] → [[x, y], ...] (경계 상자 기준 상대 좌표)
const SHAPES = Object.fromEntries(PIECE_TYPES.map((t) => [t, buildRotations(t)]));

// 월킥 오프셋(y 아래 방향 기준). 키는 `${from}${to}`, 0=스폰, 1=R, 2=180, 3=L.
const JLSTZ_KICKS = {
  '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

function kicksFor(type, from, to) {
  if (type === 'O') return [[0, 0]];
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}${to}`];
}
return { PIECE_TYPES, SHAPES, kicksFor };
})();

// ── src/core/bag.js ──
const __src_core_bag_js = (() => {
const { PIECE_TYPES } = __src_core_pieces_js;
// 7-bag 랜덤 생성기: 7종을 한 봉지에 넣고 섞어 하나씩 꺼낸다.
class Bag {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.pool = [];
  }

  next() {
    if (this.pool.length === 0) this.pool = shuffle([...PIECE_TYPES], this.rng);
    return this.pool.pop();
  }
}

function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
return { Bag };
})();

// ── src/core/board.js ──
const __src_core_board_js = (() => {
const { COLS, ROWS } = __src_core_constants_js;
function createGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// 벽·바닥·보드 위쪽 밖은 모두 막힌 칸으로 본다.
function isBlocked(grid, x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
  return grid[y][x] !== null;
}

function fullRows(grid) {
  const rows = [];
  grid.forEach((row, y) => {
    if (row.every((cell) => cell !== null)) rows.push(y);
  });
  return rows;
}

function removeRows(grid, rows) {
  const drop = new Set(rows);
  const kept = grid.filter((_, y) => !drop.has(y));
  const fresh = Array.from({ length: rows.length }, () => Array(COLS).fill(null));
  return [...fresh, ...kept];
}

function isEmpty(grid) {
  return grid.every((row) => row.every((cell) => cell === null));
}
return { createGrid, isBlocked, fullRows, removeRows, isEmpty };
})();

// ── src/core/scoring.js ──
const __src_core_scoring_js = (() => {
const { MAX_GRAVITY_LEVEL } = __src_core_constants_js;
// Tetris Guideline 점수표 (× 레벨).
const LINE_SCORES = {
  none: [0, 100, 300, 500, 800],
  mini: [100, 200, 400],
  full: [400, 800, 1200, 1600],
};
const PERFECT_CLEAR = [0, 800, 1200, 1800, 2000];
const B2B_PERFECT_TETRIS = 3200;

// "어려운" 줄 삭제: 테트리스 또는 줄을 지운 T-스핀. 연속되면 Back-to-Back ×1.5.
function isDifficult(lines, tspin) {
  return lines === 4 || (lines > 0 && tspin !== 'none');
}

function scoreClear({ lines, tspin, level, b2bActive, combo, perfectClear }) {
  const difficult = isDifficult(lines, tspin);
  const b2b = difficult && b2bActive;
  let points = (LINE_SCORES[tspin][lines] ?? 0) * level;
  if (b2b) points = Math.floor(points * 1.5);
  if (lines > 0 && combo > 0) points += 50 * combo * level;
  if (perfectClear) {
    points += (lines === 4 && b2b ? B2B_PERFECT_TETRIS : PERFECT_CLEAR[lines]) * level;
  }
  return { points, b2b, difficult };
}

// 한 줄 내려가는 데 걸리는 시간(ms): (0.8 − (레벨−1)×0.007)^(레벨−1) 초.
function gravityInterval(level) {
  const l = Math.min(level, MAX_GRAVITY_LEVEL);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
}
return { isDifficult, scoreClear, gravityInterval };
})();

// ── src/core/game.js ──
const __src_core_game_js = (() => {
const { COLS, HIDDEN_ROWS, LINE_CLEAR_DELAY, LINES_PER_LEVEL, LOCK_DELAY, MAX_LOCK_RESETS, NEXT_COUNT, SOFT_DROP_FACTOR, SPAWN_X, SPAWN_Y } = __src_core_constants_js;
const { SHAPES, kicksFor } = __src_core_pieces_js;
const { Bag } = __src_core_bag_js;
const { createGrid, fullRows, isBlocked, isEmpty, removeRows } = __src_core_board_js;
const { gravityInterval, scoreClear } = __src_core_scoring_js;
// T 중심 기준 네 대각선: 좌상, 우상, 우하, 좌하. T가 가리키는 방향의 두 칸이 "앞 코너".
const T_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

// DOM에 의존하지 않는 게임 규칙 엔진. UI는 이벤트(on)와 공개 상태만 읽는다.
class Game {
  // pieceLimit: 이 수만큼 피스를 고정하면 'finished'로 끝난다(대결 모드). 기본은 끝없음.
  // noGravity: 턴제. 피스가 저절로 떨어지거나 고정되지 않고, 소프트 드롭(↓)으로만 내려가며 하드 드롭으로만 고정된다.
  constructor({ startLevel = 1, rng = Math.random, pieceLimit = Infinity, noGravity = false } = {}) {
    this.startLevel = Math.min(Math.max(1, Math.floor(startLevel)), 15);
    this.rng = rng;
    this.pieceLimit = pieceLimit;
    this.noGravity = noGravity;
    this.listeners = new Map();
    this.reset();
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
    return this;
  }

  emit(type, payload = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn(payload);
  }

  reset() {
    this.grid = createGrid();
    this.bag = new Bag(this.rng);
    this.queue = [];
    this.fillQueue();
    this.piece = null;
    this.holdType = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = this.startLevel;
    this.combo = -1;
    this.b2b = false;
    this.elapsed = 0;
    this.state = 'ready'; // ready | playing | clearing | over | finished
    this.overReason = null;
    this.softDrop = false;
    this.gravityAcc = 0;
    this.lockState = { timer: 0, resets: 0, lowestY: 0, touched: false };
    this.lastAction = null;
    this.lastKick = -1;
    this.clearing = null;
    this.stats = { pieces: 0, tetrises: 0, tspins: 0, maxCombo: 0 };
  }

  start() {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.spawn(this.takeNext());
  }

  get gravity() {
    return gravityInterval(this.level);
  }

  get nextQueue() {
    return this.queue.slice(0, NEXT_COUNT);
  }

  // ── 피스 생성 ──────────────────────────────────────────

  fillQueue() {
    while (this.queue.length < NEXT_COUNT + 1) this.queue.push(this.bag.next());
  }

  takeNext() {
    const type = this.queue.shift();
    this.fillQueue();
    return type;
  }

  spawn(type) {
    const piece = { type, rot: 0, x: SPAWN_X, y: SPAWN_Y };
    this.piece = piece;
    if (this.collides(piece)) return this.gameOver('blockout');
    // 스폰 직후 경로가 비어 있으면 한 칸 내려와서 보이는 필드에 걸친다.
    if (!this.collidesAt(piece, 0, 1)) piece.y += 1;
    this.lockState = { timer: 0, resets: 0, lowestY: piece.y, touched: false };
    this.lastAction = null;
    this.lastKick = -1;
    this.gravityAcc = 0;
    this.emit('spawn', { type });
  }

  // ── 충돌 ───────────────────────────────────────────────

  cellsOf(piece) {
    return SHAPES[piece.type][piece.rot].map(([cx, cy]) => [piece.x + cx, piece.y + cy]);
  }

  collides(piece) {
    return this.cellsOf(piece).some(([x, y]) => isBlocked(this.grid, x, y));
  }

  collidesAt(piece, dx, dy) {
    return this.collides({ ...piece, x: piece.x + dx, y: piece.y + dy });
  }

  isGrounded() {
    return this.collidesAt(this.piece, 0, 1);
  }

  ghostY() {
    let y = this.piece.y;
    while (!this.collides({ ...this.piece, y: y + 1 })) y++;
    return y;
  }

  // ── 조작 ───────────────────────────────────────────────

  canControl() {
    return this.state === 'playing' && this.piece !== null;
  }

  move(dx) {
    if (!this.canControl() || this.collidesAt(this.piece, dx, 0)) return false;
    this.piece.x += dx;
    this.lastAction = 'move';
    this.afterManipulation();
    this.emit('move', { dx });
    return true;
  }

  rotate(dir) {
    if (!this.canControl()) return false;
    const p = this.piece;
    if (p.type === 'O') return false;
    const to = (p.rot + dir + 4) % 4;
    const kicks = kicksFor(p.type, p.rot, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      const candidate = { ...p, rot: to, x: p.x + kx, y: p.y + ky };
      if (this.collides(candidate)) continue;
      Object.assign(p, candidate);
      this.lastAction = 'rotate';
      this.lastKick = i;
      this.afterManipulation();
      this.emit('rotate', { dir, kick: i });
      return true;
    }
    return false;
  }

  setSoftDrop(on) {
    // 누르는 순간 한 칸을 바로 내려 반응을 즉시 만든다.
    if (on && !this.softDrop) this.gravityAcc = Math.max(this.gravityAcc, this.gravity / SOFT_DROP_FACTOR);
    this.softDrop = on;
  }

  // 한 칸 내리기(봇의 비틀어 넣기용). 소프트 드롭처럼 칸당 1점.
  softDropStep() {
    if (!this.canControl() || !this.stepDown()) return false;
    this.score += 1;
    return true;
  }

  hardDrop() {
    if (!this.canControl()) return 0;
    const from = this.piece.y;
    const dist = this.ghostY() - from;
    if (dist > 0) {
      this.piece.y += dist;
      this.lastAction = 'drop';
    }
    this.score += dist * 2;
    this.emit('harddrop', { dist, piece: { ...this.piece }, cells: this.cellsOf(this.piece) });
    this.lockPiece();
    return dist;
  }

  hold() {
    if (!this.canControl() || this.holdUsed) return false;
    const current = this.piece.type;
    const incoming = this.holdType ?? this.takeNext();
    this.holdType = current;
    this.holdUsed = true;
    this.emit('hold', { type: current });
    this.spawn(incoming);
    return true;
  }

  // Extended Placement: 바닥에 닿은 뒤 이동·회전하면 락 타이머 리셋(최대 15회).
  // 이전보다 더 낮은 줄에 도달하면 횟수도 초기화된다.
  afterManipulation() {
    const lock = this.lockState;
    if (this.piece.y > lock.lowestY) {
      this.lockState = { timer: 0, resets: 0, lowestY: this.piece.y, touched: false };
    } else if (lock.touched && lock.resets < MAX_LOCK_RESETS) {
      lock.timer = 0;
      lock.resets += 1;
    }
  }

  // ── 시간 진행 ──────────────────────────────────────────

  update(dt) {
    if (this.state === 'clearing') {
      this.elapsed += dt;
      this.clearing.timer -= dt;
      if (this.clearing.timer <= 0) this.finishClear();
      return;
    }
    if (this.state !== 'playing') return;
    this.elapsed += dt;

    if (!this.isGrounded() && (this.softDrop || !this.noGravity)) {
      const interval = this.softDrop ? this.gravity / SOFT_DROP_FACTOR : this.gravity;
      this.gravityAcc += dt;
      while (this.gravityAcc >= interval) {
        this.gravityAcc -= interval;
        if (!this.stepDown()) break;
        if (this.softDrop) this.score += 1;
      }
    }

    if (this.isGrounded()) {
      if (this.noGravity) return; // 턴제: 하드 드롭으로만 고정

      this.gravityAcc = 0;
      const lock = this.lockState;
      lock.touched = true;
      if (lock.resets >= MAX_LOCK_RESETS) return this.lockPiece();
      lock.timer += dt;
      if (lock.timer >= LOCK_DELAY) this.lockPiece();
    }
  }

  stepDown() {
    if (this.collidesAt(this.piece, 0, 1)) return false;
    this.piece.y += 1;
    this.lastAction = 'fall';
    if (this.piece.y > this.lockState.lowestY) {
      this.lockState = { timer: 0, resets: 0, lowestY: this.piece.y, touched: false };
    }
    return true;
  }

  // ── 고정·줄 삭제 ───────────────────────────────────────

  detectTSpin() {
    const p = this.piece;
    if (p.type !== 'T' || this.lastAction !== 'rotate') return 'none';
    const cx = p.x + 1;
    const cy = p.y + 1;
    const filled = T_CORNERS.map(([dx, dy]) => isBlocked(this.grid, cx + dx, cy + dy));
    if (filled.filter(Boolean).length < 3) return 'none';
    const frontBoth = filled[p.rot] && filled[(p.rot + 1) % 4];
    // 앞 코너 둘 다 막혔거나, 마지막 회전이 5번째 킥(1×2 이동)이면 정식 T-스핀.
    if (frontBoth || this.lastKick === 4) return 'full';
    return 'mini';
  }

  lockPiece() {
    const p = this.piece;
    const cells = this.cellsOf(p);
    const tspin = this.detectTSpin();
    for (const [x, y] of cells) this.grid[y][x] = p.type;
    this.piece = null;
    this.holdUsed = false;
    this.stats.pieces += 1;
    this.emit('lock', { type: p.type, cells });

    // Lock Out: 피스 전체가 보이는 필드 위에서 고정되면 게임 오버.
    if (cells.every(([, y]) => y < HIDDEN_ROWS)) return this.gameOver('lockout');

    const rows = fullRows(this.grid);
    const lines = rows.length;
    this.combo = lines > 0 ? this.combo + 1 : -1;

    if (lines === 0) {
      if (tspin !== 'none') {
        const { points } = scoreClear({ lines, tspin, level: this.level, b2bActive: this.b2b, combo: this.combo, perfectClear: false });
        this.score += points;
        this.stats.tspins += 1;
        this.emit('clear', { lines, tspin, b2b: false, combo: this.combo, perfectClear: false, points });
      }
      this.advance();
      return;
    }

    const snapshot = this.grid.map((row) => row.slice());
    this.grid = removeRows(this.grid, rows);
    const perfectClear = isEmpty(this.grid);
    const { points, b2b, difficult } = scoreClear({
      lines,
      tspin,
      level: this.level,
      b2bActive: this.b2b,
      combo: this.combo,
      perfectClear,
    });
    this.score += points;
    this.b2b = difficult;
    this.lines += lines;
    if (lines === 4) this.stats.tetrises += 1;
    if (tspin !== 'none') this.stats.tspins += 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);

    const prevLevel = this.level;
    this.level = this.startLevel + Math.floor(this.lines / LINES_PER_LEVEL);

    this.clearing = { rows, snapshot, timer: LINE_CLEAR_DELAY, duration: LINE_CLEAR_DELAY };
    this.state = 'clearing';
    this.emit('clear', { lines, tspin, b2b, combo: this.combo, perfectClear, points });
    if (this.level > prevLevel) this.emit('levelup', { level: this.level });
  }

  finishClear() {
    this.clearing = null;
    this.state = 'playing';
    this.advance();
  }

  // 다음 피스를 내보내거나, 정해진 피스 수를 다 뒀으면 끝낸다.
  advance() {
    if (this.stats.pieces >= this.pieceLimit) {
      this.state = 'finished';
      this.emit('finished', { pieces: this.stats.pieces });
      return;
    }
    this.spawn(this.takeNext());
  }

  gameOver(reason) {
    this.state = 'over';
    this.overReason = reason;
    this.emit('gameover', { reason });
  }

  // 위험 표시용: 스택이 보이는 필드 상단 3줄까지 올라왔는지.
  isDanger() {
    for (let y = HIDDEN_ROWS; y < HIDDEN_ROWS + 3; y++) {
      for (let x = 0; x < COLS; x++) if (this.grid[y][x] !== null) return true;
    }
    return false;
  }
}
return { Game };
})();

// ── src/core/random.js ──
const __src_core_random_js = (() => {
// 시드가 같으면 같은 수열을 내는 난수(mulberry32). 대결에서 모든 선수에게 같은 피스 순서를 준다.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000);
}
return { seededRandom, randomSeed };
})();

// ── src/ui/input.js ──
const __src_ui_input_js = (() => {
// 가이드라인 기본 키 배치. e.code 기준이라 한글 입력 모드에서도 그대로 동작한다.
const KEY_ACTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'soft',
  ArrowUp: 'cw',
  KeyX: 'cw',
  KeyZ: 'ccw',
  ControlLeft: 'ccw',
  ControlRight: 'ccw',
  Space: 'hard',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
};

const DAS = 167; // 자동 이동이 시작되기까지(ms)
const ARR = 33; // 자동 이동 간격(ms)

// 키보드·터치 공용 입력기. 좌우 이동의 DAS/ARR을 직접 계산한다(브라우저 키 반복은 무시).
class InputController {
  constructor() {
    this.game = null;
    this.releaseAll();
  }

  attach(game) {
    this.game = game;
    this.releaseAll();
  }

  releaseAll() {
    this.held = { left: false, right: false };
    this.dir = 0;
    this.das = 0;
    this.arr = 0;
    this.game?.setSoftDrop(false);
  }

  press(action) {
    const game = this.game;
    if (!game) return;
    switch (action) {
      case 'left':
      case 'right': {
        this.held[action] = true;
        this.startShift(action === 'left' ? -1 : 1);
        game.move(this.dir);
        break;
      }
      case 'soft':
        game.setSoftDrop(true);
        break;
      case 'hard':
        game.hardDrop();
        break;
      case 'cw':
        game.rotate(1);
        break;
      case 'ccw':
        game.rotate(-1);
        break;
      case 'hold':
        game.hold();
        break;
    }
  }

  release(action) {
    if (action === 'left' || action === 'right') {
      this.held[action] = false;
      // 반대쪽을 아직 누르고 있으면 그쪽으로 다시 충전한다.
      const other = action === 'left' ? 'right' : 'left';
      if (this.held[other]) this.startShift(other === 'left' ? -1 : 1);
      else this.dir = 0;
    } else if (action === 'soft') {
      this.game?.setSoftDrop(false);
    }
  }

  startShift(dir) {
    this.dir = dir;
    this.das = 0;
    this.arr = 0;
  }

  update(dt) {
    if (!this.dir || !this.game) return;
    if (this.das < DAS) {
      this.das += dt;
      if (this.das < DAS) return;
      this.arr = ARR + (this.das - DAS); // DAS가 차는 순간 바로 한 칸
    } else {
      this.arr += dt;
    }
    while (this.arr >= ARR) {
      this.arr -= ARR;
      if (!this.game.move(this.dir)) {
        this.arr = 0;
        break;
      }
    }
  }
}

// 모바일 버튼: 누르고 있는 동안 press 상태를 유지한다.
function bindTouchPad(pad, input, canAct) {
  const release = (button) => {
    if (!button.classList.contains('is-down')) return;
    button.classList.remove('is-down');
    input.release(button.dataset.action);
  };
  for (const button of pad.querySelectorAll('[data-action]')) {
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!canAct()) return;
      button.setPointerCapture(e.pointerId);
      button.classList.add('is-down');
      input.press(button.dataset.action);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, () => release(button));
    }
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
return { KEY_ACTIONS, InputController, bindTouchPad };
})();

// ── src/ui/renderer.js ──
const __src_ui_renderer_js = (() => {
const { COLS, HIDDEN_ROWS, ROWS, VISIBLE_ROWS } = __src_core_constants_js;
const { SHAPES } = __src_core_pieces_js;
const PEEK = 1; // 보이는 필드 위로 한 줄을 더 그려 스폰 직후 피스가 걸쳐 보이게 한다.
const TRAIL_MS = 200;
const FLASH_MS = 140;
const SHAKE_MS = 160;
const GAMEOVER_ROW_MS = 22;

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    ink: v('--ink'),
    well: v('--well'),
    accent: v('--accent'),
    muted: v('--muted'),
    pieces: {
      I: v('--piece-i'),
      J: v('--piece-j'),
      L: v('--piece-l'),
      O: v('--piece-o'),
      S: v('--piece-s'),
      T: v('--piece-t'),
      Z: v('--piece-z'),
    },
  };
}

function setBackingStore(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// 네오브루탈 블록: 평면 색 + 굵은 잉크 테두리 + 스티커 광택 한 점.
function drawBlock(ctx, x, y, s, color, ink) {
  const b = Math.max(1.25, s * 0.075);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, s, s);
  ctx.lineWidth = b;
  ctx.strokeStyle = ink;
  ctx.strokeRect(x + b / 2, y + b / 2, s - b, s - b);
  const shine = Math.max(1.5, s * 0.15);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(x + b + s * 0.07, y + b + s * 0.07, shine, shine);
}

// 그림자를 먼저 모두 깔고 블록을 올리면, 덩어리 가장자리에만 딱딱한 그림자가 남는다.
function drawBlocks(ctx, blocks, s, offset, ink) {
  ctx.fillStyle = ink;
  for (const { x, y } of blocks) ctx.fillRect(x + offset, y + offset, s, s);
  for (const { x, y, color } of blocks) drawBlock(ctx, x, y, s, color, ink);
}

function bounds(cells) {
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function drawPiece(ctx, type, cx, cy, s, palette, alpha = 1) {
  const cells = SHAPES[type][0];
  const { minX, maxX, minY, maxY } = bounds(cells);
  const offset = Math.max(1.5, s * 0.14);
  const x0 = cx - ((maxX - minX + 1) * s + offset) / 2;
  const y0 = cy - ((maxY - minY + 1) * s + offset) / 2;
  const blocks = cells.map(([x, y]) => ({
    x: x0 + (x - minX) * s,
    y: y0 + (y - minY) * s,
    color: palette.pieces[type],
  }));
  ctx.globalAlpha = alpha;
  drawBlocks(ctx, blocks, s, offset, palette.ink);
  ctx.globalAlpha = 1;
}

class BoardRenderer {
  // syncWellTop: 옆 패널 정렬용 CSS 변수를 이 보드 기준으로 맞출지(대결 모드의 보드들은 끈다).
  constructor(canvas, container, palette, { syncWellTop = true } = {}) {
    this.canvas = canvas;
    this.container = container;
    this.palette = palette;
    this.syncWellTop = syncWellTop;
    this.ctx = null;
    this.resetFx();
    this.fit();
    new ResizeObserver(() => this.fit()).observe(container);
  }

  resetFx() {
    this.trails = [];
    this.flashes = [];
    this.shake = null;
    this.overAt = null;
  }

  fit() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    const s = Math.max(10, Math.floor(Math.min(w / 10.5, h / (VISIBLE_ROWS + PEEK + 0.6))));
    this.s = s;
    this.frame = Math.max(3, Math.round(s * 0.12));
    this.frameShadow = Math.max(4, Math.round(s * 0.24));
    this.blockShadow = Math.max(2, Math.round(s * 0.1));
    this.ox = this.frame;
    this.oy = PEEK * s + this.frame;
    this.w = COLS * s + 2 * this.frame + this.frameShadow;
    this.h = (VISIBLE_ROWS + PEEK) * s + 2 * this.frame + this.frameShadow;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx = setBackingStore(this.canvas, this.w, this.h);
    // 옆 패널을 우물 상단선에 맞추도록 CSS에 알려 준다.
    if (this.syncWellTop) document.documentElement.style.setProperty('--well-top', `${this.oy - this.frame}px`);
  }

  colX(c) {
    return this.ox + c * this.s;
  }

  rowY(r) {
    return this.oy + (r - HIDDEN_ROWS) * this.s;
  }

  // ── 연출 트리거 ─────────────────────────────────────────

  addHardDrop({ dist, cells, piece }, now) {
    if (dist > 0) {
      const tops = new Map();
      for (const [x, y] of cells) tops.set(x, Math.min(tops.get(x) ?? Infinity, y));
      this.trails.push({ at: now, dist, tops, color: this.palette.pieces[piece.type] });
    }
    this.shake = { at: now, amp: this.s * 0.14 * Math.min(1, 0.35 + dist / 14) };
  }

  addLock({ cells }, now) {
    this.flashes.push({ at: now, cells });
  }

  markGameOver(now) {
    this.overAt = now;
  }

  // ── 그리기 ─────────────────────────────────────────────

  // target: 봇이 놓으려는 칸들. 주어지면 점선 윤곽으로 표시한다.
  draw(game, now, target = null) {
    const { ctx } = this;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(0, this.shakeOffset(now));
    this.drawWell(game, now);
    if (game) {
      const grid = game.clearing ? game.clearing.snapshot : game.grid;
      const live = game.piece && game.state === 'playing';
      if (live) this.drawDropGuide(game);
      this.drawStack(grid, now);
      if (game.clearing) this.drawClearing(game.clearing);
      if (live && target) this.drawTarget(target);
      if (live) this.drawGhost(game);
      if (game.piece) this.drawActive(game.piece, game.state === 'over');
      this.drawTrails(now);
      this.drawFlashes(now);
    }
    ctx.restore();
  }

  shakeOffset(now) {
    if (!this.shake) return 0;
    const t = (now - this.shake.at) / SHAKE_MS;
    if (t >= 1) {
      this.shake = null;
      return 0;
    }
    return this.shake.amp * Math.sin(Math.PI * t);
  }

  drawWell(game, now) {
    const { ctx, s, frame, frameShadow, ox, oy, palette } = this;
    const wellW = COLS * s;
    const wellH = VISIBLE_ROWS * s;
    ctx.fillStyle = palette.ink;
    ctx.fillRect(ox - frame + frameShadow, oy - frame + frameShadow, wellW + 2 * frame, wellH + 2 * frame);
    ctx.fillRect(ox - frame, oy - frame, wellW + 2 * frame, wellH + 2 * frame);
    if (game && game.state !== 'over' && game.isDanger()) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 140);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(ox - frame, oy - frame, wellW + 2 * frame, wellH + 2 * frame);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = palette.well;
    ctx.fillRect(ox, oy, wellW, wellH);

    // 모눈 교차점에 잉크 점.
    const dot = Math.max(1.5, s * 0.07);
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.16;
    for (let c = 1; c < COLS; c++) {
      for (let r = 1; r < VISIBLE_ROWS; r++) {
        ctx.fillRect(ox + c * s - dot / 2, oy + r * s - dot / 2, dot, dot);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 피스 아래로 떨어질 경로를 옅게 칠해 조준을 돕는다.
  drawDropGuide(game) {
    const { ctx, s } = this;
    const piece = game.piece;
    const ghostY = game.ghostY();
    const cells = SHAPES[piece.type][piece.rot];
    const columns = new Map();
    for (const [cx, cy] of cells) {
      const x = piece.x + cx;
      columns.set(x, Math.max(columns.get(x) ?? -Infinity, cy));
    }
    ctx.fillStyle = this.palette.pieces[piece.type];
    ctx.globalAlpha = 0.1;
    for (const [x, bottom] of columns) {
      const top = Math.max(piece.y + bottom + 1, HIDDEN_ROWS);
      const end = ghostY + bottom;
      if (end >= top) ctx.fillRect(this.colX(x), this.rowY(top), s, (end - top + 1) * s);
    }
    ctx.globalAlpha = 1;
  }

  drawStack(grid, now) {
    const { s, palette } = this;
    const greyFrom = this.overAt === null ? ROWS : ROWS - Math.floor((now - this.overAt) / GAMEOVER_ROW_MS);
    const blocks = [];
    for (let r = HIDDEN_ROWS - PEEK; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const type = grid[r][c];
        if (!type) continue;
        blocks.push({ x: this.colX(c), y: this.rowY(r), color: r >= greyFrom ? palette.muted : palette.pieces[type] });
      }
    }
    drawBlocks(this.ctx, blocks, s, this.blockShadow, palette.ink);
  }

  // 줄 삭제: 잉크로 번졌다가 가운데로 오므라들며 사라진다.
  drawClearing(clearing) {
    const { ctx, s, ox, palette } = this;
    const wellW = COLS * s;
    const p = 1 - Math.max(0, clearing.timer) / clearing.duration;
    for (const r of clearing.rows) {
      const y = this.rowY(r);
      if (p < 0.35) {
        ctx.globalAlpha = p / 0.35;
        ctx.fillStyle = palette.ink;
        ctx.fillRect(ox, y, wellW, s);
        ctx.globalAlpha = 1;
        continue;
      }
      const q = (p - 0.35) / 0.65;
      const width = wellW * (1 - q * q);
      ctx.fillStyle = palette.well;
      ctx.fillRect(ox, y, wellW, s);
      ctx.fillStyle = palette.ink;
      ctx.fillRect(ox + (wellW - width) / 2, y, width, s);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(ox + (wellW - width) / 2, y + s * 0.42, width, s * 0.16);
    }
  }

  drawGhost(game) {
    const { ctx, s, palette } = this;
    const piece = game.piece;
    const gy = game.ghostY();
    if (gy === piece.y) return;
    const b = Math.max(1.25, s * 0.075);
    ctx.save();
    ctx.lineWidth = b;
    ctx.setLineDash([s * 0.22, s * 0.14]);
    for (const [cx, cy] of SHAPES[piece.type][piece.rot]) {
      const x = this.colX(piece.x + cx);
      const y = this.rowY(gy + cy);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = palette.pieces[piece.type];
      ctx.fillRect(x, y, s, s);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = palette.ink;
      ctx.strokeRect(x + b / 2 + 1, y + b / 2 + 1, s - b - 2, s - b - 2);
    }
    ctx.restore();
  }

  drawTarget(cells) {
    const { ctx, s, palette } = this;
    const b = Math.max(2, s * 0.1);
    ctx.save();
    ctx.lineWidth = b;
    ctx.strokeStyle = palette.accent;
    ctx.setLineDash([s * 0.18, s * 0.12]);
    for (const [x, y] of cells) {
      if (y < HIDDEN_ROWS) continue;
      ctx.strokeRect(this.colX(x) + b / 2, this.rowY(y) + b / 2, s - b, s - b);
    }
    ctx.restore();
  }

  drawActive(piece, dimmed) {
    const { s, palette } = this;
    const blocks = SHAPES[piece.type][piece.rot]
      .map(([cx, cy]) => ({ r: piece.y + cy, c: piece.x + cx }))
      .filter(({ r }) => r >= HIDDEN_ROWS - PEEK)
      .map(({ r, c }) => ({ x: this.colX(c), y: this.rowY(r), color: dimmed ? palette.muted : palette.pieces[piece.type] }));
    drawBlocks(this.ctx, blocks, s, this.blockShadow + 1, palette.ink);
  }

  drawTrails(now) {
    const { ctx, s } = this;
    this.trails = this.trails.filter((t) => now - t.at < TRAIL_MS);
    for (const trail of this.trails) {
      const fade = 1 - (now - trail.at) / TRAIL_MS;
      for (const [x, top] of trail.tops) {
        const y1 = this.rowY(top);
        const y0 = Math.max(this.rowY(HIDDEN_ROWS - PEEK), y1 - trail.dist * s);
        if (y1 <= y0) continue;
        const grad = ctx.createLinearGradient(0, y0, 0, y1);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, trail.color);
        ctx.globalAlpha = 0.55 * fade;
        ctx.fillStyle = grad;
        ctx.fillRect(this.colX(x) + s * 0.15, y0, s * 0.7, y1 - y0);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFlashes(now) {
    const { ctx, s } = this;
    this.flashes = this.flashes.filter((f) => now - f.at < FLASH_MS);
    ctx.fillStyle = '#ffffff';
    for (const flash of this.flashes) {
      ctx.globalAlpha = 0.65 * (1 - (now - flash.at) / FLASH_MS);
      for (const [x, y] of flash.cells) {
        if (y >= HIDDEN_ROWS - PEEK) ctx.fillRect(this.colX(x), this.rowY(y), s, s);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// 홀드·다음 미리보기. 크기는 CSS가 정하고, 여기서는 백킹 스토어만 맞춘다.
class PreviewRenderer {
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.palette = palette;
    this.key = null;
    this.fit();
    new ResizeObserver(() => this.fit()).observe(canvas);
  }

  fit() {
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    if (!this.w || !this.h) return;
    this.ctx = setBackingStore(this.canvas, this.w, this.h);
    this.key = null;
    if (this.lineup) this.drawLineup(this.lineup);
  }

  drawHold(game) {
    const key = `${game.holdType}|${game.holdUsed}|${this.w}x${this.h}`;
    if (!this.ctx || key === this.key) return;
    this.key = key;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (!game.holdType) return;
    const s = Math.min(w / 5, h / 3);
    drawPiece(ctx, game.holdType, w / 2, h / 2, s, this.palette, game.holdUsed ? 0.3 : 1);
  }

  drawNext(game, count = Infinity) {
    const queue = game.nextQueue.slice(0, count);
    const key = `${queue.join('')}|${this.w}x${this.h}`;
    if (!this.ctx || key === this.key) return;
    this.key = key;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const weights = queue.map((_, i) => (i === 0 ? 1.45 : 1));
    const unit = h / weights.reduce((a, b) => a + b, 0);
    let y = 0;
    queue.forEach((type, i) => {
      const slotH = unit * weights[i];
      const s = Math.min(slotH / 2.9, w / (i === 0 ? 4.9 : 5.8));
      drawPiece(ctx, type, w / 2, y + slotH / 2, s, this.palette, i === 0 ? 1 : 0.92);
      y += slotH;
    });
  }

  drawLineup(types) {
    this.lineup = types;
    if (!this.ctx) return;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const slot = w / types.length;
    const s = Math.min(slot / 4.6, h / 2.8);
    types.forEach((type, i) => drawPiece(ctx, type, slot * (i + 0.5), h / 2, s, this.palette));
  }
}
return { readPalette, drawPiece, BoardRenderer, PreviewRenderer };
})();

// ── src/ui/hud.js ──
const __src_ui_hud_js = (() => {
const { LINES_PER_LEVEL } = __src_core_constants_js;
const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
const MAX_CALLOUTS = 3;

const pad2 = (n) => String(n).padStart(2, '0');

function formatTime(ms) {
  const cs = Math.floor(ms / 10);
  return `${pad2(Math.floor(cs / 6000))}:${pad2(Math.floor(cs / 100) % 60)}.${pad2(cs % 100)}`;
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

// clear 이벤트 → 스탬프 문구.
function describeClear({ lines, tspin, b2b, combo, perfectClear, points }) {
  let title;
  let tone = 'plain';
  if (tspin !== 'none') {
    title = `${tspin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN'}${lines ? ` ${CLEAR_NAMES[lines]}` : ''}`;
    tone = 'tspin';
  } else {
    title = CLEAR_NAMES[lines];
    if (lines === 4) tone = 'tetris';
  }
  const tags = [];
  if (perfectClear) {
    tags.push('PERFECT CLEAR');
    tone = 'perfect';
  }
  if (b2b) tags.push('BACK-TO-BACK');
  if (combo > 0) tags.push(`${combo} COMBO`);
  return { title, tags, points, tone };
}

class Hud {
  constructor(root) {
    const $ = (id) => root.querySelector(`#${id}`);
    this.el = {
      score: $('score'),
      level: $('level'),
      lines: $('lines'),
      time: $('time'),
      toNext: $('to-next'),
      progress: $('level-progress'),
      b2b: $('badge-b2b'),
      combo: $('badge-combo'),
      callouts: $('callouts'),
      countdown: $('countdown'),
    };
    this.cache = new Map();
  }

  reset() {
    this.cache.clear();
    this.el.callouts.replaceChildren();
    this.setCountdown('');
  }

  write(key, value, apply) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply(this.el[key], value);
  }

  text(key, value) {
    this.write(key, value, (el, v) => {
      el.textContent = v;
    });
  }

  update(game) {
    this.text('score', formatNumber(game.score));
    this.text('level', String(game.level));
    this.text('lines', String(game.lines));
    this.text('time', formatTime(game.elapsed));
    const into = game.lines % LINES_PER_LEVEL;
    this.text('toNext', String(LINES_PER_LEVEL - into));
    this.write('progress', into, (el, v) => {
      el.style.transform = `scaleX(${v / LINES_PER_LEVEL})`;
    });
    this.write('b2b', game.b2b, (el, on) => el.classList.toggle('is-on', on));
    const combo = Math.max(0, game.combo);
    this.write('combo', combo, (el, v) => {
      el.classList.toggle('is-on', v > 0);
      el.textContent = `${v} COMBO`;
    });
  }

  callout({ title, tags = [], points, tone }) {
    const node = document.createElement('div');
    node.className = `callout tone-${tone}`;
    const heading = document.createElement('strong');
    heading.textContent = title;
    node.append(heading);
    for (const tag of tags) {
      const chip = document.createElement('span');
      chip.className = 'callout-tag';
      chip.textContent = tag;
      node.append(chip);
    }
    if (points) {
      const pts = document.createElement('em');
      pts.textContent = `+${formatNumber(points)}`;
      node.append(pts);
    }
    node.addEventListener('animationend', () => node.remove());
    this.el.callouts.prepend(node);
    while (this.el.callouts.children.length > MAX_CALLOUTS) this.el.callouts.lastElementChild.remove();
  }

  setCountdown(text) {
    const el = this.el.countdown;
    el.textContent = text;
    el.classList.remove('is-pop');
    if (text) {
      void el.offsetWidth; // 애니메이션 재시작
      el.classList.add('is-pop');
    }
  }
}
return { formatTime, formatNumber, describeClear, Hud };
})();

// ── src/ui/audio.js ──
const __src_ui_audio_js = (() => {
// 파일 없이 Web Audio로 합성하는 짧은 효과음.
class Sfx {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.master = null;
  }

  // 브라우저 자동재생 정책 때문에 사용자 입력 시점에 처음 만든다.
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, { type = 'square', vol = 0.1, slide = 1, delay = 0 } = {}) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  play(name, detail = {}) {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'move':
        return this.tone(310, 0.03, { type: 'triangle', vol: 0.12 });
      case 'rotate':
        return this.tone(520, 0.05, { type: 'triangle', vol: 0.12, slide: 1.3 });
      case 'hold':
        return this.tone(392, 0.09, { type: 'sine', vol: 0.18, slide: 1.5 });
      case 'lock':
        return this.tone(150, 0.06, { type: 'square', vol: 0.05, slide: 0.7 });
      case 'harddrop':
        this.tone(190, 0.1, { type: 'square', vol: 0.07, slide: 0.35 });
        return this.tone(95, 0.12, { type: 'sine', vol: 0.25, slide: 0.5 });
      case 'clear': {
        const notes = detail.tspin && detail.tspin !== 'none' ? [440, 554, 659, 880] : [523, 659, 784, 1047];
        const count = Math.max(1, detail.lines);
        notes.slice(0, count).forEach((f, i) => this.tone(f, 0.13, { type: 'square', vol: 0.06, delay: i * 0.055 }));
        if (detail.lines === 4 || detail.perfectClear) this.tone(1568, 0.25, { type: 'triangle', vol: 0.08, delay: 0.24 });
        return;
      }
      case 'levelup':
        return [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.1, { type: 'triangle', vol: 0.12, delay: 0.1 + i * 0.07 }));
      case 'ready':
        return this.tone(440, 0.1, { type: 'triangle', vol: 0.14 });
      case 'go':
        return this.tone(880, 0.16, { type: 'triangle', vol: 0.16 });
      case 'gameover':
        return [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.16, delay: i * 0.17 }));
    }
  }
}
return { Sfx };
})();

// ── src/ui/storage.js ──
const __src_ui_storage_js = (() => {
// 최고 점수·설정 저장. 사생활 모드 등으로 저장소가 막혀도 게임은 그대로 돈다.
const PREFIX = 'tetris-paper:';

const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // 저장 실패는 무시한다.
    }
  },
};
return { storage };
})();

// ── src/core/placements.js ──
const __src_core_placements_js = (() => {
const { COLS, HIDDEN_ROWS, ROWS } = __src_core_constants_js;
const { fullRows, removeRows } = __src_core_board_js;
const { Game } = __src_core_game_js;
// 스폰 직후 회전 순서. 세 번 돌리는 대신 반시계 한 번.
const ROTATIONS = [[], ['cw'], ['cw', 'cw'], ['ccw']];

// 보드 모양 지표. 높이는 숨김 줄까지 포함한 칸 수, 구멍은 위가 막힌 빈칸 수.
function boardStats(grid) {
  const heights = [];
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let top = ROWS;
    for (let y = 0; y < ROWS; y++) {
      if (grid[y][x] !== null) {
        top = y;
        break;
      }
    }
    heights.push(ROWS - top);
    for (let y = top + 1; y < ROWS; y++) if (grid[y][x] === null) holes += 1;
  }
  let bumpiness = 0;
  for (let x = 0; x < COLS - 1; x++) bumpiness += Math.abs(heights[x] - heights[x + 1]);
  return {
    heights,
    holes,
    bumpiness,
    aggregateHeight: heights.reduce((a, b) => a + b, 0),
    maxHeight: Math.max(...heights),
  };
}

// 착지 후보 전부. 실제 Game 로직으로 시뮬레이션하므로 월킥·T-스핀 판정까지 게임과 똑같이 맞는다.
// 홀드가 가능하면 "홀드한 뒤 나오는 피스"의 후보도 함께 낸다(actions가 'hold'로 시작).
//   reach: 'full'(기본) — 스폰에서 좌우·회전·한 칸 내리기로 닿는 모든 상태를 넓이 우선으로 훑는다.
//          턱 밑으로 밀어 넣기(tuck)·비틀어 넣기(T-스핀)까지 찾는다.
//          'drop' — 회전 → 좌우 → 하드 드롭만. 훨씬 빨라서 한 수 앞 계산에 쓴다.
function enumerateMoves({ grid, type, holdType = null, holdUsed = false, next = [] }, { reach = 'full' } = {}) {
  const before = boardStats(grid);
  const seen = new Set();
  const moves = [];
  const explore = reach === 'drop' ? exploreDrops : exploreAll;
  explore(grid, type, [], false, before, seen, moves);
  const incoming = holdType ?? next[0];
  if (!holdUsed && incoming) explore(grid, incoming, ['hold'], true, before, seen, moves);
  return moves.map((move, i) => ({ id: `move_${i}`, ...move }));
}

function makeSim(grid) {
  const sim = new Game();
  sim.grid = grid; // 아래 메서드들은 보드를 읽기만 한다.
  sim.state = 'playing';
  return sim;
}

// 같은 칸이라도 T-스핀 여부가 다르면 다른 후보다(점수가 다르다).
function addMove(grid, sim, piece, path, tspin, prefix, hold, before, seen, moves) {
  const cells = sim.cellsOf(piece);
  const key = `${cells.map(([x, y]) => `${x},${y}`).sort().join(' ')}|${tspin}`;
  if (seen.has(key)) return;
  seen.add(key);
  moves.push(describe(grid, piece, cells, [...prefix, ...path, 'hard'], hold, before, tspin));
}

function exploreDrops(grid, type, prefix, hold, before, seen, moves) {
  const sim = makeSim(grid);
  for (const rotation of ROTATIONS) {
    if (type === 'O' && rotation.length) continue;
    sim.spawn(type);
    if (sim.state !== 'playing') return; // 스폰 자리가 막힘
    if (!rotation.every((dir) => sim.rotate(dir === 'cw' ? 1 : -1))) continue;

    const base = { ...sim.piece };
    const positions = [{ piece: base, shifts: [] }];
    for (const [dx, key] of [[-1, 'left'], [1, 'right']]) {
      sim.piece = { ...base };
      const shifts = [];
      while (sim.move(dx)) {
        shifts.push(key);
        positions.push({ piece: { ...sim.piece }, shifts: [...shifts] });
      }
    }
    for (const { piece, shifts } of positions) {
      sim.piece = { ...piece };
      addMove(grid, sim, { ...piece, y: sim.ghostY() }, [...rotation, ...shifts], 'none', prefix, hold, before, seen, moves);
    }
  }
}

const STEPS = [
  ['left', (sim) => sim.move(-1)],
  ['right', (sim) => sim.move(1)],
  ['down', (sim) => sim.stepDown()],
  ['cw', (sim) => sim.rotate(1)],
  ['ccw', (sim) => sim.rotate(-1)],
];

function exploreAll(grid, type, prefix, hold, before, seen, moves) {
  const sim = makeSim(grid);
  sim.spawn(type);
  if (sim.state !== 'playing') return; // 스폰 자리가 막힘

  // 상태 = 위치·회전 + "마지막 동작이 회전이었나"(T-스핀 판정이 달라진다). 먼저 닿은 경로가 가장 짧다.
  const visited = new Set();
  const queue = [];
  const push = (piece, path, rotated, kick) => {
    const key = `${piece.x},${piece.y},${piece.rot},${rotated ? 1 : 0}`;
    if (visited.has(key)) return;
    visited.add(key);
    queue.push({ piece, path, rotated, kick });
  };
  push({ ...sim.piece }, [], false, -1);

  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    // 이 상태에서 하드 드롭한 자리. 바닥에 닿아 있고 마지막이 회전이면 드롭 거리가 0이라 T-스핀이 유지된다.
    sim.piece = { ...node.piece };
    const landedY = sim.ghostY();
    const landed = { ...node.piece, y: landedY };
    let tspin = 'none';
    if (type === 'T' && node.rotated && landedY === node.piece.y) {
      sim.piece = landed;
      sim.lastAction = 'rotate';
      sim.lastKick = node.kick;
      tspin = sim.detectTSpin();
    }
    addMove(grid, sim, landed, node.path, tspin, prefix, hold, before, seen, moves);

    for (const [action, step] of STEPS) {
      const rotation = action === 'cw' || action === 'ccw';
      if (type === 'O' && rotation) continue;
      sim.piece = { ...node.piece };
      if (!step(sim)) continue;
      push({ ...sim.piece }, [...node.path, action], rotation, rotation ? sim.lastKick : -1);
    }
  }
}

function describe(grid, piece, cells, actions, hold, before, tspin = 'none') {
  const placed = grid.map((row) => row.slice());
  for (const [x, y] of cells) placed[y][x] = piece.type;
  const rows = fullRows(placed);
  const result = removeRows(placed, rows);
  const after = boardStats(result);
  const xs = cells.map(([x]) => x);
  const bottom = Math.max(...cells.map(([, y]) => y));
  return {
    type: piece.type,
    rot: piece.rot,
    x: piece.x,
    hold,
    actions,
    cells,
    result, // 놓고 줄까지 지운 뒤의 보드(한 수 앞 내다보기용)
    columns: [Math.min(...xs), Math.max(...xs)],
    features: {
      lines: rows.length,
      tspin, // 'none' | 'mini' | 'full' — 게임의 T-스핀 판정과 같다
      holes: after.holes,
      newHoles: after.holes - before.holes,
      aggregateHeight: after.aggregateHeight,
      maxHeight: after.maxHeight,
      bumpiness: after.bumpiness,
      lockOut: cells.every(([, y]) => y < HIDDEN_ROWS),
      // 놓기 전 보드와 비교한 값들: 피스 밑면 아래 칸 수(0이면 바닥), 가장 높은 열의 변화, 울퉁불퉁함의 변화.
      landing: ROWS - 1 - bottom,
      lowestColumn: Math.min(...before.heights),
      highestColumn: before.maxHeight,
      heightGain: after.maxHeight - before.maxHeight,
      bumpinessChange: after.bumpiness - before.bumpiness,
    },
  };
}
return { boardStats, enumerateMoves };
})();

// ── src/ai/driver.js ──
const __src_ai_driver_js = (() => {
// 봇이 Game을 조작한다. 피스가 나오면 두뇌(brain)에게 묻고, 답을 기다리는 동안은 중력을 멈춘다.
// 정해진 동작은 stepMs 간격으로 하나씩 실행해 사람이 따라 볼 수 있게 한다.
const ACTIONS = {
  hold: (game) => game.hold(),
  cw: (game) => game.rotate(1),
  ccw: (game) => game.rotate(-1),
  left: (game) => game.move(-1),
  right: (game) => game.move(1),
  down: (game) => game.softDropStep(),
  hard: (game) => game.hardDrop(),
};

// 후보의 actions 한 칸을 게임에 입력한다(화면 봇·벤치마크·테스트 공용).
function applyAction(game, action) {
  return ACTIONS[action](game);
}

function snapshotOf(game) {
  return {
    grid: game.grid.map((row) => row.slice()),
    type: game.piece.type,
    holdType: game.holdType,
    holdUsed: game.holdUsed,
    next: game.nextQueue.slice(),
  };
}

class BotDriver {
  // settleMs: 피스를 놓은 뒤 다음 수를 생각하기 전에 쉬는 시간(사람이 결과를 볼 수 있게).
  constructor(game, brain, { stepMs = 60, settleMs = 0, onThink, onDecision } = {}) {
    this.game = game;
    this.brain = brain;
    this.stepMs = stepMs;
    this.settleMs = settleMs;
    this.onThink = onThink;
    this.onDecision = onDecision;
    this.phase = 'idle'; // idle | thinking | acting | settling | stopped
    this.queue = [];
    this.acc = 0;
    this.wait = 0;
    this.token = 0;
    this.decision = null;
  }

  stop() {
    this.token += 1; // 아직 오는 중인 답은 버린다
    this.phase = 'stopped';
  }

  update(dt) {
    const game = this.game;
    if (this.phase === 'stopped') return;
    if (game.state === 'clearing') game.update(dt); // 줄 삭제 연출만 진행(중력은 없음)
    if (this.phase === 'settling') {
      this.wait -= dt;
      if (this.wait > 0) return;
      this.phase = 'idle';
    }
    if (game.state !== 'playing' || !game.piece) return;
    if (this.phase === 'idle') {
      this.think();
      return;
    }
    if (this.phase !== 'acting') return;

    this.acc += dt;
    while (this.queue.length && this.acc >= this.stepMs) {
      this.acc -= this.stepMs;
      const action = this.queue.shift();
      if (action === 'hard') {
        this.checkTarget();
        applyAction(game, 'hard');
        this.phase = 'settling';
        this.wait = this.settleMs;
        return;
      }
      applyAction(game, action);
      if (game.state !== 'playing') break;
    }
    if (!this.queue.length) this.phase = 'idle';
  }

  think() {
    const token = ++this.token;
    this.phase = 'thinking';
    this.onThink?.();
    const snapshot = snapshotOf(this.game);
    Promise.resolve()
      .then(() => this.brain.decide(snapshot))
      .catch((err) => {
        console.error(err);
        return null;
      })
      .then((decision) => {
        if (token !== this.token) return;
        this.decision = decision;
        this.queue = decision ? [...decision.move.actions] : ['hard'];
        this.acc = this.stepMs; // 첫 동작은 바로
        this.phase = 'acting';
        this.onDecision?.(decision);
      });
  }

  // 시뮬레이션과 실제 게임이 어긋나면 알린다(정상이라면 일어나지 않는다).
  checkTarget() {
    const move = this.decision?.move;
    const piece = this.game.piece;
    if (move && piece && (piece.type !== move.type || piece.rot !== move.rot || piece.x !== move.x)) {
      console.warn('봇이 계획한 위치와 실제 피스 위치가 달라요', { move, piece });
    }
  }
}
return { applyAction, snapshotOf, BotDriver };
})();

// ── src/ai/heuristic.js ──
const __src_ai_heuristic_js = (() => {
const { enumerateMoves } = __src_core_placements_js;
// El-Tetris(Yiyuan Lee)의 유전 알고리즘 가중치. 코드만으로 두는 기준선 봇.
const WEIGHTS = {
  aggregateHeight: -0.510066,
  lines: 0.760666,
  holes: -0.35663,
  bumpiness: -0.184483,
};

function evaluate(features, weights = WEIGHTS) {
  if (features.lockOut) return -Infinity;
  return (
    weights.aggregateHeight * features.aggregateHeight +
    weights.lines * features.lines +
    weights.holes * features.holes +
    weights.bumpiness * features.bumpiness
  );
}

// ── 한 수 앞 내다보기 ──────────────────────────────────

// 이 수를 둔 다음에 나올 피스. 홀드를 쓰는 수면 큐가 한 칸 더 당겨진다.
function nextPieceAfter(move, snapshot) {
  if (!move.hold) return snapshot.next[0];
  return snapshot.holdType ? snapshot.next[0] : snapshot.next[1];
}

// 후보마다 "다음 피스를 가장 잘 놓았을 때"를 찾아 follow로 붙인다.
// follow.features: 다음 피스까지 놓은 뒤의 보드. follow.score: 두 수를 합친 평가(두 수의 지운 줄 합산).
function attachFollowUps(snapshot, moves, weights = WEIGHTS) {
  for (const move of moves) {
    const type = nextPieceAfter(move, snapshot);
    if (!type || move.features.lockOut) {
      move.follow = null;
      continue;
    }
    let best = null;
    let bestScore = -Infinity;
    // 다음 피스는 빠른 방식(회전 → 좌우 → 드롭)으로만 본다: 후보마다 한 번씩, 수십 번 돌기 때문.
    for (const reply of enumerateMoves({ grid: move.result, type, holdUsed: true }, { reach: 'drop' })) {
      const score = evaluate(reply.features, weights);
      if (score > bestScore) {
        best = reply;
        bestScore = score;
      }
    }
    move.follow = {
      type,
      features: best?.features ?? null,
      score: bestScore + weights.lines * move.features.lines,
    };
  }
  return moves;
}

// ── 순위 ───────────────────────────────────────────────

const valueOf = (move, weights) => (move.follow ? move.follow.score : evaluate(move.features, weights));

// 점수가 높은 순. 한 수 앞을 붙인 후보면 두 수를 합친 평가로, 같으면 지금 수의 평가로, 그래도 같으면
// 먼저 나온(홀드 안 하는, 덜 움직이는) 후보가 앞선다.
function rankMoves(moves, weights = WEIGHTS) {
  return moves
    .map((move, order) => ({ move, score: valueOf(move, weights), now: evaluate(move.features, weights), order }))
    .sort((a, b) => b.score - a.score || b.now - a.now || a.order - b.order);
}

class HeuristicBrain {
  // lookahead: 다음 피스까지 보고 고른다(2수 탐색).
  constructor({ lookahead = false } = {}) {
    this.lookahead = lookahead;
  }

  decide(snapshot) {
    const started = performance.now();
    const moves = enumerateMoves(snapshot);
    if (moves.length === 0) return null;
    if (this.lookahead) attachFollowUps(snapshot, moves);
    const ranked = rankMoves(moves);
    return {
      source: 'heuristic',
      move: ranked[0].move,
      score: ranked[0].score,
      alternatives: ranked.slice(0, 3).map(({ move, score }) => ({ move, value: score })),
      candidates: moves.length,
      ms: performance.now() - started,
    };
  }
}
return { WEIGHTS, evaluate, nextPieceAfter, attachFollowUps, rankMoves, HeuristicBrain };
})();

// ── src/ai/jev.js ──
const __src_ai_jev_js = (() => {
const { COLS, HIDDEN_ROWS } = __src_core_constants_js;
const { enumerateMoves } = __src_core_placements_js;
const { attachFollowUps, rankMoves } = __src_ai_heuristic_js;
// 브라우저는 키 없이 개발 서버의 프록시(/api/jev)만 부른다. 키는 서버의 Tetris/.env에 있다.
const JEV_ENDPOINT = '/api/jev';
// 입력 100만 토큰당 가격(출력 토큰은 무료). docs.typesafe.ai/models 기준(2026-09). 화면에는 "추정"으로 표시.
const JEV_PRICE_PER_MTOK = 0.042;
const QUESTION_ID = 'best_move';

// ── 후보 설명 ──────────────────────────────────────────
// 문서 권장: 숫자 비교·계산은 코드가 하고, 모델에는 이름 붙은 구간으로 넘긴다(Jev 1.13 jaggedness).
const LINES_TEXT = ['none', 'clears 1 line', 'clears 2 lines', 'clears 3 lines', 'clears 4 lines at once (a Tetris)'];
const COUNT_WORDS = ['no', 'one', 'two'];

// 줄을 지우는 T-스핀만 알린다. 줄 없는 T-스핀 미니는 점수가 작아, 굳이 노리게 만들 이유가 없다
// (벤치마크에서 Jev가 줄 없는 미니를 노리다 스택을 흐트러뜨렸다).
function linesText({ lines, tspin }) {
  const base = LINES_TEXT[lines] ?? `clears ${lines} lines`;
  if (!lines || !tspin || tspin === 'none') return base;
  return `${base} with a ${tspin === 'full' ? 'T-spin (big bonus points)' : 'T-spin mini (small bonus points)'}`;
}

function positionText([from, to]) {
  const span = from === to ? `column ${from + 1}` : `columns ${from + 1}-${to + 1}`;
  const wall = from === 0 ? ', against the left wall' : to === COLS - 1 ? ', against the right wall' : '';
  return `${span} of 10${wall}`;
}

function holesText(n) {
  if (n <= 0) return 'creates no new holes';
  return n < COUNT_WORDS.length ? `creates ${COUNT_WORDS[n]} new hole${n > 1 ? 's' : ''}` : `creates ${n} new holes`;
}

function heightText(h) {
  if (h <= 4) return 'very low';
  if (h <= 8) return 'low';
  if (h <= 12) return 'medium';
  if (h <= 16) return 'high';
  return 'near the top (dangerous)';
}

// 놓이는 높이를 지금 보드의 가장 낮은 열~가장 높은 열 사이에서 어디쯤인지로 말한다.
function landingText({ landing, lowestColumn, highestColumn }) {
  if (landing <= lowestColumn) return 'the lowest part of the board';
  const t = (landing - lowestColumn) / Math.max(1, highestColumn - lowestColumn);
  if (t < 0.4) return 'a low part of the board';
  if (t < 0.8) return 'the middle height of the stack';
  return 'on top of the highest part of the stack';
}

function growthText(gain) {
  if (gain < 0) return 'lowers the stack';
  if (gain === 0) return 'does not raise the tallest column';
  if (gain <= 2) return `raises the tallest column by ${COUNT_WORDS[gain]} row${gain > 1 ? 's' : ''}`;
  return 'raises the tallest column by three or more rows';
}

function surfaceChangeText(change) {
  if (change < 0) return 'makes the surface flatter';
  if (change <= 1) return 'keeps the surface about as flat';
  if (change <= 3) return 'makes the surface a bit rougher';
  return 'makes the surface much rougher';
}

// 한 수 앞: 코드가 찾은 "다음 피스를 가장 잘 놓았을 때"를 말로.
function followText(follow) {
  const piece = `the next ${follow.type} piece`;
  const f = follow.features;
  if (!f || f.lockOut) return `leaves no safe place for ${piece}`;
  if (f.newHoles > 0) return `${piece} would then have to leave a hole`;
  if (f.lines > 0) return `${piece} can then clear ${f.lines === 1 ? 'a line' : `${f.lines} lines`}`;
  if (f.bumpinessChange > 1) return `${piece} fits without holes but roughens the surface`;
  return `${piece} then fits cleanly`;
}

// 모든 후보가 같은 필드 이름을 쓰게 해서 모델이 나란히 비교할 수 있게 한다.
// 회전 방향처럼 좋고 나쁨과 상관없는 정보는 넣지 않는다(무관한 정보는 정확도를 떨어뜨린다: jaggedness #5).
// move.follow가 붙어 있으면(한 수 앞 내다보기) next_piece 필드를, 전략에 우물 쪽이 있으면 edge_column 필드를 더한다.
function describeMove(move, policy = null) {
  const f = move.features;
  const description = {
    uses_hold: move.hold ? `yes, holds the current piece and places the ${move.type} piece` : 'no',
    position: positionText(move.columns),
    lands_on: landingText(f),
    lines_cleared: linesText(f),
    new_holes: holesText(f.newHoles),
    stack_growth: growthText(f.heightGain),
    surface_change: surfaceChangeText(f.bumpinessChange),
    stack_height_after: heightText(f.maxHeight),
    risk: f.lockOut ? 'ends the game immediately' : f.maxHeight > 16 ? 'stack close to the top' : 'none',
  };
  if (policy?.well) description.edge_column = edgeText(move, policy.well);
  if (move.follow !== undefined) description.next_piece = move.follow ? followText(move.follow) : 'unknown';
  return description;
}

function edgeText(move, side) {
  const column = side === 'right' ? COLS - 1 : 0;
  if (!move.cells.some(([x]) => x === column)) return `keeps the ${side} edge column empty`;
  return move.features.lines
    ? `puts blocks into the ${side} edge column and clears lines`
    : `puts blocks into the ${side} edge column without clearing lines`;
}

// 우선순위. 전략(policy)이 없으면 기본 순서 그대로다.
function priorities(policy, withFollow) {
  const list = ['Never choose a move whose risk ends the game.', 'Avoid creating new holes (empty cells covered from above).'];
  if (policy?.well) list.push(`Keep the ${policy.well} edge column empty as a well; only put blocks there with a move that clears lines.`);
  if (policy?.tetris) list.push('Prefer clearing four lines at once (a Tetris) over clearing fewer lines.');
  list.push(
    policy?.risk === 2
      ? 'A taller stack is acceptable for bigger clears, but keep it below the top.'
      : 'Prefer moves that land in the lowest part of the board and do not raise the tallest column.',
  );
  list.push('Prefer moves that keep the surface flat.');
  if (!policy?.tetris) list.push('Clear lines when possible; clearing several lines at once is best.');
  if (withFollow) list.push('Prefer moves after which the next piece fits cleanly.');
  return list;
}

function boardRows(grid) {
  return grid.slice(HIDDEN_ROWS).map((row) => row.map((cell) => (cell ? '#' : '.')).join(''));
}

// 한 번의 요청: state = 보드와 피스 정보, 질문 = 후보 중 하나를 고르는 Choice 하나.
// board: 보드 격자를 state에 넣을지. 기본은 뺀다 — 세 시드 50피스 비교에서 격자를 뺀 쪽이
// 확신도가 높고(0.53→0.63) 토큰도 적었다. 판단은 코드가 계산한 후보 설명만으로 한다.
// recheck: 첫 판단이 애매해 좁힌 후보들로 다시 묻는 두 번째 질문.
// policy: 플레이어 전략(strategy.js)에서 나온 정책. 없으면 기본 플레이.
function buildJevRequest(snapshot, moves, { board = false, recheck = false, policy = null } = {}) {
  const state = {
    current_piece: snapshot.type,
    hold_piece: snapshot.holdType ?? 'empty',
    next_pieces: snapshot.next.slice(0, 3),
  };
  if (board) {
    state.board = boardRows(snapshot.grid);
    state.board_legend = 'Rows from top to bottom. "#" is a filled cell, "." is empty. Columns are numbered 1-10 from the left.';
  }
  return {
    state,
    questions: {
      [QUESTION_ID]: {
        type: 'choice',
        instructions: {
          question: recheck
            ? 'These are the most promising placements for the current Tetris piece. Which one is the best move? Compare them closely.'
            : 'Which placement is the best move for the current Tetris piece?',
          goal: 'Survive as long as possible and clear many lines.',
          priorities_in_order: priorities(policy, moves.some((move) => move.follow !== undefined)),
        },
        criteria: Object.fromEntries(moves.map((move) => [move.id, describeMove(move, policy)])),
      },
    },
  };
}

// ── 서버 호출 ──────────────────────────────────────────

// ready: 참가 가능 · nokey: 서버에 키가 없음 · offline: 개발 서버가 아님(file:// 등)
async function jevStatus() {
  try {
    const res = await fetch(`${JEV_ENDPOINT}/status`, { cache: 'no-store' });
    if (!res.ok) return { state: 'offline' };
    const body = await res.json();
    return body.configured ? { state: 'ready', model: body.model } : { state: 'nokey' };
  } catch {
    return { state: 'offline' };
  }
}

async function askJev(request, { timeoutMs = 20_000 } = {}) {
  const started = performance.now();
  const res = await fetch(JEV_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return { ...body, latencyMs: Math.round(performance.now() - started) };
}

// 확신도 게이트 기본값: 벤치마크(5시드 × 50피스)에서 확신도 0.4 미만 수의 20%가 피할 수 있던 구멍을
// 만들었고, 0.8 이상은 2%였다. 그 아래일 때만 후보를 좁혀 다시 묻는다.
const GATE_CONFIDENCE = 0.4;
const SHORTLIST = 5;

// 전략의 "우물(가장자리 한 줄)은 비워 둔다"는 규칙은 코드가 지킨다 — 판단이 아니라 규칙이라서다
// (문서: 알려진 규칙은 코드에). Jev에게 우선순위로만 알려 줬더니 매 수 따로 판단하다 보니
// 1~2줄을 지우려고 우물을 채워 버려 테트리스가 0번이었다(벤치마크).
// 우물에 블록을 넣는 수는 테트리스 전략이면 4줄을, 아니면 줄을 지울 때만 허용한다.
// 스택이 WELL_RELEASE_HEIGHT 이상으로 위험해지면 규칙을 풀어 살아남는 쪽을 택한다.
const WELL_RELEASE_HEIGHT = 12;

function allowedByPolicy(moves, policy) {
  if (!policy?.well || moves.length === 0) return moves;
  if (moves[0].features.highestColumn >= WELL_RELEASE_HEIGHT) return moves;
  const column = policy.well === 'right' ? COLS - 1 : 0;
  const need = policy.tetris ? 4 : 1;
  const allowed = moves.filter((move) => !move.cells.some(([x]) => x === column) || move.features.lines >= need);
  return allowed.length ? allowed : moves;
}

function readAnswer(res, byId) {
  const answer = res.answers?.[QUESTION_ID];
  const move = byId.get(answer?.choice);
  if (!move) throw new Error('Jev 응답에 알 수 없는 후보가 있어요.');
  return { move, confidence: answer.confidence, probabilities: answer.probabilities ?? {} };
}

// Jev가 후보 중 하나를 고른다. 실패하면 휴리스틱의 수로 대신 두고 'fallback'으로 표시한다.
//   lookahead: false · 'all'(모든 후보에 다음 피스 정보) · 'recheck'(다시 물을 때만 다음 피스 정보)
//   gate: 이 확신도 미만이면 Jev 자신의 상위 SHORTLIST개 후보로 좁혀 한 번 더 묻는다(null이면 안 함).
class JevBrain {
  //   reach: 착지 후보를 찾는 방식('full' = 비틀어 넣기·T-스핀 포함, 'drop' = 위에서 떨어뜨리기만).
  constructor({ ask = askJev, requestOptions = {}, lookahead = false, gate = null, shortlist = SHORTLIST, reach = 'full' } = {}) {
    this.ask = ask;
    this.requestOptions = requestOptions;
    this.lookahead = lookahead;
    this.gate = gate;
    this.shortlist = shortlist;
    this.reach = reach;
  }

  async decide(snapshot) {
    const moves = allowedByPolicy(enumerateMoves(snapshot, { reach: this.reach }), this.requestOptions.policy);
    if (moves.length === 0) return null;
    if (this.lookahead === 'all') attachFollowUps(snapshot, moves);
    const baseline = rankMoves(moves)[0].move;
    const byId = new Map(moves.map((move) => [move.id, move]));
    const started = performance.now();
    try {
      const res = await this.ask(buildJevRequest(snapshot, moves, this.requestOptions));
      let pick = readAnswer(res, byId);
      const first = pick;
      const usage = { input_tokens: res.usage?.input_tokens ?? 0 };
      let passes = 1;

      if (this.gate !== null && pick.confidence < this.gate) {
        const shortlist = Object.entries(pick.probabilities)
          .sort((a, b) => b[1] - a[1])
          .slice(0, this.shortlist)
          .map(([id]) => byId.get(id))
          .filter(Boolean);
        if (shortlist.length > 1) {
          if (this.lookahead === 'recheck') attachFollowUps(snapshot, shortlist);
          const again = await this.ask(buildJevRequest(snapshot, shortlist, { ...this.requestOptions, recheck: true }));
          pick = readAnswer(again, byId);
          usage.input_tokens += again.usage?.input_tokens ?? 0;
          passes = 2;
        }
      }

      return {
        source: 'jev',
        move: pick.move,
        confidence: pick.confidence,
        firstConfidence: first.confidence,
        firstChoice: first.move.id,
        passes,
        alternatives: Object.entries(pick.probabilities)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .filter(([id]) => byId.has(id))
          .map(([id, value]) => ({ move: byId.get(id), value })),
        agrees: pick.move.id === baseline.id,
        candidates: moves.length,
        ms: performance.now() - started,
        model: res.model,
        usage,
        requestId: res.requestId,
      };
    } catch (err) {
      return {
        source: 'fallback',
        move: baseline,
        error: err.message,
        candidates: moves.length,
        ms: performance.now() - started,
      };
    }
  }
}
return { JEV_ENDPOINT, JEV_PRICE_PER_MTOK, QUESTION_ID, describeMove, boardRows, buildJevRequest, jevStatus, askJev, GATE_CONFIDENCE, SHORTLIST, WELL_RELEASE_HEIGHT, allowedByPolicy, JevBrain };
})();

// ── src/ai/strategy.js ──
const __src_ai_strategy_js = (() => {
const { askJev } = __src_ai_jev_js;
// 플레이어가 말로 적은 전략을 Jev가 정해진 값(정책)으로 바꾼다. 대결마다 한 번만 부른다.
// 질문과 criteria는 영어로, 플레이어 문장은 그대로(한국어) state에 넣는다(문서: 영어가 주 학습 언어).
const STRATEGY_QUESTIONS = {
  is_strategy: {
    type: 'noul',
    instructions: 'Is `strategy` an instruction about how to play Tetris?',
  },
  wants_tetris: {
    type: 'noul',
    instructions: 'Does `strategy` ask to save up rows and clear four lines at once (a Tetris)?',
  },
  well_side: {
    type: 'choice',
    instructions: 'Which edge column does `strategy` want kept empty as a well?',
    criteria: {
      left: 'The leftmost column',
      right: 'The rightmost column',
      none: 'No column is mentioned or implied',
    },
  },
  risk: {
    type: 'score',
    instructions: 'How much risk does `strategy` accept?',
    criteria: [
      'Play it safe: keep the stack as low as possible',
      'Balanced: accept some height for better clears',
      'Aggressive: accept a tall stack for bigger clears',
    ],
  },
};

// 경계값. 0.5 근처는 "반반"이라는 뜻이라(문서: Noul 0.5 = 불확실) 원하는 쪽으로 확실할 때만 켠다.
// 한국어 문장 다섯 개로 확인: "크게 터뜨려"는 wants_tetris 0.50 → 켜지 않음, "테트리스를 노려"는 0.76 → 켬.
const UNDERSTOOD = 0.5;
const WANTS = 0.6;
const SIDE_CONFIDENCE = 0.3;
const RISK_CONFIDENCE = 0.5; // 위험을 말하지 않은 문장은 확신도가 낮게(0.2~0.3) 나온다 → 기본 '균형'

// → { understood, tetris, well: 'left'|'right'|null, risk: 0|1|2, answers }
function policyFrom(answers) {
  const understood = answers.is_strategy.noul >= UNDERSTOOD;
  if (!understood) return { understood, tetris: false, well: null, risk: 1, answers };
  const tetris = answers.wants_tetris.noul >= WANTS;
  const side = answers.well_side;
  let well = side.choice !== 'none' && side.confidence >= SIDE_CONFIDENCE ? side.choice : null;
  if (tetris && !well) well = 'right'; // 테트리스를 노리는데 쪽을 말하지 않았으면 흔한 오른쪽 우물
  const risk = answers.risk.confidence >= RISK_CONFIDENCE ? Math.round(answers.risk.score) : 1;
  return { understood, tetris, well, risk, answers };
}

async function parseStrategy(text, { ask = askJev } = {}) {
  const res = await ask({ state: { strategy: text }, questions: STRATEGY_QUESTIONS });
  return { text, ...policyFrom(res.answers), model: res.model, usage: res.usage };
}

// 화면 표시용 한 줄 요약.
function policyLabel(policy) {
  if (!policy.understood) return '전략으로 이해하지 못해 기본대로 둬요';
  const parts = [];
  if (policy.tetris) parts.push('테트리스 노리기');
  if (policy.well) parts.push(`${policy.well === 'right' ? '오른쪽' : '왼쪽'} 끝 줄 비우기`);
  parts.push(['안전하게', '균형 있게', '과감하게'][policy.risk] ?? '균형 있게');
  return parts.join(' · ');
}
return { STRATEGY_QUESTIONS, policyFrom, parseStrategy, policyLabel };
})();

// ── src/versus.js ──
const __src_versus_js = (() => {
const { Game } = __src_core_game_js;
const { seededRandom } = __src_core_random_js;
const { boardStats } = __src_core_placements_js;
const { BotDriver } = __src_ai_driver_js;
const { HeuristicBrain } = __src_ai_heuristic_js;
const { GATE_CONFIDENCE, JEV_PRICE_PER_MTOK, JevBrain, jevStatus } = __src_ai_jev_js;
const { parseStrategy, policyLabel } = __src_ai_strategy_js;
const { BoardRenderer, PreviewRenderer } = __src_ui_renderer_js;
const { describeClear, formatNumber } = __src_ui_hud_js;
// 대결 모드: 나 · Jev · 휴리스틱 봇이 같은 시드(같은 피스 순서)로 같은 피스 수를 둔다.
const VERSUS_LIMITS = [20, 30, 50, 100];
const SPEED_MIN = 1;
const SPEED_MAX = 10;
const SPEED_DEFAULT = 3; // 동작 하나에 약 0.15초: 사람 눈으로 따라갈 수 있는 빠르기
const SPEED_KEY = 'bot-speed';

// 봇 속도 1~10 → 동작 하나 사이 간격(ms). 1은 0.4초, 10은 거의 즉시.
function stepMsFor(speed) {
  return Math.round(400 * Math.pow(0.62, speed - 1));
}

// 피스를 놓은 뒤 잠깐 멈춰 결과와 결정 카드를 볼 수 있게 한다.
function settleMsFor(speed) {
  return stepMsFor(speed) * 3;
}

const LANES = [
  { id: 'human', name: '나', tag: '키보드로 직접' },
  { id: 'jev', name: 'Jev', tag: 'TypeSafe · 애매하면 다시 묻기' },
  { id: 'heuristic', name: '휴리스틱', tag: '코드만 · El-Tetris + 한 수 앞' },
];

const ROTATION_KO = ['회전 없음', '시계 90°', '180°', '반시계 90°'];
const ROTATION_DEG = [0, 90, 180, -90];

const isDone = (game) => game.state === 'finished' || game.state === 'over';

function moveLabel(move) {
  const [from, to] = move.columns;
  const cols = from === to ? `${from + 1}열` : `${from + 1}–${to + 1}열`;
  const rotation = move.type === 'O' ? '회전 없음' : ROTATION_KO[move.rot];
  return `${move.hold ? '홀드 → ' : ''}${move.type} · ${rotation} · ${cols}`;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function createLane(def, template, container, palette) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.lane = def.id;
  node.querySelector('.lane-name').textContent = def.name;
  node.querySelector('.lane-tag').textContent = def.tag;
  container.append(node);
  const q = (sel) => node.querySelector(sel);
  const stat = (name) => q(`[data-stat="${name}"]`);
  return {
    ...def,
    node,
    board: new BoardRenderer(q('.lane-canvas'), q('.lane-board'), palette, { syncWellTop: false }),
    hold: new PreviewRenderer(q('.lane-hold'), palette),
    next: new PreviewRenderer(q('.lane-next'), palette),
    el: {
      state: q('.lane-state'),
      banner: q('.lane-banner'),
      off: q('.lane-off'),
      score: stat('score'),
      lines: stat('lines'),
      pieces: stat('pieces'),
      holes: stat('holes'),
      note: q('.decision-note'),
      move: q('.decision-move'),
      meta: q('.decision-meta'),
      confFill: q('.conf-fill'),
      confValue: q('.conf-value'),
      alts: q('.decision-alts'),
      foot: q('.decision-foot'),
      json: q('.decision-json pre'),
    },
    cache: new Map(),
    game: null,
    driver: null,
    metrics: null,
    target: null,
    disabled: false,
  };
}

class Versus {
  constructor({ root, palette, sfx, storage }) {
    this.sfx = sfx;
    this.storage = storage;
    const $ = (sel) => root.querySelector(sel);
    this.el = {
      info: $('#vs-info'),
      jev: $('#vs-jev'),
      policy: $('#vs-policy'),
      speed: $('#vs-speed'),
      speedValue: $('#vs-speed-value'),
      countdown: $('#vs-countdown'),
      table: $('#vs-result-table'),
      sub: $('#vs-result-sub'),
    };
    this.lanes = LANES.map((def) => createLane(def, $('#lane-template'), $('#vs-lanes'), palette));
    this.byId = Object.fromEntries(this.lanes.map((lane) => [lane.id, lane]));
    // 키와 동작이 줄바꿈으로 갈라지지 않게 항목 안은 줄바꿈 없는 공백으로 잇는다.
    this.byId.human.el.note.textContent = ['← → 이동', '↑ X 회전', 'Z 반대 회전', '↓ 소프트 드롭', 'Space 하드 드롭', 'C 홀드']
      .map((item) => item.replaceAll(' ', ' '))
      .join(' · ');

    this.seed = null;
    this.limit = VERSUS_LIMITS[2];
    this.started = false;
    this.run = null;
    this.jev = { state: 'checking' };
    this.setSpeed(storage.get(SPEED_KEY, SPEED_DEFAULT));
    this.el.speed.addEventListener('input', () => this.setSpeed(Number(this.el.speed.value)));
  }

  // ── 흐름 ────────────────────────────────────────────────

  // turnBased: 사람 선수만 중력 없이(턴제). strategy: Jev에게 말로 준 전략(빈 문자열이면 기본 플레이).
  prepare({ seed, limit, startLevel, turnBased = false, strategy = '' }) {
    this.stop();
    this.seed = seed;
    this.limit = limit;
    this.turnBased = turnBased;
    this.policy = null;
    this.started = false;
    const run = {};
    this.run = run;

    for (const lane of this.lanes) {
      const human = lane.id === 'human';
      lane.game = new Game({ startLevel, rng: seededRandom(seed), pieceLimit: limit, noGravity: human && turnBased });
      if (human) lane.node.querySelector('.lane-tag').textContent = turnBased ? '키보드 · 턴제(중력 없음)' : '키보드로 직접';
      lane.metrics = {
        holes: 0,
        peak: 0,
        holesCreated: 0,
        wallMs: 0,
        decisions: 0,
        thinkMs: 0,
        jevCalls: 0,
        fallbacks: 0,
        confidenceSum: 0,
        agreements: 0,
        rechecks: 0,
        inputTokens: 0,
        model: null,
      };
      lane.disabled = false;
      lane.target = null;
      lane.driver = null;
      lane.cache.clear();
      lane.board.resetFx();
      lane.el.banner.className = 'lane-banner';
      lane.el.off.hidden = true;
      this.resetDecision(lane);
      this.bindEvents(lane);
    }

    // 벤치마크로 고른 설정(README 참고): Jev는 위에서 떨어뜨리는 후보만 보고, 확신도가 낮으면 상위 후보를
    // 다음 피스 정보와 함께 다시 묻는다. 휴리스틱은 비틀어 넣기까지 찾고 다음 피스까지 본다.
    const brains = {
      jev: new JevBrain({ gate: GATE_CONFIDENCE, lookahead: 'recheck', reach: 'drop' }),
      heuristic: new HeuristicBrain({ lookahead: true }),
    };
    for (const id of Object.keys(brains)) {
      const lane = this.byId[id];
      lane.driver = new BotDriver(lane.game, brains[id], {
        stepMs: stepMsFor(this.speed),
        settleMs: settleMsFor(this.speed),
        onThink: () => this.onThink(lane),
        onDecision: (decision) => this.onDecision(lane, decision),
      });
    }

    this.setJev({ state: 'checking' });
    this.el.policy.hidden = !strategy;
    this.el.policy.textContent = strategy ? `Jev가 전략을 읽는 중… “${strategy}”` : '';
    // 연결을 확인하고, 전략이 있으면 Jev가 문장을 정책으로 바꾼 뒤에 Jev 레인을 시작한다.
    jevStatus().then(async (status) => {
      if (this.run !== run) return;
      if (status.state === 'ready' && strategy) {
        try {
          const policy = await parseStrategy(strategy);
          if (this.run !== run) return;
          this.policy = policy;
          brains.jev.requestOptions = { ...brains.jev.requestOptions, policy: policy.understood ? policy : null };
          this.el.policy.textContent = `Jev 전략: ${policyLabel(policy)} — “${strategy}”`;
        } catch (err) {
          if (this.run !== run) return;
          this.el.policy.textContent = `전략을 읽지 못해 기본대로 둬요 (${err.message})`;
        }
      } else if (strategy) {
        this.el.policy.textContent = `Jev가 없어 전략은 쓰지 않아요 — “${strategy}”`;
      }
      this.setJev(status);
    });
    this.el.info.textContent = `시드 ${seed} · ${limit}피스 승부 · 시작 레벨 ${startLevel}`;
    return this.byId.human.game;
  }

  start() {
    this.started = true;
    for (const lane of this.lanes) {
      if (lane.disabled) continue;
      if (lane.id === 'jev' && this.jev.state !== 'ready') continue; // 연결 확인이 끝나면 시작
      lane.game.start();
    }
  }

  stop() {
    this.run = null;
    for (const lane of this.lanes) lane.driver?.stop();
  }

  update(dt) {
    for (const lane of this.lanes) {
      const game = lane.game;
      if (lane.disabled || game.state === 'ready' || isDone(game)) continue;
      lane.metrics.wallMs += dt;
      if (lane.driver) lane.driver.update(dt);
      else game.update(dt);
    }
  }

  get done() {
    return this.started && this.lanes.every((lane) => lane.disabled || isDone(lane.game));
  }

  setSpeed(value) {
    this.speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(Number(value) || SPEED_DEFAULT)));
    this.storage.set(SPEED_KEY, this.speed);
    this.el.speed.value = String(this.speed);
    this.el.speedValue.textContent = String(this.speed);
    for (const lane of this.lanes) {
      if (!lane.driver) continue;
      lane.driver.stepMs = stepMsFor(this.speed);
      lane.driver.settleMs = settleMsFor(this.speed);
    }
  }

  setJev(status) {
    this.jev = status;
    const text = {
      checking: 'Jev 연결 확인 중…',
      ready: `Jev 연결됨 · ${status.model}`,
      nokey: 'Jev 꺼짐 · Tetris/.env에 TYPESAFE_API_KEY가 없어요',
      offline: 'Jev 꺼짐 · npm start로 연 페이지에서만 참가해요',
    }[status.state];
    this.el.jev.textContent = text;
    this.el.jev.dataset.state = status.state;
    if (status.state === 'checking') return;

    const lane = this.byId.jev;
    if (status.state === 'ready') {
      if (this.started && lane.game.state === 'ready') lane.game.start();
      return;
    }
    lane.disabled = true;
    lane.driver?.stop();
    lane.el.off.hidden = false;
    lane.el.off.textContent = text.replace('Jev 꺼짐 · ', '');
  }

  setCountdown(text) {
    const el = this.el.countdown;
    el.textContent = text;
    el.classList.remove('is-pop');
    if (text) {
      void el.offsetWidth; // 애니메이션 재시작
      el.classList.add('is-pop');
    }
  }

  // ── 게임 이벤트 ─────────────────────────────────────────

  bindEvents(lane) {
    const game = lane.game;
    const human = lane.id === 'human';
    const sfx = this.sfx;
    game
      .on('spawn', () => this.measure(lane))
      .on('harddrop', (e) => {
        lane.board.addHardDrop(e, performance.now());
        if (!human) return;
        lane.hardDropping = true;
        sfx.play('harddrop');
      })
      .on('lock', (e) => {
        lane.board.addLock(e, performance.now());
        lane.target = null;
        if (human && !lane.hardDropping) sfx.play('lock');
        lane.hardDropping = false;
      })
      .on('clear', (e) => {
        this.banner(lane, describeClear(e));
        if (human) sfx.play('clear', e);
      })
      .on('finished', () => {
        this.measure(lane);
        this.banner(lane, { title: '완주!', tags: [`${game.stats.pieces}피스`], tone: 'done' }, true);
        if (human) sfx.play('levelup');
      })
      .on('gameover', () => {
        this.measure(lane);
        lane.target = null;
        lane.board.markGameOver(performance.now());
        this.banner(lane, { title: 'GAME OVER', tags: [`${game.stats.pieces}피스째`], tone: 'over' }, true);
        if (human) sfx.play('gameover');
      });
    if (human) {
      game
        .on('move', () => sfx.play('move'))
        .on('rotate', () => sfx.play('rotate'))
        .on('hold', () => sfx.play('hold'))
        .on('levelup', () => sfx.play('levelup'));
    }
  }

  // 피스가 자리 잡을 때마다 보드 모양을 잰다.
  measure(lane) {
    const stats = boardStats(lane.game.grid);
    const m = lane.metrics;
    m.holesCreated += Math.max(0, stats.holes - m.holes);
    m.holes = stats.holes;
    m.peak = Math.max(m.peak, stats.maxHeight);
  }

  banner(lane, { title, tags = [], points, tone }, sticky = false) {
    const el = lane.el.banner;
    const heading = document.createElement('strong');
    heading.textContent = title;
    el.replaceChildren(heading);
    const detail = [...tags, points ? `+${formatNumber(points)}` : ''].filter(Boolean).join(' · ');
    if (detail) {
      const span = document.createElement('span');
      span.textContent = detail;
      el.append(span);
    }
    el.className = `lane-banner tone-${tone}`;
    void el.offsetWidth;
    el.classList.add(sticky ? 'is-sticky' : 'is-on');
  }

  // ── 봇 결정 카드 ────────────────────────────────────────

  resetDecision(lane) {
    const el = lane.el;
    el.move.textContent = lane.id === 'human' ? '' : '—';
    el.meta.textContent = '';
    el.alts.replaceChildren();
    el.foot.textContent = lane.id === 'jev' ? '피스마다 후보 전체를 Choice 질문 하나로 물어요.' : '';
    el.json.textContent = '아직 결정이 없어요.';
    this.setConfidence(lane, null);
  }

  setConfidence(lane, value) {
    lane.el.confFill.style.transform = `scaleX(${value ?? 0})`;
    lane.el.confValue.textContent = value === null ? '—' : percent(value);
  }

  onThink(lane) {
    lane.target = null;
    if (lane.id === 'jev') lane.el.meta.textContent = '생각 중…';
  }

  onDecision(lane, decision) {
    const el = lane.el;
    const m = lane.metrics;
    if (!decision) {
      el.move.textContent = '둘 곳이 없어요';
      return;
    }
    lane.target = decision.move.cells;
    m.decisions += 1;
    m.thinkMs += decision.ms;
    el.move.textContent = moveLabel(decision.move);

    if (lane.id === 'heuristic') {
      el.meta.textContent = `평가 ${decision.score.toFixed(2)} · ${decision.ms.toFixed(1)}ms`;
      this.renderAlternatives(lane, decision.alternatives, (v) => v.toFixed(2));
      el.foot.textContent = `후보 ${decision.candidates}개 중 평가 점수가 가장 높은 수 · ${m.decisions}번째 결정`;
      return;
    }

    if (decision.source === 'jev') {
      m.jevCalls += decision.passes;
      m.decisionsByJev = (m.decisionsByJev ?? 0) + 1;
      m.confidenceSum += decision.confidence;
      if (decision.passes === 2) m.rechecks += 1;
      if (decision.agrees) m.agreements += 1;
      m.inputTokens += decision.usage?.input_tokens ?? 0;
      m.model = decision.model;
      // 상태 표시를 별칭(jev-latest) 대신 실제로 답한 모델 버전으로 바꾼다.
      if (decision.model && this.jev.model !== decision.model) this.setJev({ state: 'ready', model: decision.model });
      el.meta.textContent =
        decision.passes === 2
          ? `다시 물음: 확신 ${percent(decision.firstConfidence)} → ${percent(decision.confidence)} · ${Math.round(decision.ms)}ms`
          : `${Math.round(decision.ms)}ms · 후보 ${decision.candidates}개`;
      this.setConfidence(lane, decision.confidence);
      this.renderAlternatives(lane, decision.alternatives, percent);
    } else {
      m.fallbacks += 1;
      el.meta.textContent = `대체 수(휴리스틱) · ${decision.error}`;
      this.setConfidence(lane, null);
      el.alts.replaceChildren();
    }
    const cost = (m.inputTokens / 1e6) * JEV_PRICE_PER_MTOK;
    const judged = m.decisionsByJev ?? 0;
    const agree = judged ? percent(m.agreements / judged) : '—';
    el.foot.textContent =
      `호출 ${m.jevCalls}회(다시 물음 ${m.rechecks}) · 입력 ${formatNumber(m.inputTokens)}토큰 · $${cost.toFixed(4)} 추정 · 휴리스틱과 같은 수 ${agree}` +
      (m.fallbacks ? ` · 대체 ${m.fallbacks}회` : '');
    el.json.textContent = JSON.stringify(decisionJson(decision), null, 2);
  }

  renderAlternatives(lane, alternatives, format) {
    lane.el.alts.replaceChildren(
      ...alternatives.map(({ move, value }) => {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = moveLabel(move);
        const amount = document.createElement('b');
        amount.textContent = format(value);
        item.append(label, amount);
        return item;
      }),
    );
  }

  // ── 그리기 ──────────────────────────────────────────────

  draw(now) {
    for (const lane of this.lanes) {
      const game = lane.game;
      if (!game) continue;
      lane.board.draw(game, now, lane.target);
      lane.hold.drawHold(game);
      lane.next.drawNext(game, 1);
      this.text(lane, 'score', formatNumber(game.score));
      this.text(lane, 'lines', String(game.lines));
      this.text(lane, 'pieces', `${game.stats.pieces}/${this.limit}`);
      this.text(lane, 'holes', String(lane.metrics.holes));
      const state = this.stateOf(lane);
      this.text(lane, 'state', state.label);
      if (lane.node.dataset.state !== state.key) lane.node.dataset.state = state.key;
    }
  }

  text(lane, key, value) {
    if (lane.cache.get(key) === value) return;
    lane.cache.set(key, value);
    lane.el[key].textContent = value;
  }

  stateOf(lane) {
    const game = lane.game;
    if (lane.disabled) return { key: 'off', label: '불참' };
    if (game.state === 'finished') return { key: 'done', label: '완주' };
    if (game.state === 'over') return { key: 'over', label: '게임 오버' };
    if (game.state === 'ready') return { key: 'ready', label: '대기' };
    if (lane.driver?.phase === 'thinking') return { key: 'thinking', label: '생각 중…' };
    return { key: 'playing', label: lane.driver ? '두는 중' : '플레이 중' };
  }

  // ── 결과 ────────────────────────────────────────────────

  standings() {
    const players = this.lanes.filter((lane) => !lane.disabled);
    return players
      .map((lane) => ({ lane, finished: lane.game.state === 'finished', score: lane.game.score }))
      .sort((a, b) => Number(b.finished) - Number(a.finished) || b.score - a.score)
      .map(({ lane }, i) => ({ lane, rank: i + 1 }));
  }

  renderResults() {
    const ranks = new Map(this.standings().map(({ lane, rank }) => [lane.id, rank]));
    const winner = this.lanes.find((lane) => ranks.get(lane.id) === 1);
    const notes = [
      this.turnBased ? '나는 턴제' : '',
      this.policy?.understood ? `Jev 전략: ${policyLabel(this.policy)}` : '',
    ].filter(Boolean);
    this.el.sub.textContent =
      `모두 같은 ${this.limit}피스를 같은 순서(시드 ${this.seed})로 받았어요.${notes.length ? ` (${notes.join(' · ')})` : ''}` +
      `${winner ? ` 1위는 ${winner.name}!` : ''}`;

    const table = this.el.table;
    const head = document.createElement('tr');
    head.append(cell('th', '항목'));
    for (const lane of this.lanes) {
      const th = cell('th', lane.name);
      th.dataset.lane = lane.id;
      const rank = ranks.get(lane.id);
      if (rank) th.append(badge(`${rank}위`, rank === 1));
      head.append(th);
    }
    const rows = RESULT_ROWS.map((row) => {
      const tr = document.createElement('tr');
      tr.append(cell('th', row.label));
      const values = this.lanes.map((lane) => (lane.disabled || (row.only && row.only !== lane.id) ? null : row.value(lane)));
      const best = row.better ? bestOf(values, row.better) : null;
      values.forEach((value, i) => {
        const td = cell('td', value === null ? '—' : row.format ? row.format(value, this.lanes[i]) : String(value));
        if (best !== null && value === best) td.classList.add('is-best');
        tr.append(td);
      });
      return tr;
    });
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    tbody.append(...rows);
    table.replaceChildren(thead, tbody);
  }
}

function cell(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function badge(text, first) {
  const node = document.createElement('span');
  node.className = `rank-badge${first ? ' is-first' : ''}`;
  node.textContent = text;
  return node;
}

// 모두 같은 값이면 강조하지 않는다(전원 0점 같은 경우).
function bestOf(values, better) {
  const present = values.filter((v) => v !== null);
  if (present.length < 2 || present.every((v) => v === present[0])) return null;
  return better === 'high' ? Math.max(...present) : Math.min(...present);
}

function decisionJson(decision) {
  const move = decision.move;
  const base = {
    choice: move.id,
    type: move.type,
    hold: move.hold,
    rotationDegrees: ROTATION_DEG[move.rot],
    columns: move.columns.map((c) => c + 1),
    actions: move.actions,
  };
  if (decision.source !== 'jev') return { source: 'fallback', error: decision.error, ...base };
  return {
    model: decision.model,
    ...base,
    confidence: decision.confidence,
    passes: decision.passes,
    firstChoice: decision.firstChoice,
    firstConfidence: decision.firstConfidence,
    agreesWithHeuristic: decision.agrees,
    candidates: decision.candidates,
    latencyMs: Math.round(decision.ms),
    inputTokens: decision.usage?.input_tokens,
    requestId: decision.requestId,
  };
}

const RESULT_ROWS = [
  {
    label: '결과',
    value: (lane) => lane.game.state,
    format: (state, lane) => (state === 'finished' ? '완주' : `게임 오버 (${lane.game.stats.pieces}피스)`),
  },
  { label: '점수', value: (lane) => lane.game.score, better: 'high', format: formatNumber },
  { label: '지운 줄', value: (lane) => lane.game.lines, better: 'high' },
  { label: '테트리스', value: (lane) => lane.game.stats.tetrises, better: 'high' },
  { label: '남은 구멍', value: (lane) => lane.metrics.holes, better: 'low' },
  { label: '생긴 구멍 (누적)', value: (lane) => lane.metrics.holesCreated, better: 'low' },
  { label: '가장 높이 쌓인 줄', value: (lane) => lane.metrics.peak, better: 'low' },
  {
    label: '피스당 판단 시간',
    value: (lane) => {
      const m = lane.metrics;
      if (lane.id === 'human') return lane.game.stats.pieces ? m.wallMs / lane.game.stats.pieces : 0;
      return m.decisions ? m.thinkMs / m.decisions : 0;
    },
    format: (ms, lane) => `${ms < 10 ? ms.toFixed(1) : Math.round(ms)}ms${lane.id === 'human' ? ' (조작 포함)' : ''}`,
  },
  {
    label: 'Jev 평균 확신도',
    only: 'jev',
    value: (lane) => (lane.metrics.decisionsByJev ? lane.metrics.confidenceSum / lane.metrics.decisionsByJev : null),
    format: percent,
  },
  {
    label: '휴리스틱과 같은 수',
    only: 'jev',
    value: (lane) => (lane.metrics.decisionsByJev ? lane.metrics.agreements / lane.metrics.decisionsByJev : null),
    format: percent,
  },
  {
    label: 'Jev 호출 · 비용',
    only: 'jev',
    value: (lane) => lane.metrics,
    format: (m) =>
      `${m.jevCalls}회(다시 물음 ${m.rechecks}) · $${((m.inputTokens / 1e6) * JEV_PRICE_PER_MTOK).toFixed(4)}` +
      (m.fallbacks ? ` · 대체 ${m.fallbacks}회` : ''),
  },
];
return { VERSUS_LIMITS, stepMsFor, Versus };
})();

// ── src/main.js ──
const __src_main_js = (() => {
const { Game } = __src_core_game_js;
const { randomSeed } = __src_core_random_js;
const { InputController, KEY_ACTIONS, bindTouchPad } = __src_ui_input_js;
const { BoardRenderer, PreviewRenderer, readPalette } = __src_ui_renderer_js;
const { Hud, describeClear, formatNumber, formatTime } = __src_ui_hud_js;
const { Sfx } = __src_ui_audio_js;
const { storage } = __src_ui_storage_js;
const { VERSUS_LIMITS, Versus } = __src_versus_js;
const READY_MS = 900;
const GO_MS = 600;
const MIN_LEVEL = 1;
const MAX_START_LEVEL = 15;
const RESULT_DELAY_MS = 1200; // 대결이 끝나고 결과표를 띄우기까지

const $ = (sel) => document.querySelector(sel);
const root = $('#app');
const palette = readPalette();
const board = new BoardRenderer($('#board'), $('#board-wrap'), palette);
const holdView = new PreviewRenderer($('#hold'), palette);
const nextView = new PreviewRenderer($('#next'), palette);
new PreviewRenderer($('#title-art'), palette).drawLineup(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
const hud = new Hud(root);
const input = new InputController();
const sfx = new Sfx(storage.get('sound', true));
const versus = new Versus({ root, palette, sfx, storage });

let game = null;
let mode = 'single'; // single | versus
let screen = 'title';
let countdown = 0;
let goTimer = 0;
let startLevel = clampLevel(storage.get('level', 1));
let best = storage.get('best', 0);
let hardDropping = false;
let vsLimit = VERSUS_LIMITS.includes(storage.get('vs-limit', 50)) ? storage.get('vs-limit', 50) : 50;
let resultTimer = 0;
const vsStrategyInput = $('#vs-strategy');
const vsTurnInput = $('#vs-turn');
vsStrategyInput.value = storage.get('vs-strategy', '');
vsTurnInput.checked = storage.get('vs-turn', false);
vsStrategyInput.addEventListener('change', () => storage.set('vs-strategy', vsStrategyInput.value.trim()));
vsTurnInput.addEventListener('change', () => storage.set('vs-turn', vsTurnInput.checked));

function clampLevel(n) {
  return Math.min(MAX_START_LEVEL, Math.max(MIN_LEVEL, Number(n) || 1));
}

function setMode(next) {
  mode = next;
  root.dataset.mode = next;
}

function setCountdown(text) {
  if (mode === 'versus') versus.setCountdown(text);
  else hud.setCountdown(text);
}

function setScreen(next) {
  screen = next;
  root.dataset.screen = next;
  if (next === 'playing' || next === 'countdown') document.activeElement?.blur?.();
}

// ── 흐름 ────────────────────────────────────────────────

function newGame() {
  sfx.unlock();
  versus.stop();
  setMode('single');
  game = new Game({ startLevel, rng: Math.random });
  bindGameEvents(game);
  input.attach(game);
  board.resetFx();
  hud.reset();
  countdown = READY_MS;
  goTimer = 0;
  hud.setCountdown('READY');
  sfx.play('ready');
  setScreen('countdown');
}

// 대결: 나 · Jev · 휴리스틱이 같은 시드로 같은 피스 수를 둔다. 같은 시드를 넘기면 같은 순서로 재대결.
function startVersus(seed = randomSeed()) {
  sfx.unlock();
  setMode('versus');
  game = null;
  hud.reset();
  const strategy = vsStrategyInput.value.trim();
  storage.set('vs-strategy', strategy);
  input.attach(versus.prepare({ seed, limit: vsLimit, startLevel, turnBased: vsTurnInput.checked, strategy }));
  countdown = READY_MS;
  goTimer = 0;
  resultTimer = 0;
  setCountdown('READY');
  sfx.play('ready');
  setScreen('countdown');
}

function restart() {
  if (mode === 'versus') startVersus(versus.seed);
  else newGame();
}

function showResult() {
  input.releaseAll();
  versus.renderResults();
  sfx.play('levelup');
  setScreen('result');
  setTimeout(() => {
    if (screen === 'result') $('#btn-vs-again').focus();
  }, 500);
}

function pause() {
  if (screen !== 'playing' && screen !== 'countdown') return;
  input.releaseAll();
  setScreen('paused');
  $('#btn-resume').focus();
}

function resume() {
  if (screen !== 'paused') return;
  const notStarted = mode === 'versus' ? !versus.started : game.state === 'ready';
  setScreen(notStarted ? 'countdown' : 'playing');
}

function toTitle() {
  versus.stop();
  setMode('single');
  game = null;
  input.attach(null);
  hud.reset();
  renderTitle();
  setScreen('title');
  $('#btn-start').focus();
}

function onGameOver({ reason }) {
  input.releaseAll();
  board.markGameOver(performance.now());
  sfx.play('gameover');
  const isBest = game.score > best;
  if (isBest) {
    best = game.score;
    storage.set('best', best);
  }
  const seconds = game.elapsed / 1000;
  const set = (id, value) => {
    $(`#${id}`).textContent = value;
  };
  set('over-reason', reason === 'lockout' ? '피스가 필드 위에서 고정됐어요 · LOCK OUT' : '새 피스가 들어올 자리가 없어요 · BLOCK OUT');
  set('over-score', formatNumber(game.score));
  set('over-level', String(game.level));
  set('over-lines', String(game.lines));
  set('over-time', formatTime(game.elapsed));
  set('over-tetris', String(game.stats.tetrises));
  set('over-tspin', String(game.stats.tspins));
  set('over-combo', String(game.stats.maxCombo));
  set('over-pps', seconds > 0 ? (game.stats.pieces / seconds).toFixed(2) : '0.00');
  set('over-best', formatNumber(best));
  $('#screen-over').classList.toggle('is-best', isBest && game.score > 0);
  setScreen('over');
  setTimeout(() => {
    if (screen === 'over') $('#btn-again').focus();
  }, 700);
}

function bindGameEvents(g) {
  g.on('move', () => sfx.play('move'))
    .on('rotate', () => sfx.play('rotate'))
    .on('hold', () => sfx.play('hold'))
    .on('harddrop', (e) => {
      hardDropping = true;
      sfx.play('harddrop');
      board.addHardDrop(e, performance.now());
    })
    .on('lock', (e) => {
      board.addLock(e, performance.now());
      if (!hardDropping) sfx.play('lock');
      hardDropping = false;
    })
    .on('clear', (e) => {
      sfx.play('clear', e);
      hud.callout(describeClear(e));
    })
    .on('levelup', ({ level }) => {
      sfx.play('levelup');
      hud.callout({ title: `LEVEL ${level}`, tags: ['SPEED UP'], tone: 'level' });
    })
    .on('gameover', onGameOver);
}

// ── 타이틀 ──────────────────────────────────────────────

function renderTitle() {
  $('#start-level').textContent = pad2(startLevel);
  $('#title-best').textContent = formatNumber(best);
  $('#vs-limit').textContent = String(vsLimit);
}

function changeLevel(delta) {
  startLevel = clampLevel(startLevel + delta);
  storage.set('level', startLevel);
  renderTitle();
}

function changeVsLimit(delta) {
  const i = VERSUS_LIMITS.indexOf(vsLimit) + delta;
  vsLimit = VERSUS_LIMITS[Math.min(VERSUS_LIMITS.length - 1, Math.max(0, i))];
  storage.set('vs-limit', vsLimit);
  renderTitle();
}

const pad2 = (n) => String(n).padStart(2, '0');

// ── 사운드 ──────────────────────────────────────────────

function renderSound() {
  $('#btn-sound').setAttribute('aria-pressed', String(sfx.enabled));
}

function toggleSound() {
  sfx.enabled = !sfx.enabled;
  storage.set('sound', sfx.enabled);
  if (sfx.enabled) sfx.unlock();
  renderSound();
}

// ── 입력 ────────────────────────────────────────────────

const PAUSE_KEYS = new Set(['Escape', 'KeyP', 'F1']);

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.altKey) return;
  // 전략 입력칸·체크박스에서는 글자를 치거나 체크를 바꾸게 둔다. 입력칸에서 Enter는 대결 시작.
  const field = e.target;
  if (field instanceof HTMLInputElement && (field.type === 'text' || field.type === 'checkbox')) {
    if (field.type === 'text' && e.code === 'Enter' && !e.isComposing) {
      e.preventDefault();
      startVersus();
    }
    return;
  }
  const action = KEY_ACTIONS[e.code];
  if (e.code === 'KeyM') {
    if (!e.repeat) toggleSound();
    return;
  }

  if (screen === 'title') {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      newGame();
    } else if (e.code === 'KeyV') {
      e.preventDefault();
      startVersus();
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowDown') {
      e.preventDefault();
      changeLevel(-1);
    } else if (e.code === 'ArrowRight' || e.code === 'ArrowUp') {
      e.preventDefault();
      changeLevel(1);
    }
    return;
  }

  if (screen === 'paused') {
    if (PAUSE_KEYS.has(e.code)) {
      e.preventDefault();
      resume();
    }
    return;
  }

  if (screen === 'result') {
    if (e.code === 'Enter') {
      e.preventDefault();
      startVersus(versus.seed);
    } else if (e.code === 'KeyN') {
      e.preventDefault();
      startVersus();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      toTitle();
    } else if (action) {
      e.preventDefault();
    }
    return;
  }

  if (screen === 'over') {
    if (e.code === 'Enter') {
      e.preventDefault();
      newGame();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      toTitle();
    } else if (action) {
      e.preventDefault(); // 게임 오버 직후 연타로 버튼이 눌리지 않게
    }
    return;
  }

  // countdown · playing
  if (PAUSE_KEYS.has(e.code)) {
    e.preventDefault();
    pause();
    return;
  }
  if (!action) return;
  e.preventDefault();
  if (!e.repeat) input.press(action);
});

window.addEventListener('keyup', (e) => {
  const action = KEY_ACTIONS[e.code];
  if (action) input.release(action);
});

// 창을 벗어나면 자동으로 일시정지.
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

bindTouchPad($('#touch-pad'), input, () => screen === 'playing' || screen === 'countdown');

$('#btn-start').addEventListener('click', newGame);
$('#level-down').addEventListener('click', () => changeLevel(-1));
$('#level-up').addEventListener('click', () => changeLevel(1));
$('#btn-resume').addEventListener('click', resume);
$('#btn-restart').addEventListener('click', restart);
$('#btn-quit').addEventListener('click', toTitle);
$('#btn-again').addEventListener('click', newGame);
$('#btn-home').addEventListener('click', toTitle);
$('#btn-sound').addEventListener('click', toggleSound);
$('#btn-pause').addEventListener('click', () => (screen === 'paused' ? resume() : pause()));
$('#btn-versus').addEventListener('click', () => startVersus());
$('#vs-limit-down').addEventListener('click', () => changeVsLimit(-1));
$('#vs-limit-up').addEventListener('click', () => changeVsLimit(1));
$('#btn-vs-again').addEventListener('click', () => startVersus(versus.seed));
$('#btn-vs-new').addEventListener('click', () => startVersus());
$('#btn-vs-home').addEventListener('click', toTitle);

// ── 루프 ────────────────────────────────────────────────

let last = performance.now();

function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;

  if (screen === 'countdown') {
    countdown -= dt;
    if (countdown <= 0) {
      if (mode === 'versus') versus.start();
      else game.start();
      setScreen('playing');
      setCountdown('GO!');
      sfx.play('go');
      goTimer = GO_MS;
    }
  } else if (screen === 'playing') {
    input.update(dt);
    if (mode === 'versus') {
      versus.update(dt);
      if (versus.done) {
        resultTimer += dt;
        if (resultTimer >= RESULT_DELAY_MS) showResult();
      }
    } else {
      game.update(dt);
    }
  }

  if (goTimer > 0 && screen === 'playing') {
    goTimer -= dt;
    if (goTimer <= 0) setCountdown('');
  }

  if (mode === 'versus') {
    versus.draw(now);
  } else {
    board.draw(game, now);
    if (game) {
      holdView.drawHold(game);
      nextView.drawNext(game);
      hud.update(game);
    }
  }
  requestAnimationFrame(frame);
}

renderTitle();
renderSound();
setMode('single');
setScreen('title');
requestAnimationFrame(frame);

// 개발·검증용 핸들(콘솔에서 상태 확인).
window.__tetris = {
  get game() { return game; },
  get screen() { return screen; },
  get mode() { return mode; },
  versus,
};
return {  };
})();
})();
