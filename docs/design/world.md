# 11. マップ・イベント・NPC

関連: [`regions.md`](regions.md) / [`capture.md`](capture.md) / [`save-data.md`](save-data.md) / [`economy.md`](economy.md)

---

## 1. 設計方針

「原作のマップを再現」は最初の3つの希望の1つでありながら、**最も工数が重い**領域。
9地方で数百マップになる。

> **マップは「作る」ものではなく「流し込む」ものにする。**

つまり設計の目標は、良いマップを作ることではなく、
**マップを大量に流し込める仕組みと道具を用意すること**に置く。
[`README.md`](README.md) の中心原則（コンテンツ追加のコストをゼロに近づける）が、
最も強く問われる章になる。

## 2. マップデータ形式 ―【決定】Tiled を採用する

**決定事項: マップ制作には Tiled（無料のタイルマップエディタ）を使う。**
未決事項だった「Tiled の採用可否」をここで確定する。

### 理由

- タイルマップエディタの自作は数ヶ月規模の作業になる。**得るものがない**
- Tiled は JSON 出力に対応し、Phaser も公式にサポートしている
- **数百マップを作る以上、エディタの品質が生産性を直接決める**

### ただし Tiled 形式に依存しない

```
*.tmx / *.tmj （Tiled の出力・制作時の正）
      │
      │ tools/convert-map.ts   ビルド時に変換
      ▼
自作スキーマの JSON （ゲームが読むのはこちらだけ）
```

Tiled の JSON をそのままランタイムに渡すと、外部ツールの都合に縛られる。
**中間形式として扱い、ゲーム本体は自作スキーマだけを知る。**
将来エディタを乗り換えても、変換スクリプトを差し替えるだけで済む。

## 3. マップの構造

```ts
type MapData = {
  id: MapId;                        // "kanto-pallet-town"
  region: RegionId;
  size: { width: number; height: number };   // タイル単位

  layers: {
    ground: TileId[];               // 地面
    decoration: TileId[];           // 上に乗る装飾
    overhead: TileId[];             // プレイヤーより手前に描く（木の上部など）
  };
  collision: boolean[];             // 通行可否
  terrain: TerrainId[];             // 草むら・水上・砂 等（エンカウント判定に使う §5）

  warps: Warp[];
  objects: MapObject[];
  encounters?: EncounterTableId;    // capture.md §9 への参照
  bgm?: string;
};
```

- レイヤは3枚に固定する。可変にすると Tiled 側の運用が崩れる
- `collision` と `terrain` を**タイル画像から推測しない**。明示的な配列として持つ
  （見た目とルールを分離しておかないと、タイルを差し替えた瞬間に挙動が変わる）

### マップ接続

```ts
type Warp = {
  at: { x: number; y: number };
  to: { map: MapId; x: number; y: number; facing: Direction };
  trigger: "step" | "interact";     // 踏む / 調べる（ドアなど）
};
```

**検証項目**: 全 `warp.to.map` が存在し、座標がマップ範囲内で、通行可能タイルであること。
数百マップを手で繋ぐ以上、接続ミスは必ず起きる。CIで潰す（[`data-schema.md`](data-schema.md) §6）。

## 4. オブジェクトと NPC

```ts
type MapObject = {
  id: string;
  at: { x: number; y: number };
  kind:
    | { type: "npc"; sprite: SpriteId; movement: "static" | "wander" | "route" }
    | { type: "trainer"; trainer: TrainerId; sight: number; direction: Direction }
    | { type: "item"; item: ItemId; hidden: boolean }
    | { type: "sign" }
    | { type: "obstacle"; clearedBy: FieldAbilityId };   // §7
  event?: EventScript;              // §6
  condition?: Condition;            // このフラグが立っていれば出現／消滅
};
```

- **トレーナーの視線**（`sight`）は、向いている方向に N マス。原作の挙動
- `condition` により、イベント進行でNPCが現れたり消えたりする
- 撃破済みトレーナーは `flags` で管理し、再戦は原作準拠で行わない（施設で戦えるため）

