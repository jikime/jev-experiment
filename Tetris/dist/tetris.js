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
  constructor({ startLevel = 1, rng = Math.random } = {}) {
    this.startLevel = Math.min(Math.max(1, Math.floor(startLevel)), 15);
    this.rng = rng;
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
    this.state = 'ready'; // ready | playing | clearing | over
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

    if (!this.isGrounded()) {
      const interval = this.softDrop ? this.gravity / SOFT_DROP_FACTOR : this.gravity;
      this.gravityAcc += dt;
      while (this.gravityAcc >= interval) {
        this.gravityAcc -= interval;
        if (!this.stepDown()) break;
        if (this.softDrop) this.score += 1;
      }
    }

    if (this.isGrounded()) {
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
      this.spawn(this.takeNext());
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
  constructor(canvas, container, palette) {
    this.canvas = canvas;
    this.container = container;
    this.palette = palette;
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
    document.documentElement.style.setProperty('--well-top', `${this.oy - this.frame}px`);
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

  draw(game, now) {
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

  drawNext(game) {
    const queue = game.nextQueue;
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

// ── src/main.js ──
const __src_main_js = (() => {
const { Game } = __src_core_game_js;
const { InputController, KEY_ACTIONS, bindTouchPad } = __src_ui_input_js;
const { BoardRenderer, PreviewRenderer, readPalette } = __src_ui_renderer_js;
const { Hud, describeClear, formatNumber, formatTime } = __src_ui_hud_js;
const { Sfx } = __src_ui_audio_js;
const { storage } = __src_ui_storage_js;
const READY_MS = 900;
const GO_MS = 600;
const MIN_LEVEL = 1;
const MAX_START_LEVEL = 15;

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

let game = null;
let screen = 'title';
let countdown = 0;
let goTimer = 0;
let startLevel = clampLevel(storage.get('level', 1));
let best = storage.get('best', 0);
let hardDropping = false;

function clampLevel(n) {
  return Math.min(MAX_START_LEVEL, Math.max(MIN_LEVEL, Number(n) || 1));
}

function setScreen(next) {
  screen = next;
  root.dataset.screen = next;
  if (next === 'playing' || next === 'countdown') document.activeElement?.blur?.();
}

// ── 흐름 ────────────────────────────────────────────────

function newGame() {
  sfx.unlock();
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

function pause() {
  if (screen !== 'playing' && screen !== 'countdown') return;
  input.releaseAll();
  setScreen('paused');
  $('#btn-resume').focus();
}

function resume() {
  if (screen !== 'paused') return;
  setScreen(game.state === 'ready' ? 'countdown' : 'playing');
}

function toTitle() {
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
}

function changeLevel(delta) {
  startLevel = clampLevel(startLevel + delta);
  storage.set('level', startLevel);
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
  const action = KEY_ACTIONS[e.code];
  if (e.code === 'KeyM') {
    if (!e.repeat) toggleSound();
    return;
  }

  if (screen === 'title') {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      newGame();
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
$('#btn-restart').addEventListener('click', newGame);
$('#btn-quit').addEventListener('click', toTitle);
$('#btn-again').addEventListener('click', newGame);
$('#btn-home').addEventListener('click', toTitle);
$('#btn-sound').addEventListener('click', toggleSound);
$('#btn-pause').addEventListener('click', () => (screen === 'paused' ? resume() : pause()));

// ── 루프 ────────────────────────────────────────────────

let last = performance.now();

function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;

  if (screen === 'countdown') {
    countdown -= dt;
    if (countdown <= 0) {
      game.start();
      setScreen('playing');
      hud.setCountdown('GO!');
      sfx.play('go');
      goTimer = GO_MS;
    }
  } else if (screen === 'playing') {
    input.update(dt);
    game.update(dt);
  }

  if (goTimer > 0 && screen === 'playing') {
    goTimer -= dt;
    if (goTimer <= 0) hud.setCountdown('');
  }

  board.draw(game, now);
  if (game) {
    holdView.drawHold(game);
    nextView.drawNext(game);
    hud.update(game);
  }
  requestAnimationFrame(frame);
}

renderTitle();
renderSound();
setScreen('title');
requestAnimationFrame(frame);

// 개발·검증용 핸들(콘솔에서 상태 확인).
window.__tetris = { get game() { return game; }, get screen() { return screen; } };
return {  };
})();
})();
