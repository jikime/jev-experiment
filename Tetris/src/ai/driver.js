// 봇이 Game을 조작한다. 피스가 나오면 두뇌(brain)에게 묻고, 답을 기다리는 동안은 중력을 멈춘다.
// 정해진 동작은 stepMs 간격으로 하나씩 실행해 사람이 따라 볼 수 있게 한다.
const ACTIONS = {
  hold: (game) => game.hold(),
  cw: (game) => game.rotate(1),
  ccw: (game) => game.rotate(-1),
  left: (game) => game.move(-1),
  right: (game) => game.move(1),
  hard: (game) => game.hardDrop(),
};

export function snapshotOf(game) {
  return {
    grid: game.grid.map((row) => row.slice()),
    type: game.piece.type,
    holdType: game.holdType,
    holdUsed: game.holdUsed,
    next: game.nextQueue.slice(),
  };
}

export class BotDriver {
  // settleMs: 피스를 놓은 뒤 다음 수를 생각하기 전에 쉬는 시간(사람이 결과를 볼 수 있게).
  constructor(game, brain, { stepMs = 60, settleMs = 0, onThink, onDecision } = {}) {
    this.game = game;
    this.brain = brain;
    this.stepMs = stepMs;
    this.settleMs = settleMs;
    this.onThink = onThink;
    this.onDecision = onDecision;
    this.phase = 'idle'; // idle | thinking | acting | settling | stopped
    this.queue = [];
    this.acc = 0;
    this.wait = 0;
    this.token = 0;
    this.decision = null;
  }

  stop() {
    this.token += 1; // 아직 오는 중인 답은 버린다
    this.phase = 'stopped';
  }

  update(dt) {
    const game = this.game;
    if (this.phase === 'stopped') return;
    if (game.state === 'clearing') game.update(dt); // 줄 삭제 연출만 진행(중력은 없음)
    if (this.phase === 'settling') {
      this.wait -= dt;
      if (this.wait > 0) return;
      this.phase = 'idle';
    }
    if (game.state !== 'playing' || !game.piece) return;
    if (this.phase === 'idle') {
      this.think();
      return;
    }
    if (this.phase !== 'acting') return;

    this.acc += dt;
    while (this.queue.length && this.acc >= this.stepMs) {
      this.acc -= this.stepMs;
      const action = this.queue.shift();
      if (action === 'hard') {
        this.checkTarget();
        ACTIONS.hard(game);
        this.phase = 'settling';
        this.wait = this.settleMs;
        return;
      }
      ACTIONS[action](game);
      if (game.state !== 'playing') break;
    }
    if (!this.queue.length) this.phase = 'idle';
  }

  think() {
    const token = ++this.token;
    this.phase = 'thinking';
    this.onThink?.();
    const snapshot = snapshotOf(this.game);
    Promise.resolve()
      .then(() => this.brain.decide(snapshot))
      .catch((err) => {
        console.error(err);
        return null;
      })
      .then((decision) => {
        if (token !== this.token) return;
        this.decision = decision;
        this.queue = decision ? [...decision.move.actions] : ['hard'];
        this.acc = this.stepMs; // 첫 동작은 바로
        this.phase = 'acting';
        this.onDecision?.(decision);
      });
  }

  // 시뮬레이션과 실제 게임이 어긋나면 알린다(정상이라면 일어나지 않는다).
  checkTarget() {
    const move = this.decision?.move;
    const piece = this.game.piece;
    if (move && piece && (piece.type !== move.type || piece.rot !== move.rot || piece.x !== move.x)) {
      console.warn('봇이 계획한 위치와 실제 피스 위치가 달라요', { move, piece });
    }
  }
}
