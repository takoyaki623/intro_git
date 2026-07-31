import Foundation

enum AppGroup {
    static let identifier = "group.com.example.adshield"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: identifier) ?? .standard
    }
}
