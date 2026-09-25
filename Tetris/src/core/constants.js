// Tetris Guideline 규격값. 좌표계는 y가 아래로 증가하고, 보드는 숨김 20줄 + 보이는 20줄.
export const COLS = 10;
export const ROWS = 40;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = ROWS - VISIBLE_ROWS;

// 스폰: 3칸 폭 피스는 3~5열, I·O는 가운데 열. 보이는 필드 바로 위(21~22행)에 나타난다.
export const SPAWN_X = 3;
export const SPAWN_Y = HIDDEN_ROWS - 2;

export const NEXT_COUNT = 5;
export const LOCK_DELAY = 500; // ms
export const MAX_LOCK_RESETS = 15; // Extended Placement: 바닥 접촉 후 이동·회전 15회까지 락 타이머 리셋
export const LINE_CLEAR_DELAY = 320; // ms, 줄 삭제 연출 시간
export const SOFT_DROP_FACTOR = 20; // 소프트 드롭 = 중력 20배
export const LINES_PER_LEVEL = 10;
export const MAX_GRAVITY_LEVEL = 20; // 레벨 20부터 20G(즉시 낙하), 레벨 자체는 계속 오른다
