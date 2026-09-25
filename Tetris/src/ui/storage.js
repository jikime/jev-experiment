// 최고 점수·설정 저장. 사생활 모드 등으로 저장소가 막혀도 게임은 그대로 돈다.
const PREFIX = 'tetris-paper:';

export const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // 저장 실패는 무시한다.
    }
  },
};
