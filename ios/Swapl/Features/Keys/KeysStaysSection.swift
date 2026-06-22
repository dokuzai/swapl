import SwiftUI
import Observation
import SwaplDesignTokens

// Keys stays inside Trips (DOK-155). A Stay-with-Keys is one-directional, so it
// doesn't fit the reciprocal "trip" card — it gets its own section. The guest
// sees status + a cancel for pending stays; the host sees confirm/decline so
// they can accept the stay (which releases the hold into a real spend/earn and
// issues a cover policy server-side).

@MainActor
@Observable
final class KeysStaysViewModel {
    var stays: [KeysStay]?
    var error: String?
    var busyStayId: String?

    func load() async {
        await load(retryOnAuth: true)
    }

    private func load(retryOnAuth: Bool) async {
        do {
            stays = try await KeysRepository.shared.stays().stays
            error = nil
        } catch APIClient.APIError.unauthenticated where retryOnAuth {
            // Cold-start race: this can fire before the bearer token is attached,
            // yielding a 401. Wait briefly and retry once before giving up, so a
            // pending stay isn't lost to launch timing.
            try? await Task.sleep(for: .milliseconds(700))
            await load(retryOnAuth: false)
        } catch {
            if stays == nil { self.error = error.localizedDescription }
        }
    }

    func confirm(_ id: String) async { await act(id) { try await KeysRepository.shared.confirmStay(id: id) } }
    func decline(_ id: String) async { await act(id) { try await KeysRepository.shared.declineStay(id: id) } }
    func cancel(_ id: String) async { await act(id) { try await KeysRepository.shared.cancelStay(id: id) } }

