// 파일 없이 Web Audio로 합성하는 짧은 효과음.
export class Sfx {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
    this.master = null;
  }

  // 브라우저 자동재생 정책 때문에 사용자 입력 시점에 처음 만든다.
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, { type = 'square', vol = 0.1, slide = 1, delay = 0 } = {}) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  play(name, detail = {}) {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'move':
        return this.tone(310, 0.03, { type: 'triangle', vol: 0.12 });
      case 'rotate':
        return this.tone(520, 0.05, { type: 'triangle', vol: 0.12, slide: 1.3 });
      case 'hold':
        return this.tone(392, 0.09, { type: 'sine', vol: 0.18, slide: 1.5 });
      case 'lock':
        return this.tone(150, 0.06, { type: 'square', vol: 0.05, slide: 0.7 });
      case 'harddrop':
        this.tone(190, 0.1, { type: 'square', vol: 0.07, slide: 0.35 });
        return this.tone(95, 0.12, { type: 'sine', vol: 0.25, slide: 0.5 });
      case 'clear': {
        const notes = detail.tspin && detail.tspin !== 'none' ? [440, 554, 659, 880] : [523, 659, 784, 1047];
        const count = Math.max(1, detail.lines);
        notes.slice(0, count).forEach((f, i) => this.tone(f, 0.13, { type: 'square', vol: 0.06, delay: i * 0.055 }));
        if (detail.lines === 4 || detail.perfectClear) this.tone(1568, 0.25, { type: 'triangle', vol: 0.08, delay: 0.24 });
        return;
      }
      case 'levelup':
        return [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.1, { type: 'triangle', vol: 0.12, delay: 0.1 + i * 0.07 }));
      case 'ready':
        return this.tone(440, 0.1, { type: 'triangle', vol: 0.14 });
      case 'go':
        return this.tone(880, 0.16, { type: 'triangle', vol: 0.16 });
      case 'gameover':
        return [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.16, delay: i * 0.17 }));
    }
  }
}
