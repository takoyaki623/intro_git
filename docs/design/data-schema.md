# 08. データスキーマ

関連: 01〜07 の全章
この章は**それらの結論を統合する**ため、依存関係の最後に置いている（[`README.md`](README.md)）。

---

## 1. 設計方針

[`README.md`](README.md) の線引きで「**今、完璧に確定させるもの**」の筆頭がデータ構造だった。
理由は単純で、**後から変えると全データの作り直しになる**から。

数千件のデータが載った後にスキーマを変えるのは、実質的に不可能になる。
ここだけは実装前に固めきる。

### 正はどこにあるか

| 層 | 役割 |
| --- | --- |
| `packages/data/schema/*.ts`（zod） | **最終的な正。** ランタイム検証とTS型の両方をここから導出する |
| 本章 | そのスキーマの設計。全体像と設計意図 |
| 01〜07 各章の型定義 | **説明用の抜粋。** 差分が出たら本章とスキーマが優先 |

各章に型を再掲したままにすると必ずずれる。**「正は zod スキーマ、設計は本章」**を規則とする。

## 2. 静的データと動的データの境界

**本章で最も重要な構造上の判断。**

| 種別 | 内容 | 保存先 | 変わるタイミング |
| --- | --- | --- | --- |
| **静的データ（マスタ）** | 種族・技・特性・道具・トレーナー・地方・施設定義 | リポジトリ内の JSON | **開発時のみ** |
| **動的データ（セーブ）** | 手持ち・ボックス・図鑑・BP・進行状況 | ブラウザのストレージ | プレイ中 |

### 動的データは静的データを ID で参照するだけにする

```ts
// ❌ セーブに種族の中身を埋め込む
{ species: { id: "pikachu", baseStats: {...}, types: [...] } }

// ✅ IDだけを持つ
{ species: "pikachu" }
```

埋め込むと、**バランス調整で種族値を変えた瞬間に既存セーブが古い値を持ち続ける**。
9地方ぶんの長期プレイを前提にする以上、これは致命的になる。
（セーブの互換性は [`save-data.md`](save-data.md) で扱う）

## 3. ID体系 ― 1,000件超を型で守る

IDを `string` にすると、数千箇所の参照でタイプミスが検出されない。

**決定: IDのユニオン型を JSON から自動生成する。**

```
packages/data/**/*.json   （正）
        │
        │ tools/gen-ids.ts
        ▼
packages/data/generated/ids.d.ts
        │
        ▼
type SpeciesId = "bulbasaur" | "ivysaur" | ... ;   // 1,025要素
type MoveId    = "tackle" | "thunderbolt" | ... ;  // 約920要素
```

- **エディタで補完が効き、タイプミスがコンパイルエラーになる**
- 1,000要素程度のユニオンは TypeScript が問題なく扱える
- 生成物はコミットする（CIで再生成し、差分があれば失敗させる）

数千件のデータを人力で書く以上、この投資は確実に回収できる。

### 命名規則

- ID は **英小文字ケバブケース**（`hyper-beam`, `kanto-route-1`）
- 表示名は日本語で `name` フィールドに持つ。**IDに日本語を使わない**
- ID は一度公開したら変更しない（セーブが参照するため）

## 4. ファイル構成

```
packages/data/
  schema/                  zod スキーマ（正）
  generated/               自動生成のID型
  species/                 図鑑番号帯で分割（001-100.json 等）
  moves/
  abilities/
  items/
  type-chart.json
  exp-tables.json
  natures.json
  battle-sets/             施設の相手プール（grade別）
  facilities/
  tournaments/
  regions/
    kanto/                 ← 1地方 = 1ディレクトリ = 1リリース
      region.json
      flags.json           宣言済みフラグID一覧（world.md §6）
      encounters/
      trainers/
      named/
      maps/                変換済みマップ（world.md §2）
      events/              イベントスクリプト（world.md §6）
      shops/               ショップの品揃え（economy.md §5）
    johto/
    ...

  ../../assets/            グラフィック・音声。コードからパス依存しない
  ../../maps-src/          Tiled の原本（*.tmx）。ビルド対象外
```

**Tiled の原本は `packages/data/` の外に置く。** 制作時の中間成果物であり、
ゲームが読むのは変換後の JSON だけ（[`world.md`](world.md) §2）。

**地方ごとにディレクトリを完全に分ける。** [`regions.md`](regions.md) §8 の
「1地方 = 1リリース」を、ファイル構成のレベルでも成立させる。
新地方の追加が既存ファイルに触らない形になる。

