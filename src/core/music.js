// BGM。矩形波2声＋三角波のベース＋ノイズのドラムだけで鳴らす簡易シーケンサ。
//
// 音声ファイルは持たない方針をここでも通す。曲は「音名の文字列」で書く。
//
//   'c4 e4 g4 -'    … 半角スペース区切り。'-' は休符、'~' は前の音をのばす
//
// 先の音を少しずつ予約していく方式（lookahead scheduling）にしてある。
// setInterval で1音ずつ鳴らすと、タブが裏に回ったときにリズムが崩れる。
// WebAudio の時計に対して先に予約しておけば、描画が詰まっても曲は乱れない。

import { audioBus, isEnabled } from './audio.js';

const NOTES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** 'c4' 'f#3' → 周波数。'-' と '~' は null。 */
function freqOf(token) {
  if (!token || token === '-' || token === '~') return null;
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(token);
  if (!m) return null;
  let semi = NOTES[m[1]];
  if (m[2] === '#') semi += 1;
  if (m[2] === 'b') semi -= 1;
  const octave = Number(m[3]);
  // a4 = 440Hz を基準に、平均律で求める
  const n = semi + (octave - 4) * 12 - 9;
  return 440 * Math.pow(2, n / 12);
}

const parse = (s) => s.trim().split(/\s+/);

/**
 * 曲。
 *   bpm      … 4分音符の速さ
 *   step     … 1トークンの長さ（4分音符に対する割合。0.5 なら8分音符）
 *   lead/harm … 矩形波
 *   bass     … 三角波
 *   drum     … 'x' キック / 'o' スネア / 'h' ハイハット / '-' 休み
 * 各パートは長さが違ってもよく、それぞれ自分の長さで繰り返す。
 */
