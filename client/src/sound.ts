// 街机风格音效：全部用 Web Audio 现场合成（方波/三角波 + 噪声），不需要音频文件。
// 浏览器要求用户交互后才能出声，所以 AudioContext 在第一次播放时才创建。

type Wave = OscillatorType;

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C5'、'F#4' → 频率（A4 = 440Hz） */
export function noteFreq(note: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) throw new Error(`bad note ${note}`);
  const midi = (Number(m[3]) + 1) * 12 + NOTE_INDEX[m[1]!]! + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

const MUTE_KEY = 'soundMuted';
/** 总音量：单个音的音量都偏小，叠加和声时也不会削波 */
const MASTER_VOLUME = 1.8;

class Chiptune {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private _muted = readMuted();

  get muted() {
    return this._muted;
  }

  setMuted(muted: boolean) {
    this._muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* 隐私模式下不保存 */
    }
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_VOLUME;
  }

  private audio(): { ctx: AudioContext; out: GainNode } | null {
    if (this._muted) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, out: this.master! };
  }

  /** 单个音：at 为相对现在的秒数 */
  tone(freq: number, at: number, dur: number, { type = 'square' as Wave, vol = 0.12, slideTo = 0 } = {}) {
    const a = this.audio();
    if (!a) return;
    const t = a.ctx.currentTime + at;
    const osc = a.ctx.createOscillator();
    const gain = a.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    // 快起音、指数衰减，避免爆音
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(at: number, dur: number, vol = 0.08) {
    const a = this.audio();
    if (!a) return;
    if (!this.noiseBuffer) {
      const buf = a.ctx.createBuffer(1, a.ctx.sampleRate * 0.5, a.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    const t = a.ctx.currentTime + at;
    const src = a.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const gain = a.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(gain).connect(a.out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** 按拍子播放一串音符；'-' 表示休止。返回总时长（秒） */
  melody(notes: [string, number][], bpm: number, opts: { type?: Wave; vol?: number; at?: number } = {}): number {
    const beat = 60 / bpm;
    let t = opts.at ?? 0;
    for (const [note, beats] of notes) {
      const dur = beats * beat;
      if (note !== '-') this.tone(noteFreq(note), t, dur * 0.9, { type: opts.type ?? 'square', vol: opts.vol ?? 0.1 });
      t += dur;
    }
    return t;
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const chiptune = new Chiptune();

// ---------- 九个荔枝的音效 ----------

export const sfx = {
  click() {
    chiptune.tone(1200, 0, 0.03, { vol: 0.05 });
  },

  /** 投币：两声上扬的「叮叮」 */
  coin() {
    chiptune.tone(noteFreq('B5'), 0, 0.07, { vol: 0.1 });
    chiptune.tone(noteFreq('E6'), 0.07, 0.18, { vol: 0.1 });
  },

  /** 滚动时的连续「哒哒哒」，返回停止函数 */
  rolling(): () => void {
    let i = 0;
    const id = window.setInterval(() => {
      chiptune.tone(i++ % 2 ? 660 : 880, 0, 0.035, { vol: 0.045 });
    }, 70);
    return () => window.clearInterval(id);
  },

  /** 一列停下：低沉的「咔」，列越靠右音越高一点 */
  reelStop(col: number) {
    chiptune.tone(260 + col * 40, 0, 0.09, { slideTo: 90, vol: 0.14 });
    chiptune.noise(0, 0.05, 0.06);
  },

  /** 普通中奖：快速上行琶音；线越多越长 */
  win(lines: number) {
    const arp = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'];
    const n = Math.min(arp.length, 3 + lines);
    chiptune.melody(arp.slice(0, n).map((note) => [note, 0.5] as [string, number]), 480);
    // 结尾加几声硬币落下
    for (let k = 0; k < Math.min(6, lines * 2); k++) {
      chiptune.tone(noteFreq('E6') * (k % 2 ? 1.5 : 1), 0.5 + k * 0.09, 0.08, { vol: 0.06 });
    }
  },

  /** 全屏大奖：街机开大奖的号角 + 和声 + 持续硬币声（九个荔枝更长更响） */
  jackpot(isLychee: boolean) {
    const lead: [string, number][] = [
      ['G5', 0.5], ['G5', 0.5], ['G5', 0.5], ['C6', 1.5],
      ['-', 0.5], ['A5', 0.5], ['C6', 0.5], ['E6', 1.5],
      ['-', 0.5], ['D6', 0.5], ['E6', 0.5], ['G6', 2],
    ];
    const bass: [string, number][] = [
      ['C4', 2], ['C4', 1], ['F4', 2], ['F4', 1], ['G4', 2], ['C5', 2.5],
    ];
    const bpm = isLychee ? 200 : 240;
    const len = chiptune.melody(lead, bpm, { vol: 0.11 });
    chiptune.melody(bass, bpm, { type: 'triangle', vol: 0.16 });
    const coins = isLychee ? 40 : 20;
    for (let k = 0; k < coins; k++) {
      chiptune.tone(1800 + Math.random() * 1200, len * 0.3 + k * 0.07, 0.06, { vol: 0.04 });
    }
  },

  /** 余额不足之类的提示 */
  error() {
    chiptune.tone(220, 0, 0.12, { vol: 0.1 });
    chiptune.tone(165, 0.12, 0.2, { vol: 0.1 });
  },
};
