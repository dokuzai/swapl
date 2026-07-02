import SwiftUI
import SwaplDesignTokens

// "Guida di casa" editor for the owner's own listing (DOK-152). Loads the
// current guide, edits the field set in sections, and PUTs a partial upsert.
// The 8 core fields drive the completeness bar (matches the server's
// HOME_GUIDE_CORE_FIELDS); house rules / neighbourhood / emergency contact are
// nice-to-have extras outside the percentage.
@MainActor
@Observable
final class HomeGuideEditorViewModel {
    let listingId: String
    var isLoading = false
    var isSaving = false
    var error: String?
    var loadFailed = false

    // Editable fields.
    var accessInstructions = ""
    var keyPickup = ""
    var wifiName = ""
    var wifiPassword = ""
    var heatingCooling = ""
    var kitchen = ""
    var bins = ""
    var petsPlants = ""
    var houseRules = ""
    var neighbourhood = ""
    var emergencyContact = ""

    init(listingId: String) {
        self.listingId = listingId
    }

    // 8 core fields → completeness, mirrors the server denominator.
    private var coreFields: [String] {
        [accessInstructions, keyPickup, wifiName, wifiPassword, heatingCooling, kitchen, bins, petsPlants]
    }

    var completeness: Int {
        let filled = coreFields.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.count
        return Int((Double(filled) / 8.0 * 100).rounded())
    }

    func load() async {
        isLoading = true
        error = nil
        loadFailed = false
        defer { isLoading = false }
        do {
            let response = try await TripRepository.shared.homeGuide(listingId: listingId)
            if let g = response.guide {
                accessInstructions = g.accessInstructions ?? ""
                keyPickup = g.keyPickup ?? ""
                wifiName = g.wifiName ?? ""
                wifiPassword = g.wifiPassword ?? ""
                heatingCooling = g.heatingCooling ?? ""
                kitchen = g.kitchen ?? ""
                bins = g.bins ?? ""
                petsPlants = g.petsPlants ?? ""
                houseRules = g.houseRules ?? ""
                neighbourhood = g.neighbourhood ?? ""
                emergencyContact = g.emergencyContact ?? ""
            }
        } catch {
            self.error = error.localizedDescription
            loadFailed = true
        }
    }

    // Send every field (empty string clears it server-side via explicit null).
    func save() async -> Bool {
        isSaving = true
        error = nil
        defer { isSaving = false }
        func normalized(_ s: String) -> String? {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? "" : t   // "" → server stores empty/cleared; non-empty → value
        }
        let update = HomeGuideUpdate(
            accessInstructions: normalized(accessInstructions),
            keyPickup: normalized(keyPickup),
            wifiName: normalized(wifiName),
            wifiPassword: normalized(wifiPassword),
            heatingCooling: normalized(heatingCooling),
            kitchen: normalized(kitchen),
            bins: normalized(bins),
            petsPlants: normalized(petsPlants),
            houseRules: normalized(houseRules),
            neighbourhood: normalized(neighbourhood),
            emergencyContact: normalized(emergencyContact)
        )
        do {
            try await TripRepository.shared.saveHomeGuide(listingId: listingId, update)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}

struct HomeGuideEditorView: View {
    @State private var vm: HomeGuideEditorViewModel
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.swaplTheme) private var theme

    init(listingId: String, onSaved: @escaping () -> Void) {
        _vm = State(initialValue: HomeGuideEditorViewModel(listingId: listingId))
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("\(vm.completeness.swaplPercent) complete")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                            Spacer()
                        }
                        ProgressView(value: Double(vm.completeness), total: 100)
                            .tint(SwaplSemanticLight.primary)
                        Text("Fill the essentials so your guest can settle in without messaging you.")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                    }
                    .padding(.vertical, 4)
                }

                Section("Getting in") {
                    guideField("Access instructions", text: $vm.accessInstructions)
                    guideField("Key pickup", text: $vm.keyPickup)
                }
                Section("Wi-Fi") {
                    guideField("Network name", text: $vm.wifiName)
                    guideField("Password", text: $vm.wifiPassword)
                }
                Section("Living in the home") {
                    guideField("Heating & cooling", text: $vm.heatingCooling)
                    guideField("Kitchen", text: $vm.kitchen)
                    guideField("Bins & recycling", text: $vm.bins)
                    guideField("Pets & plants", text: $vm.petsPlants)
                }
                Section("Good to know (optional)") {
                    guideField("House rules", text: $vm.houseRules)
                    guideField("Neighbourhood tips", text: $vm.neighbourhood)
                    guideField("Emergency contact", text: $vm.emergencyContact)
                }

                if let error = vm.error {
                    Section {
                        Text(error)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.destructive)
                    }
                }
            }
            .navigationTitle("Home guide")
            .navigationBarTitleDisplayMode(.inline)
            .swaplScreenBackground()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if vm.isSaving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            Task {
                                if await vm.save() {
                                    onSaved()
                                    dismiss()
                                }
                            }
                        }
                    }
                }
            }
            .overlay {
                if vm.isLoading {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(theme.background.opacity(0.6))
                }
            }
            .task { await vm.load() }
        }
    }

    private func guideField(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
            TextField(label, text: text, axis: .vertical)
                .lineLimit(1...5)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
        }
        .padding(.vertical, 2)
    }
}
