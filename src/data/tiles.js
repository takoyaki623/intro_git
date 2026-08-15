// マップのタイル。すべて 16x16。
//
// TILE[key] がタイルの「性質」、TILE_SPR[key] が見た目。
//   solid   : 通れない
//   grass   : 草むら（エンカウント判定の対象）
//   warp    : 乗るとワープ判定が走る（ドア・階段）
//   overlay : プレイヤーより手前に描く（木のてっぺんなど）
//   heal    : 乗って A で全回復（ベッド）
//   water   : なみのり中だけ通れる（solid ではない）
//   ledge   : その向きにだけ飛び降りられる段差。逆からは通れない

const PAL = {
  '.': null,
  'k': '#20301c',
  'g': '#68b060', 'G': '#4c8c48', 'h': '#84c878',
  'p': '#d8c090', 'P': '#c0a878', 'q': '#e8d8b0',
  't': '#3c8040', 'T': '#2a5c30', 'l': '#58a058',
  'r': '#7a5030', 'R': '#5a3820',
  'w': '#4c88d0', 'W': '#3468b0', 'v': '#78b0e8',
  's': '#a0a0a8', 'S': '#78787f', 'x': '#c8c8d0',
  'f': '#e85878', 'y': '#f0d848', 'n': '#f8f8f8',
  'b': '#d8a878', 'B': '#a87848', 'c': '#e8e0d0',
  'd': '#8a5a30', 'D': '#5a3818',
  'i': '#e0c8a0', 'I': '#c8ac84',
  'm': '#d84848', 'M': '#a83030',
  'e': '#58c8f0', 'E': '#2878a8',
  'o': '#404048',
};

const T = (pixels) => ({ palette: PAL, pixels });

