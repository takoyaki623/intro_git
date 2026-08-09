// 技データ。
//
// effect.kind のうち battle.js が解釈するのは
//   status / stat / drain / recoil / flinch / confuse / multiHit / highCrit / heal
// それ以外の kind は「効果なしの素の技」として素通りする。
// データがエンジンより先行してもクラッシュしないようにするための約束。

/** @type {Record<string, object>} */
export const MOVES = {
  // ---- ノーマル ----
  'たいあたり': {
    type: 'ノーマル', category: '物理', power: 40, accuracy: 100, pp: 35,
    desc: 'ぜんしんで あいてに たいあたりする。',
  },
  'ひっかく': {
    type: 'ノーマル', category: '物理', power: 40, accuracy: 100, pp: 35,
    desc: 'かたく するどい つめで ひっかく。',
  },
  'でんこうせっか': {
    type: 'ノーマル', category: '物理', power: 40, accuracy: 100, pp: 30, priority: 1,
    desc: 'めにも とまらぬ はやさで さきに こうげき できる。',
  },
  'のしかかり': {
    type: 'ノーマル', category: '物理', power: 85, accuracy: 100, pp: 15,
    effect: { kind: 'status', status: 'まひ', chance: 30 },
    desc: 'ぜんしんで のしかかる。まひさせる ことが ある。',
  },
  'なきごえ': {
    type: 'ノーマル', category: '変化', power: 0, accuracy: 100, pp: 40,
    effect: { kind: 'stat', target: 'foe', stat: 'atk', stages: -1, chance: 100 },
    desc: 'かわいい なきごえで あいての こうげきを さげる。',
  },
  'しっぽをふる': {
    type: 'ノーマル', category: '変化', power: 0, accuracy: 100, pp: 30,
    effect: { kind: 'stat', target: 'foe', stat: 'def', stages: -1, chance: 100 },
    desc: 'しっぽを ふって あいての ぼうぎょを さげる。',
  },
  'かたくなる': {
    type: 'ノーマル', category: '変化', power: 0, accuracy: null, pp: 30,
    effect: { kind: 'stat', target: 'self', stat: 'def', stages: 1, chance: 100 },
    desc: 'からだに ちからを いれて ぼうぎょを あげる。',
  },
  'えんまく': {
    type: 'ノーマル', category: '変化', power: 0, accuracy: 100, pp: 20,
    effect: { kind: 'stat', target: 'foe', stat: 'acc', stages: -1, chance: 100 },
    desc: 'すみや けむりで あいての めいちゅうを さげる。',
  },
  'すなかけ': {
    type: 'じめん', category: '変化', power: 0, accuracy: 100, pp: 15,
    effect: { kind: 'stat', target: 'foe', stat: 'acc', stages: -1, chance: 100 },
    desc: 'すなを かけて あいての めいちゅうを さげる。',
  },
  'はかいこうせん': {
    type: 'ノーマル', category: '特殊', power: 150, accuracy: 90, pp: 5,
    effect: { kind: 'recoil', ratio: 0.25 },
    desc: 'つよい こうせんを はなつ。はんどうが おおきい。',
  },
  'したでなめる': {
    type: 'ゴースト', category: '物理', power: 30, accuracy: 100, pp: 30,
    effect: { kind: 'status', status: 'まひ', chance: 30 },
    desc: 'ながい したで なめる。まひさせる ことが ある。',
  },

  // ---- ほのお ----
  'ひのこ': {
    type: 'ほのお', category: '特殊', power: 40, accuracy: 100, pp: 25,
    effect: { kind: 'status', status: 'やけど', chance: 10 },
    desc: 'ちいさな ほのおを あびせる。やけどさせる ことが ある。',
  },
  'かえんほうしゃ': {
    type: 'ほのお', category: '特殊', power: 90, accuracy: 100, pp: 15,
    effect: { kind: 'status', status: 'やけど', chance: 10 },
    desc: 'はげしい ほのおを あびせる。やけどさせる ことが ある。',
  },

  // ---- みず ----
  'みずでっぽう': {
    type: 'みず', category: '特殊', power: 40, accuracy: 100, pp: 25,
    desc: 'みずを いきおいよく はっしゃする。',
  },
  // フィールドでも使う技。おぼえていると 水の上を進める。
  'なみのり': {
    type: 'みず', category: '特殊', power: 90, accuracy: 100, pp: 15,
    field: 'surf',
    desc: 'おおなみで こうげきする。みずの うえを すすむ ときにも つかう。',
  },
  'あわ': {
    type: 'みず', category: '特殊', power: 40, accuracy: 100, pp: 30,
    effect: { kind: 'stat', target: 'foe', stat: 'spe', stages: -1, chance: 10 },
    desc: 'あわを ふきかける。すばやさを さげる ことが ある。',
  },
  'ハイドロポンプ': {
    type: 'みず', category: '特殊', power: 110, accuracy: 80, pp: 5,
    desc: 'すごい いきおいで みずを ぶつける。',
  },

  // ---- でんき ----
  'でんきショック': {
    type: 'でんき', category: '特殊', power: 40, accuracy: 100, pp: 30,
    effect: { kind: 'status', status: 'まひ', chance: 10 },
    desc: 'でんげきを あびせる。まひさせる ことが ある。',
  },
  '10まんボルト': {
    type: 'でんき', category: '特殊', power: 90, accuracy: 100, pp: 15,
    effect: { kind: 'status', status: 'まひ', chance: 10 },
    desc: 'つよい でんげきを あびせる。まひさせる ことが ある。',
  },
  'でんじは': {
    type: 'でんき', category: '変化', power: 0, accuracy: 90, pp: 20,
    effect: { kind: 'status', status: 'まひ', chance: 100 },
    desc: 'よわい でんきで あいてを まひさせる。',
  },

  // ---- くさ ----
  'つるのムチ': {
    type: 'くさ', category: '物理', power: 45, accuracy: 100, pp: 25,
    desc: 'つるを しならせて あいてを たたく。',
  },
  'はっぱカッター': {
    type: 'くさ', category: '物理', power: 55, accuracy: 95, pp: 25,
    effect: { kind: 'highCrit' },
    desc: 'はっぱを とばして きりつける。きゅうしょに あたりやすい。',
  },
  'すいとる': {
    type: 'くさ', category: '特殊', power: 20, accuracy: 100, pp: 25,
    effect: { kind: 'drain', ratio: 0.5 },
    desc: 'あたえた ダメージの はんぶん たいりょくを すいとる。',
  },
  'ねむりごな': {
    type: 'くさ', category: '変化', power: 0, accuracy: 75, pp: 15,
    effect: { kind: 'status', status: 'ねむり', chance: 100 },
    desc: 'ねむりを さそう こなを まく。',
  },

  'タネマシンガン': {
    type: 'くさ', category: '物理', power: 25, accuracy: 100, pp: 30,
    effect: { kind: 'multiHit' },
    desc: 'かたい タネを 2〜5かい つづけて はっしゃする。',
  },
  'こうごうせい': {
    type: 'くさ', category: '変化', power: 0, accuracy: null, pp: 5,
    effect: { kind: 'heal', ratio: 0.5 },
    desc: 'ひかりを あびて じぶんの たいりょくを はんぶん かいふくする。',
  },

  // ---- こおり ----
  'こおりのつぶて': {
    type: 'こおり', category: '物理', power: 40, accuracy: 100, pp: 30, priority: 1,
    desc: 'こおりの かたまりを なげる。さきに こうげき できる。',
  },

  // ---- かくとう ----
  'からてチョップ': {
    type: 'かくとう', category: '物理', power: 50, accuracy: 100, pp: 25,
    effect: { kind: 'highCrit' },
    desc: 'てがたなで きりつける。きゅうしょに あたりやすい。',
  },

  // ---- どく ----
  'どくばり': {
    type: 'どく', category: '物理', power: 15, accuracy: 100, pp: 35,
    effect: { kind: 'status', status: 'どく', chance: 30 },
    desc: 'どくの はりで さす。どく じょうたいに する ことが ある。',
  },
  'どくのこな': {
    type: 'どく', category: '変化', power: 0, accuracy: 75, pp: 35,
    effect: { kind: 'status', status: 'どく', chance: 100 },
    desc: 'どくの こなを まいて どく じょうたいに する。',
  },

  // ---- じめん ----
  'じしん': {
    type: 'じめん', category: '物理', power: 100, accuracy: 100, pp: 10,
    desc: 'じしんの しょうげきで あたりを こうげきする。',
  },

  // ---- ひこう ----
  'つつく': {
    type: 'ひこう', category: '物理', power: 35, accuracy: 100, pp: 35,
    desc: 'とがった くちばしで つつく。',
  },
  'かぜおこし': {
    type: 'ひこう', category: '特殊', power: 40, accuracy: 100, pp: 35,
    desc: 'つばさで かぜを おこして こうげきする。',
  },

  // ---- エスパー ----
  'ねんりき': {
    type: 'エスパー', category: '特殊', power: 50, accuracy: 100, pp: 25,
    effect: { kind: 'stat', target: 'foe', stat: 'spa', stages: -1, chance: 10 },
    desc: 'よわい ねんりきを おくる。とくこうを さげる ことが ある。',
  },

  'あやしいひかり': {
    type: 'ゴースト', category: '変化', power: 0, accuracy: 100, pp: 10,
    effect: { kind: 'confuse', chance: 100 },
    desc: 'あやしい ひかりを みせて あいてを こんらんさせる。',
  },

  // ---- むし ----
  'むしくい': {
    type: 'むし', category: '物理', power: 60, accuracy: 100, pp: 20,
    desc: 'あいてに かみつく。',
  },
  'れんぞくぎり': {
    type: 'むし', category: '物理', power: 30, accuracy: 95, pp: 20,
    effect: { kind: 'multiHit' },
    desc: 'かまや ツメで 2〜5かい つづけて きりつける。',
  },

  // ---- いわ ----
  'いわおとし': {
    type: 'いわ', category: '物理', power: 50, accuracy: 90, pp: 15,
    desc: 'おおきな いわを なげつける。',
  },

  // ---- ドラゴン ----
  'りゅうのいかり': {
    type: 'ドラゴン', category: '特殊', power: 45, accuracy: 100, pp: 10,
    desc: 'いかりの しょうげきはを ぶつける。',
  },

  // ---- あく ----
  'かみつく': {
    type: 'あく', category: '物理', power: 60, accuracy: 100, pp: 25,
    effect: { kind: 'flinch', chance: 30 },
    desc: 'するどい はで かみつく。ひるませる ことが ある。',
  },

  // ---- はがね ----
  'メタルクロー': {
    type: 'はがね', category: '物理', power: 50, accuracy: 95, pp: 35,
    effect: { kind: 'stat', target: 'self', stat: 'atk', stages: 1, chance: 10 },
    desc: 'はがねの つめで きりつける。こうげきが あがる ことが ある。',
  },

  // ---- フェアリー ----
  'ようせいのかぜ': {
    type: 'フェアリー', category: '特殊', power: 40, accuracy: 100, pp: 30,
    desc: 'ようせいの かぜを おくりつける。',
  },
};

// name はキーと同じなので自動で埋める（データ側で二重管理しない）
for (const [key, m] of Object.entries(MOVES)) {
  m.name = key;
  m.priority ??= 0;
  m.effect ??= null;
}

export const moveList = Object.keys(MOVES);
export const getMove = (name) => MOVES[name] ?? null;
