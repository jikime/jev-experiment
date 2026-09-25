import { MAX_GRAVITY_LEVEL } from './constants.js';

// Tetris Guideline 점수표 (× 레벨).
const LINE_SCORES = {
  none: [0, 100, 300, 500, 800],
  mini: [100, 200, 400],
  full: [400, 800, 1200, 1600],
};
const PERFECT_CLEAR = [0, 800, 1200, 1800, 2000];
const B2B_PERFECT_TETRIS = 3200;

// "어려운" 줄 삭제: 테트리스 또는 줄을 지운 T-스핀. 연속되면 Back-to-Back ×1.5.
export function isDifficult(lines, tspin) {
  return lines === 4 || (lines > 0 && tspin !== 'none');
}

export function scoreClear({ lines, tspin, level, b2bActive, combo, perfectClear }) {
  const difficult = isDifficult(lines, tspin);
  const b2b = difficult && b2bActive;
  let points = (LINE_SCORES[tspin][lines] ?? 0) * level;
  if (b2b) points = Math.floor(points * 1.5);
  if (lines > 0 && combo > 0) points += 50 * combo * level;
  if (perfectClear) {
    points += (lines === 4 && b2b ? B2B_PERFECT_TETRIS : PERFECT_CLEAR[lines]) * level;
  }
  return { points, b2b, difficult };
}

// 한 줄 내려가는 데 걸리는 시간(ms): (0.8 − (레벨−1)×0.007)^(레벨−1) 초.
export function gravityInterval(level) {
  const l = Math.min(level, MAX_GRAVITY_LEVEL);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
}