## 5. 型カタログ

各型の詳細定義は該当章にある。ここは**全体像と、章をまたぐ統合部分**を示す。

### 種族・技・バトル系

| 型 | 定義章 | 概要 |
| --- | --- | --- |
| `Species` | [01](battle-system.md) / [03](progression.md) | 種族値・タイプ・特性候補・learnset・捕獲率・経験値タイプ・進化 |
| `Move` | [01](battle-system.md) §11 | 威力・命中・PP・優先度・`effect`（データ駆動） |
| `Ability` | [03](progression.md) §6 | 効果ID（技と同じくレジストリ方式） |
| `Item` | [12](economy.md) §6 | 分類・価格・`effect`（レジストリ方式） |
| `Ball` | [04](capture.md) §3 | ボール補正は条件付きデータ |
| `TypeChart` | [01](battle-system.md) §4 | 18×18 |
| `Nature` / `ExpTable` | [03](progression.md) | 性格補正・成長曲線テーブル |

### 進化 ― 章をまたぐため、ここで定義する

[`progression.md`](progression.md) §11 と [`capture.md`](capture.md) §7 の
到達可能性検証の両方が参照する。

```ts
type Evolution = {
  from: SpeciesId;
  to: SpeciesId;
  condition:
    | { kind: "level"; level: number }
    | { kind: "item"; item: ItemId }
    | { kind: "friendship"; min: number }
    | { kind: "link"; heldItem?: ItemId }   // 通信交換進化の代替
    | { kind: "knownMove"; move: MoveId }
    | { kind: "location"; location: LocationId }
    | { kind: "custom"; id: string };
};
```

`condition` を判別可能な共用体にすることで、**到達可能性の検証スクリプトが
条件アイテムの入手経路まで辿れる**（[`capture.md`](capture.md) §7）。
条件を自由文字列にすると検証が不可能になる。

### トレーナー系

| 型 | 定義章 | 用途 |
| --- | --- | --- |
| `Trainer` | [02](named-characters.md) | 一般トレーナー |
| `NamedCharacter` | [02](named-characters.md) §7 | ネームド。`concept` + 3ティア |
| `BattleSet` | [06](endgame.md) §6 | 施設の相手プール・レンタル |
| `AiConfig` | [07](ai.md) §3 | policy × mistakeRate × knowledge |

**`Party` 型を3者で共有する。** `NamedCharacter.tiers` も
`BattleSet` からの生成結果も、最終的に同じ `Party` になる。
バトルエンジンは出自を区別しない。

### 世界・進行系

| 型 | 定義章 |
| --- | --- |
| `RegionDefinition` | [05](regions.md) §8。`challenge` でジム制/島巡り/オープンを表現 |
| `EncounterTable` | [04](capture.md) §9 |
| `Facility` / `Tournament` / `Ruleset` | [06](endgame.md) §4, §11 |
| `HallOfFameEntry` | [05](regions.md) §7 |
| `MapData` / `Warp` / `MapObject` | [11](world.md) §3, §4 |
| `EventScript` / `EventCommand` | [11](world.md) §6 |
| `Shop` | [12](economy.md) §5 |

`Ruleset` は `Facility` と `Tournament` の**両方が持つ**。ここが施設量産の要。

### `Condition` ― 章をまたぐため、ここで所在を明示する

[`world.md`](world.md) §6 で定義した `Condition`（フラグ・バッジ数・所持品による分岐）を、
**イベント分岐・NPCの出現条件・ショップの品揃え解禁**の3箇所が共有する。

用途ごとに別の条件型を作らないこと。分岐の仕組みが3つに分かれると、
検証も3回書くことになる。

## 6. 検証 ― 設計ルールを機械検証に落とす

**本章の中心的な狙い。**

> 設計文書に書いたルールのうち、機械検証できるものは**全て検証項目に落とす。**
> 文書は読まれなくなるが、**CIは必ず実行される。**

`tools/validate.ts` を CI で回す。検証項目:

### 構造の検証

| # | 項目 | 根拠 |
| --- | --- | --- |
| 1 | 全ID参照の存在確認（learnset の技、進化先、パーティの種族・技・道具…） | 基本 |
| 2 | タイプ相性表が 18×18 で欠けなく埋まっている | [01](battle-system.md) §4 |
| 3 | 全種族に learnset と経験値タイプがある | [03](progression.md) |
| 4 | 進化チェーンに循環がない | [03](progression.md) §11 |
| 5 | 努力値合計 ≤ 510、各 ≤ 252、個体値 ≤ 31 | [03](progression.md) §4 |
| 6 | パーティの技は4つ以下・重複なし・その種族が習得可能 | [02](named-characters.md) |
| 7 | `levelBands` が単調増加している | [05](regions.md) §8 |
| 8 | 施設の `unlockedBy` に循環がない | [06](endgame.md) §3 |

