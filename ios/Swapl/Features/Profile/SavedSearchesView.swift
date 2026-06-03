import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class SavedSearchesViewModel {
    var items: [SavedSearch] = []
    var error: String?
    var requiresUpgrade = false

    func load() async {
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
                            .font(.swaplBody(15))
                    }
                }
            }
            ForEach(vm.items) { s in
                VStack(alignment: .leading, spacing: 4) {
                    Text(s.name).font(.swaplDisplay(17))
                    Text(s.query).font(.swaplMono(11)).foregroundStyle(SwaplSemanticLight.mutedForeground)
                }
            }
            if let err = vm.error {
                Text(err).foregroundStyle(SwaplSemanticLight.destructive)
            }
        }
        .navigationTitle("Saved searches")
        .task { await vm.load() }
    }
}
