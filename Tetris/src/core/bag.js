import { PIECE_TYPES } from './pieces.js';

// 7-bag 랜덤 생성기: 7종을 한 봉지에 넣고 섞어 하나씩 꺼낸다.
export class Bag {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.pool = [];
  }

  next() {
    if (this.pool.length === 0) this.pool = shuffle([...PIECE_TYPES], this.rng);
    return this.pool.pop();
  }
}

function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