### 設計ルールの検証（本作固有）

| # | 項目 | 根拠 |
| --- | --- | --- |
| 9 | **全1,025種が到達可能**（入手経路のグラフ探索） | [04](capture.md) §7 |
| 10 | **ネームドの `signature` が3ティア全てに含まれる** | [02](named-characters.md) §3 |
| 11 | **`concept.tactic` が過度に重複していない**（同一戦術が3人以上なら警告） | [02](named-characters.md) §2 |
| 12 | タイプカップに、そのタイプのネームドが成立数いる | [06](endgame.md) §7 |
| 13 | `BattleSet` が各 `grade` に十分な件数ある | [06](endgame.md) §8 |
| 14 | 地方の `dex` に含まれる種が、その地方で入手可能 | [04](capture.md) |
| 15 | **全 `uid` がちょうど1つの器に属する**（手持ち／地方ボックス／共通ボックスの二重所属を禁止） | [04](capture.md) §4 |
| 16 | エンジン未対応の要素をデータが使っていない（例: `battleFormat: "double"`） | [01](battle-system.md) §12 |

### マップ・イベントの検証（11章由来）

| # | 項目 | 根拠 |
| --- | --- | --- |
| 17 | 全 `warp.to` の接続先マップが存在し、座標が範囲内かつ通行可能タイル | [11](world.md) §3 |
| 18 | **到達不能な領域がない**（プレイヤーが入れない／出られない区画の検出） | [11](world.md) §8 |
| 19 | **`setFlag` と `Condition` が使うフラグIDが `flags.json` に宣言済み** | [11](world.md) §6 |
| 20 | マップ上の `trainer` / `item` / `encounters` の参照先が存在する | [11](world.md) §8 |
| 21 | 全 `EventCommand.kind` にハンドラが登録されている | [11](world.md) §6 |

### 経済の検証（12章由来）

| # | 項目 | 根拠 |
| --- | --- | --- |
| 22 | **`training` カテゴリの道具に `price` がない**（＝お金で買えない） | [12](economy.md) §7 |
| 23 | ショップの `stock` の全 `item` が存在し `price` を持つ | [12](economy.md) §5 |
| 24 | 全 `ItemEffect.kind` にハンドラが登録されている | [12](economy.md) §6 |

**22 は [`economy.md`](economy.md) §7 の中心原則「お金では個体を強くできない」を
CIで守るためのもの。** 運用ルールにせず、価格を付けた時点で検証が落ちる形にする。

19 も同種で、[`world.md`](world.md) §6 の「フラグID宣言必須」を機械化したもの。
**タイプミスで永久に立たないフラグは、発生してから原因を追うのが極めて困難**なため、
書いた時点で落とす。

**9〜11 が本作の設計思想そのもの。**
「全ポケモンが出る」「キャラらしさを保つ」という**願望が、CIの合否になる。**

## 7. データ量の見積もり

現実感を持つための概算。

| データ | 件数 |
| --- | --- |
| 種族（フォルム込み） | 約1,500 |
| 技 | 約920 |
| 特性 | 約310 |
| 道具 | 数百（意味のあるもの） |
| ネームド | 約270人 × 3ティア = **810パーティ** |
| `BattleSet` | 目標 数千（施設の多様性を支える） |
| 出現テーブル | 地方あたり数十 × 9 |
| **マップ** | 数百（[`world.md`](world.md)） |
| **イベントスクリプト** | 地方あたり数百 × 9 |
| **フラグID** | 地方あたり数百 |
| 道具 | 数百 |

**手入力が現実的な量ではない。** `tools/` に以下を用意する前提で設計する。

- 一括変換スクリプト（表計算形式 → JSON）
- 雛形生成（種族を1件足すときの空テンプレート）
- 差分検証（既存データを壊していないか）

データ作成の道具立ては、**ゲーム本体と同じくらい重要な成果物**になる。

## 8. 調整項目（実装後に決める）

- `species/` の分割単位（図鑑番号帯か地方か）
- 生成ID型のコンパイル時間への影響（許容できなければ branded type に落とす）
- データのロード方式（全件を初期ロードするか、地方単位で遅延ロードするか）
- `tools/` の入力形式（表計算か、独自の中間形式か）