export const SONGS = {
  title: {
    bpm: 104, step: 0.5,
    lead: parse(`
      g4 ~ b4 ~ d5 ~ b4 ~  c5 ~ e5 ~ d5 ~ ~ ~
      a4 ~ c5 ~ e5 ~ c5 ~  d5 ~ g5 ~ ~ ~ ~ ~`),
    harm: parse(`
      d4 ~ g4 ~ b4 ~ g4 ~  e4 ~ g4 ~ b4 ~ ~ ~
      f4 ~ a4 ~ c5 ~ a4 ~  b4 ~ d5 ~ ~ ~ ~ ~`),
    bass: parse(`g2 ~ ~ ~ c3 ~ ~ ~ f2 ~ ~ ~ g2 ~ ~ ~`),
    drum: parse(`x - h - o - h - x - h - o - h h`),
  },

  town: {
    bpm: 118, step: 0.5,
    lead: parse(`
      e4 g4 c5 ~  b4 g4 e4 ~  f4 a4 c5 ~  b4 ~ ~ ~
      e4 g4 c5 ~  d5 c5 b4 ~  a4 g4 f4 e4  d4 ~ ~ ~`),
    harm: parse(`
      c4 ~ e4 ~  g4 ~ e4 ~  f4 ~ a4 ~  g4 ~ ~ ~
      c4 ~ e4 ~  g4 ~ g4 ~  f4 ~ d4 ~  g3 ~ ~ ~`),
    bass: parse(`c3 ~ g2 ~  c3 ~ g2 ~  f2 ~ c3 ~  g2 ~ g2 ~`),
    drum: parse(`x - h - o - h - x - h - o - h -`),
  },

  route: {
    bpm: 138, step: 0.5,
    lead: parse(`
      g4 a4 b4 d5  b4 a4 g4 e4  d4 e4 g4 a4  g4 ~ ~ ~
      g4 a4 b4 d5  e5 d5 b4 a4  b4 d5 e5 d5  b4 ~ ~ ~`),
    harm: parse(`
      d4 ~ g4 ~  d4 ~ b3 ~  b3 ~ e4 ~  d4 ~ ~ ~
      d4 ~ g4 ~  g4 ~ d4 ~  g4 ~ b4 ~  g4 ~ ~ ~`),
    bass: parse(`g2 g2 d3 ~  e3 e3 b2 ~  c3 c3 g2 ~  d3 ~ d3 ~`),
    drum: parse(`x - h h o - h - x - h h o - h h`),
  },

  cave: {
    bpm: 92, step: 0.5,
    lead: parse(`
      a3 ~ c4 ~  e4 ~ c4 ~  d4 ~ f4 ~  e4 ~ ~ ~
      a3 ~ c4 ~  g4 ~ e4 ~  f4 ~ e4 ~  d4 ~ ~ ~`),
    harm: parse(`a3 ~ ~ ~  e4 ~ ~ ~  d4 ~ ~ ~  a3 ~ ~ ~`),
    bass: parse(`a2 ~ ~ ~  a2 ~ ~ ~  d3 ~ ~ ~  e2 ~ ~ ~`),
    drum: parse(`x - - - - - h - x - - - o - - -`),
  },

  battle: {
    bpm: 158, step: 0.5,
    lead: parse(`
      a4 a4 c5 a4  e5 ~ d5 c5  b4 ~ c5 d5  e5 ~ ~ ~
      a4 a4 c5 a4  g5 ~ f5 e5  d5 ~ c5 b4  a4 ~ ~ ~`),
    harm: parse(`
      e4 e4 a4 e4  a4 ~ a4 a4  g4 ~ g4 g4  b4 ~ ~ ~
      e4 e4 a4 e4  e5 ~ d5 c5  b4 ~ a4 g4  e4 ~ ~ ~`),
    bass: parse(`a2 a2 a2 a2  f2 f2 f2 f2  g2 g2 g2 g2  e2 e2 e2 e2`),
    drum: parse(`x h o h x h o h x h o h x o o o`),
  },

  trainer: {
    bpm: 168, step: 0.5,
    lead: parse(`
      d5 ~ c5 ~  b4 c5 d5 ~  g4 ~ b4 ~  d5 ~ ~ ~
      e5 ~ d5 ~  c5 d5 e5 ~  a4 ~ c5 ~  e5 ~ ~ ~`),
    harm: parse(`
      b4 ~ a4 ~  g4 a4 b4 ~  d4 ~ g4 ~  b4 ~ ~ ~
      c5 ~ b4 ~  a4 b4 c5 ~  e4 ~ a4 ~  c5 ~ ~ ~`),
    bass: parse(`g2 g2 d3 d3  g2 g2 d3 d3  a2 a2 e3 e3  a2 a2 e3 e3`),
    drum: parse(`x h o h x h o h x h o h x h o o`),
  },

  gym: {
    bpm: 148, step: 0.5,
    lead: parse(`
      c5 ~ b4 c5  e5 ~ ~ ~  d5 ~ c5 d5  f5 ~ ~ ~
      e5 ~ d5 e5  g5 ~ ~ ~  f5 e5 d5 c5  b4 ~ ~ ~`),
    harm: parse(`
      e4 ~ e4 ~  g4 ~ ~ ~  f4 ~ f4 ~  a4 ~ ~ ~
      g4 ~ g4 ~  b4 ~ ~ ~  a4 g4 f4 e4  d4 ~ ~ ~`),
    bass: parse(`c3 c3 c3 c3  c3 c3 c3 c3  f2 f2 f2 f2  g2 g2 g2 g2`),
    drum: parse(`x h x h o h x h x h x h o h o o`),
  },

  center: {
    bpm: 96, step: 0.5,
    lead: parse(`
      f4 ~ a4 ~  c5 ~ a4 ~  g4 ~ b4 ~  d5 ~ ~ ~
      c5 ~ a4 ~  f4 ~ g4 ~  a4 ~ g4 ~  f4 ~ ~ ~`),
    harm: parse(`f4 ~ ~ ~  c4 ~ ~ ~  g4 ~ ~ ~  d4 ~ ~ ~`),
    bass: parse(`f2 ~ c3 ~  f2 ~ c3 ~  g2 ~ d3 ~  g2 ~ d3 ~`),
    drum: parse(`- - h - - - h - - - h - - - h -`),
  },

  victory: {
    bpm: 150, step: 0.5,
    loop: false,
    lead: parse(`c5 c5 c5 c5 ~ g4 ~ a4 c5 ~ a4 ~ c5 ~ ~ ~`),
    harm: parse(`e4 e4 e4 e4 ~ c4 ~ f4 a4 ~ f4 ~ a4 ~ ~ ~`),
    bass: parse(`c3 c3 c3 c3 ~ c3 ~ f2 f2 ~ g2 ~ c3 ~ ~ ~`),
    drum: parse(`x h x h - x - x x - x - x - - -`),
  },
};

