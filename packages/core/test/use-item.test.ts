/**
 * バッグから道具を使う（v0.9）。
 *
 * ここで確かめたいのは回復量そのものより、
 * **バトル中とマップ上で同じ結果になること** ―― 実装が1つである証拠。
 * 設計: docs/design/economy.md §7
 */

import { describe, expect, it } from "vitest";
import {
  createBattle,
  createInstance,
  createRng,
  step,
  instanceToBattle,
  isUsable,
  maxHpOf,
  refused,
  useOnBattle,
  useOnInstance,
  type PokemonInstance,
} from "@pkmn/core";
import { allNatures, gameData } from "@pkmn/data";

const rng = () => createRng({ s: 12345, calls: 0 });
const natures = allNatures.map((n) => n.id);

const make = (species = "charmander", level = 20): PokemonInstance =>
  createInstance(gameData, { species, level, region: "kanto" }, rng(), natures);

const hurt = (p: PokemonInstance, hp: number): PokemonInstance => ({ ...p, currentHp: hp });

describe("回復道具", () => {
  it("キズぐすりは 20 だけ回復する", () => {
    const result = useOnInstance(gameData, "potion", hurt(make(), 1));
    expect(refused(result)).toBe(false);
    if (refused(result)) return;
    expect(result.instance.currentHp).toBe(21);
  });

  it("最大値を超えない", () => {
    const mon = make();
    const full = maxHpOf(gameData, mon);
    const result = useOnInstance(gameData, "hyper-potion", hurt(mon, full - 5));
    if (refused(result)) throw new Error(result.reason);
    expect(result.instance.currentHp).toBe(full);
  });

  it("HP が満タンなら断る（道具を減らさないため）", () => {
    const mon = make();
    const result = useOnInstance(gameData, "potion", hurt(mon, maxHpOf(gameData, mon)));
    expect(refused(result)).toBe(true);
  });

  it("ひんしには回復薬が効かず、げんきのかけらだけが効く", () => {
    const mon = hurt(make(), 0);
    expect(refused(useOnInstance(gameData, "potion", mon))).toBe(true);

    const revived = useOnInstance(gameData, "revive", mon);
    if (refused(revived)) throw new Error(revived.reason);
    expect(revived.instance.currentHp).toBe(Math.floor(maxHpOf(gameData, mon) / 2));
  });

  it("げんきのかけらは倒れていない相手には使えない", () => {
    expect(refused(useOnInstance(gameData, "revive", make()))).toBe(true);
  });
});

describe("状態異常を治す道具", () => {
  it("どくけしは どく だけを治す", () => {
    const poisoned = { ...make(), status: "poison" as const };
    const ok = useOnInstance(gameData, "antidote", poisoned);
    if (refused(ok)) throw new Error(ok.reason);
    expect(ok.instance.status).toBeNull();

    const burned = { ...make(), status: "burn" as const };
    expect(refused(useOnInstance(gameData, "antidote", burned))).toBe(true);
  });

  it("なんでもなおしは全ての状態異常を治す", () => {
    for (const status of ["poison", "toxic", "paralysis", "burn", "sleep", "freeze"] as const) {
      const result = useOnInstance(gameData, "full-heal", { ...make(), status });
      if (refused(result)) throw new Error(`${status}: ${result.reason}`);
      expect(result.instance.status).toBeNull();
      expect(result.instance.statusCounter).toBe(0);
    }
  });

  it("かいふくのくすりは HP が満タンでも状態異常を治す（1つでも効けば成功）", () => {
    const mon = { ...make(), status: "burn" as const };
    const result = useOnInstance(gameData, "full-restore", mon);
    if (refused(result)) throw new Error(result.reason);
    expect(result.instance.status).toBeNull();
  });
});

describe("PP を回復する道具", () => {
  it("ピーピーエイドは減っている技を1つ回復する", () => {
    const mon = make();
    const used: PokemonInstance = {
      ...mon,
      moves: mon.moves.map((m, i) => (i === 0 ? { ...m, pp: 0 } : m)),
    };
    const result = useOnInstance(gameData, "ether", used);
    if (refused(result)) throw new Error(result.reason);
    expect(result.instance.moves[0]!.pp).toBeGreaterThan(0);
  });

  it("減っていなければ断る", () => {
    expect(refused(useOnInstance(gameData, "ether", make()))).toBe(true);
  });
});

