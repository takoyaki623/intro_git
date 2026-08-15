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
  // 積み技。序盤に撃つほど元が取れるので、AI（ai.js の statusScore）は
  // HPが6割を超えているときだけ優先的に選ぶ。
  'つるぎのまい': {
    type: 'ノーマル', category: '変化', power: 0, accuracy: null, pp: 20,
    effect: { kind: 'stat', target: 'self', stat: 'atk', stages: 2, chance: 100 },
    desc: 'せいしんを とういつし こうげきりょくを ぐーんと たかめる。',
  },
  'めいそう': {
    type: 'エスパー', category: '変化', power: 0, accuracy: null, pp: 20,
    effect: { kind: 'stat', target: 'self', stats: [{ stat: 'spa', stages: 1 }, { stat: 'spd', stages: 1 }], chance: 100 },
    desc: 'せいしんを しゅうちゅうさせ とくこうと とくぼうを たかめる。',
  },
  'こうそくいどう': {
    type: 'エスパー', category: '変化', power: 0, accuracy: null, pp: 30,
    effect: { kind: 'stat', target: 'self', stat: 'spe', stages: 2, chance: 100 },
    desc: 'からだの ちからを ぬいて すばやく うごけるように なる。',
  },
  'えんまく': {
    type: 'ノーマル', category: '変化', power: 0, accuracy: 100, pp: 20,
    effect: { kind: 'stat', target: 'foe', stat: 'acc', stages: -1, chance: 100 },
    desc: 'すみや けむりで あいての めいちゅうを さげる。',
  },
  // 天候技。5ターンのあいだ天候を変え、対応タイプの技の威力に補正がかかる。
  'あまごい': {
    type: 'みず', category: '変化', power: 0, accuracy: null, pp: 5,
    effect: { kind: 'weather', weather: 'rain', turns: 5 },
    desc: 'あめを ふらせて みずタイプの わざを つよめる。',
  },
  'にほんばれ': {
    type: 'ほのお', category: '変化', power: 0, accuracy: null, pp: 5,
    effect: { kind: 'weather', weather: 'sun', turns: 5 },
    desc: 'ひざしを つよめて ほのおタイプの わざを つよめる。',
  },
  'すなあらし': {
    type: 'いわ', category: '変化', power: 0, accuracy: null, pp: 10,
    effect: { kind: 'weather', weather: 'sand', turns: 5 },
    desc: 'すなあらしを まきおこす。いわ・じめん・はがね いがいは まいターン ダメージを うける。',
  },
  // 変化技の幅を広げる3つ（Phase X-1）。受け型に存在意義を持たせる。
  'まもる': {
    type: 'ノーマル', category: '変化', power: 0, accuracy: null, pp: 10, priority: 4,
    effect: { kind: 'protect', target: 'self' },
    desc: 'その ターン、あいての わざを ほぼ かんぜんに ふせぐ。',
  },
  'みがわり': {
    type: 'ノーマル', category: '変化', power: 0, accuracy: null, pp: 10,
    effect: { kind: 'substitute', target: 'self' },
    desc: 'じぶんの HPを けずって みがわり人形を つくり、こうげきの みがわりに する。',
  },
  'どくどく': {
    type: 'どく', category: '変化', power: 0, accuracy: 90, pp: 10,
    effect: { kind: 'status', status: 'もうどく', chance: 100 },
    desc: 'じわじわと ダメージが ふえていく もうどくを あたえる。',
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
  'とっしん': {
    type: 'ノーマル', category: '物理', power: 90, accuracy: 85, pp: 20,
    effect: { kind: 'recoil', ratio: 0.25 },
    desc: 'からだあたり こうげきする。はんどうダメージを うける。',
  },
  'すてみタックル': {
    type: 'ノーマル', category: '物理', power: 120, accuracy: 100, pp: 15,
    effect: { kind: 'recoil', ratio: 0.33 },
    desc: 'みをすてて ぶつかる はげしい タックル。はんどうダメージが おおきい。',
  },
  'フラフラダンス': {
    type: 'ノーマル', category: '変化', power: 0, accuracy: 100, pp: 20,
    effect: { kind: 'confuse', chance: 100 },
    desc: 'ふらふらな おどりを おどらせて あいてを こんらんさせる。',
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
  'かえんぐるま': {
    type: 'ほのお', category: '物理', power: 60, accuracy: 100, pp: 25,
    effect: { kind: 'status', status: 'やけど', chance: 15 },
    desc: 'からだを ほのおで つつみ とっしんする。やけどさせる ことが ある。',
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
  'スパーク': {
    type: 'でんき', category: '物理', power: 65, accuracy: 100, pp: 20,
    effect: { kind: 'status', status: 'まひ', chance: 30 },
    desc: 'でんきを まとって たいあたりする。まひさせる ことが ある。',
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
  'メガドレイン': {
    type: 'くさ', category: '特殊', power: 40, accuracy: 100, pp: 15,
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
  'リーフブレード': {
    type: 'くさ', category: '物理', power: 70, accuracy: 100, pp: 15,
    effect: { kind: 'highCrit' },
    desc: 'はっぱの やいばで きりさく。きゅうしょに あたりやすい。',
  },
  'ソーラービーム': {
    type: 'くさ', category: '特殊', power: 120, accuracy: 100, pp: 10,
    desc: 'ひかりを あつめた つよい ビームを はなつ。',
  },

  // ---- こおり ----
  'こおりのつぶて': {
    type: 'こおり', category: '物理', power: 40, accuracy: 100, pp: 30, priority: 1,
    desc: 'こおりの かたまりを なげる。さきに こうげき できる。',
  },
  'れいとうビーム': {
    type: 'こおり', category: '特殊', power: 90, accuracy: 100, pp: 10,
    effect: { kind: 'status', status: 'こおり', chance: 10 },
    desc: 'こおりの ビームを はなつ。こおらせる ことが ある。',
  },
  'れいとうパンチ': {
    type: 'こおり', category: '物理', power: 75, accuracy: 100, pp: 15,
    effect: { kind: 'status', status: 'こおり', chance: 10 },
    desc: 'こおりのように つめたい こぶしで なぐる。こおらせる ことが ある。',
  },
  'ふぶき': {
    type: 'こおり', category: '特殊', power: 110, accuracy: 70, pp: 5,
    effect: { kind: 'status', status: 'こおり', chance: 10 },
    desc: 'はげしい ふぶきを ぶつける。こおらせる ことが ある。',
  },

  // ---- かくとう ----
  'からてチョップ': {
    type: 'かくとう', category: '物理', power: 50, accuracy: 100, pp: 25,
    effect: { kind: 'highCrit' },
    desc: 'てがたなで きりつける。きゅうしょに あたりやすい。',
  },
  'インファイト': {
    type: 'かくとう', category: '物理', power: 120, accuracy: 100, pp: 5,
    desc: 'みをけずって ぶつかりあう はげしい こうげき。',
  },
  'にどげり': {
    type: 'かくとう', category: '物理', power: 30, accuracy: 100, pp: 30,
    effect: { kind: 'multiHit', hits: 2 },
    desc: 'すばやく 2かい けりを くりだす。',
  },
  'みきり': {
    type: 'かくとう', category: '変化', power: 0, accuracy: null, pp: 10, priority: 4,
    effect: { kind: 'protect', target: 'self' },
    desc: 'あいての うごきを よみ、その ターンの わざを ほぼ かんぜんに ふせぐ。',
  },
  'ドレインパンチ': {
    type: 'かくとう', category: '物理', power: 40, accuracy: 100, pp: 10,
    effect: { kind: 'drain', ratio: 0.5 },
    desc: 'ちからを すいとる パンチ。あたえた ダメージの はんぶん たいりょくを かいふくする。',
  },
  'ローキック': {
    type: 'かくとう', category: '物理', power: 65, accuracy: 100, pp: 20,
    effect: { kind: 'stat', target: 'foe', stat: 'spe', stages: -1, chance: 100 },
    desc: 'あいての あしを ねらって けとばす。すばやさを さげる。',
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
  'ヘドロこうげき': {
    type: 'どく', category: '物理', power: 65, accuracy: 100, pp: 20,
    effect: { kind: 'status', status: 'どく', chance: 30 },
    desc: 'きたない ヘドロを なげつける。どく じょうたいに する ことが ある。',
  },

  // ---- じめん ----
  'じしん': {
    type: 'じめん', category: '物理', power: 100, accuracy: 100, pp: 10,
    desc: 'じしんの しょうげきで あたりを こうげきする。',
  },
  'マッドショット': {
    type: 'じめん', category: '特殊', power: 55, accuracy: 95, pp: 15,
    effect: { kind: 'stat', target: 'foe', stat: 'spe', stages: -1, chance: 100 },
    desc: 'どろを なげつける。あいての すばやさを さげる。',
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

  // ---- じめん（つづき） ----
  'あなをほる': {
    type: 'じめん', category: '物理', power: 80, accuracy: 100, pp: 10,
    desc: 'ちめんに もぐって こうげきする。',
  },

  // ---- ひこう（つづき） ----
  'エアスラッシュ': {
    type: 'ひこう', category: '特殊', power: 75, accuracy: 95, pp: 15,
    effect: { kind: 'flinch', chance: 30 },
    desc: 'するどい かぜの はを たたきつける。ひるませる ことが ある。',
  },
  'ゴッドバード': {
    type: 'ひこう', category: '物理', power: 90, accuracy: 90, pp: 5,
    effect: { kind: 'highCrit' },
    desc: 'つばさを たたみ とっしんする。きゅうしょに あたりやすい。',
  },

  // ---- エスパー ----
  'ねんりき': {
    type: 'エスパー', category: '特殊', power: 50, accuracy: 100, pp: 25,
    effect: { kind: 'stat', target: 'foe', stat: 'spa', stages: -1, chance: 10 },
    desc: 'よわい ねんりきを おくる。とくこうを さげる ことが ある。',
  },
  'サイコキネシス': {
    type: 'エスパー', category: '特殊', power: 90, accuracy: 100, pp: 10,
    effect: { kind: 'stat', target: 'foe', stat: 'spd', stages: -1, chance: 10 },
    desc: 'つよい ねんりきを おくる。とくぼうを さげる ことが ある。',
  },
  'さいみんじゅつ': {
    type: 'エスパー', category: '変化', power: 0, accuracy: 60, pp: 10,
    effect: { kind: 'status', status: 'ねむり', chance: 100 },
    desc: 'あいてに さいみんじゅつを かけて ねむらせる。',
  },
  'サイコカッター': {
    type: 'エスパー', category: '物理', power: 70, accuracy: 100, pp: 20,
    effect: { kind: 'highCrit' },
    desc: 'こころの やいばで きりつける。きゅうしょに あたりやすい。',
  },
  'じこさいせい': {
    type: 'エスパー', category: '変化', power: 0, accuracy: null, pp: 5,
    effect: { kind: 'heal', ratio: 0.5 },
    desc: 'さいぼうを かっせいかさせて じぶんの たいりょくを はんぶん かいふくする。',
  },

  'あやしいひかり': {
    type: 'ゴースト', category: '変化', power: 0, accuracy: 100, pp: 10,
    effect: { kind: 'confuse', chance: 100 },
    desc: 'あやしい ひかりを みせて あいてを こんらんさせる。',
  },
  'シャドーボール': {
    type: 'ゴースト', category: '特殊', power: 80, accuracy: 100, pp: 15,
    effect: { kind: 'stat', target: 'foe', stat: 'spd', stages: -1, chance: 20 },
    desc: 'くろい かたまりを なげつける。とくぼうを さげる ことが ある。',
  },
  'シャドークロー': {
    type: 'ゴースト', category: '物理', power: 70, accuracy: 100, pp: 15,
    effect: { kind: 'highCrit' },
    desc: 'かげの つめで きりさく。きゅうしょに あたりやすい。',
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
  'とんぼがえり': {
    type: 'むし', category: '物理', power: 70, accuracy: 100, pp: 20,
    desc: 'すばやく こうげきしてから みを ひるがえす。',
  },
  'メガホーン': {
    type: 'むし', category: '物理', power: 90, accuracy: 85, pp: 10,
    desc: 'するどい つので つきさす。ちからいっぱいの こうげき。',
  },

  // ---- いわ ----
  'いわおとし': {
    type: 'いわ', category: '物理', power: 50, accuracy: 90, pp: 15,
    desc: 'おおきな いわを なげつける。',
  },
  'いわなだれ': {
    type: 'いわ', category: '物理', power: 75, accuracy: 90, pp: 10,
    effect: { kind: 'flinch', chance: 30 },
    desc: 'おおきな いわを なだれのように おとす。ひるませる ことが ある。',
  },
  'ストーンエッジ': {
    type: 'いわ', category: '物理', power: 100, accuracy: 80, pp: 5,
    effect: { kind: 'highCrit' },
    desc: 'するどい いわを つきたてる。きゅうしょに あたりやすい。',
  },

  // ---- ドラゴン ----
  'りゅうのいかり': {
    type: 'ドラゴン', category: '特殊', power: 45, accuracy: 100, pp: 10,
    desc: 'いかりの しょうげきはを ぶつける。',
  },
  'ドラゴンクロー': {
    type: 'ドラゴン', category: '物理', power: 80, accuracy: 100, pp: 15,
    desc: 'するどい つめで きりさく。',
  },
  'りゅうせいぐん': {
    type: 'ドラゴン', category: '特殊', power: 130, accuracy: 90, pp: 5,
    effect: { kind: 'stat', target: 'self', stat: 'spa', stages: -2, chance: 100 },
    desc: 'りゅうせいを あいてに ふらせる。はんどうで じぶんの とくこうが さがる。',
  },
  'たつまき': {
    type: 'ドラゴン', category: '特殊', power: 40, accuracy: 100, pp: 20,
    effect: { kind: 'flinch', chance: 20 },
    desc: 'はげしい たつまきを まきおこす。ひるませる ことが ある。',
  },

  // ---- あく ----
  'かみつく': {
    type: 'あく', category: '物理', power: 60, accuracy: 100, pp: 25,
    effect: { kind: 'flinch', chance: 30 },
    desc: 'するどい はで かみつく。ひるませる ことが ある。',
  },
  'あくのはどう': {
    type: 'あく', category: '特殊', power: 80, accuracy: 100, pp: 15,
    effect: { kind: 'flinch', chance: 20 },
    desc: 'あくの はどうを ぶつける。ひるませる ことが ある。',
  },
  'だましうち': {
    type: 'あく', category: '物理', power: 60, accuracy: null, pp: 5, priority: 1,
    desc: 'すきを ついて こうげきする。かならず さきに でる。',
  },
  'かみくだく': {
    type: 'あく', category: '物理', power: 80, accuracy: 100, pp: 15,
    effect: { kind: 'stat', target: 'foe', stat: 'def', stages: -1, chance: 20 },
    desc: 'つよい あごで かみくだく。あいての ぼうぎょを さげる ことが ある。',
  },

  // ---- はがね ----
  'メタルクロー': {
    type: 'はがね', category: '物理', power: 50, accuracy: 95, pp: 35,
    effect: { kind: 'stat', target: 'self', stat: 'atk', stages: 1, chance: 10 },
    desc: 'はがねの つめで きりつける。こうげきが あがる ことが ある。',
  },
  'ラスターカノン': {
    type: 'はがね', category: '特殊', power: 80, accuracy: 90, pp: 10,
    desc: 'ひかりの エネルギーを ほうしゃする。',
  },
  'コメットパンチ': {
    type: 'はがね', category: '物理', power: 18, accuracy: 90, pp: 15,
    effect: { kind: 'multiHit' },
    desc: 'はがねの こぶしで 2〜5かい つづけて なぐる。',
  },
  'アイアンテール': {
    type: 'はがね', category: '物理', power: 100, accuracy: 75, pp: 15,
    effect: { kind: 'stat', target: 'foe', stat: 'def', stages: -1, chance: 30 },
    desc: 'かたい しっぽで たたきつける。あいての ぼうぎょを さげる ことが ある。',
  },

  // ---- フェアリー ----
  'ようせいのかぜ': {
    type: 'フェアリー', category: '特殊', power: 40, accuracy: 100, pp: 30,
    desc: 'ようせいの かぜを おくりつける。',
  },
  'マジカルシャイン': {
    type: 'フェアリー', category: '特殊', power: 80, accuracy: 100, pp: 15,
    desc: 'まぶしい ひかりを あびせて こうげきする。',
  },
  'チャームボイス': {
    type: 'フェアリー', category: '特殊', power: 40, accuracy: null, pp: 15,
    desc: 'かわいい こえで こうげきする。かならず あたる。',
  },
  'つきのひかり': {
    type: 'フェアリー', category: '変化', power: 0, accuracy: null, pp: 5,
    effect: { kind: 'heal', ratio: 0.5 },
    desc: 'つきの ひかりを あびて じぶんの たいりょくを はんぶん かいふくする。',
  },
  'てんしのキッス': {
    type: 'フェアリー', category: '変化', power: 0, accuracy: 75, pp: 10,
    effect: { kind: 'confuse', chance: 100 },
    desc: 'てんしのような しぐさで あいてを こんらんさせる。',
  },

  // ---- どく（つづき） ----
  'ヘドロばくだん': {
    type: 'どく', category: '特殊', power: 90, accuracy: 100, pp: 10,
    effect: { kind: 'status', status: 'どく', chance: 30 },
    desc: 'きたない ヘドロを なげつける。どく じょうたいに する ことが ある。',
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
