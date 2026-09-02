/**
 * 実データの正しさを固定する基準テスト。
 *
 * v0.4 で tools/ による一括投入に切り替えるとき、
 * 変換結果がここで固定した値と一致することを確かめる基準になる。
 * 手書きデータ → 自動投入 の移行で数値が壊れていないことを保証する。
 */

import { describe, expect, it } from "vitest";
import {
  TYPES, calcDamage, createBattle, createRng, createRngState, legalActions, step,
  decidesPowerAtRuntime, toBattlePokemon, walkCommands,
} from "@pkmn/core";
import {
  allArt,
  allEncounterTables,
  allEvents,
  allMoves,
  allNamed,
  allSpecies,
  gameData,
} from "@pkmn/data";

describe("種族値が原作と一致する", () => {
  const EXPECTED: Record<string, [number, number, number, number, number, number]> = {
    // HP, こうげき, ぼうぎょ, とくこう, とくぼう, すばやさ
    bulbasaur: [45, 49, 49, 65, 65, 45],
    charmander: [39, 52, 43, 60, 50, 65],
    squirtle: [44, 48, 65, 50, 64, 43],
    pikachu: [35, 55, 40, 50, 50, 90],
    geodude: [40, 80, 100, 30, 30, 20],
    onix: [35, 45, 160, 30, 45, 70],
    gastly: [30, 35, 30, 100, 35, 80],
    lapras: [130, 85, 80, 85, 95, 60],
    abra: [25, 20, 15, 105, 55, 90],
    machop: [70, 80, 50, 35, 35, 35],
    magnemite: [25, 35, 70, 95, 55, 45],
    clefairy: [70, 45, 48, 60, 65, 35],
    // v0.4 で 151 種へ拡張した際に追加
    venusaur: [80, 82, 83, 100, 100, 80],
    charizard: [78, 84, 78, 109, 85, 100],
    blastoise: [79, 83, 100, 85, 105, 78],
    mewtwo: [106, 110, 90, 154, 90, 130],
    mew: [100, 100, 100, 100, 100, 100],
    snorlax: [160, 110, 65, 65, 110, 30],
    chansey: [250, 5, 5, 35, 105, 50],
    magikarp: [20, 10, 55, 15, 20, 80],
    gengar: [60, 65, 60, 130, 75, 110],
    dragonite: [91, 134, 95, 100, 100, 80],
    cloyster: [50, 95, 180, 85, 45, 70],
    alakazam: [55, 50, 45, 135, 95, 120],
  };

  for (const [id, [hp, atk, def, spa, spd, spe]] of Object.entries(EXPECTED)) {
    it(id, () => {
      expect(gameData.species(id).baseStats).toEqual({ hp, atk, def, spa, spd, spe });
    });
  }
});

describe("技の威力・命中・PP が原作と一致する", () => {
  const EXPECTED: Record<string, { power: number | null; accuracy: number | null; pp: number }> = {
    tackle: { power: 40, accuracy: 100, pp: 35 },
    "quick-attack": { power: 40, accuracy: 100, pp: 30 },
    "take-down": { power: 90, accuracy: 85, pp: 20 },
    "body-slam": { power: 85, accuracy: 100, pp: 15 },
    flamethrower: { power: 90, accuracy: 100, pp: 15 },
    thunderbolt: { power: 90, accuracy: 100, pp: 15 },
    "ice-beam": { power: 90, accuracy: 100, pp: 10 },
    surf: { power: 90, accuracy: 100, pp: 15 },
    "razor-leaf": { power: 55, accuracy: 95, pp: 25 },
    "rock-throw": { power: 50, accuracy: 90, pp: 15 },
    absorb: { power: 20, accuracy: 100, pp: 25 },
    "sleep-powder": { power: null, accuracy: 75, pp: 15 },
    "thunder-wave": { power: null, accuracy: 90, pp: 20 },
    toxic: { power: null, accuracy: 90, pp: 10 },
    "will-o-wisp": { power: null, accuracy: 85, pp: 15 },
    // 第9世代で 10 → 5 に変更された（実装時に見落としていた）
    recover: { power: null, accuracy: null, pp: 5 },
  };

  for (const [id, expected] of Object.entries(EXPECTED)) {
    it(id, () => {
      const move = gameData.move(id);
      expect({ power: move.power, accuracy: move.accuracy, pp: move.pp }).toEqual(expected);
    });
  }
});

