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
- **MCP サーバ 2 つ** — Context7（ライブラリ公式ドキュメント参照）と Sequential Thinking（多段推論）

コマンド一覧は `/sc:help` で確認できます。

### MCP サーバについて

`.mcp.json` の 2 つのサーバは `npx` で起動するため、初回のみ Node.js とネットワークが必要です。
初回起動時に Claude Code がこのプロジェクトの MCP サーバを信頼するか確認するので、承認してください。
使わない場合は `.mcp.json` を削除しても、コマンド・エージェント・スキルはそのまま動作します。

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
