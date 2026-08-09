// シード付き乱数（mulberry32）。
// 状態が 32bit 整数ひとつなので、そのままセーブに入れて再現できる。

export function mulberry32(seed) {
  let s = seed >>> 0;

  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /** 0以上1未満 */
    next,
    /** min以上max以下の整数 */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** 確率 p (0..1) で true */
    chance: (p) => next() < p,
    /** 配列からひとつ */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /**
     * weight 付きの配列からひとつ。
     * 要素は { weight: number, ... } の形。weight 省略時は 1 扱い。
     */
    weighted(arr) {
      let total = 0;
      for (const e of arr) total += e.weight ?? 1;
      let r = next() * total;
      for (const e of arr) {
        r -= e.weight ?? 1;
        if (r < 0) return e;
      }
      return arr[arr.length - 1];
    },
    get seed() { return s; },
    set seed(v) { s = v >>> 0; },
  };
}

/** ゲーム全体で使う共有の乱数器。セーブ／ロード時に seed を差し替える。 */
export const rng = mulberry32((Math.random() * 0xFFFFFFFF) >>> 0);