export const TILE_SPR = {
  path: T([
    'pppppppppppppppp', 'pppppqppppppPppp', 'ppPpppppppppppqp', 'pppppppppqppppPp',
    'ppppppPppppppppp', 'pqpppppppppPpppp', 'pppppppppppppppp', 'ppppPppppqpppppp',
    'ppppppppppppppPp', 'pPpppppppppppppp', 'ppppppqppppppppp', 'pppppppppppPpppp',
    'ppqppppppppppppp', 'ppppppppPppppppp', 'ppppppppppppppqp', 'pppppppppppppppp',
  ]),

  grass: T([
    'gggggggggggggggg', 'gGgggggggggGgggg', 'ggggghggggggggGg', 'ggGggggggghggggg',
    'hgggggggGggggggg', 'ggggghgggggggggg', 'gggGggggggggghgg', 'gghgggggGgggggGg',
    'gggggggggggggggg', 'gGggghgggggggggg', 'gggggggggGgggggg', 'ghgggggggggggGgg',
    'gggggGggggghgggg', 'gggggggggggggggg', 'gGgggghggggGgggg', 'gggggggggggggggg',
  ]),

  tallgrass: T([
    'gggggggggggggggg', 'gggggggggggggggg', 'ggkggggkggggkggg', 'gkGkggkGkggkGkgg',
    'gGGGgkGGGkgGGGkg', 'gGlGggGlGggGlGgg', 'kGlGkkGlGkkGlGkg', 'gGlGggGlGggGlGgg',
    'ggGgggGGgggGGggg', 'gggggggggggggggg', 'kggggkggggkggggk', 'GkggGkggGkggGkgg',
    'GGkgGGkgGGkgGGkg', 'GlGgGlGgGlGgGlGg', 'GlGgGlGgGlGgGlGg', 'gGgggGgggGgggGgg',
  ]),

  tree: T([
    '....tttttttt....', '..ttTTttttTTtt..', '.tTTtttttttTTTt.', 'tTtttlllltttTTTt',
    'tTttlllllltttTTt', 'tttlllllllltttTt', 'ttlllllllllllttt', 'tTlllllllllllTtt',
    'tTTtlllllllttTTt', '.tTTttlllltttTt.', '..ttTTttttTTtt..', '.....rrRRrr.....',
    '.....rrRRrr.....', '.....rrRRrr.....', '....rRRRRRRr....', '...GGGGGGGGGG...',
  ]),

  water: T([
    'wwwwwwwwwwwwwwww', 'wwwWwwwwwwwWwwww', 'wwwwwwvwwwwwwwww', 'WwwwwwwwwwwwwWww',
    'wwwwwwwwwvwwwwww', 'wwwWwwwwwwwwwwww', 'wwwwwwwwwwwWwwww', 'wvwwwwwWwwwwwwww',
    'wwwwwwwwwwwwwwvw', 'wwwWwwwwwwwwwwww', 'wwwwwwwwwWwwwwww', 'wWwwwwvwwwwwwwww',
    'wwwwwwwwwwwwwWww', 'wwwwWwwwwwvwwwww', 'wwwwwwwwwwwwwwww', 'wwWwwwwwwwwWwwww',
  ]),

  cliff: T([
    'ssssssssssssssss', 'sSsssSsssssSssss', 'ssssssssSssssssS', 'sSssssssssSsssss',
    'SssssSssssssssss', 'ssssssssssSsssSs', 'ssSsssssssssssss', 'sssssssSssssSsss',
    'SSSSSSSSSSSSSSSS', 'ssssssssssssssss', 'sSssssSsssssssSs', 'sssssssssSssssss',
    'ssSsssssssssSsss', 'sssssSsssssssssS', 'ssssssssSsssssss', 'SSSSSSSSSSSSSSSS',
  ]),

  flower: T([
    'gggggggggggggggg', 'gggkkgggggggkkgg', 'ggkffkgggggkffkg', 'ggkfykgggggkfykg',
    'gggkkgggggggkkgg', 'ggggGggggggggGgg', 'gggggggggggggggg', 'gggggggkkgggggGg',
    'ggggggkffkgggggg', 'ggggggkfykgggggg', 'gggggggkkgggggGg', 'gggggggGgggggggg',
    'gkkggggggggkkggg', 'kffkggggggkffkgg', 'kfykggggggkfykgg', 'gkkgggggggkkgggg',
  ]),

  sign: T([
    'gggggggggggggggg', 'gggggggggggggggg', 'gdddddddddddddgg', 'dbbbbbbbbbbbbbdg',
    'dbcccccccccccbdg', 'dbcBBcBBcBBBcbdg', 'dbcccccccccccbdg', 'dbcBBBcBBcBBcbdg',
    'dbcccccccccccbdg', 'dbbbbbbbbbbbbbdg', 'gdddddddddddddgg', 'ggggggdDdggggggg',
    'ggggggdDdggggggg', 'ggggggdDdggggggg', 'gggggGdDdGgggggg', 'ggggggggggggggGg',
  ]),

  door: T([
    'BBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBB', 'BdddddddddddddBB', 'BdDDDDDDDDDDDdBB',
    'BdDkkkkkkkkkkDbB', 'BdDkkkkkkkkkkDbB', 'BdDkkkkkkkkkkDbB', 'BdDkkkkkkkkkkDbB',
    'BdDkkkkkkkkkkDbB', 'BdDkkkkkkkkkkDbB', 'BdDkkkkkkkkkkDbB', 'BdDkkkkkkkkkkDbB',
    'BdDkkkkkkkkkkDbB', 'BdDkkkkkkkkkkDbB', 'BdddddddddddddBB', 'pppppppppppppppp',
  ]),

  wall: T([
    'bbbbbbbbbbbbbbbb', 'bBBBBBBBBBBBBBBb', 'bBbbbbbBbbbbbbBb', 'bBbbbbbBbbbbbbBb',
    'bBBBBBBBBBBBBBBb', 'bbbbBbbbbbbBbbbb', 'bbbbBbbbbbbBbbbb', 'bBBBBBBBBBBBBBBb',
    'bBbbbbbBbbbbbbBb', 'bBbbbbbBbbbbbbBb', 'bBBBBBBBBBBBBBBb', 'bbbbBbbbbbbBbbbb',
    'bbbbBbbbbbbBbbbb', 'bBBBBBBBBBBBBBBb', 'bBbbbbbBbbbbbbBb', 'bbbbbbbbbbbbbbbb',
  ]),

  roof: T([
    'mmmmmmmmmmmmmmmm', 'MMMMMMMMMMMMMMMM', 'mmmmmmmmmmmmmmmm', 'mMmmMmmMmmMmmMmm',
    'mmmmmmmmmmmmmmmm', 'MMMMMMMMMMMMMMMM', 'mmmmmmmmmmmmmmmm', 'mMmmMmmMmmMmmMmm',
    'mmmmmmmmmmmmmmmm', 'MMMMMMMMMMMMMMMM', 'mmmmmmmmmmmmmmmm', 'mMmmMmmMmmMmmMmm',
    'mmmmmmmmmmmmmmmm', 'MMMMMMMMMMMMMMMM', 'mmmmmmmmmmmmmmmm', 'oooooooooooooooo',
  ]),

  window: T([
    'bbbbbbbbbbbbbbbb', 'bBBBBBBBBBBBBBBb', 'bBeeeeeeeeeeeeBb', 'bBeEEeeeeeeeeeBb',
    'bBeEeeeeeeeeeeBb', 'bBeeeeeeeeeeeeBb', 'bBeeeeeeeeeeeeBb', 'bBBBBBBBBBBBBBBb',
    'bBeeeeeeeeeeeeBb', 'bBeEEeeeeeeeeeBb', 'bBeEeeeeeeeeeeBb', 'bBeeeeeeeeeeeeBb',
    'bBeeeeeeeeeeeeBb', 'bBBBBBBBBBBBBBBb', 'bBbbbbbbbbbbbbBb', 'bbbbbbbbbbbbbbbb',
  ]),

  floor: T([
    'iiiiiiiiiiiiiiii', 'iIiiiiiIiiiiiiIi', 'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii',
    'iiiiiiiiiiiiiiii', 'IiiiiiiIiiiiiiIi', 'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii',
    'iiiiiiiiiiiiiiii', 'iIiiiiiIiiiiiiIi', 'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii',
    'iiiiiiiiiiiiiiii', 'IiiiiiiIiiiiiiIi', 'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii',
  ]),

  counter: T([
    'iiiiiiiiiiiiiiii', 'dddddddddddddddd', 'dccccccccccccccd', 'dccccccccccccccd',
    'dccccccccccccccd', 'dddddddddddddddd', 'dDDDDDDDDDDDDDDd', 'dDDDDDDDDDDDDDDd',
    'dDDDDDDDDDDDDDDd', 'dDDDDDDDDDDDDDDd', 'dDDDDDDDDDDDDDDd', 'dDDDDDDDDDDDDDDd',
    'dDDDDDDDDDDDDDDd', 'dDDDDDDDDDDDDDDd', 'dddddddddddddddd', 'iiiiiiiiiiiiiiii',
  ]),

  bed: T([
    'iiiiiiiiiiiiiiii', 'innnnnnnnnnnnnni', 'inccccccccccccni', 'inccccccccccccni',
    'inccccccccccccni', 'innnnnnnnnnnnnni', 'immmmmmmmmmmmmmi', 'imMMMMMMMMMMMMmi',
    'imMMMMMMMMMMMMmi', 'imMMMMMMMMMMMMmi', 'imMMMMMMMMMMMMmi', 'imMMMMMMMMMMMMmi',
    'imMMMMMMMMMMMMmi', 'immmmmmmmmmmmmmi', 'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii',
  ]),

  pc: T([
    'iiiiiiiiiiiiiiii', 'iiooooooooooooii', 'iosssssssssssoii', 'iosEEEEEEEEEsoii',
    'iosEeeeeeeeeEsoi', 'iosEeeeeeeeeEsoi', 'iosEeeeeeeeeEsoi', 'iosEeeeeeeeeEsoi',
    'iosEEEEEEEEEsoii', 'iosssssssssssoii', 'iossxxxxxxxssoii', 'iosssssssssssoii',
    'iiooooooooooooii', 'iiiSSSSSSSSSSiii', 'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii',
  ]),

  mat: T([
    'iiiiiiiiiiiiiiii', 'immmmmmmmmmmmmmi', 'imMMMMMMMMMMMMmi', 'imMcccccccccMMmi',
    'imMcMMMMMMMMcMmi', 'imMcMMMMMMMMcMmi', 'imMcMMMMMMMMcMmi', 'imMcMMMMMMMMcMmi',
    'imMcMMMMMMMMcMmi', 'imMcMMMMMMMMcMmi', 'imMcccccccccMMmi', 'imMMMMMMMMMMMMmi',
    'immmmmmmmmmmmmmi', 'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii',
  ]),

  stairs: T([
    'IIIIIIIIIIIIIIII', 'ISSSSSSSSSSSSSSI', 'Ixxxxxxxxxxxxxxx', 'ISSSSSSSSSSSSSSI',
    'Ixxxxxxxxxxxxxxx', 'ISSSSSSSSSSSSSSI', 'Ixxxxxxxxxxxxxxx', 'ISSSSSSSSSSSSSSI',
    'Ixxxxxxxxxxxxxxx', 'ISSSSSSSSSSSSSSI', 'Ixxxxxxxxxxxxxxx', 'ISSSSSSSSSSSSSSI',
    'Ixxxxxxxxxxxxxxx', 'ISSSSSSSSSSSSSSI', 'Ixxxxxxxxxxxxxxx', 'IIIIIIIIIIIIIIII',
  ]),

  ledge: T([
    'gggggggggggggggg', 'GGGGGGGGGGGGGGGG', 'ssssssssssssssss', 'sSsSsSsSsSsSsSsS',
    'SSSSSSSSSSSSSSSS', 'pppppppppppppppp', 'pppppppppppppppp', 'pppppppppppppppp',
    'pppppppppppppppp', 'pppppppppppppppp', 'pppppppppppppppp', 'pppppppppppppppp',
    'pppppppppppppppp', 'pppppppppppppppp', 'pppppppppppppppp', 'pppppppppppppppp',
  ]),
};