## 5. エンカウント判定

1歩ごとに判定する（原作準拠）。

```
歩いたタイルの terrain がエンカウント対象か
        │ Yes
        ▼
エンカウント率で抽選 → 成立したら EncounterTable から抽選
```

- エンカウント率は `terrain` ごとに定義（草むら・洞窟・水上で異なる）
- 抽選は [`capture.md`](capture.md) §9 の `EncounterTable` を参照
- **連続で出続ける／全く出ない、の救済を入れる**（直前のエンカウントから最低歩数、
  一定歩数を超えたら確率上昇）。原作より緩めてよい ―― 9地方を周回する本作では、
  理不尽な連続エンカウントは摩擦として重すぎる

## 6. イベントシステム ―【最重要】

[`save-data.md`](save-data.md) の `RegionProgress.flags` は**器だけが存在していた。**
それを操作する仕組みがここになる。

### 表現 ―【決定】JSON のコマンド列にする

| 案 | 判断 |
| --- | --- |
| TypeScript でハードコード | ❌ 地方追加のたびにコードが増える。本設計の原則に反する |
| 独自スクリプト言語 | ❌ パーサとエディタ支援の自作コストが見合わない |
| **JSON のコマンド列** | ✅ **採用。** 技効果・ボール補正・ルールセットと同じデータ駆動 |

```ts
type EventScript = EventCommand[];

type EventCommand =
  | { kind: "message"; speaker?: string; text: string }
  | { kind: "choice"; prompt: string; options: { text: string; then: EventScript }[] }
  | { kind: "if"; cond: Condition; then: EventScript; else?: EventScript }
  | { kind: "setFlag"; flag: FlagId; value: boolean }
  | { kind: "battle"; trainer: TrainerId; onWin?: EventId; onLose?: EventId }  // 参照のみ
  | { kind: "giveItem"; item: ItemId; count: number }
  | { kind: "givePokemon"; species: SpeciesId; level: number }
  | { kind: "takeMoney" | "giveMoney"; amount: number }
  | { kind: "healParty" }
  | { kind: "warp"; to: MapId; x: number; y: number }
  | { kind: "moveObject"; object: string; path: Direction[] }
  | { kind: "faceObject"; object: string; direction: Direction }
  | { kind: "wait"; frames: number }
  | { kind: "playSe" | "playBgm"; id: string }
  | { kind: "shop"; inventory: ShopId }          // economy.md §5
  | { kind: "openBox" | "openDex" };

type Condition =
  | { kind: "flag"; flag: FlagId; value: boolean }
  | { kind: "badges"; op: ">=" ; count: number }
  | { kind: "hasItem"; item: ItemId }
  | { kind: "hasSpecies"; species: SpeciesId }
  | { kind: "and" | "or"; of: Condition[] };
```

### インタプリタ

- `packages/core` に置く。**描画に依存しない**
- `message` や `wait` のような**演出を伴うコマンドは、実行を中断して UI に制御を返す**
  （[`ui-flow.md`](ui-flow.md) §4 のバトルと同じ考え方 ―― core は時間を持たない）
- イベントは**原子的に完了する**ものとして扱い、実行の途中状態はセーブしない。
  中断が必要な長大イベントは、フラグで区切って複数イベントに分割する

### `battle` コマンドだけは原子性を保てない

バトルは数分かかる。**「イベントは原子的」という前提と正面から衝突する。**
ブラウザを閉じられたら、イベントの途中でセーブが存在しない状態になる。

**決定: `battle` コマンドはイベントを2つに分割する境界として扱う。**

```
イベント前半（会話 → battle 開始）
      │  ここでフラグを立て、バトルを開始する。イベントはここで終了
      ▼
バトル（この間の中断は「バトルからの離脱」として扱う）
      │
      ▼
イベント後半（フラグと勝敗を条件に、別イベントとして起動）
```

