import { Game } from '../core/game.js';
import { LINE_CLEAR_DELAY } from '../core/constants.js';
import { boardStats } from '../core/placements.js';
import { seededRandom } from '../core/random.js';
import { applyAction, snapshotOf } from './driver.js';

// 화면 없이 봇 한 판을 끝까지 둔다(벤치마크용). 중력 없이 결정 → 동작 입력 → 줄 삭제를 반복한다.
// onDecision(decision, snapshot, game): 결정마다 불린다.
export async function playGame(brain, { seed, pieces, startLevel = 1, onDecision } = {}) {
  const game = new Game({ startLevel, rng: seededRandom(seed), pieceLimit: pieces });
  let peak = 0;
  game.start();
  while (game.state === 'playing' || game.state === 'clearing') {
    if (game.state === 'clearing') {
      game.update(LINE_CLEAR_DELAY);
      continue;
    }
    const snapshot = snapshotOf(game);
    const decision = await brain.decide(snapshot);
    onDecision?.(decision, snapshot, game);
    for (const action of decision?.move.actions ?? ['hard']) applyAction(game, action);
    peak = Math.max(peak, boardStats(game.grid).maxHeight);
  }
  const end = boardStats(game.grid);
  return {
    state: game.state,
    pieces: game.stats.pieces,
    lines: game.lines,
    score: game.score,
    tetrises: game.stats.tetrises,
    tspins: game.stats.tspins,
    holes: end.holes,
    peak,
  };
}
