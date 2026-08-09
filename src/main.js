import * as Screen from './core/screen.js';
import * as Loop from './core/loop.js';
import * as Input from './core/input.js';
import * as Scenes from './core/sceneStack.js';
import { preload } from './engine/font.js';
import { TitleScene } from './scenes/TitleScene.js';

const canvas = document.getElementById('screen');
const ctx = Screen.init(canvas);

Input.init();
preload();

Scenes.push(new TitleScene());

Loop.start(
  () => {
    Input.update();
    Scenes.update();
  },
  () => {
    Screen.clear('#000');
    Scenes.render(ctx);
  },
);

// Playwright からゲーム内部へ触れるようにしておく。
// これが無いと、モジュールの読み込みに失敗したときに「真っ黒な canvas」以外の
// 手がかりが何も残らない。
globalThis.__game = { Screen, Scenes, Input, Loop };
