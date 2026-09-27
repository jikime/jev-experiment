// 최고 점수·설정 저장. 사생활 모드 등으로 저장소가 막혀도 게임은 그대로 돈다.
const PREFIX = 'tetris-paper:';

function store(area) {
  return {
    get(key, fallback) {
      try {
        const raw = area().getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        area().setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // 저장 실패는 무시한다.
      }
    },
  };
}

export const storage = store(() => localStorage);
// 탭을 닫으면 지워지는 저장소: 방문자의 TypeSafe 키처럼 오래 남기지 않을 값.
export const tabStorage = store(() => sessionStorage);
