import { enumerateMoves } from '../core/placements.js';

// El-Tetris(Yiyuan Lee)의 유전 알고리즘 가중치. 코드만으로 두는 기준선 봇.
export const WEIGHTS = {
  aggregateHeight: -0.510066,
  lines: 0.760666,
  holes: -0.35663,
  bumpiness: -0.184483,
};

export function evaluate(features, weights = WEIGHTS) {
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
export function nextPieceAfter(move, snapshot) {
  if (!move.hold) return snapshot.next[0];
  return snapshot.holdType ? snapshot.next[0] : snapshot.next[1];
}

// 후보마다 "다음 피스를 가장 잘 놓았을 때"를 찾아 follow로 붙인다.
// follow.features: 다음 피스까지 놓은 뒤의 보드. follow.score: 두 수를 합친 평가(두 수의 지운 줄 합산).
export function attachFollowUps(snapshot, moves, weights = WEIGHTS) {
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
export function rankMoves(moves, weights = WEIGHTS) {
  return moves
    .map((move, order) => ({ move, score: valueOf(move, weights), now: evaluate(move.features, weights), order }))
    .sort((a, b) => b.score - a.score || b.now - a.now || a.order - b.order);
}

export class HeuristicBrain {
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