describe("ダメージ計算が手計算と一致する", () => {
  /**
   * Lv50・個体値31・努力値0・性格無補正で手計算した値。
   * 式: floor(floor(floor(2*Lv/5+2) * 威力 * A / D) / 50) + 2 → 乱数 → タイプ一致 → 相性
   */
  it("ピカチュウの10まんボルト → ラプラス", () => {
    const a = toBattlePokemon(gameData, { species: "pikachu", level: 50, moves: ["thunderbolt"] });
    const d = toBattlePokemon(gameData, { species: "lapras", level: 50, moves: ["surf"] });

    // とくこう70 / とくぼう115 を前提に手計算した値
    expect(a.stats.spa).toBe(70);
    expect(d.stats.spd).toBe(115);
    expect(d.maxHp).toBe(205);

    const opts = { forceCritical: false } as const;
    const move = gameData.move("thunderbolt");
    const max = calcDamage(gameData, a, d, move, createRng(createRngState(1)), {
      ...opts, forceRandom: 100,
    });
    const min = calcDamage(gameData, a, d, move, createRng(createRngState(1)), {
      ...opts, forceRandom: 85,
    });

    // 基礎26 → 乱数 → タイプ一致1.5 → でんき対みず2倍
    expect(max.damage).toBe(78); // floor(26*1.5)=39 → 39*2
    expect(min.damage).toBe(66); // floor(26*0.85)=22 → floor(33) → 33*2
    expect(max.effectiveness).toBe(2);
  });

  it("急所は1.5倍になる", () => {
    const a = toBattlePokemon(gameData, { species: "pikachu", level: 50, moves: ["thunderbolt"] });
    const d = toBattlePokemon(gameData, { species: "lapras", level: 50, moves: ["surf"] });
    const move = gameData.move("thunderbolt");
    const crit = calcDamage(gameData, a, d, move, createRng(createRngState(1)), {
      forceCritical: true, forceRandom: 100,
    });
    // 基礎26 → 急所 floor(39) → 乱数100 → 一致 floor(58.5)=58 → x2 = 116
    expect(crit.damage).toBe(116);
  });
});

