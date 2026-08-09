// 経験値タイプ。値は「レベル n に到達するのに必要な累計経験値」。

export const MAX_LEVEL = 100;

export const CURVE = {
  fast: (n) => Math.floor((4 * n ** 3) / 5),
  mediumFast: (n) => n ** 3,
  // n<=1 で負になるので clamp が必須。ここを忘れるとレベル1で経験値がマイナスになる。
  mediumSlow: (n) => Math.max(0, Math.floor((6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140)),
  slow: (n) => Math.floor((5 * n ** 3) / 4),
};

export const EXP_TYPE_LABEL = {
  fast: 'はやい', mediumFast: 'ふつう', mediumSlow: 'ややおそい', slow: 'おそい',
};

/** そのレベルに到達するのに必要な累計経験値 */
export function expForLevel(type, level) {
  const f = CURVE[type] ?? CURVE.mediumFast;
  return f(Math.max(1, Math.min(MAX_LEVEL, level)));
}

/** 累計経験値からレベルを求める */
export function levelFromExp(type, exp) {
  let lv = 1;
  while (lv < MAX_LEVEL && exp >= expForLevel(type, lv + 1)) lv++;
  return lv;
}
