// SRS(Super Rotation System) 테트로미노 정의와 월킥 테이블.
export const PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

// 스폰 방향(상태 0). J·L·T는 평평한 면이 아래로 오도록 스폰한다.
const SPAWN_SHAPES = {
  I: ['....', 'XXXX', '....', '....'],
  J: ['X..', 'XXX', '...'],
  L: ['..X', 'XXX', '...'],
  O: ['.XX.', '.XX.', '....', '....'],
  S: ['.XX', 'XX.', '...'],
  T: ['.X.', 'XXX', '...'],
  Z: ['XX.', '.XX', '...'],
};

function parse(rows) {
  const cells = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === 'X') cells.push([x, y]);
    });
  });
  return cells;
}

// n×n 경계 상자 안에서 시계 방향 90° 회전.
function rotateCW(cells, n) {
  return cells.map(([x, y]) => [n - 1 - y, x]);
}

function buildRotations(type) {
  const rows = SPAWN_SHAPES[type];
  const base = parse(rows);
  if (type === 'O') return [base, base, base, base];
  const n = rows.length;
  const states = [base];
  for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1], n));
  return states;
}

// SHAPES[type][rotation] → [[x, y], ...] (경계 상자 기준 상대 좌표)
export const SHAPES = Object.fromEntries(PIECE_TYPES.map((t) => [t, buildRotations(t)]));

// 월킥 오프셋(y 아래 방향 기준). 키는 `${from}${to}`, 0=스폰, 1=R, 2=180, 3=L.
const JLSTZ_KICKS = {
  '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function kicksFor(type, from, to) {
  if (type === 'O') return [[0, 0]];
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}${to}`];
}
