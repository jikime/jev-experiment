import { COLS, ROWS } from './constants.js';

export function createGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// 벽·바닥·보드 위쪽 밖은 모두 막힌 칸으로 본다.
export function isBlocked(grid, x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
  return grid[y][x] !== null;
}

export function fullRows(grid) {
  const rows = [];
  grid.forEach((row, y) => {
    if (row.every((cell) => cell !== null)) rows.push(y);
  });
  return rows;
}

export function removeRows(grid, rows) {
  const drop = new Set(rows);
  const kept = grid.filter((_, y) => !drop.has(y));
  const fresh = Array.from({ length: rows.length }, () => Array(COLS).fill(null));
  return [...fresh, ...kept];
}

export function isEmpty(grid) {
  return grid.every((row) => row.every((cell) => cell === null));
}
