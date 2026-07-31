import SwiftUI

struct ContentView: View {
    @State private var enabledStates: [FilterCategory: Bool] = Dictionary(
        uniqueKeysWithValues: FilterCategory.allCases.map { ($0, RuleStore.isEnabled($0)) }
    )
    @State private var customDomains: [String] = RuleStore.customDomains()
    @State private var newDomain: String = ""
    @State private var showReloadTip = false

    var body: some View {
        NavigationStack {
            List {
                Section("フィルター") {
                    ForEach(FilterCategory.allCases) { category in
                        Toggle(isOn: binding(for: category)) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(category.title)
                                Text(category.subtitle)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("カスタムブロックドメイン") {
                    ForEach(customDomains, id: \.self) { domain in
                        Text(domain)
                    }
                    .onDelete { offsets in
                        RuleStore.removeCustomDomains(at: offsets)
                        customDomains = RuleStore.customDomains()
                        showReloadTip = true
                    }

                    HStack {
                        TextField("例: ads.example.com", text: $newDomain)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button("追加") {
                            addDomain()
                        }
                        .disabled(newDomain.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }

                Section {
                    Button("Safariの設定を開く") {
                        openSettings()
                    }
                } footer: {
                    Text("フィルターやドメインを変更したら、「設定 > Safari > 機能拡張」で AdShield の拡張機能をオフ→オンにして再読み込みしてください。")
                }
            }
            .navigationTitle("AdShield")
            .alert("設定を反映するには", isPresented: $showReloadTip) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("設定 > Safari > 機能拡張 から AdShield のブロックリストを再読み込みしてください。")
            }
        }
    }

    private func binding(for category: FilterCategory) -> Binding<Bool> {
        Binding(
            get: { enabledStates[category] ?? true },
            set: { newValue in
                enabledStates[category] = newValue
                RuleStore.setEnabled(newValue, for: category)
                showReloadTip = true
            }
        )
    }

    private func addDomain() {
        guard RuleStore.addCustomDomain(newDomain) else { return }
        customDomains = RuleStore.customDomains()
        newDomain = ""
        showReloadTip = true
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

#Preview {
    ContentView()
}
