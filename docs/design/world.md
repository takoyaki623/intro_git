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

### 2.1 【訂正・v0.7】当面の原本はテキストのマップソースにする

Tiled 採用の決定は、上の「原本を差し替えても影響は変換スクリプトに閉じる」という
構えのおかげで、**痛みなく先送りできる**ことが実装してみて分かった。

**決定: v0.7 の原本は `packages/data/source/maps/*.map`（テキスト）とする。**

```
id: kanto-pallet-town
name: マサラタウン
region: kanto

legend:                 # 文字 → 地形。`!` 前置で通行不可
. normal
, grass
T !normal
D normal

grid:                   # 見たままの格子
TTTTT.TTTTTT
T..........T
...

warps:                  # 座標 種類 接続先マップ 座標 向き
5,0 step kanto-route-1 5,16 up
3,4 interact kanto-players-house-1f 3,6 up

objects:                # ID 座標 種別 [イベントID] [if:フラグ=真偽]
pallet-kid 8,6 npc:boy:static kanto.pallet.kid
pallet-oak-blocker 5,1 npc:oak:static kanto.pallet.oak-block if:kanto.pallet.got-starter=false
```

理由:

- **Tiled の価値はタイルを「塗る」ことにあるが、塗るタイルが1枚も存在しない**
  （[`../game-plan.md`](../game-plan.md) §10）。v0.7 で必要なのは
  通行可否・地形・接続・オブジェクトだけで、これは文字で書ける
- `maps-src/`（Tiled の原本）は**リポジトリに入れられない**（原作マップの写しのため）。
  一方この形式は数値と構造だけなので**コミットできる。**
  原本がコミットできないと、生成物と原本が別々の場所にある状態が常態化する
- 差分が読める。「どのマスの通行判定を変えたか」が git の diff にそのまま出る

**Tiled への移行は、`tools/convert-map.ts` に読み込み口を1つ足すだけ**で済む。
出力スキーマは変わらないので、ゲーム側は何も知らなくてよい ―― これが §2 の狙いだった。

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

### 5.1 実測（v0.7）― 「救済」はひとつのものではなかった

草むらだけを 15 万歩ぶん歩かせて測った（基本遭遇率は 12% に設定）。

| 設定 | 遭遇回数 | 平均歩数 | 最小 | 中央 | 最大 | 実効遭遇率 |
| --- | --- | --- | --- | --- | --- | --- |
| **採用した設定**（猶予5歩＋pity） | 11,399 | 13.2 | 6 | 11 | **37** | **7.6%** |
| 猶予なし（pity のみ） | 18,099 | 8.3 | 1 | 6 | 36 | 12.1% |
| 救済ぜんぶ無し（原作風） | 17,660 | 8.5 | 1 | 6 | **79** | 11.8% |

分かったこと:

1. **`rateByTerrain` は実効遭遇率ではない。** 猶予歩数5があるだけで 12% → 7.6% に落ちる。
   猶予は「連続で出続ける」を止めるつもりの仕掛けだったが、
   実際には**遭遇の総量そのものを4割減らしている。** 設定値を体感値だと思ってはいけない
2. **pity は平均をほとんど動かさない**（8.5 → 8.3）。効くのは分布の裾で、
   最悪ケースを **79歩 → 37歩** に半減させる
3. したがって **2つを「救済」とひとくくりにして増減させてはいけない。**
   猶予は総量を削る調整、pity は裾を切る調整で、効く場所が違う

この表は `packages/core/src/world/movement.ts` の `ENCOUNTER` の直上に写してある。
実効値を固定するテストも置いた（`world.test.ts`）ので、
猶予歩数を触ると実効率が動いたことが検出される。

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

### 9.1 v0.7 の結果

完了条件は満たした。マサラタウン・主人公の家・オーキド研究所・1番道路の4枚で、
家 → 町 → 研究所（最初の1匹）→ ライバル戦 → 町 → 1番道路 → 野生戦 → 逃走 まで通る。
同じ道行きを2通りで検証している ―― `core` だけで通す単体テストと、
ブラウザを実際に動かす `tools/playthrough.mjs`。

**フラグによる分岐は2つの形で効く**ことを確認した:

- `Condition` を持つオブジェクトは**存在ごと消える**。
  最初の1匹を受け取るまで、町の北口はオーキド本人が塞いでいる
- イベント内の `if` は**同じNPCの台詞を変える**

#### 実装が設計を訂正したところ

**1. 「マップを1枚足すコスト」は思ったより座標にある。**
コードは1行も増えなかった（狙いどおり）が、**手で書いた座標は必ず間違える。**
このバージョンで検証が捕まえたのは、warp の接続ミスではなく
「机に囲まれて一生話しかけられない NPC」と「四方を塞がれた1マス」だった。
そこで検証項目 #55（到達不能な区画）に加えて **#56（話しかけられないオブジェクト）**
を足した。**歩けるマスが全部繋がっていることと、置いたものが起動できることは別。**

**2. `battle` を「末尾のみ」に縛った判断は正しかったが、縛り方が足りなかった。**
§6 では「`EventScript` の最後のコマンド」と書いていたが、
`if` や `choice` の枝の中に `battle` がある場合を規定していなかった。
実装では**「自分が属する列の末尾であり、かつ祖先も全て末尾である」**まで縛った。
ライバル戦は「選んだ1匹に応じて相手が変わる」ため `if` の3分岐の底に `battle` があり、
この規定が無いと最初の実データで破れていた。

**3. `givePokemon` の技指定が UI まで届いていなかった。**
コマンドは `moves?` を持っていたのに、`EventEffect` に載せ忘れていた。
型は通り、テストも通り、**ブラウザで動かしてヒトカゲが「ひのこ」1つで戦っていた**
ことで初めて分かった。`tools/playthrough.mjs` を書いた理由がこれ。

**4. 段差は「地形」で表現できた。**
一方通行の向きを地形IDに持たせる（`ledge-down` 等）案もあったが、
南向き以外は9地方を通してごく少数なので、**1方向に固定して定数1つで表した。**
必要になったら地形を増やす。

#### v0.7 では**やっていない**こと

- **世界の状態を保存していない。** フラグ・所持金・手持ちはリロードで消える。
  `SaveData` のスキーマ変更（v2 → v3）を伴うので v0.9 の IndexedDB 移行とまとめる
- **HP がマップに持ち越されない。** 手持ちはまだ `PartySpec`（設計図）で、
  戦うたびに満タンから始まる。`healParty` も演出だけ。**v0.8 の最優先はこれ**
  （[`../game-plan.md`](../game-plan.md) §8.3 論点3の結果）
- **トレーナーの視線**（`sight`）は型にあるだけで判定していない。v0.10
- NPC の `movement`（`wander` / `route`）も同様に未実装

## 10. 調整項目（実装後に決める）

- タイルサイズ（16px か 32px か）と画面あたりの表示タイル数
- エンカウント率と救済の閾値
- トレーナーの視線の距離
- マップ1枚あたりのオブジェクト数の上限（描画負荷）
- イベントの `wait` の単位（フレームか ミリ秒か）
- マップの遅延読み込み単位（1枚ずつか、隣接分を先読みするか）