- `battle` コマンドは `EventScript` の**最後のコマンドでなければならない**（検証項目）
- `onWin` / `onLose` は**別のイベントIDへの参照**にする。インラインのスクリプトにしない
- バトル中に中断された場合は、次回起動時に**バトル直前の状態から再開**する
  （トレーナー戦をやり直す。進行は巻き戻らない）

インラインの `onWin` を許すと「バトルを含むイベントの途中状態」が発生し、
セーブできない領域がゲーム内に生まれてしまう。**型のレベルで塞ぐ。**

### フラグIDは静的データ側で宣言する

```ts
// data/regions/kanto/flags.json
["kanto.oak.received-starter", "kanto.gym1.cleared", "kanto.rocket.hideout-open", ...]
```

- **宣言のないフラグを `setFlag` / `Condition` が使っていたら検証エラー**にする
- タイプミスで永久に立たないフラグは、発生してから原因を突き止めるのが極めて困難。
  [`data-schema.md`](data-schema.md) §6 の「調整項目」だったが、**宣言必須で確定する**
- 命名は `<地方>.<系統>.<内容>` のドット区切り

## 7. フィールド技 ―【決定】秘伝技を廃止する

原作では いあいぎり・なみのり 等の秘伝技を覚えたポケモンが進行に必要になる。

**決定: 秘伝技を廃止し、進行能力は「道具または進行フラグ」で解放する。**

```ts
type FieldAbilityId = "cut" | "surf" | "strength" | "rockSmash" | "fly" | ...;
```

- 障害物は `{ type: "obstacle"; clearedBy: FieldAbilityId }` として置く
- 対応する能力は、バッジ取得や道具入手で**プレイヤー自身が獲得する**（手持ちに依存しない）

### 理由

- 秘伝要員がパーティ枠を圧迫するのは、**9地方を周回する本作では特に苦痛**になる
- 「技を覚えさせる／忘れさせる」という独立したサブシステムが丸ごと不要になる
- 第7世代以降の原作も実質この方向（ライドポケモン等）

[`capture.md`](capture.md) §8、[`progression.md`](progression.md) の
「周回の摩擦を減らす」方針と一貫している。

## 8. マップ作成のワークフロー

数百マップを作る以上、**道具立てがそのまま生産性になる。**

1. Tiled でマップを描く（タイルセットは地方間で共有する）
2. `tools/convert-map.ts` で自作スキーマへ変換
3. `tools/validate.ts` で検証
   - warp の接続先が存在し、通行可能タイルか
   - `encounters` の参照先が存在するか
   - `trainer` / `item` / `flag` の参照が存在するか
   - 到達不能な領域がないか（**プレイヤーが入れない/出られない区画の検出**）
4. 地方の全マップが揃ったら [`capture.md`](capture.md) §7 の到達可能性検証を回す

**タイルセットは地方間で共有する。** カントーとジョウトは特に共有率が高く、
[`regions.md`](regions.md) §2 で実装順を隣接地方にした理由がここにある。

## 9. 実装の段階

| 版 | 内容 |
| --- | --- |
| **v0.7** | 1つの町 + 1本の道路。移動・衝突・warp・エンカウント・最小のイベント |
| v0.8 | ポケモンセンター／ボックス端末のイベント |
| v0.9 | ショップのイベント |
| v0.10 | カントー全域。ジム・ダンジョン・フィールド技による障害物 |
| v1.0 | 四天王・殿堂入りのイベント演出 |

**v0.7 の完了条件**: 町と道路を往復でき、草むらで野生と遭遇し、
NPCと会話してフラグが立ち、そのフラグで別のNPCの反応が変わること。
イベントシステム全体の疎通確認をここで済ませる。

## 10. 調整項目（実装後に決める）

- タイルサイズ（16px か 32px か）と画面あたりの表示タイル数
- エンカウント率と救済の閾値
- トレーナーの視線の距離
- マップ1枚あたりのオブジェクト数の上限（描画負荷）
- イベントの `wait` の単位（フレームか ミリ秒か）
- マップの遅延読み込み単位（1枚ずつか、隣接分を先読みするか）