describe("データ全体の整合", () => {
  it("カントー151種が1つも欠けていない", () => {
    // v0.11 でカントーの外の種が入った（ネームドが使うぶんだけ）。
    // **「151種ちょうど」を数えるのはもう正しくない**が、
    // 確かめたいのは元から「1〜151 が欠けていないこと」の方だった
    const nums = new Set(allSpecies.map((s) => s.dexNo));
    for (let n = 1; n <= 151; n += 1) {
      expect(nums.has(n), `図鑑 ${n} 番`).toBe(true);
    }
    expect(nums.size, "図鑑番号の重複").toBe(allSpecies.length);
  });

  /**
   * v0.11 では「ネームドが使うためだけに居る」で正しかった。
   * v1.1 で原作のカントーに寄せると、**カントーの外の種でも野生に出るものがある**
   * ―― ソーナンス は ハナダのどうくつ に居る（第2世代の種だが FRLG に出る）。
   *
   * v1.1-k で逃げ道が2つ増えた。守りたいのは元の意図
   * （**消費者の居ない種を置かない**）のままで、増えたのは消費者の種類:
   *
   *   - **配ってもらう**（みずのめいろの トゲピー・固定シンボル）
   *   - **進化で辿り着く**（マリル を捕まえれば マリルリ は世界の中に居る）
   *
   * 進化先を除くと「野生に出る種の進化先」を1つも置けなくなり、
   * **公式データが吐いた進化の枝を、こちらの都合で切る**ことになる ――
   * それは「まだ足していない」ではなく「壊した」なので、逃げ道を足すほうが正しい。
   */
  it("カントーの外の種には必ず出番がある（使われる・野生・配布・進化のどれか）", () => {
    const outside = allSpecies.filter((s) => s.dexNo > 151);
    expect(outside.length).toBeGreaterThan(0);

    const reachable = new Set(
      allNamed.flatMap((c) =>
        Object.values(c.tiers).flatMap((party) => party.map((m) => m.species)),
      ),
    );
    for (const table of allEncounterTables) {
      for (const entry of table.entries) reachable.add(entry.species);
    }
    for (const event of allEvents) {
      for (const command of walkCommands(event.commands)) {
        if (command.kind === "givePokemon" || command.kind === "wildBattle") {
          reachable.add(command.species);
        }
      }
    }
    // 進化は何段でも辿る（マリル → マリルリ、ウリムー → イノムー …）
    for (let grew = true; grew; ) {
      grew = false;
      for (const s of allSpecies) {
        if (!reachable.has(s.id)) continue;
        for (const evo of s.evolutions ?? []) {
          if (!reachable.has(evo.to)) {
            reachable.add(evo.to);
            grew = true;
          }
        }
      }
    }

    for (const s of outside) {
      expect(reachable.has(s.id), `${s.name} に出番が無い`).toBe(true);
    }
  });

  it("種族値の合計が原作の値と一致する（打ち間違いの検出）", () => {
    const BST: Record<string, number> = {
      bulbasaur: 318, charizard: 534, blastoise: 530, pikachu: 320,
      mewtwo: 680, mew: 600, snorlax: 540, dragonite: 600,
      magikarp: 200, chansey: 450, gengar: 500, arcanine: 555,
    };
    for (const [id, total] of Object.entries(BST)) {
      const s = gameData.species(id);
      const sum = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
      expect(sum, `${id} の種族値合計`).toBe(total);
    }
  });

  it("全18タイプに攻撃技が存在する", () => {
    for (const type of TYPES) {
      const has = allMoves.some((m) => m.type === type && m.category !== "status");
      expect(has, `${type} の攻撃技`).toBe(true);
    }
  });
});

