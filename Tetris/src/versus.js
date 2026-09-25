import { Game } from './core/game.js';
import { seededRandom } from './core/random.js';
import { boardStats } from './core/placements.js';
import { BotDriver } from './ai/driver.js';
import { HeuristicBrain } from './ai/heuristic.js';
import { JEV_PRICE_PER_MTOK, JevBrain, jevStatus } from './ai/jev.js';
import { BoardRenderer, PreviewRenderer } from './ui/renderer.js';
import { describeClear, formatNumber } from './ui/hud.js';

// 대결 모드: 나 · Jev · 휴리스틱 봇이 같은 시드(같은 피스 순서)로 같은 피스 수를 둔다.
export const VERSUS_LIMITS = [20, 30, 50, 100];
const SPEED_MIN = 1;
const SPEED_MAX = 10;
const SPEED_DEFAULT = 3; // 동작 하나에 약 0.15초: 사람 눈으로 따라갈 수 있는 빠르기
const SPEED_KEY = 'bot-speed';

// 봇 속도 1~10 → 동작 하나 사이 간격(ms). 1은 0.4초, 10은 거의 즉시.
export function stepMsFor(speed) {
  return Math.round(400 * Math.pow(0.62, speed - 1));
}

// 피스를 놓은 뒤 잠깐 멈춰 결과와 결정 카드를 볼 수 있게 한다.
function settleMsFor(speed) {
  return stepMsFor(speed) * 3;
}

const LANES = [
  { id: 'human', name: '나', tag: '키보드로 직접' },
  { id: 'jev', name: 'Jev', tag: 'TypeSafe System One' },
  { id: 'heuristic', name: '휴리스틱', tag: '코드만 · El-Tetris 가중치' },
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

export class Versus {
  constructor({ root, palette, sfx, storage }) {
    this.sfx = sfx;
    this.storage = storage;
    const $ = (sel) => root.querySelector(sel);
    this.el = {
      info: $('#vs-info'),
      jev: $('#vs-jev'),
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

  prepare({ seed, limit, startLevel }) {
    this.stop();
    this.seed = seed;
    this.limit = limit;
    this.started = false;
    const run = {};
    this.run = run;

    for (const lane of this.lanes) {
      lane.game = new Game({ startLevel, rng: seededRandom(seed), pieceLimit: limit });
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

    const brains = { jev: new JevBrain(), heuristic: new HeuristicBrain() };
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
    jevStatus().then((status) => {
      if (this.run === run) this.setJev(status);
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
      m.jevCalls += 1;
      m.confidenceSum += decision.confidence;
      if (decision.agrees) m.agreements += 1;
      m.inputTokens += decision.usage?.input_tokens ?? 0;
      m.model = decision.model;
      // 상태 표시를 별칭(jev-latest) 대신 실제로 답한 모델 버전으로 바꾼다.
      if (decision.model && this.jev.model !== decision.model) this.setJev({ state: 'ready', model: decision.model });
      el.meta.textContent = `${Math.round(decision.ms)}ms · 후보 ${decision.candidates}개`;
      this.setConfidence(lane, decision.confidence);
      this.renderAlternatives(lane, decision.alternatives, percent);
    } else {
      m.fallbacks += 1;
      el.meta.textContent = `대체 수(휴리스틱) · ${decision.error}`;
      this.setConfidence(lane, null);
      el.alts.replaceChildren();
    }
    const cost = (m.inputTokens / 1e6) * JEV_PRICE_PER_MTOK;
    const agree = m.jevCalls ? percent(m.agreements / m.jevCalls) : '—';
    el.foot.textContent =
      `호출 ${m.jevCalls}회 · 입력 ${formatNumber(m.inputTokens)}토큰 · $${cost.toFixed(4)} 추정 · 휴리스틱과 같은 수 ${agree}` +
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
    this.el.sub.textContent = `모두 같은 ${this.limit}피스를 같은 순서(시드 ${this.seed})로 받았어요.${winner ? ` 1위는 ${winner.name}!` : ''}`;

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
    value: (lane) => (lane.metrics.jevCalls ? lane.metrics.confidenceSum / lane.metrics.jevCalls : null),
    format: percent,
  },
  {
    label: '휴리스틱과 같은 수',
    only: 'jev',
    value: (lane) => (lane.metrics.jevCalls ? lane.metrics.agreements / lane.metrics.jevCalls : null),
    format: percent,
  },
  {
    label: 'Jev 호출 · 비용',
    only: 'jev',
    value: (lane) => lane.metrics,
    format: (m) =>
      `${m.jevCalls}회 · $${((m.inputTokens / 1e6) * JEV_PRICE_PER_MTOK).toFixed(4)}` + (m.fallbacks ? ` · 대체 ${m.fallbacks}회` : ''),
  },
];
