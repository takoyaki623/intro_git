# 09. セーブデータ

関連: [`data-schema.md`](data-schema.md) / [`regions.md`](regions.md) / [`capture.md`](capture.md)

---

## 1. 設計方針

本作のセーブは、一般的なブラウザゲームより要求が厳しい。

| 事情 | 帰結 |
| --- | --- |
| 共通ボックスに数千〜数万個体が溜まる | **容量が大きい。** localStorage では足りない |
| 9地方を数年かけて追加する | **スキーマが必ず変わる。** マイグレーションが生命線 |
| 総プレイ時間が数百時間規模 | **消失が許されない。** バックアップとエクスポートが必須 |

「あとで考える」が最も許されない領域。実装は v0.5 だが、構造は今決めきる。

## 2. 保存先 ―【決定】IndexedDB

| 候補 | 判断 |
| --- | --- |
| localStorage | ❌ **5MB制限**。共通ボックスだけで超える（§4）。同期APIで大量データに不向き |
| **IndexedDB** | ✅ **採用。** 容量が十分、非同期、構造化データをそのまま置ける |
| サーバ保存 | ❌ 個人開発の範囲を超える。将来の選択肢としてのみ |

### ストレージ層は必ず抽象化する

```ts
interface SaveStore {
  load(slot: number): Promise<SaveData | null>;
  save(slot: number, data: SaveData): Promise<void>;
  listSlots(): Promise<SlotInfo[]>;
  export(slot: number): Promise<Blob>;
  import(file: Blob): Promise<SaveData>;
}
```

IndexedDB を直接叩くコードをゲーム側に散らさない。
将来デスクトップ版（ファイル保存）に移す可能性を残す。

### 個体は別ストアに分ける

共通ボックスを1つの巨大なJSONにすると、1体入れ替えるだけで全体の読み書きが発生する。

- `pokemon` ストア: `uid` をキーに `PokemonInstance` を個別保存
- ボックスは **`uid` の配列だけ**を持つ

これで部分読み込み・部分更新ができ、数万個体でも実用速度を保てる。

## 3. 構造

```ts
type SaveData = {
  schemaVersion: number;              // §5。最初のフィールドに置く
  meta: { playerId; playerName; createdAt; lastSavedAt; totalPlayTime };

  // ── 地方をまたぐ（恒久）──
  global: {
    boxUids: string[];                // 共通ボックス。実体は別ストア
    dex: Record<SpeciesId, DexEntry>;
    bp: number;
    hallOfFame: HallOfFameEntry[];
    savedTeams: { name: string; memberUids: string[] }[];
    expMultiplierTier: number;        // 周回加速の段階
    endgame: {
      unlockedFacilities: FacilityId[];
      facilityRecords: Record<FacilityId, { bestStreak: number; clearedBrains: number[] }>;
      tournamentRecords: Record<CupId, { clearedTiers: TierId[] }>;
      defeatedNamed: Record<NamedId, TierId[]>;   // 「全トレーナー」の可視化用
    };
    seenMatchups: Record<string, true>;           // 既知のタイプ相性（ui-flow.md §6）
  };

  // ── 地方ごと（独立・並行進行可能）──
  regions: Record<RegionId, RegionProgress>;

  // ── 現在地。地方とエンドゲームは排他 ──
  location:
    | { kind: "home" }
    | { kind: "region"; region: RegionId }
    | { kind: "endgame"; run: ActiveRun };

  settings: Settings;
};

/** 各章が「設定で選べる」と書いていた項目の集約。定義がどこにもなかったためここで確定する。 */
type Settings = {
  battleSpeed: "normal" | "fast" | "logOnly";   // ui-flow.md §4
  skipCaptureAnimation: boolean;                // capture.md §8
  disclosureLevel: "basic" | "advanced";        // ui-flow.md §6
  lossPenalty: "none" | "classic";              // economy.md §2
  autoSave: boolean;
  textSpeed: "slow" | "normal" | "fast";
  volume: { bgm: number; se: number };
};

/** 施設・トーナメントの連戦は途中中断できる（§6）。その状態をここに持つ。 */
type ActiveRun =
  | ({ kind: "facility"; facility: FacilityId } & RunState)
  | ({ kind: "tournament"; cup: CupId; tier: TierId } & RunState);

type RunState = {
  memberUids: string[];              // 持ち込んだ個体
  rentalParty?: Party;               // レンタル制の場合は実体をここに持つ
  streak: number;                    // 現在の連勝数
  battleIndex: number;               // 連戦の何戦目か
  carriedState?: {                   // carryOverDamage が true の施設用
    hp: Record<string, number>;
    pp: Record<string, number[]>;
    status: Record<string, StatusId | null>;
  };
  rngSeed: number;                   // 相手生成の再現用
};

type RegionProgress = {
  state: "notStarted" | "inProgress" | "cleared";
  attempt: number;                    // 何周目か
  partyUids: string[];                // 手持ち6
  boxUids: string[];                  // 地方ボックス
  partnerUid?: string;                // 相棒（§ regions.md §6）
  badges: GymId[];
  money: number;
  bag: Record<ItemId, number>;
  position: { map: MapId; x: number; y: number };
  flags: Record<string, boolean>;     // イベント進行
  playTime: number;
};
```

