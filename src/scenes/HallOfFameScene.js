import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { SE } from '../core/audio.js';
import * as Music from '../core/music.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextCentered } from '../engine/font.js';
import { fillScreen } from '../engine/ui.js';
import { TextBox } from '../engine/textbox.js';
import { displayName } from '../game/monster.js';
import { state, setFlag, autoSave } from '../game/state.js';

const W = Screen.W;
const H = Screen.H;

const CREDITS = [
  ['さいごまで あそんでくれて', 'ありがとう！'],
  ['ポケモン風 RPG', 'つくりかた の きろく'],
  ['マップ・データ・エンジン', 'ドット・おんがく も ぜんぶ', 'このプロジェクトの なかに'],
  ['また あたらしい たびに', 'でかけてみてね。'],
];

/**
 * ポケモンリーグ チャンピオン戦に かったあとの エンディング。
 * 白フェード → 手持ちを1匹ずつ紹介 → かんたんな クレジット → タイトルへ。
 */
export class HallOfFameScene {
  constructor() {
    this.t = 0;
    this.phase = 'fade';      // fade → roll → credits → done
    this.rollIndex = 0;
    this.box = new TextBox({ y: 146, h: 40 });
  }

  enter() {
    Input.clearEdges();
    Music.play('victory');
    setFlag('hallOfFame');
    state.hallOfFameCount = (state.hallOfFameCount ?? 0) + 1;
    autoSave();
  }

  update() {
    this.t++;

    if (this.phase === 'fade') {
      if (this.t > 50) {
        this.phase = 'roll';
        this.t = 0;
        this.box.setText(`${state.player.name}は でんどうにゅうりした！`);
      }
      return;
    }

    if (this.phase === 'roll') {
      this.box.update(Input.isDown(BTN.A));
      if (Input.justPressed(BTN.A)) {
        if (!this.box.advance()) return;
        this.rollIndex++;
        if (this.rollIndex > state.party.length) {
          this.phase = 'credits';
          this.creditPage = 0;
          this.box.setText(CREDITS[0].join('\n'));
          return;
        }
        const mon = state.party[this.rollIndex - 1];
        SE.select();
        this.box.setText(`${displayName(mon)}  Lv${mon.level}`);
      }
      return;
    }

    if (this.phase === 'credits') {
      this.box.update(Input.isDown(BTN.A));
      if (Input.justPressed(BTN.A)) {
        if (!this.box.advance()) return;
        this.creditPage++;
        if (this.creditPage >= CREDITS.length) {
          this.phase = 'done';
          this.finish();
          return;
        }
        this.box.setText(CREDITS[this.creditPage].join('\n'));
      }
    }
  }

  async finish() {
    const { TitleScene } = await import('./TitleScene.js');
    Scenes.reset(new TitleScene());
  }

  render(ctx) {
    fillScreen(ctx, '#ffffff', Math.min(1, this.t / 40));

    if (this.phase === 'fade') return;

    ctx.fillStyle = '#182038';
    ctx.fillRect(0, 0, W, H);

    if (this.phase === 'roll' && this.rollIndex >= 1 && this.rollIndex <= state.party.length) {
      const mon = state.party[this.rollIndex - 1];
      const cx = W / 2;
      const bob = Math.round(Math.sin(this.t / 14) * 3);
      drawSprite(ctx, mon.species.sprite, cx - 24, 40 + bob, { scale: 2 });
    } else if (this.phase === 'roll') {
      drawTextCentered(ctx, '★ でんどうの ま ★', W / 2, 60, { color: '#ffe14a', shadow: '#303050' });
    } else {
      drawTextCentered(ctx, 'THANK YOU', W / 2, 60, { color: '#ffe14a', shadow: '#303050' });
    }

    this.box.render(ctx);
  }
}