export const TILE = {
  path: { sprite: 'path' },
  grass: { sprite: 'grass' },
  tallgrass: { sprite: 'tallgrass', grass: true },
  tree: { sprite: 'tree', solid: true },
  // water は「なみのり中だけ通れる」。solid とは別あつかいにする。
  water: { sprite: 'water', water: true },
  cliff: { sprite: 'cliff', solid: true },
  flower: { sprite: 'flower' },
  sign: { sprite: 'sign', solid: true },
  door: { sprite: 'door', warp: true },
  wall: { sprite: 'wall', solid: true },
  roof: { sprite: 'roof', solid: true },
  window: { sprite: 'window', solid: true },
  floor: { sprite: 'floor' },
  // talkThrough: 通れないが、その向こうに立つ NPC には話しかけられる
  counter: { sprite: 'counter', solid: true, talkThrough: true },
  bed: { sprite: 'bed', heal: true },
  pc: { sprite: 'pc', solid: true, pc: true },
  mat: { sprite: 'mat', warp: true },
  stairs: { sprite: 'stairs', warp: true },
  // ledge は上からだけ飛び降りられる。横や下からは通れない。
  ledge: { sprite: 'ledge', ledge: 'down' },
};

export const getTile = (key) => TILE[key] ?? null;
export const getTileSprite = (key) => TILE_SPR[TILE[key]?.sprite] ?? null;
