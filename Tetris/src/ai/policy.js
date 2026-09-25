import { COLS } from '../core/constants.js';

// 플레이어 전략(strategy.js가 Jev로 해석한 정책)을 코드 쪽 규칙으로 바꾼다.
// 규칙은 코드가 지키고(문서: 알려진 규칙은 코드에), 그 안에서 고르는 판단만 Jev에게 남긴다.

// "우물(가장자리 한 줄)은 비워 둔다"는 규칙. Jev에게 우선순위로만 알려 줬더니 매 수 따로 판단하다
// 1~2줄을 지우려고 우물을 채워 버려 테트리스가 0번이었다(벤치마크).
// 우물에 블록을 넣는 수는 테트리스 전략이면 4줄을, 아니면 줄을 지울 때만 허용한다.
// 가장 높은 열이 WELL_RELEASE_HEIGHT에 닿으면 규칙을 풀어 살아남는 쪽을 택한다.
// 8로 정한 근거(휴리스틱, 12시드 × 100피스): 12보다 점수 +5%, 최고 높이 13.2 → 9.6.
// 4줄 보너스·작은 줄 벌점 같은 가중치도 시험했지만 결과가 전혀 달라지지 않아 넣지 않았다.
export const WELL_RELEASE_HEIGHT = 8;

export function allowedByPolicy(moves, policy) {
  if (!policy?.well || moves.length === 0) return moves;
  if (moves[0].features.highestColumn >= WELL_RELEASE_HEIGHT) return moves;
  const column = policy.well === 'right' ? COLS - 1 : 0;
  const need = policy.tetris ? 4 : 1;
  const allowed = moves.filter((move) => !move.cells.some(([x]) => x === column) || move.features.lines >= need);
  return allowed.length ? allowed : moves;
}
