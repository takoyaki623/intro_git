import Foundation

final class ContentBlockerRequestHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let bundle = Bundle(for: type(of: self))
        let rules = ContentBlockerRuleBuilder.buildRules(bundle: bundle)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("blockerList")
            .appendingPathExtension("json")

        let item = NSExtensionItem()

        do {
            let data = try JSONSerialization.data(withJSONObject: rules, options: [])
            try data.write(to: outputURL, options: .atomic)
            item.attachments = [NSItemProvider(contentsOf: outputURL)].compactMap { $0 }
        } catch {
            // ルール生成に失敗した場合は空のリストで完了させる
        }

        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}
