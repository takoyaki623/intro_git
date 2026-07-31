import Foundation

/// アプリ本体と Safari 拡張機能の両方から参照する、共有 App Group 上の設定ストア
enum RuleStore {
    private static let customDomainsKey = "customBlockedDomains"

    static func isEnabled(_ category: FilterCategory) -> Bool {
        let defaults = AppGroup.defaults
        if defaults.object(forKey: category.defaultsKey) == nil {
            return true
        }
        return defaults.bool(forKey: category.defaultsKey)
    }

    static func setEnabled(_ enabled: Bool, for category: FilterCategory) {
        AppGroup.defaults.set(enabled, forKey: category.defaultsKey)
    }

    static func customDomains() -> [String] {
        AppGroup.defaults.stringArray(forKey: customDomainsKey) ?? []
    }

    @discardableResult
    static func addCustomDomain(_ domain: String) -> Bool {
        let trimmed = domain.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return false }
        var domains = customDomains()
        guard !domains.contains(trimmed) else { return false }
        domains.append(trimmed)
        AppGroup.defaults.set(domains, forKey: customDomainsKey)
        return true
    }

    static func removeCustomDomains(at offsets: IndexSet) {
        var domains = customDomains()
        domains.remove(atOffsets: offsets)
        AppGroup.defaults.set(domains, forKey: customDomainsKey)
    }
}
