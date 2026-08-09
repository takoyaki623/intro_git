// 効果音。WebAudio の矩形波とノイズだけで鳴らす。
//
// 音声ファイルは1つも持たない（「外部アセットなし」の方針をここでも通す）。
// ブラウザは操作があるまで AudioContext を鳴らさないので、最初の入力で resume する。

let ctx = null;
let master = null;
let enabled = true;

function ensure() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AC) { enabled = false; return null; }
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);
  } catch {
    enabled = false;
  }
  return ctx;
}

/** 最初のユーザー操作で呼ぶ。ブラウザの自動再生制限を外す。 */
export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setEnabled(v) { enabled = v; }
export function isEnabled() { return enabled; }

export function setVolume(v) {
  if (master) master.gain.value = Math.max(0, Math.min(1, v)) * 0.4;
}

/**
 * 単音。
 * type: 'square' | 'triangle' | 'sawtooth' | 'sine'
 * to を渡すと freq → to へ滑らせる（上昇音・下降音）。
 */
export function tone(freq, dur = 0.08, opt = {}) {
  if (!enabled) return;
  const c = ensure();
  if (!c || c.state === 'suspended') return;

  const { type = 'square', to = null, gain = 1, delay = 0 } = opt;
  const t0 = c.currentTime + delay;

  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== null) osc.frequency.linearRampToValueAtTime(to, t0 + dur);

  // 立ち上がりを一瞬にして、切るときだけ滑らかにする（プチッというノイズ防止）
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** ノイズ（被弾・ボールの揺れなど） */
export function noise(dur = 0.08, opt = {}) {
  if (!enabled) return;
  const c = ensure();
  if (!c || c.state === 'suspended') return;

  const { gain = 0.6, delay = 0, lowpass = 2400 } = opt;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));

  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;

  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = lowpass;

  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filt).connect(g).connect(master);
  src.start(t0);
}

// ---- ゲーム内の効果音 ----

export const SE = {
  cursor: () => tone(880, 0.04, { gain: 0.5 }),
  select: () => { tone(660, 0.05); tone(990, 0.06, { delay: 0.05 }); },
  cancel: () => tone(330, 0.07, { to: 220 }),
  text: () => tone(1200, 0.012, { gain: 0.25 }),

  hit: (eff = 1) => {
    noise(eff > 1 ? 0.14 : 0.08, { gain: eff > 1 ? 0.8 : 0.5, lowpass: eff > 1 ? 3600 : 1600 });
  },
  faint: () => tone(440, 0.5, { to: 60, type: 'triangle' }),
  levelUp: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.11, { delay: i * 0.09 })),

  ballThrow: () => tone(300, 0.16, { to: 700, type: 'triangle' }),
  ballShake: () => noise(0.05, { gain: 0.4, lowpass: 900 }),
  caught: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.16, { delay: i * 0.12 })),

  encounter: () => [220, 330, 220, 330].forEach((f, i) => tone(f, 0.09, { delay: i * 0.08, type: 'sawtooth' })),
  evolve: () => [392, 494, 587, 784, 988].forEach((f, i) => tone(f, 0.22, { delay: i * 0.16 })),
  heal: () => [659, 784, 659, 784].forEach((f, i) => tone(f, 0.12, { delay: i * 0.11, type: 'sine', gain: 0.8 })),
  save: () => { tone(660, 0.08); tone(880, 0.12, { delay: 0.09 }); },

  /** HP が2割を切っているときの警告音 */
  lowHp: () => tone(1046, 0.05, { gain: 0.35 }),
};
