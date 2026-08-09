// タイトルからゲーム本体へ入る入口。
// data/ 一式を引き連れてくるので、タイトル表示までの初期ロードを軽くするため
// TitleScene からは動的 import で呼ばれる。

import * as Scenes from '../core/sceneStack.js';
import { rng } from '../core/rng.js';
import { resetState, load, state } from './state.js';
import { loadMap, world } from './world.js';
import { createMonster } from './monster.js';
import { FieldScene } from '../scenes/FieldScene.js';
import { DialogScene } from '../scenes/DialogScene.js';
import { NameScene } from '../scenes/NameScene.js';

/**
 * デバッグ用フック。
 * これが無いと、モジュール読み込みに失敗したとき「真っ黒な canvas」以外に
 * 手がかりが残らない。自動テストからも状態を覗くのに使う。
 */
function installDebugHooks(field) {
  const g = globalThis.__game ?? (globalThis.__game = {});
  g.state = state;
  g.world = world;
  g.rng = rng;
  g.field = field;
  g.pos = () => ({ ...state.player.pos });
  g.sceneName = () => Scenes.top()?.constructor.name ?? null;
  g.mode = () => Scenes.top()?.mode ?? null;
  g.forceEncounter = (id, lv = 5) => {
    field.startWildBattle({ speciesId: id, level: lv });
  };
  g.givePokemon = (id, lv = 5) => {
    state.party.push(createMonster(id, lv, { rng }));
  };
  g.warpTo = (map, x, y, dir = 'down') => {
    loadMap(map, x, y, dir);
    field.updateCamera();
  };
}

export function startNewGame() {
  resetState();
  loadMap('hajimari', 9, 12, 'up');
  const field = Scenes.reset(new FieldScene());
  installDebugHooks(field);
  field.busy = true;

  // まず名前をきいて、それから最初の会話に入る
  Scenes.push(new NameScene({
    title: 'あなたの なまえは？',
    initial: state.player.name,
    max: 5,
    onDone: (name) => {
      if (name) state.player.name = name;
      openIntro(field);
    },
  }));
}

function openIntro(field) {
  Scenes.push(new DialogScene({
    lines: [
      'ようこそ ポケモンの せかいへ！',
      `きみの なまえは ${state.player.name}。`,
      'むらの まんなかに いる はかせに はなしかけて さいしょの ポケモンを もらおう！',
    ],
    onClose: () => { field.busy = false; },
  }));
}

export function continueGame() {
  const r = load();
  if (!r.ok) {
    // 読めないセーブで上書きしないよう、新規として始める
    startNewGame();
    return;
  }
  const p = state.player.pos;
  loadMap(p.map, p.x, p.y, p.dir);
  const field = Scenes.reset(new FieldScene());
  installDebugHooks(field);
}
