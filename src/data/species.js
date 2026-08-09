// 種族データ。id は全国図鑑の番号に合わせてある。
//
// evolution:
//   { method:'level', level:16, to:5 }
//   { method:'stone', item:'かみなりのいし', to:26 }
//   null（進化しない）

import { SPR } from './sprites/monsters.js';

export const SPECIES = {
  1: {
    name: 'フシギダネ', types: ['くさ', 'どく'],
    base: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'なきごえ' },
      { lv: 7, move: 'つるのムチ' }, { lv: 10, move: 'どくばり' },
      { lv: 13, move: 'ねむりごな' }, { lv: 15, move: 'すいとる' },
      { lv: 20, move: 'はっぱカッター' }, { lv: 25, move: 'どくのこな' },
      { lv: 28, move: 'のしかかり' },
    ],
    evolution: { method: 'level', level: 16, to: 2 },
    catchRate: 45, baseExp: 64, expType: 'mediumSlow', sprite: SPR.fushigidane,
    height: 0.7, weight: 6.9,
    dex: 'うまれたときから せなかに ふしぎな タネが うえてあって からだと ともに そだつという。',
  },
  2: {
    name: 'フシギソウ', types: ['くさ', 'どく'],
    base: { hp: 60, atk: 62, def: 63, spa: 80, spd: 80, spe: 60 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'つるのムチ' },
      { lv: 13, move: 'ねむりごな' }, { lv: 15, move: 'すいとる' },
      { lv: 22, move: 'はっぱカッター' }, { lv: 26, move: 'タネマシンガン' },
      { lv: 30, move: 'のしかかり' },
    ],
    evolution: { method: 'level', level: 32, to: 3 },
    catchRate: 45, baseExp: 142, expType: 'mediumSlow', sprite: SPR.fushigisou,
    height: 1.0, weight: 13.0,
    dex: 'つぼみを せなかに かかえて あるく。えいようを とられるので あしごしが つよくなる。',
  },
  3: {
    name: 'フシギバナ', types: ['くさ', 'どく'],
    base: { hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80 },
    learnset: [
      { lv: 1, move: 'つるのムチ' }, { lv: 1, move: 'はっぱカッター' },
      { lv: 32, move: 'ねむりごな' }, { lv: 36, move: 'こうごうせい' },
      { lv: 40, move: 'タネマシンガン' }, { lv: 50, move: 'はかいこうせん' },
    ],
    evolution: null,
    catchRate: 45, baseExp: 236, expType: 'mediumSlow', sprite: SPR.fushigibana,
    height: 2.0, weight: 100.0,
    dex: 'せなかの はなから あまい かおりが ただよう。かおりは たたかう ものの きもちを やわらげる。',
  },

  4: {
    name: 'ヒトカゲ', types: ['ほのお'],
    base: { hp: 39, atk: 52, def: 43, spa: 60, spd: 50, spe: 65 },
    learnset: [
      { lv: 1, move: 'ひっかく' }, { lv: 1, move: 'なきごえ' },
      { lv: 7, move: 'ひのこ' }, { lv: 10, move: 'えんまく' },
      { lv: 16, move: 'りゅうのいかり' }, { lv: 21, move: 'メタルクロー' },
      { lv: 28, move: 'かえんほうしゃ' },
    ],
    evolution: { method: 'level', level: 16, to: 5 },
    catchRate: 45, baseExp: 62, expType: 'mediumSlow', sprite: SPR.hitokage,
    height: 0.6, weight: 8.5,
    dex: 'うまれたときから しっぽに ほのおが ともっている。ほのおが きえたとき その いのちは おわる。',
  },
  5: {
    name: 'リザード', types: ['ほのお'],
    base: { hp: 58, atk: 64, def: 58, spa: 80, spd: 65, spe: 80 },
    learnset: [
      { lv: 1, move: 'ひっかく' }, { lv: 1, move: 'ひのこ' },
      { lv: 19, move: 'りゅうのいかり' }, { lv: 24, move: 'メタルクロー' },
      { lv: 32, move: 'かえんほうしゃ' },
    ],
    evolution: { method: 'level', level: 36, to: 6 },
    catchRate: 45, baseExp: 142, expType: 'mediumSlow', sprite: SPR.rizaado,
    height: 1.1, weight: 19.0,
    dex: 'しっぽを ふりまわし するどい つめで あいてを ひきさく。きょうぼうな せいかく。',
  },
  6: {
    name: 'リザードン', types: ['ほのお', 'ひこう'],
    base: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    learnset: [
      { lv: 1, move: 'ひっかく' }, { lv: 1, move: 'かえんほうしゃ' },
      { lv: 36, move: 'かぜおこし' }, { lv: 46, move: 'りゅうのいかり' },
      { lv: 54, move: 'はかいこうせん' },
    ],
    evolution: null,
    catchRate: 45, baseExp: 240, expType: 'mediumSlow', sprite: SPR.rizaadon,
    height: 1.7, weight: 90.5,
    dex: 'そらを とびまわり つよい あいてを さがしている。ほのおは あらゆる ものを とかす。',
  },

  7: {
    name: 'ゼニガメ', types: ['みず'],
    base: { hp: 44, atk: 48, def: 65, spa: 50, spd: 64, spe: 43 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'しっぽをふる' },
      { lv: 7, move: 'あわ' }, { lv: 10, move: 'かたくなる' },
      { lv: 13, move: 'みずでっぽう' }, { lv: 22, move: 'かみつく' },
      { lv: 28, move: 'こおりのつぶて' },
    ],
    evolution: { method: 'level', level: 16, to: 8 },
    catchRate: 45, baseExp: 63, expType: 'mediumSlow', sprite: SPR.zenigame,
    height: 0.5, weight: 9.0,
    dex: 'こうらに とじこもって みを まもる。すきを みて はんげきの みずを はっしゃする。',
  },
  8: {
    name: 'カメール', types: ['みず'],
    base: { hp: 59, atk: 63, def: 80, spa: 65, spd: 80, spe: 58 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'みずでっぽう' },
      { lv: 13, move: 'かたくなる' }, { lv: 24, move: 'かみつく' },
      { lv: 28, move: 'なみのり' }, { lv: 31, move: 'こおりのつぶて' },
    ],
    evolution: { method: 'level', level: 36, to: 9 },
    catchRate: 45, baseExp: 142, expType: 'mediumSlow', sprite: SPR.kameeru,
    height: 1.0, weight: 22.5,
    dex: 'ふさふさの しっぽは ながいきの しるし。おいかけっこが とても はやい。',
  },
  9: {
    name: 'カメックス', types: ['みず'],
    base: { hp: 79, atk: 83, def: 100, spa: 85, spd: 105, spe: 78 },
    learnset: [
      { lv: 1, move: 'みずでっぽう' }, { lv: 1, move: 'かみつく' },
      { lv: 28, move: 'なみのり' }, { lv: 36, move: 'こおりのつぶて' },
      { lv: 42, move: 'ハイドロポンプ' },
      { lv: 52, move: 'はかいこうせん' },
    ],
    evolution: null,
    catchRate: 45, baseExp: 239, expType: 'mediumSlow', sprite: SPR.kamekkusu,
    height: 1.6, weight: 85.5,
    dex: 'こうらの ほうすいこうから ひとを ふきとばす いきおいの みずを はっしゃする。',
  },

  10: {
    name: 'ポッポ', types: ['ノーマル', 'ひこう'],
    base: { hp: 40, atk: 45, def: 40, spa: 35, spd: 35, spe: 56 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 5, move: 'すなかけ' },
      { lv: 9, move: 'かぜおこし' }, { lv: 13, move: 'でんこうせっか' },
      { lv: 19, move: 'つつく' }, { lv: 25, move: 'のしかかり' },
    ],
    evolution: { method: 'level', level: 18, to: 11 },
    catchRate: 255, baseExp: 50, expType: 'mediumSlow', sprite: SPR.poppo,
    height: 0.3, weight: 1.8,
    dex: 'おとなしくて めったに あらそわない。おどろくと すなを まきあげて みを まもる。',
  },
  11: {
    name: 'ピジョン', types: ['ノーマル', 'ひこう'],
    base: { hp: 63, atk: 60, def: 55, spa: 50, spd: 50, spe: 71 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'かぜおこし' },
      { lv: 22, move: 'つつく' }, { lv: 29, move: 'でんこうせっか' },
      { lv: 38, move: 'のしかかり' },
    ],
    evolution: null,
    catchRate: 120, baseExp: 122, expType: 'mediumSlow', sprite: SPR.pijon,
    height: 1.1, weight: 30.0,
    dex: 'ひろい なわばりを もち まいにち くまなく とびまわって みまわりを する。',
  },

  12: {
    name: 'コラッタ', types: ['ノーマル'],
    base: { hp: 30, atk: 56, def: 35, spa: 25, spd: 35, spe: 72 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'しっぽをふる' },
      { lv: 7, move: 'でんこうせっか' }, { lv: 13, move: 'かみつく' },
      { lv: 20, move: 'のしかかり' },
    ],
    evolution: { method: 'level', level: 20, to: 13 },
    catchRate: 255, baseExp: 51, expType: 'mediumFast', sprite: SPR.koratta,
    height: 0.3, weight: 3.5,
    dex: 'まえばが じょうぶで かたい きも かじる。どこにでも すみつく たくましさ。',
  },
  13: {
    name: 'ラッタ', types: ['ノーマル'],
    base: { hp: 55, atk: 81, def: 60, spa: 50, spd: 70, spe: 97 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'でんこうせっか' },
      { lv: 24, move: 'かみつく' }, { lv: 30, move: 'からてチョップ' },
      { lv: 34, move: 'のしかかり' }, { lv: 44, move: 'はかいこうせん' },
    ],
    evolution: null,
    catchRate: 127, baseExp: 145, expType: 'mediumFast', sprite: SPR.ratta,
    height: 0.7, weight: 18.5,
    dex: 'みずかきの ついた あしで かわを およぎわたる。まえばは いっしょう のびつづける。',
  },

  14: {
    name: 'キャタピー', types: ['むし'],
    base: { hp: 45, atk: 30, def: 35, spa: 20, spd: 20, spe: 45 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'えんまく' },
      { lv: 5, move: 'れんぞくぎり' },
    ],
    evolution: { method: 'level', level: 7, to: 15 },
    catchRate: 255, baseExp: 39, expType: 'mediumFast', sprite: SPR.kyatapii,
    height: 0.3, weight: 2.9,
    dex: 'あたまの しょっかくから すごい においを だして てきを おいはらう。',
  },
  15: {
    name: 'トランセル', types: ['むし'],
    base: { hp: 50, atk: 20, def: 55, spa: 25, spd: 25, spe: 30 },
    learnset: [
      { lv: 1, move: 'かたくなる' }, { lv: 1, move: 'たいあたり' },
    ],
    evolution: { method: 'level', level: 10, to: 16 },
    catchRate: 120, baseExp: 72, expType: 'mediumFast', sprite: SPR.toranseru,
    height: 0.7, weight: 9.9,
    dex: 'からを かたくして しんかの ときを まつ。なかみは やわらかく むりょくだ。',
  },
  16: {
    name: 'バタフリー', types: ['むし', 'ひこう'],
    base: { hp: 60, atk: 45, def: 50, spa: 90, spd: 80, spe: 70 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 10, move: 'ねんりき' },
      { lv: 13, move: 'どくのこな' }, { lv: 15, move: 'ねむりごな' },
      { lv: 18, move: 'かぜおこし' }, { lv: 22, move: 'あやしいひかり' },
      { lv: 26, move: 'むしくい' }, { lv: 32, move: 'ようせいのかぜ' },
    ],
    evolution: null,
    catchRate: 45, baseExp: 178, expType: 'mediumFast', sprite: SPR.batafurii,
    height: 1.1, weight: 32.0,
    dex: 'はねの りんぷんは みずを はじく。あめの ひでも とびまわれる。',
  },

  17: {
    name: 'ピカチュウ', types: ['でんき'],
    base: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
    learnset: [
      { lv: 1, move: 'でんきショック' }, { lv: 1, move: 'なきごえ' },
      { lv: 6, move: 'しっぽをふる' }, { lv: 9, move: 'でんこうせっか' },
      { lv: 13, move: 'でんじは' }, { lv: 20, move: 'したでなめる' },
      { lv: 23, move: 'あやしいひかり' }, { lv: 26, move: '10まんボルト' },
    ],
    evolution: { method: 'stone', item: 'かみなりのいし', to: 26 },
    catchRate: 190, baseExp: 112, expType: 'mediumFast', sprite: SPR.pikachuu,
    height: 0.4, weight: 6.0,
    dex: 'ほっぺの りょうがわに ちいさい でんきぶくろを もつ。ピリピリと でんきを ためている。',
  },
  26: {
    name: 'ライチュウ', types: ['でんき'],
    base: { hp: 60, atk: 90, def: 55, spa: 90, spd: 80, spe: 110 },
    learnset: [
      { lv: 1, move: '10まんボルト' }, { lv: 1, move: 'でんこうせっか' },
      { lv: 1, move: 'でんじは' }, { lv: 1, move: 'したでなめる' },
    ],
    evolution: null,
    catchRate: 75, baseExp: 218, expType: 'mediumFast', sprite: SPR.raichuu,
    height: 0.8, weight: 30.0,
    dex: 'ためこんだ でんきの りょうで しっぽが ひかる。ときどき たいちに ながして ほうでんする。',
  },

  129: {
    name: 'コイキング', types: ['みず'],
    base: { hp: 20, atk: 10, def: 55, spa: 15, spd: 20, spe: 80 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 15, move: 'しっぽをふる' },
      { lv: 25, move: 'かみつく' },
    ],
    evolution: { method: 'level', level: 20, to: 130 },
    catchRate: 255, baseExp: 40, expType: 'slow', sprite: SPR.koikingu,
    height: 0.9, weight: 10.0,
    dex: 'ちからも スピードも たいしたことは ない。せかいで いちばん よわくて なさけない ポケモン。',
  },
  130: {
    name: 'ギャラドス', types: ['みず', 'ひこう'],
    base: { hp: 95, atk: 125, def: 79, spa: 60, spd: 100, spe: 81 },
    learnset: [
      { lv: 1, move: 'かみつく' }, { lv: 1, move: 'しっぽをふる' },
      { lv: 21, move: 'なみのり' },
      { lv: 25, move: 'りゅうのいかり' }, { lv: 28, move: 'いわおとし' },
      { lv: 32, move: 'ハイドロポンプ' }, { lv: 41, move: 'じしん' },
      { lv: 52, move: 'はかいこうせん' },
    ],
    evolution: null,
    catchRate: 45, baseExp: 189, expType: 'slow', sprite: SPR.gyaradosu,
    height: 6.5, weight: 235.0,
    dex: 'せいしつは きわめて きょうぼう。ひとたび あばれだすと まちを やきつくすまで おさまらない。',
  },
};

// id / 名前引きは自動で埋める（データ側で二重に持たない）
for (const [id, s] of Object.entries(SPECIES)) {
  s.id = Number(id);
  s.evolution ??= null;
}

export const speciesList = Object.values(SPECIES);
export const byName = Object.fromEntries(speciesList.map((s) => [s.name, s]));
export const getSpecies = (id) => SPECIES[id] ?? null;

/** そのレベルまでに覚える技のうち、後ろから4つ（野生個体の技構成） */
export function movesAtLevel(species, level) {
  const learned = species.learnset.filter((e) => e.lv <= level).map((e) => e.move);
  return learned.slice(-4);
}
