import SwiftUI
import SwaplDesignTokens

// Free couch request (DOK-219). Couchsurf stays cost no Keys — the guest needs a
// yearly Couchsurfer membership to send the request. We let the guest submit;
// if the server says a membership is required (422), we surface a "Join" CTA that
// opens the Stripe checkout. Reuses the one-directional KeysStay flow server-side.
struct CouchsurfRequestSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    let listing: Listing
    let onRequested: (String) -> Void

    @State private var dateFrom: Date
    @State private var dateTo: Date
    @State private var guestCount = 1
    @State private var message = ""
    @State private var isSubmitting = false
    @State private var needsMembership = false
    @State private var joinBusy = false
    @State private var error: String?

    init(listing: Listing, onRequested: @escaping (String) -> Void) {
        self.listing = listing
        self.onRequested = onRequested
        let start = SwaplDateText.parse(listing.availableFrom) ?? Date()
        let from = max(Calendar.current.startOfDay(for: Date()), Calendar.current.startOfDay(for: start))
        _dateFrom = State(initialValue: from)
        _dateTo = State(initialValue: Calendar.current.date(byAdding: .day, value: 3, to: from) ?? from)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Couchsurf stays are free — no Keys change hands. You'll need a Couchsurfer membership to send the request.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }

                Section("Dates") {
                    RangeDatePicker(from: $dateFrom, to: $dateTo)
                }

                Section {
                    Stepper(value: $guestCount, in: 1...max(1, listing.sleeps)) {
                        HStack {
                            Text("Guests")
                            Spacer()
                            Text("\(guestCount)").foregroundStyle(AirbnbPalette.secondaryText)
                        }
                    }
                } header: {
                    Text("Guests")
                } footer: {
                    Text("This home sleeps \(listing.sleeps).")
                }

                Section("Message to the host") {
                    TextEditor(text: $message).frame(minHeight: 100)
                }

                if needsMembership {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Become a Couchsurfer to send free couch requests.")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                            Button {
                                Task { await join() }
                            } label: {
                                HStack {
                                    if joinBusy { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                                    Text("Join Couchsurfer — €19/year")
                                }
                                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(SwaplSemanticLight.primary, in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .disabled(joinBusy)
                            Text("After joining, come back and send your request.")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                                .foregroundStyle(AirbnbPalette.secondaryText)
                        }
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(SwaplSemanticLight.destructive) }
                }
            }
            .navigationTitle("Request a free couch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { Task { await submit() } }
                        .disabled(isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }
        do {
            let res = try await KeysRepository.shared.requestStay(
                listingId: listing.id,
                dateFrom: SwaplDateText.apiString(from: dateFrom),
                dateTo: SwaplDateText.apiString(from: dateTo),
                kind: "couchsurf"
            )
            onRequested(res.stayId)
        } catch APIClient.APIError.status(422, let body) where (body ?? "").contains("COUCHSURFER_MEMBERSHIP_REQUIRED") {
            needsMembership = true
            error = nil
        } catch APIClient.APIError.status(_, let body) {
            error = body ?? "Couldn't send the request. Try again."
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func join() async {
        joinBusy = true
        error = nil
        defer { joinBusy = false }
        do {
            let url = try await KeysRepository.shared.startCouchsurferCheckout()
            if let u = URL(string: url) { openURL(u) }
        } catch {
            self.error = "Couldn't start checkout. Try again."
        }
    }
}
