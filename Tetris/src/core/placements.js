import { COLS, HIDDEN_ROWS, ROWS } from './constants.js';
import { fullRows, removeRows } from './board.js';
import { Game } from './game.js';

// 스폰 직후 회전 순서. 세 번 돌리는 대신 반시계 한 번.
const ROTATIONS = [[], ['cw'], ['cw', 'cw'], ['ccw']];

// 보드 모양 지표. 높이는 숨김 줄까지 포함한 칸 수, 구멍은 위가 막힌 빈칸 수.
export function boardStats(grid) {
  const heights = [];
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let top = ROWS;
    for (let y = 0; y < ROWS; y++) {
      if (grid[y][x] !== null) {
        top = y;
        break;
      }
    }
    heights.push(ROWS - top);
    for (let y = top + 1; y < ROWS; y++) if (grid[y][x] === null) holes += 1;
  }
  let bumpiness = 0;
  for (let x = 0; x < COLS - 1; x++) bumpiness += Math.abs(heights[x] - heights[x + 1]);
  return {
    heights,
    holes,
    bumpiness,
    aggregateHeight: heights.reduce((a, b) => a + b, 0),
    maxHeight: Math.max(...heights),
  };
}

// 스폰 → 회전 → 좌우 이동 → 하드 드롭으로 닿는 모든 착지 후보.
// 실제 Game 로직으로 시뮬레이션하므로 월킥까지 게임과 똑같이 맞는다.
// 홀드가 가능하면 "홀드한 뒤 나오는 피스"의 후보도 함께 낸다(actions가 'hold'로 시작).
export function enumerateMoves({ grid, type, holdType = null, holdUsed = false, next = [] }) {
  const before = boardStats(grid);
  const seen = new Set();
  const moves = [];
  explore(grid, type, [], false, before, seen, moves);
  const incoming = holdType ?? next[0];
  if (!holdUsed && incoming) explore(grid, incoming, ['hold'], true, before, seen, moves);
  return moves.map((move, i) => ({ id: `move_${i}`, ...move }));
}

function explore(grid, type, prefix, hold, before, seen, moves) {
  const sim = new Game();
  sim.grid = grid; // 아래 메서드들은 보드를 읽기만 한다.
  sim.state = 'playing';
  for (const rotation of ROTATIONS) {
    if (type === 'O' && rotation.length) continue;
    sim.spawn(type);
    if (sim.state !== 'playing') return; // 스폰 자리가 막힘
    if (!rotation.every((dir) => sim.rotate(dir === 'cw' ? 1 : -1))) continue;

    const base = { ...sim.piece };
    const positions = [{ piece: base, shifts: [] }];
    for (const [dx, key] of [[-1, 'left'], [1, 'right']]) {
      sim.piece = { ...base };
      const shifts = [];
      while (sim.move(dx)) {
        shifts.push(key);
        positions.push({ piece: { ...sim.piece }, shifts: [...shifts] });
      }
    }

    for (const { piece, shifts } of positions) {
      sim.piece = { ...piece };
      const landed = { ...piece, y: sim.ghostY() };
      const cells = sim.cellsOf(landed);
      const key = cells.map(([x, y]) => `${x},${y}`).sort().join(' ');
      if (seen.has(key)) continue; // 회전만 다르고 같은 자리에 놓이는 후보는 하나로
      seen.add(key);
      moves.push(describe(grid, landed, cells, [...prefix, ...rotation, ...shifts, 'hard'], hold, before));
    }
  }
}

function describe(grid, piece, cells, actions, hold, before) {
  const placed = grid.map((row) => row.slice());
  for (const [x, y] of cells) placed[y][x] = piece.type;
  const rows = fullRows(placed);
  const after = boardStats(removeRows(placed, rows));
  const xs = cells.map(([x]) => x);
  const bottom = Math.max(...cells.map(([, y]) => y));
  return {
    type: piece.type,
    rot: piece.rot,
    x: piece.x,
    hold,
    actions,
    cells,
    columns: [Math.min(...xs), Math.max(...xs)],
    features: {
      lines: rows.length,
      holes: after.holes,
      newHoles: after.holes - before.holes,
      aggregateHeight: after.aggregateHeight,
      maxHeight: after.maxHeight,
      bumpiness: after.bumpiness,
      lockOut: cells.every(([, y]) => y < HIDDEN_ROWS),
      // 놓기 전 보드와 비교한 값들: 피스 밑면 아래 칸 수(0이면 바닥), 가장 높은 열의 변화, 울퉁불퉁함의 변화.
      landing: ROWS - 1 - bottom,
      lowestColumn: Math.min(...before.heights),
      highestColumn: before.maxHeight,
      heightGain: after.maxHeight - before.maxHeight,
      bumpinessChange: after.bumpiness - before.bumpiness,
    },
  };
}
