import { COLS, HIDDEN_ROWS } from '../core/constants.js';
import { enumerateMoves } from '../core/placements.js';
import { attachFollowUps, rankMoves } from './heuristic.js';
import { allowedByPolicy } from './policy.js';

// 브라우저는 키 없이 개발 서버의 프록시(/api/jev)만 부른다. 키는 서버의 Tetris/.env에 있다.
export const JEV_ENDPOINT = '/api/jev';
// 입력 100만 토큰당 가격(출력 토큰은 무료). docs.typesafe.ai/models 기준(2026-09). 화면에는 "추정"으로 표시.
export const JEV_PRICE_PER_MTOK = 0.042;
export const QUESTION_ID = 'best_move';

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
// position: 몇 번째 열인지. 후보 묶기(group)에서는 빼서, 좋고 나쁨이 같은 자리를 하나로 묶는다.
export function describeMove(move, policy = null, { position = true } = {}) {
  const f = move.features;
  const description = {
    uses_hold: move.hold ? `yes, holds the current piece and places the ${move.type} piece` : 'no',
    ...(position ? { position: positionText(move.columns) } : {}),
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
  if (policy?.tspin) list.push('Prefer T-spins that clear lines; they earn big bonus points.');
  if (policy?.hold) list.push('Use the hold slot when the current piece fits badly or should be saved for later.');
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

export function boardRows(grid) {
  return grid.slice(HIDDEN_ROWS).map((row) => row.map((cell) => (cell ? '#' : '.')).join(''));
}

// 한 번의 요청: state = 보드와 피스 정보, 질문 = 후보 중 하나를 고르는 Choice 하나.
// board: 보드 격자를 state에 넣을지. 기본은 뺀다 — 세 시드 50피스 비교에서 격자를 뺀 쪽이
// 확신도가 높고(0.53→0.63) 토큰도 적었다. 판단은 코드가 계산한 후보 설명만으로 한다.
// recheck: 첫 판단이 애매해 좁힌 후보들로 다시 묻는 두 번째 질문.
// policy: 플레이어 전략(strategy.js)에서 나온 정책. 없으면 기본 플레이.
export function buildJevRequest(snapshot, moves, { board = false, recheck = false, policy = null, position = true } = {}) {
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
        criteria: Object.fromEntries(moves.map((move) => [move.id, describeMove(move, policy, { position })])),
      },
    },
  };
}

// ── 서버 호출 ──────────────────────────────────────────

// ready: 참가 가능 · nokey: 서버에 키가 없음 · offline: 개발 서버가 아님(file:// 등)
export async function jevStatus() {
  try {
    const res = await fetch(`${JEV_ENDPOINT}/status`, { cache: 'no-store' });
    if (!res.ok) return { state: 'offline' };
    const body = await res.json();
    return body.configured ? { state: 'ready', model: body.model } : { state: 'nokey' };
  } catch {
    return { state: 'offline' };
  }
}

