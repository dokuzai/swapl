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
    // When the balance falls short we offer a path to the wallet's "ways to earn
    // points" screen — never an offer to buy.
    @State private var showEarnPaths = false
    // Lightweight "how does this work?" explainer, on demand from the toolbar.
    // Doesn't add a tap to the request flow — only the curious pay the cost.
    @State private var showInfo = false

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

    // How many points the guest is missing for the current dates. 0 when they can
    // afford it (or balance isn't loaded). Drives the "earn points" CTA + message.
    private var shortBy: Int {
        guard let balance = vm.balance, totalKeys > balance else { return 0 }
        return totalKeys - balance
    }

    // "You have N points — enough for about M nights here" gives the balance a
    // scale tied to THIS home's rate, computed live as dates/rate load.
    private func balanceScaleText(balance: Int) -> String {
        guard nightlyKeys > 0 else { return "You have \(balance) points — enough for this stay." }
        let possibleNights = balance / nightlyKeys
        return "You have \(balance) points — enough for this stay (about \(possibleNights) night\(possibleNights == 1 ? "" : "s") at this home)."
    }

    // Short balance: state the gap, then a concrete hosting fix ("host ~N nights
    // of your own home to cover it"), never a purchase. Falls back gracefully if
    // we don't know the member's own rate yet.
    private func insufficientText(balance: Int) -> String {
        let gap = totalKeys - balance
        let myRate = vm.availability?.nightlyKeys ?? 0  // rate of THIS listing as a proxy scale
        if myRate > 0 {
            let nightsToHost = Int((Double(gap) / Double(myRate)).rounded(.up))
            return "You have \(balance) points — \(gap) short. Host about \(nightsToHost) night\(nightsToHost == 1 ? "" : "s") to earn the rest, or pick fewer nights. Points can't be bought."
        }
        return "You have \(balance) points — \(gap) short. Earn points by hosting, or pick fewer nights. Points can't be bought."
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
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showInfo = true
                    } label: {
                        Image(systemName: "info.circle")
                    }
                    .accessibilityLabel("How staying with points works")
                    .popover(isPresented: $showInfo) {
                        infoPopover
                            .presentationCompactAdaptation(.popover)
                    }
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
            .sheet(isPresented: $showEarnPaths, onDismiss: { Task { await vm.load() } }) {
                NavigationStack { KeysWalletView() }
            }
        }
        .task { await vm.load() }
    }

    private var form: some View {
        Form {
            // First-touch framing: what "stay with points" means and how it
            // differs from a direct swap, so a guest isn't guessing whether the
            // nightly rate is a price. One sentence, above the date pickers.
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Book one-way — no hosting back required")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                    Text("Unlike a swap, the host doesn't travel to you. You spend travel points you earned by hosting — never money.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 2)
            }

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
                    if canAfford {
                        // Give the balance a scale: a bare number means nothing
                        // until it's "≈ N nights at this rate".
                        Text(balanceScaleText(balance: balance))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                    } else {
                        // Insufficient: quantify the gap AND give an actionable
                        // next step in hosting terms, so "short" has a fix that
                        // isn't "buy". Points are never money.
                        Text(insufficientText(balance: balance))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(SwaplSemanticLight.destructive)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } header: {
                Text("Cost")
            }

            if let requestError {
                Section {
                    Text(requestError).foregroundStyle(SwaplSemanticLight.destructive)
                    // Insufficient points is the one error with a next step: send
                    // the guest to the wallet's "ways to earn points" screen.
                    if shortBy > 0 {
                        Button {
                            showEarnPaths = true
                        } label: {
                            Label("See how to earn points", systemImage: "key.horizontal")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        }
                    }
                }
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

    // On-demand explainer. Frames points as travel points earned by hosting —
    // never money, never buyable — so the model stays "air miles", not currency.
    private var infoPopover: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Staying with points", systemImage: "key.horizontal")
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                .foregroundStyle(SwaplSemanticLight.primary)

            Text("Example: host 2 nights of your home (\(nightlyKeys > 0 ? nightlyKeys : 8) points / night) → earn \((nightlyKeys > 0 ? nightlyKeys : 8) * 2) points → spend them on 2 nights here.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .fixedSize(horizontal: false, vertical: true)

            infoRow("You earn points by hosting other members — they're travel points, not money, and can't be bought.")
            infoRow("Pick your dates and the home's nightly points show the total. The host doesn't need to travel back.")
            infoRow("Your points are held when you request, and only spent once the host confirms. If they decline, you get them straight back.")
            infoRow("Every confirmed stay is covered by a Swapl policy.")
        }
        .padding(18)
        .frame(maxWidth: 320, alignment: .leading)
    }

    private func infoRow(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(SwaplSemanticLight.primary)
            Text(text)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.text)
                .fixedSize(horizontal: false, vertical: true)
        }
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
            // Insufficient points — never an offer to buy; quantify the gap and
            // surface the "earn points" CTA (shortBy drives the button below).
            let missing = shortBy > 0 ? shortBy : totalKeys - (vm.balance ?? 0)
            requestError = missing > 0
                ? "You're \(missing) points short for these dates (\(totalKeys) needed). Earn points by hosting, or pick fewer nights — points can't be bought."
                : "You don't have enough points for these dates. Earn points by hosting, or pick fewer nights — points can't be bought."
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