describe("バトル中とマップ上で結果が一致する", () => {
  // **同じ実装を通っている証拠**。分けて書くといつか片方だけずれる
  it("キズぐすりの回復量が同じ", () => {
    const mon = hurt(make(), 3);
    const onMap = useOnInstance(gameData, "potion", mon);
    if (refused(onMap)) throw new Error(onMap.reason);

    const inBattle = instanceToBattle(gameData, mon);
    const result = useOnBattle(gameData, "potion", inBattle);
    if (refused(result)) throw new Error(result.reason);

    expect(inBattle.currentHp).toBe(onMap.instance.currentHp);
  });

  it("状態異常も同じように消える", () => {
    const mon = { ...make(), status: "sleep" as const, statusCounter: 2 };
    const onMap = useOnInstance(gameData, "awakening", mon);
    if (refused(onMap)) throw new Error(onMap.reason);

    const inBattle = instanceToBattle(gameData, mon);
    useOnBattle(gameData, "awakening", inBattle);

    expect(inBattle.status).toBeNull();
    expect(onMap.instance.status).toBeNull();
    expect(inBattle.statusCounter).toBe(0);
    expect(onMap.instance.statusCounter).toBe(0);
  });
});

describe("使える場所", () => {
  it("持ち物としての効果しか無い道具は使えない", () => {
    expect(isUsable(gameData.item("leftovers"), "field")).toBe(false);
    expect(isUsable(gameData.item("poke-ball"), "field")).toBe(false);
    expect(isUsable(gameData.item("potion"), "field")).toBe(true);
    expect(isUsable(gameData.item("potion"), "battle")).toBe(true);
  });
});

describe("バトル中に使ったとき、UI が結果を受け取れる（v0.12）", () => {
  /**
   * v0.9 から v0.11 まで、`itemUsed` は文章しか運んでいなかった。
   * 表示層は **BattleState を覗きにいかない**造りなので、
   * イベントに乗っていない情報は存在しないのと同じ ――
   * 結果として、キズぐすりを使っても HPバーが動かなかった。
   */
  it("回復したあとの HP と状態がイベントに乗る", () => {
    const state = createBattle(
      gameData,
      [
        [{ species: "charmander", level: 20, moves: ["scratch"] }],
        [{ species: "pidgey", level: 5, moves: ["tackle"] }],
      ],
      1,
    );
    const me = state.sides[0].party[0]!;
    me.currentHp = 5;
    me.status = "poison";

    const out = step(gameData, state, [
      { kind: "item", item: "full-heal" },
      { kind: "move", moveIndex: 0 },
    ]);
    const used = out.events.find((e) => e.kind === "itemUsed");
    expect(used?.kind).toBe("itemUsed");
    if (used?.kind !== "itemUsed") return;
    expect(used.target).toBe(0);
    expect(used.status).toBeNull();

    // 状態を治しただけなので HP は増えない。**それでも今の HP を返す**
    // ―― 「変わらなかった」ことも表示層には情報になる
    expect(used.remainingHp).toBeGreaterThan(0);
  });

  it("回復薬なら HP が増えた値が乗る", () => {
    const state = createBattle(
      gameData,
      [
        [{ species: "charmander", level: 20, moves: ["scratch"] }],
        [{ species: "pidgey", level: 5, moves: ["tackle"] }],
      ],
      2,
    );
    const me = state.sides[0].party[0]!;
    me.currentHp = 5;

    const out = step(gameData, state, [
      { kind: "item", item: "potion" },
      { kind: "move", moveIndex: 0 },
    ]);
    const used = out.events.find((e) => e.kind === "itemUsed");
    if (used?.kind !== "itemUsed") throw new Error("itemUsed が出ていない");
    expect(used.remainingHp).toBeGreaterThan(5);
  });
});

/**
 * 道具が個体を作り替える（v1.1-b）。
 *
 * 確かめたいのは効果そのものより、**道具の側が決めないこと** ――
 * わざの入れ替えも進化も「提案」で返り、実際にやるのは UI。
 * ここが崩れると、原作の「やめる」が効かない道具ができる。
 */
