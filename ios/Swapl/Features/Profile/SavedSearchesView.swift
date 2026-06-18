import SwiftUI
import Observation
import SwaplDesignTokens

@MainActor
@Observable
final class SavedSearchesViewModel {
    var items: [SavedSearch] = []
    var error: String?
    var requiresUpgrade = false
    var hasLoaded = false

    func load() async {
        defer { hasLoaded = true }
        do { items = try await ProfileRepository.shared.savedSearches() }
        catch APIClient.APIError.status(402, _) { requiresUpgrade = true }
        catch { self.error = error.localizedDescription }
    }
}

struct SavedSearchesView: View {
    @State private var vm = SavedSearchesViewModel()

    var body: some View {
        List {
            if vm.requiresUpgrade {
                SurfaceCard {
                    VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                        KickerLabel(text: "Plus / Pro")
                        Text("Saved searches are a Plus member feature.")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    }
                }
            }
            ForEach(vm.items) { s in
                VStack(alignment: .leading, spacing: 4) {
                    Text(s.name).font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    Text(s.query).font(.swaplMono(SwaplDesignSystem.FontSize.tiny)).foregroundStyle(SwaplSemanticLight.mutedForeground)
                }
            }
            if let err = vm.error {
                Text(err)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(SwaplSemanticLight.destructive)
            }
        }
        .overlay {
            if vm.hasLoaded && vm.items.isEmpty && !vm.requiresUpgrade && vm.error == nil {
                SwaplEmptyState(
                    systemImage: "magnifyingglass",
                    title: "No saved searches",
                    description: "Save a search on the web to get notified about new matching homes."
                )
            }
        }
        .scrollContentBackground(.hidden)
        .swaplFloatingHeader(String(localized: "Saved searches"))
        .task { await vm.load() }
    }
}
