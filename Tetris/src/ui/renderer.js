import { COLS, HIDDEN_ROWS, ROWS, VISIBLE_ROWS } from '../core/constants.js';
import { SHAPES } from '../core/pieces.js';

const PEEK = 1; // 보이는 필드 위로 한 줄을 더 그려 스폰 직후 피스가 걸쳐 보이게 한다.
const TRAIL_MS = 200;
const FLASH_MS = 140;
const SHAKE_MS = 160;
const GAMEOVER_ROW_MS = 22;

export function readPalette() {
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

export function drawPiece(ctx, type, cx, cy, s, palette, alpha = 1) {
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

export class BoardRenderer {
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
export class PreviewRenderer {
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
