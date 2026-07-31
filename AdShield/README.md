# AdShield

Safari 用の広告・トラッキングブロッカー iOS アプリです(280blockerと同じ「Safari Content Blocker拡張機能」の仕組みを使った個人開発向けサンプル実装)。

## 構成

- `AdShield`(アプリ本体・SwiftUI): フィルターのオン/オフ、カスタムブロックドメインの追加/削除を行うUI
- `BlockerExtension`(Safari Content Blocker拡張): 有効なフィルターのルールJSONを結合してSafariに渡す
- `Shared`: アプリと拡張機能の両方から使う共通コード(App Group経由の設定共有、ルール生成ロジック)
- `ContentBlockerExtension/Rules/*.json`: 広告・トラッカー・SNSウィジェットのブロックルール(サンプルの初期リスト)

## 必要なもの

- macOS + Xcode 15以降
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)(`brew install xcodegen`)
- Apple Developer アカウント(実機テスト・App Group利用に必要。無料アカウントでも実機ビルド自体は可能)

## セットアップ手順

1. `project.yml` 内の以下を自分の環境に合わせて変更します。
   - `options.bundleIdPrefix`(例: `com.yourname.adshield`)
   - 各ターゲットの `PRODUCT_BUNDLE_IDENTIFIER`
   - App Group ID(`group.com.example.adshield` を独自のものに変更し、`App/AdShield.entitlements` と `ContentBlockerExtension/BlockerExtension.entitlements`、`Shared/AppGroup.swift` の `identifier` も同じ値に揃える)
2. Xcodeプロジェクトを生成します。

   ```sh
   cd AdShield
   xcodegen generate
   open AdShield.xcodeproj
   ```

3. Xcodeで両ターゲット(`AdShield`, `BlockerExtension`)の **Signing & Capabilities** で Team を設定し、App Groups capability に指定したグループが選択されていることを確認します。
4. 実機またはシミュレータでビルド・実行します。
5. 端末の「設定 > Safari > 機能拡張」を開き、AdShield を有効化します。
6. アプリ内でフィルターやカスタムドメインを変更した場合は、同じ画面で拡張機能をオフ→オンにして再読み込みしてください(Safari Content Blockerの仕様上、自動反映されないため)。

## ブロックルールを増やす

`ContentBlockerExtension/Rules/ads_rules.json` などに、[WebKit Content Blocker のルール形式](https://developer.apple.com/documentation/safariservices/creating-a-content-blocker)でオブジェクトを追加してください。1リストの上限は15万件です。

```json
{
  "trigger": { "url-filter": ".*", "if-domain": ["*example-ad-network.com"] },
  "action": { "type": "block" }
}
```

## 既知の制約

- 同梱のブロックルールは動作確認用の小規模なサンプルです。実運用では広告/トラッカーのドメインリストを継続的に更新する必要があります。
- Safari Content Blockerは「リクエストのブロック/CSS非表示」のみ可能で、Shadowrocketのようなアプリ単位・OS全体のプロキシ制御はできません。