### `location` と `RegionProgress.state` は別物

紛らわしいので明示する。**両者は独立していて、片方から他方は導けない。**

| フィールド | 意味 |
| --- | --- |
| `location` | **今どこにいるか。** 常に1箇所。ホーム／ある地方／エンドゲーム |
| `RegionProgress.state` | **その地方の進行段階。** 未着手／進行中／クリア済み |

地方は並行進行できるため、`state: "inProgress"` の地方が複数あっても、
`location` はそのうち1つ（またはホーム／エンドゲーム）を指す。

ゲーム内の制限判定（共通ボックスを開けるか等、[`capture.md`](capture.md) §4）は
**`state` を見る。`location` では判定しない。**

### セーブの構造が、地方独立制の定義そのものになっている

[`regions.md`](regions.md) §5 の「持ち越すもの／持ち越さないもの」の表が、
そのまま `global` と `regions` の分割になっている。

- `global` にあるもの = 持ち越す（ボックス・図鑑・BP・殿堂・周回加速）
- `RegionProgress` にあるもの = 持ち越さない（お金・道具・バッジ・手持ち）

**設計ルールをデータ構造で強制する。** 「お金を持ち越さない」を実装で気をつけるのではなく、
お金の置き場所が地方の中にしかない、という形にする。

### 地方の並行進行が無料で手に入る

`regions` が `Record<RegionId, RegionProgress>` である以上、
**カントーを途中で中断してジョウトを始め、後で戻る**が自然に成立する。

地方独立制の副産物だが、実際に遊ぶ上ではかなり効く。
「今の地方に飽きたら別の地方に行ける」形になる。

## 4. サイズ見積もり

| 項目 | 概算 |
| --- | --- |
| `PokemonInstance` 1体 | 300〜500 バイト（JSON） |
| 共通ボックス 10,000体 | **3〜5 MB** |
| 図鑑 1,025件 | 約 100 KB |
| 地方進行 × 9 | 数百 KB |
| 合計 | **5〜10 MB 規模** |

localStorage の 5MB を明確に超える。IndexedDB を選ぶ根拠がここにある。

## 5. スキーマバージョンとマイグレーション

**本章で最も重要な部分。** 数年かけて地方を追加する以上、
セーブのスキーマは**必ず、何度も変わる**。

### 規則

1. `SaveData.schemaVersion` を持ち、**読み込み時に必ず確認する**
2. マイグレーション関数を版ごとに用意し、**順に適用する**（v1→v2→v3…）
3. **一方向のみ。** ダウングレードは実装しない
4. 現在の版より新しいセーブは**読まずに拒否する**（壊すより読めない方がよい）

