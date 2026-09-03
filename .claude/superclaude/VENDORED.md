# SuperClaude — 同梱物について

このディレクトリ配下と `.claude/{commands,agents,skills}` は
[SuperClaude Framework](https://github.com/SuperClaude-Org/SuperClaude_Framework)
を本リポジトリに同梱したものです。

| 項目 | 値 |
| --- | --- |
| バージョン | 4.3.0 |
| 取得元 | PyPI `SuperClaude==4.3.0` に同梱の Claude Code プラグイン (`superclaude/_plugins/superclaude/`) |
| ライセンス | MIT (SuperClaude Org) |

## 上流からの変更点

上流はこれを Claude Code の**プラグイン**として配布していますが、
プラグインはリポジトリを clone しただけでは有効化されず、
利用者ごとに `claude plugin marketplace add` / `claude plugin install`
を実行する必要があります。

clone してすぐ使える状態にするため、プラグインを分解して
Claude Code がプロジェクト直下から自動で読む標準パスに再配置しています。

| 上流 (プラグイン) | このリポジトリ |
| --- | --- |
| `commands/` | `.claude/commands/sc/` （`/sc:*` として自動ロード） |
| `agents/` | `.claude/agents/` （自動ロード） |
| `skills/` | `.claude/skills/` （自動ロード） |
| `hooks/hooks.json` | `.claude/settings.json` の `hooks` |
| `.mcp.json` | リポジトリ直下の `.mcp.json` |
| `core/` `modes/` `mcp/` `examples/` `scripts/` | `.claude/superclaude/` （参照用。自動ロードなし） |

hooks の内容は上流と同じですが、2 点だけ調整しています。

- パス参照を `${CLAUDE_PLUGIN_ROOT}` から `$CLAUDE_PROJECT_DIR` に変更
  （プラグインとして読まれないため `CLAUDE_PLUGIN_ROOT` は未定義になる）
- SessionStart の `timeout` を `10000` から `10` に変更。
  Claude Code の hook timeout は**秒**単位なので、上流の値では約 2.8 時間になる

`commands/` `agents/` `skills/` の各 Markdown は上流のまま無改変です。

## 更新方法

```bash
pip download SuperClaude==<新バージョン> --no-deps -d /tmp/sc
# 展開して superclaude/_plugins/superclaude/ から上表のとおり再配置し、
# このファイルのバージョンを更新する
```
