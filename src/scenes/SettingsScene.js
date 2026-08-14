import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { SE } from '../core/audio.js';
import { drawText, drawTextRight, drawTextCentered } from '../engine/font.js';
import { drawWindow, COL } from '../engine/ui.js';
import { settings, set, TEXT_SPEEDS, BATTLE_SPEEDS } from '../core/settings.js';

const W = Screen.W;
const H = Screen.H;

/**
 * せってい。左右で値を変える。
 * 変えた時点で pkmn_settings に書くので「けってい」ボタンは置かない。
 */
export class SettingsScene {
  constructor({ onClose = null } = {}) {
    this.onClose = onClose;
    this.index = 0;

    this.rows = [
      {
        label: 'もじの はやさ',
        get: () => TEXT_SPEEDS.find((s) => s.id === settings.textSpeed)?.label ?? 'ふつう',
        cycle: (d) => {
          const i = TEXT_SPEEDS.findIndex((s) => s.id === settings.textSpeed);
          const n = (i + d + TEXT_SPEEDS.length) % TEXT_SPEEDS.length;
          set('textSpeed', TEXT_SPEEDS[n].id);
        },
        hint: 'メッセージが 1文字ずつ でる はやさ。',
      },
      {
        label: 'バトルの えんしゅつ',
        get: () => BATTLE_SPEEDS.find((s) => s.id === settings.battleSpeed)?.label ?? 'ふつう',
        cycle: (d) => {
          const i = BATTLE_SPEEDS.findIndex((s) => s.id === settings.battleSpeed);
          const n = (i + d + BATTLE_SPEEDS.length) % BATTLE_SPEEDS.length;
          set('battleSpeed', BATTLE_SPEEDS[n].id);
        },
        hint: 'バトル中の アニメーションの はやさ。Ｂを おしっぱなしでも はやおくり。',
      },
      {
        label: 'こうかおん',
        get: () => (settings.sound ? 'オン' : 'オフ'),
        cycle: () => set('sound', !settings.sound),
        hint: 'こうげきや メニューの おとを ならすか どうか。',
      },
      {
        label: 'おんりょう',
        get: () => `${Math.round(settings.volume * 10)}`,
        cycle: (d) => set('volume', Math.max(0, Math.min(1, settings.volume + d * 0.1))),
        hint: 'ぜんたいの おおきさ。０で むおん、１０で さいだい。',
      },
      {
        label: 'ＢＧＭ',
        get: () => (settings.music ? 'オン' : 'オフ'),
        cycle: () => set('music', !settings.music),
        hint: 'おんがくを ならすか どうか。',
      },
      {
        label: 'ＢＧＭの おおきさ',
        get: () => `${Math.round(settings.musicVolume * 10)}`,
        cycle: (d) => set('musicVolume', Math.max(0, Math.min(1, settings.musicVolume + d * 0.1))),
        hint: 'こうかおんとは べつに かえられます。',
      },
      {
        label: 'データを かきだす',
        action: async () => {
          const { exportSaveText } = await import('../game/state.js');
          const { showExport } = await import('../core/ioOverlay.js');
          showExport(exportSaveText());
        },
        hint: 'いまの ぼうけんを もじれつに して コピーできます。',
      },
      {
        label: 'データを よみこむ',
        action: async () => {
          const { showImport } = await import('../core/ioOverlay.js');
          const { importSaveText } = await import('../game/state.js');
          showImport((text) => importSaveText(text));
        },
        hint: 'コピーした もじれつを はりつけて、ぼうけんを もどします。',
      },
    ];
  }

  enter() { Input.clearEdges(); }
  exit() { this.onClose?.(); }
  resume() { Input.clearEdges(); }

  async update() {
    if (Input.justPressed(BTN.B)) { Scenes.pop(); return; }
    if (Input.justPressed(BTN.A)) {
      const row = this.rows[this.index];
      if (row.action) { await row.action(); return; }
      const { KeyConfigScene } = await import('./KeyConfigScene.js');
      Scenes.push(new KeyConfigScene());
      return;
    }

    if (Input.repeated(BTN.UP)) { this.index = (this.index + this.rows.length - 1) % this.rows.length; SE.cursor(); }
    if (Input.repeated(BTN.DOWN)) { this.index = (this.index + 1) % this.rows.length; SE.cursor(); }

    const row = this.rows[this.index];
    const d = Input.repeated(BTN.RIGHT) ? 1 : Input.repeated(BTN.LEFT) ? -1 : 0;
    if (d && row.cycle) {
      row.cycle(d);
      SE.select();     // 音を切った直後は鳴らないが、それが「切れた」合図になる
    }
  }

  render(ctx) {
    const row = this.rows[this.index];
    ctx.fillStyle = '#3c4a68';
    ctx.fillRect(0, 0, W, H);

    drawWindow(ctx, 4, 4, 248, 26);
    drawText(ctx, 'せってい', 12, 9, { color: COL.ink });
    drawTextRight(ctx, '← → で かえる', 244, 10, { color: COL.inkLight });

    const lineH = 13;
    drawWindow(ctx, 4, 34, 248, 112);
    this.rows.forEach((r, i) => {
      const y = 39 + i * lineH;
      const on = i === this.index;
      if (on) {
        ctx.fillStyle = '#e8e0c8';
        ctx.fillRect(10, y - 3, 236, lineH + 2);
      }
      drawText(ctx, r.label, 18, y, { color: COL.ink });
      if (r.action) {
        if (on) drawTextRight(ctx, 'Ａ ▶', 234, y, { color: COL.select });
        return;
      }
      const v = r.get();
      drawTextRight(ctx, `${on ? '◀ ' : ''}${v}${on ? ' ▶' : ''}`, 234, y, {
        color: on ? COL.select : COL.ink,
      });
    });

    drawWindow(ctx, 4, 150, 248, 38);
    drawText(ctx, row.hint, 12, 156, { color: COL.ink });
    const aLabel = row.action ? 'じっこう' : 'キーの わりあて';
    drawTextCentered(ctx, `Ａ ： ${aLabel}　　Ｂ ： とじる`, W / 2, 172, { color: COL.inkLight });
  }
}
