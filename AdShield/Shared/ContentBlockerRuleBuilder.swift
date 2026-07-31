import Foundation

/// 有効なフィルター種別のルールを結合し、Safari Content Blocker 用の JSON 配列を組み立てる
enum ContentBlockerRuleBuilder {
    /// WebKit Content Blocker の1リストあたりの上限
    static let maxRuleCount = 150_000

    static func buildRules(bundle: Bundle) -> [[String: Any]] {
        var rules: [[String: Any]] = []

        for category in FilterCategory.allCases where RuleStore.isEnabled(category) {
            rules.append(contentsOf: loadBundledRules(named: category.resourceName, bundle: bundle))
        }

        rules.append(contentsOf: RuleStore.customDomains().map(customBlockRule))

        if rules.count > maxRuleCount {
            rules = Array(rules.prefix(maxRuleCount))
        }
        return rules
    }

    private static func loadBundledRules(named name: String, bundle: Bundle) -> [[String: Any]] {
        guard
            let url = bundle.url(forResource: name, withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return json
    }

    private static func customBlockRule(domain: String) -> [String: Any] {
        [
            "trigger": [
                "url-filter": ".*",
                "if-domain": ["*\(domain)"]
            ],
            "action": [
                "type": "block"
            ]
        ]
    }
}
