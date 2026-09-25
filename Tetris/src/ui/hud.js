import { LINES_PER_LEVEL } from '../core/constants.js';

const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
const MAX_CALLOUTS = 3;

const pad2 = (n) => String(n).padStart(2, '0');

export function formatTime(ms) {
  const cs = Math.floor(ms / 10);
  return `${pad2(Math.floor(cs / 6000))}:${pad2(Math.floor(cs / 100) % 60)}.${pad2(cs % 100)}`;
}

export function formatNumber(n) {
  return n.toLocaleString('en-US');
}

// clear 이벤트 → 스탬프 문구.
export function describeClear({ lines, tspin, b2b, combo, perfectClear, points }) {
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

export class Hud {
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
