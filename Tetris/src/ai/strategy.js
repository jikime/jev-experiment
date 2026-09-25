import { askJev } from './jev.js';

// 플레이어가 말로 적은 전략을 Jev가 정해진 값(정책)으로 바꾼다. 대결마다 한 번만 부른다.
// 질문과 criteria는 영어로, 플레이어 문장은 그대로(한국어) state에 넣는다(문서: 영어가 주 학습 언어).
export const STRATEGY_QUESTIONS = {
  is_strategy: {
    type: 'noul',
    instructions: 'Is `strategy` an instruction about how to play Tetris?',
  },
  wants_tetris: {
    type: 'noul',
    instructions: 'Does `strategy` ask to save up rows and clear four lines at once (a Tetris)?',
  },
  well_side: {
    type: 'choice',
    instructions: 'Which edge column does `strategy` want kept empty as a well?',
    criteria: {
      left: 'The leftmost column',
      right: 'The rightmost column',
      none: 'No column is mentioned or implied',
    },
  },
  risk: {
    type: 'score',
    instructions: 'How much risk does `strategy` accept?',
    criteria: [
      'Play it safe: keep the stack as low as possible',
      'Balanced: accept some height for better clears',
      'Aggressive: accept a tall stack for bigger clears',
    ],
  },
};

// 경계값. 0.5 근처는 "반반"이라는 뜻이라(문서: Noul 0.5 = 불확실) 원하는 쪽으로 확실할 때만 켠다.
// 한국어 문장 다섯 개로 확인: "크게 터뜨려"는 wants_tetris 0.50 → 켜지 않음, "테트리스를 노려"는 0.76 → 켬.
const UNDERSTOOD = 0.5;
const WANTS = 0.6;
const SIDE_CONFIDENCE = 0.3;
const RISK_CONFIDENCE = 0.5; // 위험을 말하지 않은 문장은 확신도가 낮게(0.2~0.3) 나온다 → 기본 '균형'

// → { understood, tetris, well: 'left'|'right'|null, risk: 0|1|2, answers }
export function policyFrom(answers) {
  const understood = answers.is_strategy.noul >= UNDERSTOOD;
  if (!understood) return { understood, tetris: false, well: null, risk: 1, answers };
  const tetris = answers.wants_tetris.noul >= WANTS;
  const side = answers.well_side;
  let well = side.choice !== 'none' && side.confidence >= SIDE_CONFIDENCE ? side.choice : null;
  if (tetris && !well) well = 'right'; // 테트리스를 노리는데 쪽을 말하지 않았으면 흔한 오른쪽 우물
  const risk = answers.risk.confidence >= RISK_CONFIDENCE ? Math.round(answers.risk.score) : 1;
  return { understood, tetris, well, risk, answers };
}

export async function parseStrategy(text, { ask = askJev } = {}) {
  const res = await ask({ state: { strategy: text }, questions: STRATEGY_QUESTIONS });
  return { text, ...policyFrom(res.answers), model: res.model, usage: res.usage };
}

// 화면 표시용 한 줄 요약.
export function policyLabel(policy) {
  if (!policy.understood) return '전략으로 이해하지 못해 기본대로 둬요';
  const parts = [];
  if (policy.tetris) parts.push('테트리스 노리기');
  if (policy.well) parts.push(`${policy.well === 'right' ? '오른쪽' : '왼쪽'} 끝 줄 비우기`);
  parts.push(['안전하게', '균형 있게', '과감하게'][policy.risk] ?? '균형 있게');
  return parts.join(' · ');
}
