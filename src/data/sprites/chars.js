// フィールドのキャラクター。16x20（足元がタイルの下端に来るよう縦に少し長い）。
//
// 1方向につき 3コマ:
//   0 = 立ち / 1 = 右足前 / 2 = 左足前
// 左右向きは right だけ描いて left は反転で賄う（作画量が半分になる）。

// 'o' は輪郭と瞳を兼ねる。'O' はその横の白いハイライト。
const P = (extra) => ({ '.': null, 'o': '#241c30', 'O': '#ffffff', ...extra });

const HERO = P({
  s: '#f0c090', S: '#d09060',   // 肌
  h: '#8a4020', H: '#5a2810',   // 髪
  c: '#e04848', C: '#a83030',   // 帽子・上着
  b: '#3860b0', B: '#284880',   // ズボン
  w: '#f8f8f8', k: '#303038',   // 白・靴
});

const BOY = P({
  s: '#f0c090', S: '#d09060',
  h: '#3a2a1a', H: '#241608',
  c: '#48a058', C: '#2c7038',
  b: '#8a6a40', B: '#5a4428',
  w: '#f8f8f8', k: '#303038',
});

const GIRL = P({
  s: '#f8ccA0'.toLowerCase(), S: '#d8a070',
  h: '#c08030', H: '#8a5418',
  c: '#e878b0', C: '#b04878',
  b: '#f0f0f8', B: '#c0c0d0',
  w: '#f8f8f8', k: '#303038',
});

const PROF = P({
  s: '#f0c090', S: '#d09060',
  h: '#d0d0d8', H: '#9898a0',
  c: '#f8f8f8', C: '#c8c8d0',
  b: '#485868', B: '#303c48',
  w: '#f8f8f8', k: '#303038',
});

const NURSE = P({
  s: '#f8cca0', S: '#d8a070',
  h: '#f090a8', H: '#c05878',
  c: '#f8f8f8', C: '#d8d8e0',
  b: '#f8f8f8', B: '#d8d8e0',
  w: '#e04848', k: '#303038',
});

// トレーナーは色だけ変えて作る。形を共有しているので、
// 遠目にも「同じ世界の住人」に見えつつ職業の区別はつく。
const YOUNGSTER = P({
  s: '#f0c090', S: '#d09060',
  h: '#2a2018', H: '#181008',
  c: '#f0f0f8', C: '#c0c0d0',   // 白いシャツ
  b: '#4878c8', B: '#305090',   // たんパン
  w: '#f8f8f8', k: '#303038',
});

const LASS = P({
  s: '#f8cca0', S: '#d8a070',
  h: '#7a4a28', H: '#4c2c14',
  c: '#f8e070', C: '#c8ac38',   // きいろい服
  b: '#e05878', B: '#a83050',   // スカート
  w: '#f8f8f8', k: '#303038',
});

const BUGCATCHER = P({
  s: '#f0c090', S: '#d09060',
  h: '#3a2a1a', H: '#241608',
  c: '#f0e8c0', C: '#c8c098',   // むぎわらぼうし色
  b: '#68a848', B: '#3c7028',
  w: '#f8f8f8', k: '#303038',
});

const LEADER = P({
  s: '#f0c090', S: '#d09060',
  h: '#f0d848', H: '#c0a818',   // きんぱつ
  c: '#404850', C: '#282e34',   // ぐんぷく
  b: '#404850', B: '#282e34',
  w: '#f8f8f8', k: '#303038',
});

/** 下向き（正面）の3コマを作る */
function frontFrames(pal) {
  const base = [
    '................',
    '.....oooooo.....',
    '....occcccco....',
    '...occcccccco...',
    '...oCCCCCCCCo...',
    '...ohhssssHho...',
    '...ohsssssssho..',
    '...osoOssOosso..',
    '....ossssssso...',
    '....osSssssSo...',
    '...occcccccco...',
    '..occcCccCccco..',
    '..oscccccccсso..'.replace('с', 'c'),
    '..osccccccccso..',
    '...occcccccco...',
    '....obbbbbbo....',
    '....obbbbbbo....',
    '....oBBooBBo....',
  ];
  const stand = [...base, '....okko.okko...', '.....oo...oo....'];
  const left = [...base, '...okko...okko..', '...oo.......oo..'];
  const right = [...base, '....okko.okko...', '....oo.....oo...'];
  return [stand, left, right].map((pixels) => ({ palette: pal, pixels }));
}

function backFrames(pal) {
  const base = [
    '................',
    '.....oooooo.....',
    '....occcccco....',
    '...occcccccco...',
    '...occcccccco...',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '....ohhhhhho....',
    '....osssssso....',
    '...occcccccco...',
    '..occccccccco...',
    '..osccccccccso..',
    '..osccccccccso..',
    '...occcccccco...',
    '....obbbbbbo....',
    '....obbbbbbo....',
    '....oBBooBBo....',
  ];
  const stand = [...base, '....okko.okko...', '.....oo...oo....'];
  const left = [...base, '...okko...okko..', '...oo.......oo..'];
  const right = [...base, '....okko.okko...', '....oo.....oo...'];
  return [stand, left, right].map((pixels) => ({ palette: pal, pixels }));
}

function sideFrames(pal) {
  const base = [
    '................',
    '.....oooooo.....',
    '....occccccoo...',
    '...occccccccCo..',
    '...oCCCCCCCCCo..',
    '...ohhsssssso...',
    '...ohssssssso...',
    '...ossoOsssso...',
    '....ossssssSo...',
    '....osSssssso...',
    '...occcccccco...',
    '..occccccccco...',
    '..osccccccccso..',
    '...occccccccso..',
    '...occcccccco...',
    '....obbbbbbo....',
    '....obbbbbbo....',
    '....oBBBBBBo....',
  ];
  const stand = [...base, '.....okkkko.....', '.....oooooo.....'];
  const left = [...base, '...okko..okko...', '...ooo....ooo...'];
  const right = [...base, '.....okkkkoo....', '.....oo...oo....'];
  return [stand, left, right].map((pixels) => ({ palette: pal, pixels }));
}

function makeChar(pal) {
  return {
    down: frontFrames(pal),
    up: backFrames(pal),
    right: sideFrames(pal),
    left: null, // right を左右反転して使う
  };
}

export const CHARS = {
  hero: makeChar(HERO),
  boy: makeChar(BOY),
  girl: makeChar(GIRL),
  prof: makeChar(PROF),
  nurse: makeChar(NURSE),
  youngster: makeChar(YOUNGSTER),
  lass: makeChar(LASS),
  bugcatcher: makeChar(BUGCATCHER),
  leader: makeChar(LEADER),
};

/**
 * 向きとコマ番号からスプライト定義と反転フラグを返す。
 * left は right の反転で描く。
 */
export function charSprite(name, dir, frame = 0) {
  const c = CHARS[name] ?? CHARS.boy;
  const flip = dir === 'left';
  const set = c[flip ? 'right' : dir] ?? c.down;
  return { def: set[frame % set.length], flip };
}
