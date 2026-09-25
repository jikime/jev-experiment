import { COLS, HIDDEN_ROWS } from '../core/constants.js';
import { enumerateMoves } from '../core/placements.js';
import { rankMoves } from './heuristic.js';

// 브라우저는 키 없이 개발 서버의 프록시(/api/jev)만 부른다. 키는 서버의 Tetris/.env에 있다.
export const JEV_ENDPOINT = '/api/jev';
// 입력 100만 토큰당 가격(출력 토큰은 무료). docs.typesafe.ai/models 기준(2026-09). 화면에는 "추정"으로 표시.
export const JEV_PRICE_PER_MTOK = 0.042;
export const QUESTION_ID = 'best_move';

// ── 후보 설명 ──────────────────────────────────────────
// 문서 권장: 숫자 비교·계산은 코드가 하고, 모델에는 이름 붙은 구간으로 넘긴다(Jev 1.13 jaggedness).
const LINES_TEXT = ['none', 'clears 1 line', 'clears 2 lines', 'clears 3 lines', 'clears 4 lines at once (a Tetris)'];
const COUNT_WORDS = ['no', 'one', 'two'];

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

// 모든 후보가 같은 필드 이름을 쓰게 해서 모델이 나란히 비교할 수 있게 한다.
// 회전 방향처럼 좋고 나쁨과 상관없는 정보는 넣지 않는다(무관한 정보는 정확도를 떨어뜨린다: jaggedness #5).
export function describeMove(move) {
  const f = move.features;
  return {
    uses_hold: move.hold ? `yes, holds the current piece and places the ${move.type} piece` : 'no',
    position: positionText(move.columns),
    lands_on: landingText(f),
    lines_cleared: LINES_TEXT[f.lines] ?? `clears ${f.lines} lines`,
    new_holes: holesText(f.newHoles),
    stack_growth: growthText(f.heightGain),
    surface_change: surfaceChangeText(f.bumpinessChange),
    stack_height_after: heightText(f.maxHeight),
    risk: f.lockOut ? 'ends the game immediately' : f.maxHeight > 16 ? 'stack close to the top' : 'none',
  };
}

export function boardRows(grid) {
  return grid.slice(HIDDEN_ROWS).map((row) => row.map((cell) => (cell ? '#' : '.')).join(''));
}

// 한 번의 요청: state = 보드와 피스 정보, 질문 = 후보 중 하나를 고르는 Choice 하나.
// board: 보드 격자를 state에 넣을지. 기본은 뺀다 — 세 시드 50피스 비교에서 격자를 뺀 쪽이
// 확신도가 높고(0.53→0.63) 토큰도 적었다. 판단은 코드가 계산한 후보 설명만으로 한다.
export function buildJevRequest(snapshot, moves, { board = false } = {}) {
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
          question: 'Which placement is the best move for the current Tetris piece?',
          goal: 'Survive as long as possible and clear many lines.',
          priorities_in_order: [
            'Never choose a move whose risk ends the game.',
            'Avoid creating new holes (empty cells covered from above).',
            'Prefer moves that land in the lowest part of the board and do not raise the tallest column.',
            'Prefer moves that keep the surface flat.',
            'Clear lines when possible; clearing several lines at once is best.',
          ],
        },
        criteria: Object.fromEntries(moves.map((move) => [move.id, describeMove(move)])),
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

// Jev가 후보 중 하나를 고른다. 실패하면 휴리스틱의 수로 대신 두고 'fallback'으로 표시한다.
export class JevBrain {
  constructor({ ask = askJev, requestOptions = {} } = {}) {
    this.ask = ask;
    this.requestOptions = requestOptions;
  }

  async decide(snapshot) {
    const moves = enumerateMoves(snapshot);
    if (moves.length === 0) return null;
    const baseline = rankMoves(moves)[0].move;
    const byId = new Map(moves.map((move) => [move.id, move]));
    const started = performance.now();
    try {
      const res = await this.ask(buildJevRequest(snapshot, moves, this.requestOptions));
      const answer = res.answers?.[QUESTION_ID];
      const move = byId.get(answer?.choice);
      if (!move) throw new Error('Jev 응답에 알 수 없는 후보가 있어요.');
      const probabilities = answer.probabilities ?? {};
      return {
        source: 'jev',
        move,
        confidence: answer.confidence,
        alternatives: Object.entries(probabilities)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .filter(([id]) => byId.has(id))
          .map(([id, value]) => ({ move: byId.get(id), value })),
        agrees: move.id === baseline.id,
        candidates: moves.length,
        ms: res.latencyMs ?? performance.now() - started,
        model: res.model,
        usage: res.usage,
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
