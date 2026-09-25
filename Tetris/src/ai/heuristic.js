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

// 점수가 높은 순. 같은 점수면 먼저 나온(홀드 안 하는, 덜 움직이는) 후보가 앞선다.
export function rankMoves(moves, weights = WEIGHTS) {
  return moves
    .map((move, order) => ({ move, score: evaluate(move.features, weights), order }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
}

export class HeuristicBrain {
  decide(snapshot) {
    const started = performance.now();
    const moves = enumerateMoves(snapshot);
    if (moves.length === 0) return null;
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