// ---- 再生 ----

const LOOKAHEAD_MS = 120;   // どのくらいの間隔で先を見に行くか
const SCHEDULE_SEC = 0.45;  // どのくらい先まで予約しておくか

let current = null;   // { song, name, step, nextTime, index }
let timer = null;
let muted = false;

function voice(ctx, out, freq, t0, dur, type, gain) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.setValueAtTime(gain, t0 + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function drumHit(ctx, out, kind, t0) {
  if (kind === 'x') {
    // キック：低い方へ滑らせた三角波
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
    g.gain.setValueAtTime(0.55, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.16);
    return;
  }
  // スネアとハイハットはノイズ。長さと明るさだけ変える。
  const snare = kind === 'o';
  const dur = snare ? 0.12 : 0.04;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = snare ? 'bandpass' : 'highpass';
  filt.frequency.value = snare ? 1800 : 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(snare ? 0.32 : 0.14, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t0);
}

/** その拍のトークンを鳴らす。'~' は前の音の続きなので何もしない。 */
function playStep(ctx, out, song, i, t0, stepSec) {
  const at = (track) => (track && track.length ? track[i % track.length] : null);

  for (const [name, type, gain] of [['lead', 'square', 0.20], ['harm', 'square', 0.11]]) {
    const tok = at(song[name]);
    const f = freqOf(tok);
    if (f === null) continue;
    // 次の '~' の数だけ音をのばす
    let dur = stepSec;
    const track = song[name];
    for (let k = 1; k < track.length; k++) {
      if (track[(i + k) % track.length] !== '~') break;
      dur += stepSec;
    }
    voice(ctx, out, f, t0, dur * 0.95, type, gain);
  }

  const bf = freqOf(at(song.bass));
  if (bf !== null) voice(ctx, out, bf, t0, stepSec * 0.9, 'triangle', 0.28);

  const dr = at(song.drum);
  if (dr && dr !== '-' && dr !== '~') drumHit(ctx, out, dr, t0);
}

function tick() {
  if (!current) return;
  const bus = audioBus();
  if (!bus || bus.ctx.state === 'suspended') return;   // まだ操作されていない

  const { ctx, out } = bus;
  const song = current.song;
  const stepSec = (60 / song.bpm) * (song.step ?? 0.5);

  if (current.nextTime < ctx.currentTime) current.nextTime = ctx.currentTime + 0.05;

  while (current.nextTime < ctx.currentTime + SCHEDULE_SEC) {
    const len = Math.max(
      song.lead?.length ?? 0, song.harm?.length ?? 0,
      song.bass?.length ?? 0, song.drum?.length ?? 0,
    );
    if (song.loop === false && current.index >= len) { stop(); return; }
    if (!muted) playStep(ctx, out, song, current.index, current.nextTime, stepSec);
    current.index++;
    current.nextTime += stepSec;
  }
}

/**
 * 曲を鳴らす。同じ曲を指定したときは鳴らし直さない
 * （マップを移るたびに頭から鳴ると落ち着かない）。
 */
export function play(name) {
  if (!SONGS[name]) return;
  if (current?.name === name) return;

  const bus = audioBus();
  current = { song: SONGS[name], name, index: 0, nextTime: bus ? bus.ctx.currentTime + 0.05 : 0 };
  if (timer === null) timer = setInterval(tick, LOOKAHEAD_MS);
  tick();
}

export function stop() {
  current = null;
  if (timer !== null) { clearInterval(timer); timer = null; }
}

/** いま鳴っている曲の名前。戻したいときに使う。 */
export const playing = () => current?.name ?? null;

/** 設定でBGMを切ったとき。予約はやめるが、曲の位置は保つ。 */
export function setMuted(v) { muted = v; }
