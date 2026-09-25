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

// 착지 후보 전부. 실제 Game 로직으로 시뮬레이션하므로 월킥·T-스핀 판정까지 게임과 똑같이 맞는다.
// 홀드가 가능하면 "홀드한 뒤 나오는 피스"의 후보도 함께 낸다(actions가 'hold'로 시작).
//   reach: 'full'(기본) — 스폰에서 좌우·회전·한 칸 내리기로 닿는 모든 상태를 넓이 우선으로 훑는다.
//          턱 밑으로 밀어 넣기(tuck)·비틀어 넣기(T-스핀)까지 찾는다.
//          'drop' — 회전 → 좌우 → 하드 드롭만. 훨씬 빨라서 한 수 앞 계산에 쓴다.
export function enumerateMoves({ grid, type, holdType = null, holdUsed = false, next = [] }, { reach = 'full' } = {}) {
  const before = boardStats(grid);
  const seen = new Set();
  const moves = [];
  const explore = reach === 'drop' ? exploreDrops : exploreAll;
  explore(grid, type, [], false, before, seen, moves);
  const incoming = holdType ?? next[0];
  if (!holdUsed && incoming) explore(grid, incoming, ['hold'], true, before, seen, moves);
  return moves.map((move, i) => ({ id: `move_${i}`, ...move }));
}

function makeSim(grid) {
  const sim = new Game();
  sim.grid = grid; // 아래 메서드들은 보드를 읽기만 한다.
  sim.state = 'playing';
  return sim;
}

// 같은 칸이라도 T-스핀 여부가 다르면 다른 후보다(점수가 다르다).
function addMove(grid, sim, piece, path, tspin, prefix, hold, before, seen, moves) {
  const cells = sim.cellsOf(piece);
  const key = `${cells.map(([x, y]) => `${x},${y}`).sort().join(' ')}|${tspin}`;
  if (seen.has(key)) return;
  seen.add(key);
  moves.push(describe(grid, piece, cells, [...prefix, ...path, 'hard'], hold, before, tspin));
}

function exploreDrops(grid, type, prefix, hold, before, seen, moves) {
  const sim = makeSim(grid);
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
      addMove(grid, sim, { ...piece, y: sim.ghostY() }, [...rotation, ...shifts], 'none', prefix, hold, before, seen, moves);
    }
  }
}

const STEPS = [
  ['left', (sim) => sim.move(-1)],
  ['right', (sim) => sim.move(1)],
  ['down', (sim) => sim.stepDown()],
  ['cw', (sim) => sim.rotate(1)],
  ['ccw', (sim) => sim.rotate(-1)],
];

function exploreAll(grid, type, prefix, hold, before, seen, moves) {
  const sim = makeSim(grid);
  sim.spawn(type);
  if (sim.state !== 'playing') return; // 스폰 자리가 막힘

  // 상태 = 위치·회전 + "마지막 동작이 회전이었나"(T-스핀 판정이 달라진다). 먼저 닿은 경로가 가장 짧다.
  const visited = new Set();
  const queue = [];
  const push = (piece, path, rotated, kick) => {
    const key = `${piece.x},${piece.y},${piece.rot},${rotated ? 1 : 0}`;
    if (visited.has(key)) return;
    visited.add(key);
    queue.push({ piece, path, rotated, kick });
  };
  push({ ...sim.piece }, [], false, -1);

  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    // 이 상태에서 하드 드롭한 자리. 바닥에 닿아 있고 마지막이 회전이면 드롭 거리가 0이라 T-스핀이 유지된다.
    sim.piece = { ...node.piece };
    const landedY = sim.ghostY();
    const landed = { ...node.piece, y: landedY };
    let tspin = 'none';
    if (type === 'T' && node.rotated && landedY === node.piece.y) {
      sim.piece = landed;
      sim.lastAction = 'rotate';
      sim.lastKick = node.kick;
      tspin = sim.detectTSpin();
    }
    addMove(grid, sim, landed, node.path, tspin, prefix, hold, before, seen, moves);

    for (const [action, step] of STEPS) {
      const rotation = action === 'cw' || action === 'ccw';
      if (type === 'O' && rotation) continue;
      sim.piece = { ...node.piece };
      if (!step(sim)) continue;
      push({ ...sim.piece }, [...node.path, action], rotation, rotation ? sim.lastKick : -1);
    }
  }
}

function describe(grid, piece, cells, actions, hold, before, tspin = 'none') {
  const placed = grid.map((row) => row.slice());
  for (const [x, y] of cells) placed[y][x] = piece.type;
  const rows = fullRows(placed);
  const result = removeRows(placed, rows);
  const after = boardStats(result);
  const xs = cells.map(([x]) => x);
  const bottom = Math.max(...cells.map(([, y]) => y));
  return {
    type: piece.type,
    rot: piece.rot,
    x: piece.x,
    hold,
    actions,
    cells,
    result, // 놓고 줄까지 지운 뒤의 보드(한 수 앞 내다보기용)
    columns: [Math.min(...xs), Math.max(...xs)],
    features: {
      lines: rows.length,
      tspin, // 'none' | 'mini' | 'full' — 게임의 T-스핀 판정과 같다
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