export async function askJev(request, { timeoutMs = 20_000 } = {}) {
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
export const GATE_CONFIDENCE = 0.4;
export const SHORTLIST = 5;

function readAnswer(res, byId) {
  const answer = res.answers?.[QUESTION_ID];
  const move = byId.get(answer?.choice);
  if (!move) throw new Error('Jev 응답에 알 수 없는 후보가 있어요.');
  return { move, confidence: answer.confidence, probabilities: answer.probabilities ?? {} };
}

// Jev가 후보 중 하나를 고른다. 실패하면 휴리스틱의 수로 대신 두고 'fallback'으로 표시한다.
//   lookahead: false · 'all'(모든 후보에 다음 피스 정보) · 'recheck'(다시 물을 때만 다음 피스 정보)
//   gate: 이 확신도 미만이면 Jev 자신의 상위 SHORTLIST개 후보로 좁혀 한 번 더 묻는다(null이면 안 함).
export class JevBrain {
  //   reach: 착지 후보를 찾는 방식('full' = 비틀어 넣기·T-스핀 포함, 'drop' = 위에서 떨어뜨리기만).
  //   group: 설명이 똑같은 후보를 선택지 하나로 묶는다. 묶음 안의 구체적인 자리는 휴리스틱이 정한다.
  constructor({ ask = askJev, requestOptions = {}, lookahead = false, gate = null, shortlist = SHORTLIST, reach = 'full', group = false } = {}) {
    this.ask = ask;
    this.requestOptions = requestOptions;
    this.lookahead = lookahead;
    this.gate = gate;
    this.shortlist = shortlist;
    this.reach = reach;
    this.group = group;
  }

  async decide(snapshot) {
    // T-스핀을 원하면 비틀어 넣는 자리까지 찾아야 후보에 T-스핀이 생긴다.
    const reach = this.requestOptions.policy?.tspin ? 'full' : this.reach;
    const moves = allowedByPolicy(enumerateMoves(snapshot, { reach }), this.requestOptions.policy);
    if (moves.length === 0) return null;
    if (this.lookahead === 'all') attachFollowUps(snapshot, moves);
    const ranked = rankMoves(moves);
    const baseline = ranked[0].move;
    const byId = new Map(moves.map((move) => [move.id, move]));
    const options = this.group ? groupByDescription(moves, ranked, this.requestOptions.policy) : moves;
    const requestOptions = this.group ? { ...this.requestOptions, position: false } : this.requestOptions;
    const started = performance.now();
    try {
      const res = await this.ask(buildJevRequest(snapshot, options, requestOptions));
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
          const again = await this.ask(buildJevRequest(snapshot, shortlist, { ...requestOptions, recheck: true }));
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
        options: options.length,
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

// 설명이 똑같은 후보는 Jev가 구분할 수 없으니 선택지 하나로 묶는다. 대표는 묶음 안에서 휴리스틱 점수가 가장
// 높은 후보(정확한 자리 계산은 코드 몫). 선택지 순서는 원래 나열 순서를 지켜 휴리스틱의 순위가 새지 않게 한다.
export function groupByDescription(moves, ranked, policy = null) {
  const representative = new Map(); // 설명 → 대표 후보
  for (const { move } of ranked) {
    const key = JSON.stringify(describeMove(move, policy, { position: false }));
    if (!representative.has(key)) representative.set(key, move);
  }
  const chosen = new Set(representative.values());
  return moves.filter((move) => chosen.has(move));
}

// Jev+: 휴리스틱(2수 탐색)이 안전한 상위 k개를 고르고, Jev는 그 안에서 플레이어 전략에 맞는 수를 고른다
// (skill suggestion 쿡북의 "코드가 넓게 거르고, Jev가 좁게 판단"). 확신도가 gate보다 낮으면 휴리스틱 1순위를
// 둔다(confidence-gated routing: 판단이 애매하면 코드에 맡긴다).
// 선택지 5개에서 확신도 0.2는 1순위 확률 약 0.36 — 한 후보로 뚜렷하게 기울지 않은 경우다.
export const PLUS_GATE = 0.2;

export class JevPlusBrain {
  constructor({ ask = askJev, requestOptions = {}, k = SHORTLIST, gate = PLUS_GATE } = {}) {
    this.ask = ask;
    this.requestOptions = requestOptions;
    this.k = k;
    this.gate = gate;
  }

  async decide(snapshot) {
    const moves = allowedByPolicy(enumerateMoves(snapshot), this.requestOptions.policy);
    if (moves.length === 0) return null;
    attachFollowUps(snapshot, moves);
    const top = rankMoves(moves)
      .slice(0, this.k)
      .map(({ move }) => move);
    const baseline = top[0];
    const started = performance.now();
    if (top.length === 1) {
      return { source: 'jev', move: baseline, confidence: 1, passes: 0, deferred: false, agrees: true, alternatives: [], candidates: moves.length, options: 1, ms: 0 };
    }
    const byId = new Map(top.map((move) => [move.id, move]));
    try {
      const res = await this.ask(buildJevRequest(snapshot, top, { ...this.requestOptions, recheck: true }));
      const pick = readAnswer(res, byId);
      const deferred = pick.confidence < this.gate;
      const move = deferred ? baseline : pick.move;
      return {
        source: 'jev',
        move,
        jevChoice: pick.move.id,
        deferred,
        confidence: pick.confidence,
        passes: 1,
        alternatives: Object.entries(pick.probabilities)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .filter(([id]) => byId.has(id))
          .map(([id, value]) => ({ move: byId.get(id), value })),
        agrees: move.id === baseline.id,
        candidates: moves.length,
        options: top.length,
        ms: performance.now() - started,
        model: res.model,
        usage: { input_tokens: res.usage?.input_tokens ?? 0 },
        requestId: res.requestId,
      };
    } catch (err) {
      return { source: 'fallback', move: baseline, error: err.message, candidates: moves.length, ms: performance.now() - started };
    }
  }
}
