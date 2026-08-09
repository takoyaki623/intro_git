import * as Screen from './core/screen.js';
import * as Loop from './core/loop.js';
import * as Input from './core/input.js';
import * as Scenes from './core/sceneStack.js';
import * as Audio from './core/audio.js';
import * as World from './game/world.js';
import * as Settings from './core/settings.js';
import { preload } from './engine/font.js';
import { state } from './game/state.js';
import { TitleScene } from './scenes/TitleScene.js';

const canvas = document.getElementById('screen');
const ctx = Screen.init(canvas);

Input.init();
preload();
Settings.load();   // 音量・文字速度。セーブとは別に持っているので起動時に読む

// ブラウザは操作があるまで音を鳴らさないので、最初の入力で解除する
for (const ev of ['keydown', 'pointerdown']) {
  addEventListener(ev, () => Audio.unlock(), { once: true });
}

Scenes.push(new TitleScene());

Loop.start(
  () => {
    Input.update();
    Scenes.update();
    // プレイ時間。60fps の固定ステップなので 1フレーム = 1/60 秒として数える。
    state.playTimeMs += 1000 / 60;
  },
  () => {
    Screen.clear('#000');
    Scenes.render(ctx);
  },
);

// Playwright からゲーム内部へ触れるようにしておく。
// これが無いと、モジュールの読み込みに失敗したときに「真っ黒な canvas」以外の
// 手がかりが何も残らない。
// World と state も出しておく。1枚にまとめたビルドは import で中身を掴めないので、
// ここを通さないとバンドル版だけテストできなくなる。
globalThis.__game = { Screen, Scenes, Input, Loop, Audio, World, state };
