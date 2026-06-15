import SwiftUI
import Observation
import SwaplDesignTokens

// Stay-with-Keys request sheet (DOK-155). A one-directional stay: the guest
// pays in points, the host need not travel. Sits ALONGSIDE the direct-swap
// proposal flow, never replacing it. Immediacy is the point — pick dates, see
// the cost, tap "Request with points". Insufficient balance shows a message,
// never an offer to buy.

@MainActor
@Observable
final class StayWithKeysViewModel {
    let listingId: String
    var availability: KeysAvailability?
    var balance: Int?
    var error: String?
    var isLoading = false

    init(listingId: String) { self.listingId = listingId }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            // Availability + wallet balance in parallel: the cost preview needs
            // the nightly rate, the "enough points?" hint needs the balance.
            async let avail = KeysRepository.shared.availability(listingId: listingId)
            async let wallet = KeysRepository.shared.wallet()
            self.availability = try await avail
            self.balance = try await wallet.balance
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct StayWithKeysSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var vm: StayWithKeysViewModel
    @State private var dateFrom: Date
    @State private var dateTo: Date
    @State private var requestError: String?
    @State private var isSubmitting = false
    @State private var requestedStayId: String?

    let listing: Listing
    let onRequested: (String) -> Void

    init(listing: Listing, onRequested: @escaping (String) -> Void) {
        self.listing = listing
        self.onRequested = onRequested
        _vm = State(initialValue: StayWithKeysViewModel(listingId: listing.id))
        let from = SwaplDateText.parse(listing.availableFrom) ?? Date()
        let to = Calendar.current.date(byAdding: .day, value: max(listing.minStayDays, 1), to: from) ?? from
        _dateFrom = State(initialValue: from)
        _dateTo = State(initialValue: to)
    }

    // Whole nights between the two chosen dates.
    private var nights: Int {
        max(0, Calendar.current.dateComponents([.day], from: dateFrom, to: dateTo).day ?? 0)
    }

    private var nightlyKeys: Int { vm.availability?.nightlyKeys ?? 0 }
    private var totalKeys: Int { nightlyKeys * nights }

    private var canAfford: Bool {
        guard let balance = vm.balance else { return true }
        return balance >= totalKeys
    }

    var body: some View {
        NavigationStack {
            Group {
                if vm.availability != nil {
                    form
                } else if let error = vm.error {
                    SwaplEmptyState(
                        systemImage: "key.horizontal",
                        title: "Stay unavailable",
                        description: error,
                        actionTitle: "Try Again",
                        action: { Task { await vm.load() } }
                    )
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel("Loading stay options")
                }
            }
            .navigationTitle("Stay with points")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert("Request sent", isPresented: requestedBinding) {
                Button("OK") {
                    if let id = requestedStayId { onRequested(id) }
                    dismiss()
                }
            } message: {
                Text("Your points are held until the host confirms. You'll find this stay under Trips.")
            }
        }
        .task { await vm.load() }
    }

    private var form: some View {
        Form {
            Section {
                DatePicker("Check-in", selection: $dateFrom, displayedComponents: .date)
                DatePicker("Check-out", selection: $dateTo, displayedComponents: .date)
            } footer: {
                Text("Choose dates inside the home's availability. \(listing.minStayDays)–\(listing.maxStayDays) nights.")
            }

            Section {
                costRow("Points per night", "\(nightlyKeys)")
                costRow("Nights", "\(nights)")
                Divider()
                HStack {
                    Text("Total")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    Spacer()
                    Text("\(totalKeys) points")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                }
                if let balance = vm.balance {
                    Text(canAfford
                         ? "You have \(balance) points — enough for this stay."
                         : "You have \(balance) points — \(totalKeys - balance) short. Earn points by hosting, or pick fewer nights. Points can't be bought.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(canAfford ? AirbnbPalette.secondaryText : SwaplSemanticLight.destructive)
                }
            } header: {
                Text("Cost")
            }

            if let requestError {
                Section { Text(requestError).foregroundStyle(SwaplSemanticLight.destructive) }
            }

            Section {
                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        Spacer()
                        if isSubmitting { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                        Text(isSubmitting ? "Sending" : "Request with points")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                            .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        Spacer()
                    }
                    .padding(.vertical, 6)
                }
                .listRowBackground(canAffordAndValid ? SwaplSemanticLight.primary : SwaplSemanticLight.muted)
                .disabled(!canAffordAndValid || isSubmitting)
            }
        }
    }

    private var canAffordAndValid: Bool {
        nights >= max(listing.minStayDays, 1) && nights <= listing.maxStayDays && canAfford
    }

    private func costRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
            Spacer()
            Text(value).font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
        }
    }

    private var requestedBinding: Binding<Bool> {
        Binding(get: { requestedStayId != nil }, set: { if !$0 { requestedStayId = nil } })
    }

    private func submit() async {
        guard nights > 0 else {
            requestError = "Check-out must be after check-in."
            return
        }
        isSubmitting = true
        requestError = nil
        defer { isSubmitting = false }
        do {
            let response = try await KeysRepository.shared.requestStay(
                listingId: listing.id,
                dateFrom: SwaplDateText.apiString(from: dateFrom),
                dateTo: SwaplDateText.apiString(from: dateTo)
            )
            requestedStayId = response.stayId
        } catch APIClient.APIError.status(422, let body) where (body ?? "").localizedCaseInsensitiveContains("enough") {
            // Insufficient points — never an offer to buy; just inform.
            requestError = "You don't have enough points for these dates. Try fewer nights or earn points by hosting."
        } catch let error as APIClient.APIError {
            // The API surfaces a human message in the error body (see APIError);
            // localizedDescription already extracts it for 422s like
            // OUTSIDE_AVAILABILITY / DATES_TAKEN.
            requestError = error.localizedDescription
        } catch {
            requestError = error.localizedDescription
        }
    }
}
