import SwiftUI
import Observation
import MapKit
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
    // Rich detail (area/address, contacts) loaded on appear; the summary renders
    // instantly from `stay`. Mirrors the swap trip view.
    @State private var detail: KeysStayDetail?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                hero

                header
                    .padding(.horizontal, 22)

                infoCard.padding(.horizontal, 22)   // dates / nights / points — featured

                if stay.status == "confirmed" {
                    Label(
                        stay.isCouchsurf
                            ? String(localized: "Confirmed — enjoy your couch stay.")
                            : String(localized: "Confirmed — your stay is covered by a Swapl policy."),
                        systemImage: "checkmark.shield"
                    )
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 22)
                }

                // Only the guest travels somewhere; the host is at home.
                if stay.isGuest {
                    whereYouStay.padding(.horizontal, 22)
                }

                contactsCard.padding(.horizontal, 22)

                // In-app chat (DOK-221) — the per-transaction thread, with the
                // stay's lifecycle events inline. Available once the detail loads
                // (the conversation is created lazily by the detail endpoint).
                if let conversationId = detail?.conversationId {
                    NavigationLink {
                        ConversationView(conversationId: conversationId, title: detail?.counterpart.name ?? stay.counterpartName)
                    } label: {
                        messageRow
                    }
                    .buttonStyle(.plain)
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
        .swaplFloatingHeader(stay.listing.city)
        .task { detail = try? await KeysRepository.shared.stayDetail(id: stay.id) }
    }

    @ViewBuilder
    private var hero: some View {
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
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(keysStayTitle(stay))
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                keysStayStatusBadge(stay)
            }
            if let line = counterpartLine {
                Text(line)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
    }

    // Prefer the freshly-loaded name; fall back to the list summary's.
    private var counterpartLine: String? {
        if let name = detail?.counterpart.name ?? stay.counterpartName, !name.isEmpty {
            return stay.isGuest ? String(localized: "Hosted by \(name)") : String(localized: "Requested by \(name)")
        }
        return nil
    }

    @ViewBuilder
    private var whereYouStay: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Where you're staying")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            if let d = detail?.listing, let lat = d.lat, let lng = d.lng {
                KeysAreaMap(lat: lat, lng: lng, label: "\(d.neighbourhood ?? d.city), \(d.city)")
            }

            if let addr = detail?.listing.address, !addr.isEmpty {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(addr)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    Text("The exact address unlocks once your stay is confirmed.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
    }

    private var revealed: Bool { stay.status == "confirmed" || stay.status == "completed" }

    @ViewBuilder
    private var contactsCard: some View {
        if stay.isGuest {
            // Guest: how to reach the host.
            ContactChannelsCard(
                name: detail?.counterpart.name ?? stay.counterpartName,
                channels: detail?.counterpart.contactChannels,
                hasChannels: detail?.counterpart.hasContactChannels ?? false,
                lockedMessage: String(localized: "Contact details unlock once the stay is confirmed.")
            )
        } else {
            // Host: who's coming + how to message them.
            GuestCard(
                name: detail?.counterpart.name ?? stay.counterpartName,
                avatar: detail?.counterpart.avatar,
                channels: detail?.counterpart.contactChannels,
                hasChannels: detail?.counterpart.hasContactChannels ?? false,
                confirmed: revealed
            )
        }
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

    private var messageRow: some View {
        let name = detail?.counterpart.name ?? stay.counterpartName
        return HStack(spacing: 14) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                .frame(width: 44, height: 44)
                .background(SwaplSemanticLight.primary, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(name.map { String(localized: "Message \($0)") } ?? String(localized: "Message"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text("Chat in Swapl about your stay")
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

// Approximate-area map (fuzzed coords) — mirrors the swap cockpit's, with the
// width pinned so MapKit can't push the card past the screen.
private struct KeysAreaMap: View {
    let lat: Double
    let lng: Double
    let label: String

    var body: some View {
        let center = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        VStack(alignment: .leading, spacing: 8) {
            Map(initialPosition: .region(MKCoordinateRegion(
                center: center, latitudinalMeters: 4500, longitudinalMeters: 4500
            )), interactionModes: []) {
                MapCircle(center: center, radius: 1500)
                    .foregroundStyle(SwaplSemanticLight.primary.opacity(0.14))
                    .stroke(SwaplSemanticLight.primary.opacity(0.45), lineWidth: 1.5)
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .frame(maxWidth: .infinity)
            .frame(height: 160)
            .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.hairline))
            .allowsHitTesting(false)
            HStack(spacing: 6) {
                Image(systemName: "mappin.and.ellipse")
                Text("\(label) · approximate area")
            }
            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
            .foregroundStyle(AirbnbPalette.secondaryText)
        }
    }
}

// Off-platform contacts card (DOK-204) — shared look with the swap trip view.
// Renders the counterpart's channels once unlocked, or a locked teaser when they
// have channels that haven't been revealed yet.
struct ContactChannelsCard: View {
    let name: String?
    let channels: ContactChannels?
    let hasChannels: Bool
    var lockedMessage: String = String(localized: "Contact details unlock once the stay is confirmed.")

    var body: some View {
        if let channels, !channels.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(name.map { String(localized: "Contact \($0)") } ?? String(localized: "Contact details"))
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                ForEach(channels.present, id: \.kind) { item in
                    keysContactRow(kind: item.kind, value: item.value)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(22)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
        } else if hasChannels {
            HStack(spacing: 12) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                Text(lockedMessage)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
        }
    }
}

// Host side: who's coming + how to reach them. The contact rows (WhatsApp /
// Telegram / email) double as the "message them" path — keys stays have no
// in-app chat thread (that's swap-only).
private struct GuestCard: View {
    let name: String?
    let avatar: String?
    let channels: ContactChannels?
    let hasChannels: Bool
    let confirmed: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Your guest")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            HStack(spacing: 12) {
                avatarView
                VStack(alignment: .leading, spacing: 2) {
                    Text(name ?? String(localized: "Your guest"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(confirmed ? String(localized: "Confirmed for your dates") : String(localized: "Awaiting your confirmation"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                Spacer(minLength: 0)
            }

            if let channels, !channels.isEmpty {
                Divider()
                ForEach(channels.present, id: \.kind) { item in
                    keysContactRow(kind: item.kind, value: item.value)
                }
            } else {
                Text(emptyNote)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
    }

    private var emptyNote: String {
        if !confirmed {
            return String(localized: "Confirm the stay to see how to reach your guest.")
        }
        if hasChannels {
            return String(localized: "Contact details are unavailable right now.")
        }
        let who = name ?? String(localized: "Your guest")
        return String(localized: "\(who) hasn't shared off-platform contact details.")
    }

    @ViewBuilder
    private var avatarView: some View {
        let shape = Circle()
        if let avatar, let url = URL(string: avatar) {
            AsyncImage(url: url) { img in
                img.resizable().scaledToFill()
            } placeholder: {
                SwaplSemanticLight.muted
            }
            .frame(width: 48, height: 48)
            .clipShape(shape)
        } else {
            ZStack {
                shape.fill(SwaplSemanticLight.accent)
                Text(String((name ?? "?").prefix(1)).uppercased())
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
            }
            .frame(width: 48, height: 48)
        }
    }
}

// Shared contact row (a tappable channel) used by the contact + guest cards.
@ViewBuilder
private func keysContactRow(kind: ContactChannelKind, value: String) -> some View {
    if let url = kind.url(for: value) {
        Link(destination: url) { keysContactRowLabel(kind: kind, value: value, linkable: true) }
            .buttonStyle(.plain)
            .contentShape(Rectangle())
    } else {
        keysContactRowLabel(kind: kind, value: value, linkable: false)
    }
}

private func keysContactRowLabel(kind: ContactChannelKind, value: String, linkable: Bool) -> some View {
    HStack(spacing: 12) {
        Image(systemName: kind.systemImage)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(SwaplSemanticLight.primary)
            .frame(width: 24)
        VStack(alignment: .leading, spacing: 2) {
            Text(kind.label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
            Text(value)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .medium))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        Spacer(minLength: 0)
        if linkable {
            Image(systemName: "arrow.up.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
    }
    .padding(.vertical, 10)
}
