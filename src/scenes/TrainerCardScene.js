// トレーナーカード（Phase Z-1）。
// state に散らばっていた記録（プレイ時間だけ）を、歩数・戦績・図鑑の記録まで含めて1画面にまとめる。

import * as Screen from '../core/screen.js';
import * as Scenes from '../core/sceneStack.js';
import * as Input from '../core/input.js';
import { BTN } from '../core/input.js';
import { draw as drawSprite } from '../engine/pixelArt.js';
import { drawText, drawTextRight } from '../engine/font.js';
import { drawWindow, COL } from '../engine/ui.js';
import { state, playTimeText } from '../game/state.js';
import { BADGES, badgeFlag } from '../data/trainers.js';
import { getSpecies } from '../data/species.js';
import { MAPS } from '../data/maps/index.js';

const W = Screen.W;
const H = Screen.H;

export class TrainerCardScene {
  enter() { Input.clearEdges(); }

  update() {
    if (Input.justPressed(BTN.B) || Input.justPressed(BTN.A)) Scenes.pop();
  }

  /** ぜんぶの手持ち・ボックスから、metLv と 現在Lv の差がいちばん大きい子を探す。 */
  longestRaised() {
    const all = [...state.party, ...state.boxes.flat()].filter(Boolean);
    if (!all.length) return null;
    return all.reduce((best, m) => {
      const grown = m.level - (m.metLv ?? m.level);
      const bestGrown = best.level - (best.metLv ?? best.level);
      return grown > bestGrown ? m : best;
    });
  }

  render(ctx) {
    drawWindow(ctx, 8, 8, W - 16, H - 16);
    drawText(ctx, 'トレーナーカード', 20, 16, { color: COL.ink });

    drawText(ctx, state.player.name, 20, 30, { color: COL.ink });
    if (state.flags.nuzlocke) {
      drawTextRight(ctx, 'しょうがいれんぞく', W - 20, 30, { color: COL.select });
    }
    drawText(ctx, `おかね ${state.player.money}円`, 20, 42, { color: COL.inkLight });
    drawTextRight(ctx, playTimeText(), W - 20, 42, { color: COL.inkLight });

    drawText(ctx, 'バッジ', 20, 56, { color: COL.inkLight });
    BADGES.forEach((b, i) => {
      const bx = 56 + i * 13;
      const y = 53;
      const got = !!state.flags[badgeFlag(b.id)];
      ctx.fillStyle = COL.ink;
      ctx.fillRect(bx, y, 10, 10);
      ctx.fillStyle = got ? b.color : COL.paper;
      ctx.fillRect(bx + 1, y + 1, 8, 8);
      if (got) { ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + 3, y + 3, 2, 2); }
    });

    // 2列×3行で6項目ぶん。1列ぶんだと縦に収まらないので、ここだけ横に並べる。
    const s = state.stats ?? {};
    const pairs = [
      ['あるいた', `${s.steps ?? 0}ほ`, 'たたかった', `${s.battles ?? 0}かい`],
      ['つかまえた', `${s.caught ?? 0}ひき`, 'にげた', `${s.fled ?? 0}かい`],
      ['ボール', `${s.ballsUsed ?? 0}個`, 'タワー', `${s.towerBest ?? 0}れん`],
    ];
    let ly = 72;
    for (const [l1, v1, l2, v2] of pairs) {
      drawText(ctx, l1, 20, ly, { color: COL.inkLight });
      drawTextRight(ctx, v1, 118, ly, { color: COL.ink });
      drawText(ctx, l2, 138, ly, { color: COL.inkLight });
      drawTextRight(ctx, v2, W - 20, ly, { color: COL.ink });
      ly += 12;
    }

    // 2列: いちばんそだてた／はじめてつかまえた（どちらも小さく1匹ぶんだけ出す）
    const colY = ly + 12;
    const col2 = 134;
    drawText(ctx, 'そだてた', 20, colY, { color: COL.inkLight });
    drawText(ctx, 'はじめて', col2, colY, { color: COL.inkLight });

    const long = this.longestRaised();
    if (long) {
      drawSprite(ctx, long.species.sprite, 20, colY + 8, { scale: 1.3 });
      drawText(ctx, `${long.nick ?? long.species.name}`, 55, colY + 16, { color: COL.ink });
      drawText(ctx, `Lv${long.level}（+${long.level - (long.metLv ?? long.level)}）`, 55, colY + 28, { color: COL.inkLight });
    } else {
      drawText(ctx, 'まだ いない', 20, colY + 20, { color: COL.inkLight });
    }

    const firstId = state.dex?.caught?.[0];
    if (firstId != null) {
      const sp = getSpecies(firstId);
      const place = MAPS[state.dex.where?.[firstId]]?.name ?? '？？？';
      if (sp) drawSprite(ctx, sp.sprite, col2, colY + 8, { scale: 1.3 });
      drawText(ctx, `${sp?.name ?? '？？？'}`, col2 + 35, colY + 16, { color: COL.ink });
      drawText(ctx, place, col2 + 35, colY + 28, { color: COL.inkLight });
    } else {
      drawText(ctx, 'まだ いない', col2, colY + 20, { color: COL.inkLight });
    }
  }
}