```ts
const migrations: Record<number, (data: unknown) => unknown> = {
  2: (v1) => { /* ... */ },
  3: (v2) => { /* ... */ },
};

function migrate(data: unknown): SaveData {
  let current = data as { schemaVersion: number };
  while (current.schemaVersion < CURRENT_VERSION) {
    current = migrations[current.schemaVersion + 1](current) as typeof current;
  }
  return SaveDataSchema.parse(current);   // zod で最終検証
}
```

### 各版のサンプルセーブをリポジトリに保存する

**マイグレーションが壊れていることに気づくのは、常に手遅れになってから。**

- `fixtures/saves/v1.json`, `v2.json`, … を**リポジトリに固定データとして置く**
- CI で「全ての過去版が最新版まで通り、zod検証を通過する」ことを検証する
- 版を上げるたびにサンプルを1件追加する

これでマイグレーションの鎖が切れないことが保証される。
[`data-schema.md`](data-schema.md) §6 と同じ思想 ―― **規律を人間の注意力ではなくCIに預ける。**

## 6. 保存のタイミング

| 種別 | タイミング |
| --- | --- |
| 手動セーブ | メニューから |
| **オートセーブ** | ポケモンセンター利用時 / マップ遷移時 / バトル終了時 / 施設の1戦ごと |

数百時間のプレイを前提にする以上、クラッシュ時の損失は最小にする。
施設の連戦中も1戦ごとに保存し、途中から再開できるようにする。

## 7. 破損対策

ブラウザのストレージは、書き込み途中の中断・容量超過・ブラウザのバグで壊れうる。

1. **アトミックな書き込み**: 新しいレコードに書き切ってから、現行スロットの参照を切り替える
2. **1世代前を保持**: 直前のセーブを常に残す
3. **読み込み時に zod 検証**: 失敗したら自動でバックアップから復旧を試みる
4. **復旧不能なら明示的に伝える**: 黙って新規データを作らない

## 8. エクスポート／インポート（必須機能）

**ブラウザのストレージは消える。** キャッシュクリア、シークレットウィンドウ、
ブラウザの乗り換え、OS再インストール ―― どれでも消える。

数百時間のセーブがそれで失われるのは許容できないので、
**JSONファイルとしてのエクスポート／インポートを必須機能とする。**
セーブ実装（v0.5）と同時に入れる。後回しにしない。

- エクスポート = 個体の実体も含めた完全なデータ
- インポート = zod検証 + マイグレーションを通してから取り込む
- 定期的にエクスポートを促す導線をUIに置く

## 9. チート耐性 ―【決定】対策しない

シングルプレイであり、対人要素がない。セーブを書き換えても**本人の体験の問題**にすぎない。
対策のコストを、ゲーム本体に回す。

ただし**破損対策とチート対策は別物**として扱う。

> 改造を防ぐ検証はしない。**壊れたデータで進行不能にならないための検証はする。**

zod検証は「不正の検出」ではなく「クラッシュの防止」のために入れる。
検証に失敗した個体は、ゲーム全体を止めずにその個体だけ隔離する。

## 9.5 v0.5 の最小セーブ（実装後に追記）

[`../game-plan.md`](../game-plan.md) §8.3 論点1 の決定どおり、
v0.5 では `localStorage` に記録だけを保存する。ただし**構造は最終形の部分集合にした。**

```ts
type SaveData = {
  schemaVersion: 1;
  global: { bp: number; endgame: { facilityRecords: Record<FacilityId, FacilityRecord> } };
  settings: { battleSpeed: "normal" | "fast" | "logOnly" };
};
```

§3 の入れ子（`global` / `endgame` / `settings`）をそのまま使っているので、
v0.9 の移行は**項目の追加**で済み、構造の作り直しにならない。

条件だった `SaveStore` の抽象化も入れた。実装は `packages/game/src/save.ts` の1ファイルで、
v0.9 で IndexedDB に差し替えるとき、呼び出し側は一行も変わらない。

