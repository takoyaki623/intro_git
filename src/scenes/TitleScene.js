import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import * as Storage from '../core/storage.js';
import { drawText, drawTextCentered } from '../engine/font.js';
import { drawWindow, COL, fillScreen } from '../engine/ui.js';
import { Menu } from '../engine/menu.js';
import { draw as drawSprite, placeholderSprite } from '../engine/pixelArt.js';
import { SPECIES } from '../data/species.js';
import { SPR } from '../data/sprites/monsters.js';

const W = Screen.W;
const H = Screen.H;

export class TitleScene {
  constructor() {
    this.t = 0;
    this.mode = 'logo';   // logo → menu
    this.menu = null;
    this.mascot = SPR.hitokage ?? placeholderSprite(4, '#e8703a');
  }

  enter() {
    Input.clearAll();
    this.buildMenu();
  }

  buildMenu() {
    const has = Storage.hasSave();
    this.menu = new Menu(
      [
        { label: 'つづきから', id: 'continue', disabled: !has },
        { label: 'はじめから', id: 'new' },
        { label: 'そうさせつめい', id: 'help' },
      ],
      { x: 84, y: 118, lineH: 16, colW: 100, index: has ? 0 : 1 },
    );
  }

  update() {
    this.t++;

    if (this.mode === 'logo') {
      if (this.t > 40 || Input.justPressed(BTN.A) || Input.justPressed(BTN.START)) {
        this.mode = 'menu';
      }
      return;
    }

    if (this.mode === 'help') {
      if (Input.justPressed(BTN.A) || Input.justPressed(BTN.B)) this.mode = 'menu';
      return;
    }

    const r = this.menu.update();
    if (r?.type === 'select') this.choose(r.item.id);
  }

  async choose(id) {
    if (id === 'help') {
      this.mode = 'help';
      return;
    }
    // FieldScene は data/ 一式を引き連れてくるので、タイトル表示までの初期ロードを
    // 軽くするために選択された時点で読み込む。
    const [{ startNewGame, continueGame }] = await Promise.all([
      import('../game/bootstrap.js'),
    ]);
    if (id === 'new') startNewGame();
    else continueGame();
  }

  render(ctx) {
    // 空のグラデーション（矩形の積み重ねで作る。滑らかなグラデはドット絵と喧嘩する）
    const bands = ['#2a2a58', '#3a3a72', '#4c4c8c', '#6262a4', '#8079b8'];
    const bh = Math.ceil(H / bands.length);
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, i * bh, W, bh);
    }

    // 星
    for (let i = 0; i < 24; i++) {
      const x = (i * 71) % W;
      const y = (i * 37) % 90;
      const tw = (this.t + i * 7) % 120;
      if (tw > 60) continue;
      ctx.fillStyle = tw > 40 ? '#ffffff' : '#c8c8f0';
      ctx.fillRect(x, y, 1, 1);
    }

    // 地面
    ctx.fillStyle = '#2c6a3a';
    ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = '#3c8a4a';
    ctx.fillRect(0, H - 34, W, 3);

    // マスコット（ふわふわ上下）
    const bob = Math.round(Math.sin(this.t / 22) * 2);
    drawSprite(ctx, this.mascot, W - 68, H - 34 - 48 + bob, { scale: 2 });

    // ロゴ
    const logoY = 22 + (this.mode === 'logo' ? Math.round(Math.sin(this.t / 8) * 2) : 0);
    drawTextCentered(ctx, 'ポケットモンスター', W / 2, logoY, {
      color: '#ffe14a', shadow: '#8a4a10',
    });
    drawTextCentered(ctx, '― ドットのぼうけん ―', W / 2, logoY + 18, {
      color: '#ffffff', shadow: '#404070',
    });

    if (this.mode === 'logo') {
      if (this.t % 60 < 36) {
        drawTextCentered(ctx, 'おしてね', W / 2, 140, { color: '#ffffff', shadow: '#303050' });
      }
      return;
    }

    if (this.mode === 'help') {
      this.renderHelp(ctx);
      return;
    }

    drawWindow(ctx, 74, 108, 116, 62);
    this.menu.render(ctx);

    if (!Storage.hasSave()) {
      drawText(ctx, 'セーブなし', 6, H - 14, { color: '#ffffff', shadow: '#303050' });
    }
  }

  renderHelp(ctx) {
    fillScreen(ctx, '#000000', 0.55);
    drawWindow(ctx, 14, 26, 228, 140);

    const lines = [
      'そうさほうほう',
      '',
      'いどう      ： やじるし / WASD',
      'けってい    ： Z または スペース',
      'キャンセル  ： X または Esc',
      'メニュー    ： C',
      'ダッシュ    ： Shift をおしながら',
      '',
      'スマホは がめんしたの ボタンで',
      'そうさ できます。',
    ];
    lines.forEach((l, i) => {
      drawText(ctx, l, 24, 36 + i * 13, { color: i === 0 ? COL.select : COL.ink });
    });
  }
}