    private func act(_ id: String, _ op: @Sendable () async throws -> KeysStayActionResponse) async {
        busyStayId = id
        defer { busyStayId = nil }
        do {
            _ = try await op()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// The keys-stays UI now lives inside the unified Trips list (TripsView): the
// list builds TripItem rows and renders KeysStaySummaryCard → KeysStayDetailView
// directly, so a stay is just "a trip with the points method", not its own
// section. KeysStaysViewModel is owned by TripsView and loaded with the swaps.

// MARK: - Shared status + title helpers

func keysStayTitle(_ stay: KeysStay) -> String {
    stay.isGuest
        ? String(localized: "Stay in \(stay.listing.city)")
        : String(localized: "Guest at \(stay.listing.title)")
}

func keysStayCounterpartLine(_ stay: KeysStay) -> String? {
    guard let name = stay.counterpartName, !name.isEmpty else { return nil }
    return stay.isGuest ? String(localized: "Hosted by \(name)") : String(localized: "Requested by \(name)")
}

func keysStaySubtitle(_ stay: KeysStay) -> String {
    let nights = stay.nights == 1 ? String(localized: "1 night") : String(localized: "\(stay.nights) nights")
    return stay.isCouchsurf ? String(localized: "\(nights) · couch") : String(localized: "\(nights) · \(stay.keysCost) points")
}

func keysStayStatusLabel(_ stay: KeysStay) -> String {
    switch stay.status {
    case "pending": return stay.isGuest ? String(localized: "Awaiting host") : String(localized: "Action needed")
    case "confirmed": return String(localized: "Confirmed")
    case "declined": return String(localized: "Declined")
    case "cancelled": return String(localized: "Cancelled")
    case "completed": return String(localized: "Completed")
    default: return stay.status.capitalized
    }
}

func keysStayStatusColor(_ stay: KeysStay) -> Color {
    switch stay.status {
    case "confirmed", "completed": return SwaplSemanticLight.primary
    case "declined", "cancelled": return SwaplSemanticLight.destructive
    default: return AirbnbPalette.text
    }
}

func keysStayStatusBadge(_ stay: KeysStay) -> some View {
    Text(keysStayStatusLabel(stay))
        .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .bold))
        .foregroundStyle(keysStayStatusColor(stay))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(keysStayStatusColor(stay).opacity(0.14), in: Capsule())
}

@ViewBuilder
func keysStayThumbnail(_ photo: String?, size: CGFloat) -> some View {
    let shape = RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
    Group {
        if let photo, let url = URL(string: photo) {
            AsyncImage(url: url) { img in
                img.resizable().scaledToFill()
            } placeholder: {
                SwaplSemanticLight.muted
            }
        } else {
            ZStack {
                SwaplSemanticLight.muted
                Image(systemName: "house.fill").foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
    }
    .frame(width: size, height: size)
    .clipShape(shape)
}

// MARK: - Stay detail (both guest + host)

struct KeysStayDetailView: View {
    let stay: KeysStay
    let vm: KeysStaysViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let photo = stay.listing.photo, let url = URL(string: photo) {
                    AsyncImage(url: url) { img in
                        img.resizable().scaledToFill()
                    } placeholder: {
                        SwaplSemanticLight.muted
                    }
                    .frame(height: 200)
                    .frame(maxWidth: .infinity)
                    .clipped()
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(keysStayTitle(stay))
                            .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                        Spacer()
                        keysStayStatusBadge(stay)
                    }
                    if let line = keysStayCounterpartLine(stay) {
                        Text(line)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                    }
                }
                .padding(.horizontal, 22)

                infoCard.padding(.horizontal, 22)

                if stay.status == "confirmed" {
                    Label(
                        stay.isCouchsurf
                            ? String(localized: "Confirmed — enjoy your couch stay.")
                            : String(localized: "Confirmed — your stay is covered by a Swapl policy."),
                        systemImage: "checkmark.shield"
                    )
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .padding(.horizontal, 22)
                }

                NavigationLink {
                    ListingDetailView(listingId: stay.listing.id)
                } label: {
                    viewHomeRow
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 22)

                if let error {
                    Text(error)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.destructive)
                        .padding(.horizontal, 22)
                }

                actions
                    .padding(.horizontal, 22)
                    .padding(.bottom, 28)
            }
            .padding(.top, 8)
        }
        .background(SwaplSemanticLight.background)
        .navigationTitle(String(localized: "Stay with points"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var infoCard: some View {
        VStack(spacing: 0) {
            infoRow(String(localized: "Dates"), SwaplDateText.range(from: stay.dateFrom, to: stay.dateTo))
            Divider()
            infoRow(String(localized: "Nights"), "\(stay.nights)")
            Divider()
            if stay.isCouchsurf {
                infoRow(String(localized: "Type"), String(localized: "Free couch"))
            } else {
                infoRow(String(localized: "Points"), "\(stay.keysCost)")
            }
        }
        .padding(.horizontal, 16)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
    }

    private func infoRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(AirbnbPalette.secondaryText)
            Spacer()
            Text(value).foregroundStyle(AirbnbPalette.text).fontWeight(.semibold)
        }
        .font(.swaplBody(SwaplDesignSystem.FontSize.body))
        .padding(.vertical, 14)
    }

    private var viewHomeRow: some View {
        HStack(spacing: 14) {
            keysStayThumbnail(stay.listing.photo, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text("View home")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(stay.listing.title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(AirbnbPalette.softBackground, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
    }

    @ViewBuilder
    private var actions: some View {
        if stay.isPending && !stay.isGuest {
            HStack(spacing: 12) {
                actionButton(String(localized: "Decline"), filled: false) {
                    perform { try await KeysRepository.shared.declineStay(id: stay.id) }
                }
                actionButton(String(localized: "Confirm stay"), filled: true) {
                    perform { try await KeysRepository.shared.confirmStay(id: stay.id) }
                }
            }
        } else if stay.isPending && stay.isGuest {
            actionButton(String(localized: "Cancel request"), filled: false) {
                perform { try await KeysRepository.shared.cancelStay(id: stay.id) }
            }
        }
    }

    private func actionButton(_ title: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if busy { ProgressView().tint(filled ? SwaplSemanticLight.primaryForeground : AirbnbPalette.text) }
                else { Text(title) }
            }
            .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
            .foregroundStyle(filled ? SwaplSemanticLight.primaryForeground : AirbnbPalette.text)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(filled ? SwaplSemanticLight.primary : SwaplSemanticLight.muted, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    // Run a confirm/decline/cancel: refresh the shared list, then pop back so the
    // member lands on the updated Trips list. On failure, show the error in place.
    private func perform(_ op: @escaping @Sendable () async throws -> KeysStayActionResponse) {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                _ = try await op()
                await vm.load()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
