// れんせんタワー（Phase Z-4）。
// レベルを50にそろえた10連戦。既存のトレーナー戦の仕組み(trainerBattle)をそのまま使う。

export const TOWER_LEVEL = 50;

// prize:0 にしてある。連戦で賞金が積み上がると経済が壊れるので、ここでは稼がせない。
export const TOWER_TRAINERS = [
  { class: 'タワーずかい', name: 'イチ', sprite: 'youngster', skill: 3, prize: 0, party: [{ id: 3, lv: TOWER_LEVEL }] },
  { class: 'タワーずかい', name: 'ニナ', sprite: 'lass', skill: 3, prize: 0, party: [{ id: 6, lv: TOWER_LEVEL }] },
  { class: 'タワーずかい', name: 'サブロウ', sprite: 'boy', skill: 3, prize: 0, party: [{ id: 9, lv: TOWER_LEVEL }] },
  { class: 'タワーずかい', name: 'ヨンコ', sprite: 'girl', skill: 3, prize: 0, party: [{ id: 26, lv: TOWER_LEVEL }] },
  { class: 'タワーずかい', name: 'ゴロウ', sprite: 'boy', skill: 3, prize: 0, party: [{ id: 76, lv: TOWER_LEVEL }] },
  { class: 'タワーずかい', name: 'ロッカ', sprite: 'lass', skill: 3, prize: 0, party: [{ id: 130, lv: TOWER_LEVEL }] },
  { class: 'タワーずかい', name: 'ナナ', sprite: 'girl', skill: 3, prize: 0, party: [{ id: 68, lv: TOWER_LEVEL }] },
  { class: 'タワーずかい', name: 'ハチロウ', sprite: 'boy', skill: 3, prize: 0, party: [{ id: 282, lv: TOWER_LEVEL }] },
  { class: 'タワーずかい', name: 'クノイチ', sprite: 'girl', skill: 3, prize: 0, party: [{ id: 609, lv: TOWER_LEVEL }] },
  { class: 'タワーずかい', name: 'トウヤ', sprite: 'youngster', skill: 3, prize: 0, party: [{ id: 635, lv: TOWER_LEVEL }] },
];
