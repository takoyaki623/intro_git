import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextRight, drawTextCentered, wrapText } from '../engine/font.js';
import { drawWindow, drawBar, hpColor, HP_THRESHOLDS, drawTypeTag, COL } from '../engine/ui.js';
import { TYPE_COLOR } from '../data/types.js';
import { getMove } from '../data/moves.js';
import { displayName } from '../game/monster.js';
import { expRatio, expToNext, STAT_LABEL } from '../game/formulas.js';
import { EXP_TYPE_LABEL } from '../data/growth.js';
import { MAPS } from '../data/maps/index.js';
import { natureText } from '../data/natures.js';

const W = Screen.W;
const H = Screen.H;

// IV の合計から素質の一言を出す。数字を直接見せるより雰囲気が出る。
const IV_WORDS = ['のんびり', 'ふつう', 'いいかんじ', 'すぐれた', 'ちからづよい', 'てんさいはだ'];

/** つよさをみる。A / ← → で 2ページを行き来する。 */
export class SummaryScene {
  constructor({ mon }) {
    this.mon = mon;
    this.page = 0;
  }

  enter() { Input.clearEdges(); }

  update() {
    if (Input.justPressed(BTN.B)) { Scenes.pop(); return; }
    if (Input.justPressed(BTN.A) || Input.repeated(BTN.RIGHT)) this.page = (this.page + 1) % 2;
    if (Input.repeated(BTN.LEFT)) this.page = (this.page + 1) % 2;
  }

  render(ctx) {
    const m = this.mon;
    ctx.fillStyle = '#384868';
    ctx.fillRect(0, 0, W, H);

    // 左のプロフィール欄は両ページ共通
    drawWindow(ctx, 4, 4, 90, 120);
    drawSprite(ctx, m.species.sprite, 21, 10, { scale: 2 });
    drawTextCentered(ctx, displayName(m), 49, 62, { color: COL.ink });
    drawTextCentered(ctx, `Lv${m.level}`, 49, 76, { color: COL.ink });

    let tx = 10;
    for (const t of m.species.types) tx += drawTypeTag(ctx, t, TYPE_COLOR[t], tx, 92) + 3;

    drawBar(ctx, 12, 114, 70, m.curHP / m.stats.hp, hpColor(m.curHP, m.stats.hp), { critAt: HP_THRESHOLDS });
    drawTextRight(ctx, `${m.curHP}/${m.stats.hp}`, 84, 102, { color: COL.ink });

    if (this.page === 0) this.renderStats(ctx);
    else this.renderMoves(ctx);

    drawWindow(ctx, 4, 128, 90, 60);
    drawText(ctx, 'ずかん', 12, 133, { color: COL.inkLight });
    drawTextRight(ctx, `No.${String(m.species.id).padStart(3, '0')}`, 86, 133, { color: COL.ink });
    drawText(ctx, 'どうぐ', 12, 150, { color: COL.inkLight });
    drawTextRight(ctx, m.held ?? 'なし', 86, 150, { color: COL.ink });
    drawText(ctx, 'とくせい', 12, 167, { color: COL.inkLight });
    drawTextRight(ctx, m.species.ability ?? 'なし', 86, 167, { color: COL.ink });

    drawWindow(ctx, 98, 172, 154, 16);
    drawText(ctx, this.page === 0 ? 'A ： わざを みる' : 'A ： のうりょくを みる', 106, 175, { color: COL.ink });
  }

  renderStats(ctx) {
    const m = this.mon;
    drawWindow(ctx, 98, 4, 154, 164);

    const rows = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    rows.forEach((k, i) => {
      const y = 12 + i * 17;
      drawText(ctx, STAT_LABEL[k], 106, y, { color: COL.ink });
      drawTextRight(ctx, String(m.stats[k]), 190, y, { color: COL.ink });
      // 上が個体値、下が努力値。どちらも数値は出さず、伸びしろだけ見せる。
      drawBar(ctx, 198, y + 2, 44, m.ivs[k] / 31, '#6ac0f0', { h: 3 });
      drawBar(ctx, 198, y + 8, 44, (m.evs?.[k] ?? 0) / 252, '#f0a840', { h: 3 });
    });

    const ivSum = Object.values(m.ivs).reduce((a, b) => a + b, 0);
    const word = IV_WORDS[Math.min(IV_WORDS.length - 1, Math.floor(ivSum / 32))];
    drawText(ctx, `せいかく ： ${m.nature.name}`, 106, 116, { color: COL.ink });
    drawText(ctx, natureText(m.nature), 106, 129, { color: COL.inkLight });
    drawText(ctx, `そしつ ： ${word}`, 106, 142, { color: COL.ink });
    drawText(ctx, 'つぎの Lvまで', 106, 155, { color: COL.inkLight });
    drawTextRight(ctx, String(expToNext(m)), 244, 155, { color: COL.ink });
    drawBar(ctx, 106, 167, 138, expRatio(m), COL.exp, { h: 3 });
  }

  renderMoves(ctx) {
    const m = this.mon;
    drawWindow(ctx, 98, 4, 154, 118);

    m.moves.forEach((mv, i) => {
      const def = getMove(mv.id);
      const y = 12 + i * 27;
      drawTypeTag(ctx, def.type, TYPE_COLOR[def.type], 106, y);
      drawText(ctx, mv.id, 106, y + 13, { color: COL.ink });
      drawTextRight(ctx, `${mv.pp}/${mv.maxPp}`, 244, y, { color: COL.ink });
    });

    drawWindow(ctx, 98, 126, 154, 42);
    const first = getMove(m.moves[0].id);
    wrapText(first?.desc ?? '', 138).slice(0, 2).forEach((l, i) => {
      drawText(ctx, l, 106, 132 + i * 14, { color: COL.ink });
    });
  }
}