マイグレーションの鎖（§5）は**まだ空のまま形だけ作った**。
`migrations` が空の `Record` として存在し、`migrate()` が版を見て順に適用する。
最初の版で作っておかないと、2つ目の版を足すときに必ず1つ飛ばす。

`normalize()` は §9 の方針どおり、**不正の検出ではなくクラッシュの防止**のために置いている。
壊れた値は既定値に落として読み込み、進行不能にしない。

### 9.6 v0.7 の状況 ― 世界の状態はまだ保存していない

マップ探索を入れたが、**フラグ・所持金・手持ち・現在地はどれもセーブに入れていない。**
リロードすると主人公の家からやり直しになる。

意図した先送り。`SaveData` にこれらを足すとスキーマが v2 → v3 になり、
`localStorage` のままマイグレーションを1回増やすことになる。
**v0.9 で IndexedDB へ移す版と同じタイミングでやる方が、移行が1回で済む。**

型としては [`world.md`](world.md) の `WorldState`
（`flags` / `badges` / `money` / `bag` / `partySpecies`）が既にあり、
`RegionProgress` に入れる形も §3 で決まっている。**器と中身は揃っていて、繋いでいないだけ。**

### 9.7 v0.9 の実装記録 ― 繋いだら、繋いでいなかったものが見えた

v3 で世界の状態が入り、保存先が IndexedDB になった。§9.6 で「器と中身は揃っていて、
繋いでいないだけ」と書いたが、**繋ぐ作業そのものが4つの誤りを暴いた。**

| 見つかったもの | なぜ繋ぐまで見えなかったか |
| --- | --- |
| 同じ道具を2回もらっていた | バッグを `world.bag` と `player.bag` の2箇所に持ち、`core` と UI が**両方とも足していた**。別々の入れ物だったので、合計だけが静かに倍になる |
| 図鑑の「まだ見ていない」を保存しようとしていた | `DexState` には `unknown` があり、セーブの `DexEntryState` には無い。**記録が無いことが未発見を表す**ので、書けば意味が二重になる。型が先に気づいた |
| マップ画面を開くたびに冒頭の案内が出る | 「マップ画面を開いた」と「冒険を始めた」を同じ扱いにしていた。セーブが無かった頃は区別する必要が無かった |
| 復活地点が主人公の家に固定されていた | 戻る先を定数で書いていた。`respawn` を持って初めて「回復してもらった場所が戻る場所」という規則になる |

いずれも**型検査でもユニットテストでも落ちない。** 3つ目と4つ目は、
`tools/playthrough.mjs` にリロードの検査を足したときに初めて見えた。

#### 二重の持ち主を1つにした

`WorldState`（`core` が読み書きする世界）と `PlayerState`（UI が持つ世界）は、
**同じものを別々に持っていた**。v0.9 で `player` を唯一の持ち主にした。

- `flags` と `bag` は**同じオブジェクトを指す**。`core` が書き換えれば、そのまま保存される
- `badges` と `money` は数値なので参照を共有できない。イベントの前後で写す（`syncWorld` / `syncPlayer`）

参照の共有と値の写しが混ざるのは気持ち悪いが、**持ち主が2人いる状態よりはるかにましだ。**
`core` が `WorldState` を不変にする日が来れば、写す側に寄せられる。

#### エクスポートはファイルではなくテキストで見せる

§8 は「JSONファイルとしてのエクスポート」と書いていた。**実装では文字列を
テキストエリアに出してコピーさせる形にした。**

理由は配布形態。この遊べる版は単一 HTML として埋め込んで見ることがあり、
その中では `<a download>` もスクリプトからの保存も封じられている。
**押しても何も起きないボタン**は、バックアップ機能として最悪の形をしている。
コピーなら必ず動く。ファイル保存は、後でデスクトップ版を作るときに足せばよい。

#### 保存点

§6 の表のとおりに置いた。現時点でポケモンセンターはまだ無いので、
`healed` イベント（ママの回復）が同じ役割を持っている。

