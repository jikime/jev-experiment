import { Game } from './core/game.js';
import { InputController, KEY_ACTIONS, bindTouchPad } from './ui/input.js';
import { BoardRenderer, PreviewRenderer, readPalette } from './ui/renderer.js';
import { Hud, describeClear, formatNumber, formatTime } from './ui/hud.js';
import { Sfx } from './ui/audio.js';
import { storage } from './ui/storage.js';

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
