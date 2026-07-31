import Foundation

enum FilterCategory: String, CaseIterable, Identifiable {
    case ads
    case trackers
    case social

    var id: String { rawValue }

    var title: String {
        switch self {
        case .ads: return "広告ブロック"
        case .trackers: return "トラッキングブロック"
        case .social: return "SNSウィジェットブロック"
        }
    }

    var subtitle: String {
        switch self {
        case .ads: return "バナー広告・広告ネットワークを非表示にします"
        case .trackers: return "アクセス解析・行動追跡スクリプトをブロックします"
        case .social: return "いいねボタンなどのSNS埋め込みウィジェットを非表示にします"
        }
    }

    /// Rules/<resourceName>.json に対応するバンドル済みルールファイル名
    var resourceName: String {
        switch self {
        case .ads: return "ads_rules"
        case .trackers: return "trackers_rules"
        case .social: return "social_rules"
        }
    }

    var defaultsKey: String { "filter.enabled.\(rawValue)" }
}
