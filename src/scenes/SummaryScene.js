import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextRight, drawTextCentered, wrapText } from '../engine/font.js';
import { drawWindow, drawBar, drawCursor, hpColor, HP_THRESHOLDS, drawTypeTag, COL } from '../engine/ui.js';
import { TYPE_COLOR } from '../data/types.js';
import { getMove } from '../data/moves.js';
import { displayName } from '../game/monster.js';
import { expRatio, expToNext, STAT_LABEL } from '../game/formulas.js';
import { EXP_TYPE_LABEL } from '../data/growth.js';
import { MAPS } from '../data/maps/index.js';
import { natureText } from '../data/natures.js';
import { getAbilityDesc } from '../data/abilities.js';

const PAGE_HINT = ['A ： わざを みる', 'A ： とくせいを みる', 'A ： のうりょくを みる'];

const W = Screen.W;
const H = Screen.H;

// IV の合計から素質の一言を出す。数字を直接見せるより雰囲気が出る。
const IV_WORDS = ['のんびり', 'ふつう', 'いいかんじ', 'すぐれた', 'ちからづよい', 'てんさいはだ'];

/** つよさをみる。A / ← → で 2ページを行き来する。 */
export class SummaryScene {
  constructor({ mon }) {
    this.mon = mon;
    this.page = 0;
    this.moveIndex = 0;
  }

  enter() { Input.clearEdges(); }

  update() {
    if (Input.justPressed(BTN.B)) { Scenes.pop(); return; }
    if (Input.justPressed(BTN.A) || Input.repeated(BTN.RIGHT)) this.page = (this.page + 1) % 3;
    if (Input.repeated(BTN.LEFT)) this.page = (this.page + 2) % 3;

    if (this.page === 1 && this.mon.moves.length > 1) {
      if (Input.repeated(BTN.UP)) this.moveIndex = (this.moveIndex + this.mon.moves.length - 1) % this.mon.moves.length;
      if (Input.repeated(BTN.DOWN)) this.moveIndex = (this.moveIndex + 1) % this.mon.moves.length;
    }
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
    else if (this.page === 1) this.renderMoves(ctx);
    else this.renderAbility(ctx);

    drawWindow(ctx, 4, 128, 90, 60);
    drawText(ctx, 'ずかん', 12, 133, { color: COL.inkLight });
    drawTextRight(ctx, `No.${String(m.species.id).padStart(3, '0')}`, 86, 133, { color: COL.ink });
    drawText(ctx, 'どうぐ', 12, 148, { color: COL.inkLight });
    drawTextRight(ctx, m.held ?? 'なし', 86, 148, { color: COL.ink });
    // とくせいの名前は「がんじょう」「すなおこし」など長いものが多く、ラベルと同じ行に
    // 右寄せすると重なってしまう（実測ずみ）。ラベルの次の行に単独で置く。
    drawText(ctx, 'とくせい', 12, 163, { color: COL.inkLight });
    drawTextRight(ctx, m.species.ability ?? 'なし', 86, 176, { color: COL.ink });

    drawWindow(ctx, 98, 172, 154, 16);
    drawText(ctx, PAGE_HINT[this.page], 106, 175, { color: COL.ink });
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
    this.moveIndex = Math.min(this.moveIndex, m.moves.length - 1);
    drawWindow(ctx, 98, 4, 154, 118);

    m.moves.forEach((mv, i) => {
      const def = getMove(mv.id);
      const y = 12 + i * 27;
      if (i === this.moveIndex) drawCursor(ctx, 100, y + 3, COL.select);
      drawTypeTag(ctx, def.type, TYPE_COLOR[def.type], 106, y);
      drawText(ctx, mv.id, 106, y + 13, { color: COL.ink });
      drawTextRight(ctx, `${mv.pp}/${mv.maxPp}`, 244, y, { color: COL.ink });
    });

    drawWindow(ctx, 98, 126, 154, 42);
    const cur = m.moves[this.moveIndex];
    const def = getMove(cur.id);
    const power = def?.power > 0 ? String(def.power) : 'ー';
    const acc = def?.accuracy == null ? 'ぜったい' : String(def.accuracy);
    // いりょく・めいちゅうを両方 フルネームで1行に出すと幅が足りないわざがあるので、
    // 2段に分ける（せつめいは1行だけになるが、数値のほうが優先度が高い）。
    drawText(ctx, `いりょく ${power}`, 106, 132, { color: COL.inkLight });
    drawText(ctx, `めいちゅう ${acc}`, 106, 145, { color: COL.inkLight });
    const first = wrapText(def?.desc ?? '', 138)[0] ?? '';
    drawText(ctx, first, 106, 158, { color: COL.ink });
  }

  renderAbility(ctx) {
    const m = this.mon;
    drawWindow(ctx, 98, 4, 154, 164);
    const ability = m.species.ability;
    drawText(ctx, 'とくせい', 106, 12, { color: COL.inkLight });
    drawText(ctx, ability ?? 'なし', 106, 27, { color: COL.ink });
    wrapText(getAbilityDesc(ability), 138).forEach((l, i) => {
      drawText(ctx, l, 106, 46 + i * 14, { color: COL.ink });
    });

    if (m.held) {
      drawText(ctx, 'どうぐ', 106, 120, { color: COL.inkLight });
      drawText(ctx, m.held, 106, 135, { color: COL.ink });
    }
  }
}
