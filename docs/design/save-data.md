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

## 10. 調整項目（実装後に決める）

- セーブスロット数（複数の冒険を並行させるか、1つで十分か）
- オートセーブの頻度（書き込み負荷とのバランス）
- 共通ボックスの個体数上限を設けるか（無制限だと最終的に速度に影響する）
- `flags` のキーを静的データ側の一覧で検証するか
- エクスポートを促す頻度
