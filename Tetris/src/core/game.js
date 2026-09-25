import {
  COLS,
  HIDDEN_ROWS,
  LINE_CLEAR_DELAY,
  LINES_PER_LEVEL,
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  NEXT_COUNT,
  SOFT_DROP_FACTOR,
  SPAWN_X,
  SPAWN_Y,
} from './constants.js';
import { SHAPES, kicksFor } from './pieces.js';
import { Bag } from './bag.js';
import { createGrid, fullRows, isBlocked, isEmpty, removeRows } from './board.js';
import { gravityInterval, scoreClear } from './scoring.js';

// T 중심 기준 네 대각선: 좌상, 우상, 우하, 좌하. T가 가리키는 방향의 두 칸이 "앞 코너".
const T_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

// DOM에 의존하지 않는 게임 규칙 엔진. UI는 이벤트(on)와 공개 상태만 읽는다.
export class Game {
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