describe("わざマシン", () => {
  /** ヒトカゲはマシンで かえんほうしゃ を覚える（公式の互換表）。 */
  const withMoves = (p: PokemonInstance, ids: string[]): PokemonInstance => ({
    ...p,
    moves: ids.map((id) => ({ id, pp: gameData.move(id).pp })),
  });

  it("空きがあれば その場で おぼえる", () => {
    const before = withMoves(make(), ["scratch"]);
    const result = useOnInstance(gameData, "tm35", before);
    expect(refused(result)).toBe(false);
    if (refused(result)) return;
    expect(result.instance.moves.map((m) => m.id)).toEqual(["scratch", "flamethrower"]);
    // **続きが無い** ―― 選ぶことが何も無いので UI を通さない
    expect(result.then).toBeUndefined();
  });

  it("4つ埋まっていたら、入れ替えは UI に渡す（勝手に消さない）", () => {
    const before = withMoves(make(), ["scratch", "growl", "ember", "smokescreen"]);
    const result = useOnInstance(gameData, "tm35", before);
    expect(refused(result)).toBe(false);
    if (refused(result)) return;
    expect(result.then).toEqual({ kind: "learnMove", move: "flamethrower" });
    // **この時点では何も変わっていない。** 変えるのは選んだあと
    expect(result.instance.moves.map((m) => m.id)).toEqual(before.moves.map((m) => m.id));
  });

  it("覚えられない種には、覚えられないと言う", () => {
    // メタモンはマシンを1本も覚えない（原作どおり・互換表が0件の4種の1つ）
    const result = useOnInstance(gameData, "tm35", make("ditto"));
    expect(refused(result)).toBe(true);
    if (!refused(result)) return;
    expect(result.reason).toContain("おぼえられない");
  });

  it("もう覚えている技は、断り方が違う", () => {
    const result = useOnInstance(gameData, "tm35", withMoves(make(), ["flamethrower"]));
    expect(refused(result)).toBe(true);
    if (!refused(result)) return;
    expect(result.reason).toContain("すでに");
  });

  it("バトル中には使えない", () => {
    const battle = createBattle(
      gameData,
      [[{ species: "charmander", level: 20, moves: ["scratch"] }],
       [{ species: "pidgey", level: 5, moves: ["tackle"] }]],
      1,
    );
    const result = useOnBattle(gameData, "tm35", battle.sides[0]!.party[0]!);
    expect(refused(result)).toBe(true);
  });

  it("バッグに「つかう」が出るのはマップ上だけ", () => {
    expect(isUsable(gameData.item("tm35"), "field")).toBe(true);
    expect(isUsable(gameData.item("tm35"), "battle")).toBe(false);
  });
});

describe("進化させる道具", () => {
  it("石は 進化を提案する（種族はまだ変わらない）", () => {
    const result = useOnInstance(gameData, "thunder-stone", make("pikachu"));
    expect(refused(result)).toBe(false);
    if (refused(result)) return;
    expect(result.then).toEqual({ kind: "evolve", to: "raichu" });
    expect(result.instance.species).toBe("pikachu");
  });

  it("石が合っていなければ こうかが ない", () => {
    const result = useOnInstance(gameData, "water-stone", make("pikachu"));
    expect(refused(result)).toBe(true);
  });

  it("つながりのヒモは、交換で進化する種に効く", () => {
    const result = useOnInstance(gameData, "linking-cord", make("machoke"));
    expect(refused(result)).toBe(false);
    if (refused(result)) return;
    expect(result.then).toEqual({ kind: "evolve", to: "machamp" });
  });

  /**
   * 原作で交換時に持ち物が要る枝は、**その持ち物ごと**でないと成立しない
   * （progression.md §11 の統合）。持たせ忘れを黙って通すと、
   * 「メタルコートを持たせる」という原作の手順そのものが消える。
   */
  it("持ち物が要る枝は、持たせていないと効かない", () => {
    const bare = make("scyther");
    expect(refused(useOnInstance(gameData, "linking-cord", bare))).toBe(true);

    const holding: PokemonInstance = { ...bare, item: "metal-coat" };
    const result = useOnInstance(gameData, "linking-cord", holding);
    expect(refused(result)).toBe(false);
    if (refused(result)) return;
    expect(result.then).toEqual({ kind: "evolve", to: "scizor" });
  });

  it("交換で進化しない種には効かない", () => {
    expect(refused(useOnInstance(gameData, "linking-cord", make("charmander")))).toBe(true);
  });
});
