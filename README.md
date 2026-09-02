# ポケモン風RPG

TypeScript で書いた、原作風の RPG。**個人用・非配布**（`docs/game-plan.md` §10）。

- ポケモン 228種（カントー 151 ＋ 77）・技 292種・マップ 210枚
- **公式素材は1枚も入っていない。** 絵はコードが組む ――
  素材が無い状態が逃げ道ではなく通常動作
- 手元に素材があれば、**自分の端末の中だけで**差し替えられる（下記）

## パソコンで動かす

必要なのは Node だけ（開発は v22 で確認。npm は同梱のもの）。

```
git clone https://github.com/takoyaki623/intro_git
cd intro_git
git checkout claude/pokemon-game-planning-p9gnqa
npm install      # 76 パッケージ・10秒ほど
npm run dev      # → http://localhost:5173
```

**`http://` で開くのが大事。** ファイルを直接（`file://`）開くと、
ブラウザが保存（IndexedDB）を止めるので進行が残らない
―― そのときは画面の上に1行そう出る。

## スマホで動かす

```
npm run bundle
```

2つ出る。**用途が違うので間違えないこと。**

| ファイル | 何 |
| --- | --- |
| `dist/pokemon-rpg.html` | Artifact 用の**断片**（`<!doctype>` も `<head>` も無い） |
| `dist/pokemon-rpg-standalone.html` | **そのまま開く用**（1枚で完結） |

スマホへ送って開くなら **standalone のほう**。断片を開くと
`meta viewport` が無いので 980px の幅に組まれ、指で押せない大きさになる。

`file://` では保存が効かないので、進行を残すなら
**「セーブ」→ バックアップ**で文字列をコピーしておく。

## 手元の素材を入れる

**公式素材はこのリポジトリにも配る版にも入らない**（公開リポジトリなので
公衆送信になる）。入れるのは利用者が自分の端末へ、が唯一の道。
画像はどこにも送られない（そのブラウザの IndexedDB の中だけ）。

### 名前の決まり

**ファイル名がそのまま絵の名前**になる。一覧は 453 こ:

```
npm run art:names      # → dist/asset-names.tsv（図鑑番号の列つき）
```

ゲームの設定画面（「え（そざい）」）にも同じ一覧が出る。

### 入れ方（どちらでもよい）

**そのまま選ぶ。** 設定画面 →「え（そざい）」→ ファイルかフォルダを選ぶ。
`001.png` も `ピカチュウ.png` も**その場で名前が直る**ので、
リネームは要らない。当たらなかったものは名指しで報告される。

**先に名前を直しておく。** 数が多いならこちら:

```
npm run art:collect -- ~/Downloads/sprites --dry   # 下見
npm run art:collect -- ~/Downloads/sprites          # → assets/collected
```

入力は1バイトも変えない（読んでコピーするだけ）。
2種に当たるものは**どちらもコピーせず**に報告する。

## 道具

```
npm run check        # 型・テスト・データ検証・生成物の鮮度（1分）
npm run playthrough  # 端から端まで遊んで 322件を確かめる（24分・要 npm run dev）
npm run shots        # 74か所を2サイズで撮る（10分・要 npm run dev）
npm run gallery      # 撮ったものを1枚の HTML に
npm run sprites      # 228種の姿を1枚に（dist/sprites.html）
npm run data         # 原本（TSV・.map）から JSON を作り直す
```

**見た目に自動判定は無い。** だから撮って並べて目で見る、が `shots` と
`sprites` の役目。`check` が緑でも、絵が良いかは別の話。

## 設計

`docs/game-plan.md` に方針、`docs/design/` に画面・セーブ・捕獲などの決定。
**なぜそうしたか**と**何を入れなかったか**を残してある。