| 保存点 | 実装 |
| --- | --- |
| マップ遷移時 | `doWarp` |
| バトル終了時 | `afterBattle`（戦闘後シーケンスの後） |
| 回復時・イベント終了時 | `runEvent` の末尾 |
| 捕獲・預ける・逃がす | `onCaught` / ボックス操作 ―― **取り返しがつかない操作はその場で保存する** |

#### まだやっていないこと

§7 の破損対策のうち、実装したのは 4（黙って新規データを作らない）だけ。
1〜3（アトミックな書き込み・1世代前の保持・zod 検証）は入れていない。
`normalize()` が壊れた値を既定値に落とすので進行不能にはならないが、
**「壊れたセーブから復旧する」機能はまだ無い。** エクスポートが唯一の保険になっている。

### 9.8 v0.10 の版 ― スキーマ v4

**地方が並列に9つある構造を、セーブが初めて表現した。**

| 追加したもの | 内容 |
| --- | --- |
| `global.boxUids` | **共通ボックス。** 地方ボックスとは別物（[`capture.md`](capture.md) §4） |
| `global.currentRegion` | 今どの地方に居るか。**`null` は拠点** |
| `settings.artSource` | 絵の出どころ（`drawn` / `local`）。器だけ先に作る |

v3→v4 は既定値を足すだけ ―― v0.9 のセーブは「カントーに居る」以外に有りえない。

#### 捨てる判断は、片方の器しか見ていなかった

`storeParty()` は「地方の器から外れた個体を捨てる」（幽霊を残さないため）。
共通ボックスが増えたことで、**この判断が片手落ちになった** ――
地方の記録が古い瞬間に、送ったはずの個体が保存で消える。

`sendToCommonBox()` は地方と共通ボックスを同時に動かすのでその状態を作らないが、
**捨てる判断が「片方しか見ていない」ままだと、いつか別の経路で踏む。**
テストは器の不整合を直接組み立てて、
**「書き込みで個体を失わない」**という不変条件そのものを見ている
（守りを外すと落ちることを確認済み）。

#### 読み込みでは地方を正とする

地方の器と共通ボックスの両方に同じ uid が居るセーブを読んだら、**地方側を残す。**
送るときに地方から抜くのが正しい手順なので、両方に居るのは壊れた状態であり、
そのとき進行中の地方を壊さない方に倒す。

### 9.9 v1.0 の版 ― スキーマ v5（殿堂入り）

`global.hallOfFame: HallOfFameEntry[]` を足した。

```ts
type HallOfFameEntry = {
  region: string;
  count: number;   // 何回目か（1から）
  at: number;
  party: { species: string; nickname: string | null; level: number; shiny: boolean }[];
};
```

**個体そのもの（`uid`）を参照しない。** ここだけ §2 の「器は uid しか持たない」に
従っていないが、理由がある ―― 殿堂は「**そのとき何を連れていたか**」の記録なので、
あとから逃がしたり進化させたりしたときに変わってはいけない。
uid で参照すると、記録のほうが後から動いてしまう。

`global` に置いたのは、殿堂入りが**地方をまたぐ**ため
（[`regions.md`](regions.md) §2 の「地方は独立」の外側にある）。

v4 からの引き上げは**空の配列**にする。バッジ8つで四天王を倒したセーブでも、
記録が残っていない以上は空にするしかない ――
**後から作った記録を「あったこと」にはしない。**

## 10. 調整項目（実装後に決める）

- セーブスロット数（複数の冒険を並行させるか、1つで十分か）
- オートセーブの頻度（書き込み負荷とのバランス）
- 共通ボックスの個体数上限を設けるか（無制限だと最終的に速度に影響する）
- ~~`flags` のキーを静的データ側の一覧で検証するか~~ → **v0.7 で宣言必須に確定**
  （[`world.md`](world.md) §6・[`data-schema.md`](data-schema.md) §6 #50）
- エクスポートを促す頻度
