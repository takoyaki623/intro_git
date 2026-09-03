# intro_git

git の練習用リポジトリです。基本的なワークフローを学びます。

## SuperClaude

このリポジトリには [SuperClaude Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework) v4.3.0 を同梱しています。
clone してこのディレクトリで `claude` を起動すれば、**追加のインストール操作なしで**そのまま使えます。

内訳:

- **30 個のスラッシュコマンド** — `/sc:implement` `/sc:analyze` `/sc:brainstorm` `/sc:test` など
- **20 個の専門エージェント** — `@pm-agent` `@system-architect` `@security-engineer` など
- **6 個のスキル** — `confidence-check` `deep-research` `brainstorm` `troubleshoot` `pm` `token-efficiency`（会話内容に応じて自動起動）
- **3 個の hook** — セッション開始時の状況表示、終了前の未コミット確認、Write/Edit 後の自己検証
- **MCP サーバ 4 つ** — 下記参照

コマンド一覧は `/sc:help` で確認できます。

### MCP サーバについて

`.mcp.json` に 4 つ定義しています。いずれも API キー不要・無料です。

| サーバ | できること | 必要なもの |
| --- | --- | --- |
| Context7 | ライブラリの公式ドキュメント参照 | Node.js |
| Sequential Thinking | 多段推論（`--think` 系フラグの土台） | Node.js |
| Playwright | 実ブラウザ操作。E2E テスト、スクリーンショット、フォーム入力、コンソールとネットワークの検査 | Node.js + ブラウザ（初回に自動取得） |
| Serena | LSP による意味的なコード操作。シンボルのリネーム・参照検索・定義ジャンプ・診断、およびセッションをまたぐプロジェクト記憶 | [uv](https://docs.astral.sh/uv/)（`uvx`） |

Serena は PyPI の [`serena-agent`](https://pypi.org/project/serena-agent/)（本体は
[oraios/serena](https://github.com/oraios/serena)、MIT）を `uvx` 経由で起動します。
`uv` が入っていない場合は Serena だけ起動に失敗しますが、他の 3 つには影響しません。

初回起動時に Claude Code がこのプロジェクトの MCP サーバを信頼するか確認するので、承認してください。
使わない場合は `.mcp.json` を削除しても、コマンド・エージェント・スキルはそのまま動作します。

API キーが要る MCP サーバ（Magic、Morphllm、Tavily）は、`.mcp.json` が GitHub に
公開されるため意図的に入れていません。使う場合は `claude mcp add` で各自の環境に
入れるか、キーを `${VAR}` 形式で環境変数から読ませてください。

### 配置

```
.mcp.json                  MCP サーバ定義
.claude/
  settings.json            hook 定義
  commands/sc/             30 コマンド → /sc:*
  agents/                  20 エージェント
  skills/                  6 スキル
  superclaude/             参照ドキュメントと hook スクリプト
    VENDORED.md            同梱元・上流からの変更点
```

同梱の経緯と上流からの差分は [`.claude/superclaude/VENDORED.md`](.claude/superclaude/VENDORED.md) を参照してください。
