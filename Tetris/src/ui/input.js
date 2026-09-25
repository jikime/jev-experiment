// 가이드라인 기본 키 배치. e.code 기준이라 한글 입력 모드에서도 그대로 동작한다.
export const KEY_ACTIONS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'soft',
  ArrowUp: 'cw',
  KeyX: 'cw',
  KeyZ: 'ccw',
  ControlLeft: 'ccw',
  ControlRight: 'ccw',
  Space: 'hard',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
};

const DAS = 167; // 자동 이동이 시작되기까지(ms)
const ARR = 33; // 자동 이동 간격(ms)

// 키보드·터치 공용 입력기. 좌우 이동의 DAS/ARR을 직접 계산한다(브라우저 키 반복은 무시).
export class InputController {
  constructor() {
    this.game = null;
    this.releaseAll();
  }

  attach(game) {
    this.game = game;
    this.releaseAll();
  }

  releaseAll() {
    this.held = { left: false, right: false };
    this.dir = 0;
    this.das = 0;
    this.arr = 0;
    this.game?.setSoftDrop(false);
  }

  press(action) {
    const game = this.game;
    if (!game) return;
    switch (action) {
      case 'left':
      case 'right': {
        this.held[action] = true;
        this.startShift(action === 'left' ? -1 : 1);
        game.move(this.dir);
        break;
      }
      case 'soft':
        game.setSoftDrop(true);
        break;
      case 'hard':
        game.hardDrop();
        break;
      case 'cw':
        game.rotate(1);
        break;
      case 'ccw':
        game.rotate(-1);
        break;
      case 'hold':
        game.hold();
        break;
    }
  }

  release(action) {
    if (action === 'left' || action === 'right') {
      this.held[action] = false;
      // 반대쪽을 아직 누르고 있으면 그쪽으로 다시 충전한다.
      const other = action === 'left' ? 'right' : 'left';
      if (this.held[other]) this.startShift(other === 'left' ? -1 : 1);
      else this.dir = 0;
    } else if (action === 'soft') {
      this.game?.setSoftDrop(false);
    }
  }

  startShift(dir) {
    this.dir = dir;
    this.das = 0;
    this.arr = 0;
  }

  update(dt) {
    if (!this.dir || !this.game) return;
    if (this.das < DAS) {
      this.das += dt;
      if (this.das < DAS) return;
      this.arr = ARR + (this.das - DAS); // DAS가 차는 순간 바로 한 칸
    } else {
      this.arr += dt;
    }
    while (this.arr >= ARR) {
      this.arr -= ARR;
      if (!this.game.move(this.dir)) {
        this.arr = 0;
        break;
      }
    }
  }
}

// 모바일 버튼: 누르고 있는 동안 press 상태를 유지한다.
export function bindTouchPad(pad, input, canAct) {
  const release = (button) => {
    if (!button.classList.contains('is-down')) return;
    button.classList.remove('is-down');
    input.release(button.dataset.action);
  };
  for (const button of pad.querySelectorAll('[data-action]')) {
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!canAct()) return;
      button.setPointerCapture(e.pointerId);
      button.classList.add('is-down');
      input.press(button.dataset.action);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, () => release(button));
    }
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