describe("データの網羅性", () => {
  it("全種族に必須フィールドが揃っている", () => {
    for (const s of allSpecies) {
      expect(s.types.length, s.id).toBeGreaterThanOrEqual(1);
      // learnset は空でありうる（v0.8）。
      // v1.1-i で全種が1つ以上のレベル技を持つようになった
      expect(s.catchRate, s.id).toBeGreaterThan(0);
      expect(s.abilities.length, s.id).toBeGreaterThan(0);
      expect(Object.keys(s.evYield).length, s.id).toBeGreaterThan(0);
    }
  });

  it("レベル技を持たない種は、機構が未実装の技しか覚えない種に限る", () => {
    // 空の learnset を野放しにすると「投入し忘れ」と区別が付かなくなる。
    // 原作の事実として空になる種だけを、名指しで許す。
    //
    // **v1.1-i で名簿が空になった。** メタモン（へんしん）と ケーシィ（テレポート）は
    // どちらも「その技しかレベルで覚えない」種で、技の機構が無いあいだだけ
    // ここに載っていた ―― 名簿は「まだ機構が無い」ことの一覧でもあり、
    // 機構ができたら**縮む**のが正しい。空のまま残すのは、
    // 次に同じことが起きたとき**書く場所がここだと分かる**ようにするため
    const allowed: string[] = [];
    const empty = allSpecies.filter((s) => s.learnset.length === 0).map((s) => s.id);
    expect(empty.sort()).toEqual(allowed.sort());
  });

  it("技を持たない個体でもバトルが成立する（わるあがき）", () => {
    const state = createBattle(
      gameData,
      [[{ species: "abra", level: 10, moves: [] }],
       [{ species: "rattata", level: 10, moves: ["tackle"] }]],
      1,
    );
    // 技が無くても行動の選択肢は空にならない
    expect(legalActions(gameData, state, 0).length).toBeGreaterThan(0);
    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.some((e) => e.kind === "struggle" && e.side === 0)).toBe(true);
  });

  it("learnset が参照する技が全て存在する", () => {
    for (const s of allSpecies) {
      for (const l of s.learnset) {
        expect(() => gameData.move(l.move), `${s.id} → ${l.move}`).not.toThrow();
      }
    }
  });

  /**
   * 例外は **威力を実行時に決める技**（プレゼント・おんがえし ほか）。
   * `damage.ts` の `powerOverride` を使う側なので、表の `power` は空でよい。
   *
   * **一覧はここに書かない**（v1.2-c）―― 検証とテストの2か所に同じ列挙があり、
   * 片方だけ直した跡ができた。core の `decidesPowerAtRuntime` を読む。
   */
  it("変化技は威力を持たず、攻撃技は必ず威力を持つ（実行時に決める技を除く）", () => {
    for (const m of allMoves) {
      if (m.category === "status") expect(m.power, m.id).toBeNull();
      else if (decidesPowerAtRuntime(m.effect)) expect(m.power, m.id).toBeNull();
      else expect(m.power, m.id).toBeGreaterThan(0);
    }
  });
});

describe("姿のレシピ（v0.12.5）", () => {
  const SHAPES = new Set([
    "ball", "squiggle", "fish", "arms", "blob", "upright", "legs",
    "quadruped", "wings", "tentacles", "heads", "humanoid", "bug-wings", "armor",
  ]);
  const SIZES = new Set(["tiny", "small", "medium", "large"]);
  const PARTS = new Set([
    "flame", "plant", "fin", "spark", "crystal", "drip", "aura",
    "horn", "spike", "plate", "antenna", "wing", "band", "sparkle",
  ]);

  it("全種にレシピがあり、描ける種類だけを指している", () => {
    const drawn = new Map(allArt.map((a) => [a.species, a]));
    for (const s of allSpecies) {
      const recipe = drawn.get(s.id);
      expect(recipe, s.id).toBeDefined();
      expect(SHAPES.has(recipe!.shape), `${s.id}: ${recipe!.shape}`).toBe(true);
      expect(SIZES.has(recipe!.size), `${s.id}: ${recipe!.size}`).toBe(true);
      for (const part of recipe!.parts) {
        expect(PARTS.has(part), `${s.id}: ${part}`).toBe(true);
      }
    }
  });

  it("居ない種のレシピを持っていない", () => {
    const ids = new Set(allSpecies.map((s) => s.id));
    for (const a of allArt) expect(ids.has(a.species), a.species).toBe(true);
  });

  it("進化前後で見た目が変わる（大きさか体型か色のどれかが違う）", () => {
    const recipe = new Map(allArt.map((a) => [a.species, a]));
    const key = (id: string) => {
      const a = recipe.get(id)!;
      return `${a.shape}/${a.color}/${a.size}`;
    };
    // **全部は変わらない**（原作でも姿がほぼ同じ進化はある）。
    // ここで見たいのは「ほとんど変わらない」状態になっていないこと
    const pairs = allSpecies.flatMap((s) =>
      s.evolutions.map((e) => [s.id, e.to] as const),
    );
    const changed = pairs.filter(([from, to]) => recipe.has(to) && key(from) !== key(to));
    expect(pairs.length).toBeGreaterThan(50);
    expect(changed.length / pairs.length).toBeGreaterThan(0.7);
  });
});
