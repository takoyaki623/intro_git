// 種族データ。id は全国図鑑の番号に合わせてある。
//
// evolution:
//   { method:'level', level:16, to:5 }
//   { method:'stone', item:'かみなりのいし', to:26 }
//   null（進化しない）

import { SPR } from './sprites/monsters.js';
import { placeholderSprite } from '../engine/pixelArt.js';

// 他世代の追加種族(26体)。実スプライトが未作画のあいだは
// placeholderSprite() で id から決定論的なシルエットを生成する。
// 見た目を後から差し替えるだけで済むよう、種族データ自体は先に確定させる。

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
    tm: ['のしかかり', 'はっぱカッター', 'ねんりき', 'こうごうせい'],
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
    tm: ['のしかかり', 'はっぱカッター', 'ねんりき', 'こうごうせい'],
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
    tm: ['のしかかり', 'はっぱカッター', 'ねんりき', 'こうごうせい'],
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
    tm: ['のしかかり', 'かえんほうしゃ', 'かみつく'],
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
    tm: ['のしかかり', 'かえんほうしゃ', 'かみつく'],
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
    tm: ['のしかかり', 'かえんほうしゃ', 'かみつく'],
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
    tm: ['のしかかり', 'なみのり', 'かみつく'],
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
    tm: ['のしかかり', 'なみのり', 'かみつく'],
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
    tm: ['のしかかり', 'なみのり', 'かみつく'],
    evolution: null,
    catchRate: 45, baseExp: 239, expType: 'mediumSlow', sprite: SPR.kamekkusu,
    height: 1.6, weight: 85.5,
    dex: 'こうらの ほうすいこうから ひとを ふきとばす いきおいの みずを はっしゃする。',
  },

  10: {
    name: 'キャタピー', types: ['むし'],
    base: { hp: 45, atk: 30, def: 35, spa: 20, spd: 20, spe: 45 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'えんまく' },
      { lv: 5, move: 'れんぞくぎり' },
    ],
    tm: [],
    evolution: { method: 'level', level: 7, to: 11 },
    catchRate: 255, baseExp: 39, expType: 'mediumFast', sprite: SPR.kyatapii,
    height: 0.3, weight: 2.9,
    dex: 'あたまの しょっかくから すごい においを だして てきを おいはらう。',
  },
  11: {
    name: 'トランセル', types: ['むし'],
    base: { hp: 50, atk: 20, def: 55, spa: 25, spd: 25, spe: 30 },
    learnset: [
      { lv: 1, move: 'かたくなる' }, { lv: 1, move: 'たいあたり' },
    ],
    tm: [],
    evolution: { method: 'level', level: 10, to: 12 },
    catchRate: 120, baseExp: 72, expType: 'mediumFast', sprite: SPR.toranseru,
    height: 0.7, weight: 9.9,
    dex: 'からを かたくして しんかの ときを まつ。なかみは やわらかく むりょくだ。',
  },
  12: {
    name: 'バタフリー', types: ['むし', 'ひこう'],
    base: { hp: 60, atk: 45, def: 50, spa: 90, spd: 80, spe: 70 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 10, move: 'ねんりき' },
      { lv: 13, move: 'どくのこな' }, { lv: 15, move: 'ねむりごな' },
      { lv: 18, move: 'かぜおこし' }, { lv: 22, move: 'あやしいひかり' },
      { lv: 26, move: 'むしくい' }, { lv: 32, move: 'ようせいのかぜ' },
    ],
    tm: ['のしかかり', 'ねんりき', 'こうごうせい'],
    evolution: null,
    catchRate: 45, baseExp: 178, expType: 'mediumFast', sprite: SPR.batafurii,
    height: 1.1, weight: 32.0,
    dex: 'はねの りんぷんは みずを はじく。あめの ひでも とびまわれる。',
  },

  16: {
    name: 'ポッポ', types: ['ノーマル', 'ひこう'],
    base: { hp: 40, atk: 45, def: 40, spa: 35, spd: 35, spe: 56 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 5, move: 'すなかけ' },
      { lv: 9, move: 'かぜおこし' }, { lv: 13, move: 'でんこうせっか' },
      { lv: 19, move: 'つつく' }, { lv: 25, move: 'のしかかり' },
    ],
    tm: ['のしかかり', 'ねんりき'],
    evolution: { method: 'level', level: 18, to: 17 },
    catchRate: 255, baseExp: 50, expType: 'mediumSlow', sprite: SPR.poppo,
    height: 0.3, weight: 1.8,
    dex: 'おとなしくて めったに あらそわない。おどろくと すなを まきあげて みを まもる。',
  },
  17: {
    name: 'ピジョン', types: ['ノーマル', 'ひこう'],
    base: { hp: 63, atk: 60, def: 55, spa: 50, spd: 50, spe: 71 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'かぜおこし' },
      { lv: 22, move: 'つつく' }, { lv: 29, move: 'でんこうせっか' },
      { lv: 38, move: 'のしかかり' },
    ],
    tm: ['のしかかり', 'ねんりき'],
    evolution: null,
    catchRate: 120, baseExp: 122, expType: 'mediumSlow', sprite: SPR.pijon,
    height: 1.1, weight: 30.0,
    dex: 'ひろい なわばりを もち まいにち くまなく とびまわって みまわりを する。',
  },

  19: {
    name: 'コラッタ', types: ['ノーマル'],
    base: { hp: 30, atk: 56, def: 35, spa: 25, spd: 35, spe: 72 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'しっぽをふる' },
      { lv: 7, move: 'でんこうせっか' }, { lv: 13, move: 'かみつく' },
      { lv: 20, move: 'のしかかり' },
    ],
    tm: ['のしかかり', 'かみつく'],
    evolution: { method: 'level', level: 20, to: 20 },
    catchRate: 255, baseExp: 51, expType: 'mediumFast', sprite: SPR.koratta,
    height: 0.3, weight: 3.5,
    dex: 'まえばが じょうぶで かたい きも かじる。どこにでも すみつく たくましさ。',
  },
  20: {
    name: 'ラッタ', types: ['ノーマル'],
    base: { hp: 55, atk: 81, def: 60, spa: 50, spd: 70, spe: 97 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'でんこうせっか' },
      { lv: 24, move: 'かみつく' }, { lv: 30, move: 'からてチョップ' },
      { lv: 34, move: 'のしかかり' }, { lv: 44, move: 'はかいこうせん' },
    ],
    tm: ['のしかかり', 'かみつく'],
    evolution: null,
    catchRate: 127, baseExp: 145, expType: 'mediumFast', sprite: SPR.ratta,
    height: 0.7, weight: 18.5,
    dex: 'みずかきの ついた あしで かわを およぎわたる。まえばは いっしょう のびつづける。',
  },

  25: {
    name: 'ピカチュウ', types: ['でんき'],
    base: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
    learnset: [
      { lv: 1, move: 'でんきショック' }, { lv: 1, move: 'なきごえ' },
      { lv: 6, move: 'しっぽをふる' }, { lv: 9, move: 'でんこうせっか' },
      { lv: 13, move: 'でんじは' }, { lv: 20, move: 'したでなめる' },
      { lv: 23, move: 'あやしいひかり' }, { lv: 26, move: '10まんボルト' },
    ],
    tm: ['のしかかり', '10まんボルト', 'ねんりき'],
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
    tm: ['のしかかり', '10まんボルト', 'ねんりき', 'なみのり'],
    evolution: null,
    catchRate: 75, baseExp: 218, expType: 'mediumFast', sprite: SPR.raichuu,
    height: 0.8, weight: 30.0,
    dex: 'ためこんだ でんきの りょうで しっぽが ひかる。ときどき たいちに ながして ほうでんする。',
  },

  // ---------- どうくつ ----------
  41: {
    name: 'ズバット', types: ['どく', 'ひこう'],
    base: { hp: 40, atk: 45, def: 35, spa: 30, spd: 40, spe: 55 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 5, move: 'えんまく' },
      { lv: 9, move: 'すいとる' }, { lv: 13, move: 'あやしいひかり' },
      { lv: 17, move: 'かぜおこし' }, { lv: 21, move: 'かみつく' },
      { lv: 27, move: 'どくのこな' },
    ],
    tm: ['のしかかり', 'かみつく'],
    evolution: { method: 'level', level: 22, to: 42 },
    catchRate: 255, baseExp: 49, expType: 'mediumFast', sprite: SPR.zubatto,
    height: 0.8, weight: 7.5,
    dex: 'めが たいかしていて まわりが みえない。ちょうおんぱで あいてを さぐる。',
  },
  42: {
    name: 'ゴルバット', types: ['どく', 'ひこう'],
    base: { hp: 75, atk: 80, def: 70, spa: 65, spd: 75, spe: 90 },
    learnset: [
      { lv: 1, move: 'かみつく' }, { lv: 1, move: 'すいとる' },
      { lv: 1, move: 'あやしいひかり' }, { lv: 30, move: 'かぜおこし' },
      { lv: 38, move: 'のしかかり' },
    ],
    tm: ['のしかかり', 'かみつく', 'ねんりき'],
    evolution: null,
    catchRate: 90, baseExp: 159, expType: 'mediumFast', sprite: SPR.gorubatto,
    height: 1.6, weight: 55.0,
    dex: 'あいての ちを すいすぎて とべなくなることが ある。おおきな くちが とくちょう。',
  },

  // ---------- みずべ ----------
  54: {
    name: 'コダック', types: ['みず'],
    base: { hp: 50, atk: 52, def: 48, spa: 65, spd: 50, spe: 55 },
    learnset: [
      { lv: 1, move: 'ひっかく' }, { lv: 5, move: 'しっぽをふる' },
      { lv: 10, move: 'みずでっぽう' }, { lv: 16, move: 'あやしいひかり' },
      { lv: 23, move: 'ねんりき' }, { lv: 31, move: 'なみのり' },
    ],
    tm: ['のしかかり', 'なみのり', 'ねんりき'],
    evolution: null,
    catchRate: 190, baseExp: 64, expType: 'mediumFast', sprite: SPR.kodakku,
    height: 0.8, weight: 19.6,
    dex: 'いつも ずつうに なやんでいる。あたまが いたむほど ふしぎな ちからが つよくなる。',
  },

  // ---------- いわ ----------
  74: {
    name: 'イシツブテ', types: ['いわ', 'じめん'],
    base: { hp: 40, atk: 80, def: 100, spa: 30, spd: 30, spe: 20 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'かたくなる' },
      { lv: 11, move: 'いわおとし' }, { lv: 16, move: 'すなかけ' },
      { lv: 26, move: 'じしん' },
    ],
    tm: ['のしかかり'],
    evolution: { method: 'level', level: 25, to: 75 },
    catchRate: 255, baseExp: 60, expType: 'mediumSlow', sprite: SPR.ishitsubute,
    height: 0.4, weight: 20.0,
    dex: 'やまみちに ころがっている。いわと みわけが つかず ふんづけて しまうことも。',
  },
  75: {
    name: 'ゴローン', types: ['いわ', 'じめん'],
    base: { hp: 55, atk: 95, def: 115, spa: 45, spd: 45, spe: 35 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'いわおとし' },
      { lv: 1, move: 'かたくなる' }, { lv: 29, move: 'じしん' },
      { lv: 36, move: 'のしかかり' },
    ],
    tm: ['のしかかり'],
    evolution: null,
    catchRate: 120, baseExp: 137, expType: 'mediumSlow', sprite: SPR.goroon,
    height: 1.0, weight: 105.0,
    dex: 'やまを ころがりおりて すすむ。とちゅうで きが あっても きにせず たおしていく。',
  },

  129: {
    name: 'コイキング', types: ['みず'],
    base: { hp: 20, atk: 10, def: 55, spa: 15, spd: 20, spe: 80 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 15, move: 'しっぽをふる' },
      { lv: 25, move: 'かみつく' },
    ],
    tm: [],
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
    tm: ['のしかかり', 'なみのり', 'かみつく', '10まんボルト'],
    evolution: null,
    catchRate: 45, baseExp: 189, expType: 'slow', sprite: SPR.gyaradosu,
    height: 6.5, weight: 235.0,
    dex: 'せいしつは きわめて きょうぼう。ひとたび あばれだすと まちを やきつくすまで おさまらない。',
  },

  // ========== ここから 他世代の追加種族(26体) ==========
  // カントーの序盤だけでは 18タイプのうち10タイプぶんしか埋まらない
  // （こおり・かくとう・エスパー・ゴースト・ドラゴン・あく・はがね・フェアリー が空白）。
  // 2〜9世代からここを埋め、同時に色々な世代が出るようにする。

  // ---------- 御三家（みず・3世代） ----------
  258: {
    name: 'ミズゴロウ', types: ['みず'], gen: 3,
    base: { hp: 50, atk: 70, def: 50, spa: 50, spd: 50, spe: 40 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'なきごえ' },
      { lv: 9, move: 'みずでっぽう' }, { lv: 15, move: 'すなかけ' },
    ],
    tm: ['のしかかり', 'なみのり'],
    evolution: { method: 'level', level: 16, to: 259 },
    catchRate: 45, baseExp: 62, expType: 'mediumSlow', sprite: placeholderSprite(258, '#3878c8'),
    height: 0.4, weight: 7.6,
    dex: 'あしうらの ひれで じめんを たたき しんどうで てきを けんちする。',
  },
  259: {
    name: 'ヌマクロー', types: ['みず', 'じめん'], gen: 3,
    base: { hp: 70, atk: 85, def: 70, spa: 60, spd: 70, spe: 50 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'みずでっぽう' },
      { lv: 20, move: 'すなかけ' }, { lv: 28, move: 'あなをほる' },
    ],
    tm: ['のしかかり', 'なみのり'],
    evolution: { method: 'level', level: 36, to: 260 },
    catchRate: 45, baseExp: 138, expType: 'mediumSlow', sprite: placeholderSprite(259, '#3060a8'),
    height: 0.7, weight: 28.0,
    dex: 'うしろあしで たつことも できる。おかでも すばやく うごきまわれる。',
  },
  260: {
    name: 'ラグラージ', types: ['みず', 'じめん'], gen: 3,
    base: { hp: 100, atk: 110, def: 90, spa: 85, spd: 90, spe: 60 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'なみのり' },
      { lv: 20, move: 'じしん' }, { lv: 32, move: 'ハイドロポンプ' },
    ],
    tm: ['のしかかり', 'なみのり', 'かみつく'],
    evolution: null,
    catchRate: 45, baseExp: 241, expType: 'mediumSlow', sprite: placeholderSprite(260, '#204878'),
    height: 1.4, weight: 81.9,
    dex: 'とても ちからもちで おおきな いわを おしのけて みちを つくる。',
  },

  // ---------- 御三家（くさ・7世代） ----------
  722: {
    name: 'モクロー', types: ['くさ', 'ひこう'], gen: 7,
    base: { hp: 40, atk: 50, def: 40, spa: 55, spd: 50, spe: 70 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'すなかけ' },
      { lv: 9, move: 'つるのムチ' }, { lv: 15, move: 'かぜおこし' },
    ],
    tm: ['のしかかり', 'はっぱカッター'],
    evolution: { method: 'level', level: 17, to: 723 },
    catchRate: 45, baseExp: 64, expType: 'mediumSlow', sprite: placeholderSprite(722, '#5a3820'),
    height: 0.3, weight: 1.5,
    dex: 'よるの もりを おとも たてずに とぶ。まだ うまく とべない ひよっこ。',
  },
  723: {
    name: 'フクスロー', types: ['くさ', 'ひこう'], gen: 7,
    base: { hp: 55, atk: 65, def: 55, spa: 70, spd: 65, spe: 85 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'つるのムチ' },
      { lv: 20, move: 'かぜおこし' }, { lv: 28, move: 'はっぱカッター' },
    ],
    tm: ['のしかかり', 'はっぱカッター', 'ねんりき'],
    evolution: { method: 'level', level: 34, to: 724 },
    catchRate: 45, baseExp: 147, expType: 'mediumSlow', sprite: placeholderSprite(723, '#6a4828'),
    height: 0.7, weight: 16.0,
    dex: 'はねを ナイフのように するどく とがらせて てきに たたきつける。',
  },
  724: {
    name: 'ジュナイパー', types: ['くさ', 'ゴースト'], gen: 7,
    base: { hp: 78, atk: 100, def: 75, spa: 95, spd: 95, spe: 95 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'はっぱカッター' },
      { lv: 20, move: 'あやしいひかり' }, { lv: 34, move: 'シャドーボール' },
    ],
    tm: ['のしかかり', 'はっぱカッター', 'ねんりき', 'こうごうせい'],
    evolution: null,
    catchRate: 45, baseExp: 239, expType: 'mediumSlow', sprite: placeholderSprite(724, '#2a2018'),
    height: 1.6, weight: 36.6,
    dex: 'はねを つばさから やに かえて ゆみのように あやつり こうげきする。',
  },

  // ---------- エスパー・フェアリー（3世代） ----------
  280: {
    name: 'ラルトス', types: ['エスパー', 'フェアリー'], gen: 3,
    base: { hp: 28, atk: 25, def: 25, spa: 45, spd: 35, spe: 40 },
    learnset: [
      { lv: 1, move: 'ねんりき' }, { lv: 1, move: 'あやしいひかり' },
      { lv: 12, move: 'ようせいのかぜ' },
    ],
    tm: ['ねんりき'],
    evolution: { method: 'level', level: 20, to: 281 },
    catchRate: 235, baseExp: 40, expType: 'mediumSlow', sprite: placeholderSprite(280, '#e8a8d8'),
    height: 0.4, weight: 6.6,
    dex: 'ひとの きもちを かんじとる。うれしいときは からだが ほんのり あたたかくなる。',
  },
  281: {
    name: 'キルリア', types: ['エスパー', 'フェアリー'], gen: 3,
    base: { hp: 38, atk: 35, def: 35, spa: 65, spd: 55, spe: 50 },
    learnset: [
      { lv: 1, move: 'ねんりき' }, { lv: 1, move: 'ようせいのかぜ' },
      { lv: 24, move: 'さいみんじゅつ' }, { lv: 30, move: 'サイコキネシス' },
    ],
    tm: ['ねんりき'],
    evolution: null,
    catchRate: 120, baseExp: 97, expType: 'mediumSlow', sprite: placeholderSprite(281, '#d888c0'),
    height: 0.7, weight: 20.2,
    dex: 'ちからが つよくなるほど うつくしく みを よじって おどるようになる。',
  },

  // ---------- かくとう・はがね（4世代） ----------
  447: {
    name: 'リオル', types: ['かくとう'], gen: 4,
    base: { hp: 40, atk: 70, def: 40, spa: 35, spd: 40, spe: 60 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'からてチョップ' },
      { lv: 16, move: 'ねんりき' },
    ],
    tm: [],
    evolution: { method: 'level', level: 30, to: 448 },
    catchRate: 75, baseExp: 70, expType: 'mediumSlow', sprite: placeholderSprite(447, '#2858a8'),
    height: 0.7, weight: 20.2,
    dex: 'はどうを あやつり なかまと こうしんする。すんだ みずと きれいな くうきを このむ。',
  },
  448: {
    name: 'ルカリオ', types: ['かくとう', 'はがね'], gen: 4,
    base: { hp: 70, atk: 110, def: 70, spa: 85, spd: 70, spe: 95 },
    learnset: [
      { lv: 1, move: 'からてチョップ' }, { lv: 1, move: 'ねんりき' },
      { lv: 20, move: 'メタルクロー' }, { lv: 35, move: 'インファイト' },
    ],
    tm: ['ねんりき'],
    evolution: null,
    catchRate: 45, baseExp: 184, expType: 'mediumSlow', sprite: placeholderSprite(448, '#1848a0'),
    height: 1.2, weight: 54.0,
    dex: 'はどうを よむちからで あいての うごきを よちする。おつきみやまの おくに すむという。',
  },

  // ---------- あく・ドラゴン（5世代） ----------
  633: {
    name: 'モノズ', types: ['あく', 'ドラゴン'], gen: 5,
    base: { hp: 52, atk: 65, def: 50, spa: 45, spd: 50, spe: 38 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'かみつく' },
      { lv: 18, move: 'りゅうのいかり' },
    ],
    tm: ['かみつく'],
    evolution: { method: 'level', level: 32, to: 634 },
    catchRate: 45, baseExp: 72, expType: 'slow', sprite: placeholderSprite(633, '#4830a0'),
    height: 0.8, weight: 17.3,
    dex: 'ずつうと しっぽの め、みっつの あたまが てんでばらばらに うごく。',
  },
  634: {
    name: 'ジヘッド', types: ['あく', 'ドラゴン'], gen: 5,
    base: { hp: 72, atk: 85, def: 70, spa: 65, spd: 70, spe: 58 },
    learnset: [
      { lv: 1, move: 'かみつく' }, { lv: 1, move: 'りゅうのいかり' },
      { lv: 26, move: 'あくのはどう' }, { lv: 40, move: 'ドラゴンクロー' },
    ],
    tm: ['かみつく'],
    evolution: null,
    catchRate: 45, baseExp: 144, expType: 'slow', sprite: placeholderSprite(634, '#382480'),
    height: 1.4, weight: 50.0,
    dex: 'ふたつの あたまが けんかしながらも きょうりょくして てきに いどむ。',
  },

  // ---------- ゴースト・ほのお（5世代） ----------
  607: {
    name: 'ヒトモシ', types: ['ゴースト', 'ほのお'], gen: 5,
    base: { hp: 50, atk: 30, def: 55, spa: 65, spd: 55, spe: 20 },
    learnset: [
      { lv: 1, move: 'ひのこ' }, { lv: 1, move: 'あやしいひかり' },
      { lv: 17, move: 'したでなめる' },
    ],
    tm: ['かえんほうしゃ'],
    evolution: { method: 'level', level: 27, to: 608 },
    catchRate: 190, baseExp: 55, expType: 'mediumFast', sprite: placeholderSprite(607, '#4868a8'),
    height: 0.3, weight: 3.1,
    dex: 'ひとの じゅみょうを もやして あかりに する。ながく そばに いると さむけが する。',
  },
  608: {
    name: 'ランプラー', types: ['ゴースト', 'ほのお'], gen: 5,
    base: { hp: 60, atk: 40, def: 60, spa: 95, spd: 60, spe: 55 },
    learnset: [
      { lv: 1, move: 'ひのこ' }, { lv: 1, move: 'あやしいひかり' },
      { lv: 24, move: 'かえんほうしゃ' }, { lv: 36, move: 'シャドーボール' },
    ],
    tm: ['かえんほうしゃ', 'ねんりき'],
    evolution: null,
    catchRate: 90, baseExp: 130, expType: 'mediumFast', sprite: placeholderSprite(608, '#3858a0'),
    height: 0.6, weight: 13.0,
    dex: 'たましいを すいこんで おおきくなった あかり。ちかづくものを ろうそくで さそう。',
  },

  // ---------- こおり・むし（8世代） ----------
  872: {
    name: 'ユキハミ', types: ['こおり', 'むし'], gen: 8,
    base: { hp: 30, atk: 25, def: 35, spa: 45, spd: 35, spe: 20 },
    learnset: [
      { lv: 1, move: 'むしくい' }, { lv: 1, move: 'こおりのつぶて' },
      { lv: 16, move: 'ねむりごな' },
    ],
    tm: [],
    evolution: { method: 'level', level: 24, to: 873 },
    catchRate: 190, baseExp: 42, expType: 'mediumFast', sprite: placeholderSprite(872, '#c8e8f8'),
    height: 0.3, weight: 3.8,
    dex: 'ゆきの けっしょうを からだに つけて うごく。さむさが へいきな めずらしい むし。',
  },
  873: {
    name: 'モスノウ', types: ['こおり', 'むし'], gen: 8,
    base: { hp: 70, atk: 65, def: 60, spa: 125, spd: 90, spe: 65 },
    learnset: [
      { lv: 1, move: 'むしくい' }, { lv: 1, move: 'こおりのつぶて' },
      { lv: 24, move: 'れいとうビーム' }, { lv: 32, move: 'ようせいのかぜ' },
    ],
    tm: ['ねんりき'],
    evolution: null,
    catchRate: 75, baseExp: 173, expType: 'mediumFast', sprite: placeholderSprite(873, '#a8d8f0'),
    height: 0.7, weight: 42.0,
    dex: 'はねに つもった ゆきの もんようは 1まいとして おなじものが ない。',
  },

  // ---------- ノーマル・ひこう（4世代） ----------
  396: {
    name: 'ムックル', types: ['ノーマル', 'ひこう'], gen: 4,
    base: { hp: 40, atk: 55, def: 30, spa: 30, spd: 30, spe: 60 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 5, move: 'かぜおこし' },
      { lv: 9, move: 'すなかけ' },
    ],
    tm: [],
    evolution: { method: 'level', level: 14, to: 397 },
    catchRate: 255, baseExp: 49, expType: 'mediumFast', sprite: placeholderSprite(396, '#a06838'),
    height: 0.3, weight: 2.0,
    dex: 'なわばりいしきが つよく、じぶんより おおきな あいてにも つっかかっていく。',
  },
  397: {
    name: 'ムクバード', types: ['ノーマル', 'ひこう'], gen: 4,
    base: { hp: 55, atk: 75, def: 50, spa: 40, spd: 40, spe: 80 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'かぜおこし' },
      { lv: 22, move: 'つつく' }, { lv: 30, move: 'エアスラッシュ' },
    ],
    tm: [],
    evolution: null,
    catchRate: 120, baseExp: 119, expType: 'mediumFast', sprite: placeholderSprite(397, '#906030'),
    height: 0.6, weight: 15.5,
    dex: 'むれで とんで なわばりを まもる。はねおとの おおきさで じゅんいが わかる。',
  },

  // ---------- でんき（9世代） ----------
  921: {
    name: 'パモ', types: ['でんき'], gen: 9,
    base: { hp: 45, atk: 50, def: 20, spa: 40, spd: 25, spe: 60 },
    learnset: [
      { lv: 1, move: 'でんきショック' }, { lv: 1, move: 'しっぽをふる' },
      { lv: 12, move: 'でんこうせっか' },
    ],
    tm: ['10まんボルト'],
    evolution: { method: 'level', level: 18, to: 922 },
    catchRate: 190, baseExp: 46, expType: 'mediumFast', sprite: placeholderSprite(921, '#f0d020'),
    height: 0.3, weight: 2.5,
    dex: 'しっぽを じめんに こすりつけて でんきを ためる。おこると ほっぺが ひかる。',
  },
  922: {
    name: 'パモット', types: ['でんき'], gen: 9,
    base: { hp: 60, atk: 75, def: 40, spa: 50, spd: 40, spe: 85 },
    learnset: [
      { lv: 1, move: 'でんきショック' }, { lv: 1, move: 'でんこうせっか' },
      { lv: 22, move: '10まんボルト' }, { lv: 30, move: 'インファイト' },
    ],
    tm: ['10まんボルト'],
    evolution: null,
    catchRate: 75, baseExp: 130, expType: 'mediumFast', sprite: placeholderSprite(922, '#e8c018'),
    height: 0.4, weight: 6.5,
    dex: 'りょうての でんきを こすりあわせて スパークを とばす。けんかっぱやい。',
  },

  // ---------- ノーマル（8世代） ----------
  819: {
    name: 'ホシガリス', types: ['ノーマル'], gen: 8,
    base: { hp: 70, atk: 45, def: 40, spa: 30, spd: 40, spe: 25 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'しっぽをふる' },
      { lv: 15, move: 'すなかけ' },
    ],
    tm: [],
    evolution: { method: 'level', level: 24, to: 820 },
    catchRate: 255, baseExp: 52, expType: 'mediumFast', sprite: placeholderSprite(819, '#e08838'),
    height: 0.3, weight: 2.5,
    dex: 'ほおぶくろに たべものを ためこむ。いつも なにか かじっている。',
  },
  820: {
    name: 'ヨクバリス', types: ['ノーマル'], gen: 8,
    base: { hp: 120, atk: 95, def: 55, spa: 55, spd: 75, spe: 20 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'しっぽをふる' },
      { lv: 24, move: 'のしかかり' }, { lv: 32, move: 'いわなだれ' },
    ],
    tm: ['のしかかり'],
    evolution: null,
    catchRate: 90, baseExp: 165, expType: 'mediumFast', sprite: placeholderSprite(820, '#c86828'),
    height: 0.6, weight: 6.0,
    dex: 'ほおぶくろが ぱんぱんに ふくらむと ちからが みなぎり ぼうぎょが かたくなる。',
  },

  // ---------- でんき（2世代） ----------
  179: {
    name: 'メリープ', types: ['でんき'], gen: 2,
    base: { hp: 55, atk: 40, def: 40, spa: 65, spd: 45, spe: 35 },
    learnset: [
      { lv: 1, move: 'でんきショック' }, { lv: 1, move: 'なきごえ' },
      { lv: 13, move: 'でんじは' },
    ],
    tm: ['10まんボルト'],
    evolution: { method: 'level', level: 15, to: 180 },
    catchRate: 235, baseExp: 56, expType: 'mediumSlow', sprite: placeholderSprite(179, '#f8f0d0'),
    height: 0.6, weight: 7.8,
    dex: 'けが けばだつと ほうでんの あいず。かみなりぐもが ちかづくと ちぢれる。',
  },
  180: {
    name: 'モココ', types: ['でんき'], gen: 2,
    base: { hp: 70, atk: 55, def: 55, spa: 80, spd: 60, spe: 45 },
    learnset: [
      { lv: 1, move: 'でんきショック' }, { lv: 1, move: 'でんじは' },
      { lv: 20, move: '10まんボルト' }, { lv: 28, move: 'かみつく' },
    ],
    tm: ['10まんボルト'],
    evolution: null,
    catchRate: 120, baseExp: 128, expType: 'mediumSlow', sprite: placeholderSprite(180, '#f0e8c0'),
    height: 0.8, weight: 13.3,
    dex: 'けを こすりあわせて でんきを おこす。あめの ひは でんきが ためられない。',
  },

  // ---------- ノーマル・ひこう（6世代） ----------
  661: {
    name: 'ヤヤコマ', types: ['ノーマル', 'ひこう'], gen: 6,
    base: { hp: 45, atk: 50, def: 43, spa: 40, spd: 38, spe: 62 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'つつく' },
      { lv: 14, move: 'かぜおこし' },
    ],
    tm: [],
    evolution: { method: 'level', level: 17, to: 662 },
    catchRate: 255, baseExp: 49, expType: 'mediumFast', sprite: placeholderSprite(661, '#d86030'),
    height: 0.3, weight: 1.7,
    dex: 'たいおんが たかく、さむい あさは からだから ゆげが たちのぼる。',
  },
  662: {
    name: 'ヒノヤコマ', types: ['ノーマル', 'ひこう'], gen: 6,
    base: { hp: 62, atk: 73, def: 55, spa: 56, spd: 52, spe: 84 },
    learnset: [
      { lv: 1, move: 'たいあたり' }, { lv: 1, move: 'つつく' },
      { lv: 24, move: 'エアスラッシュ' }, { lv: 32, move: 'ひのこ' },
    ],
    tm: [],
    evolution: null,
    catchRate: 120, baseExp: 122, expType: 'mediumFast', sprite: placeholderSprite(662, '#c85020'),
    height: 0.7, weight: 16.0,
    dex: 'つばさの したに たくわえた ねつを ぶつけて てきを ひるませる。',
  },
};

// id / 名前引きは自動で埋める（データ側で二重に持たない）
// gen も同様。新しく足した種族だけが明示していて、それ以外（カントー勢）は 1 に落ちる。
for (const [id, s] of Object.entries(SPECIES)) {
  s.id = Number(id);
  s.evolution ??= null;
  s.gen ??= 1;
}

export const speciesList = Object.values(SPECIES);
export const byName = Object.fromEntries(speciesList.map((s) => [s.name, s]));
export const getSpecies = (id) => SPECIES[id] ?? null;

/** そのレベルまでに覚える技のうち、後ろから4つ（野生個体の技構成） */
export function movesAtLevel(species, level) {
  const learned = species.learnset.filter((e) => e.lv <= level).map((e) => e.move);
  return learned.slice(-4);
}
