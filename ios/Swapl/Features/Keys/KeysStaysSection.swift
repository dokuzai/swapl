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
        do {
            stays = try await KeysRepository.shared.stays().stays
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

// Embedded in TripsView. Renders nothing when the member has no Keys stays, so
// it stays out of the way for swap-only users.
struct KeysStaysSection: View {
    @State private var vm = KeysStaysViewModel()

    var body: some View {
        Group {
            if let stays = vm.stays, !stays.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Stays with points")
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.top, 14)

                    ForEach(stays) { stay in
                        KeysStayCard(
                            stay: stay,
                            isBusy: vm.busyStayId == stay.id,
                            onConfirm: { Task { await vm.confirm(stay.id) } },
                            onDecline: { Task { await vm.decline(stay.id) } },
                            onCancel: { Task { await vm.cancel(stay.id) } }
                        )
                    }
                }
            }
        }
        .task { await vm.load() }
    }
}

private struct KeysStayCard: View {
    let stay: KeysStay
    let isBusy: Bool
    let onConfirm: () -> Void
    let onDecline: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(stay.isGuest ? "Stay in \(stay.listing.city)" : "Guest at \(stay.listing.title)")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    Text(SwaplDateText.range(from: stay.dateFrom, to: stay.dateTo))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text("\(stay.nights) night\(stay.nights == 1 ? "" : "s") · \(stay.keysCost) points")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                Spacer()
                statusBadge
            }

            // Host actions for a pending stay: confirm or decline.
            if stay.isPending && !stay.isGuest {
                HStack(spacing: 12) {
                    actionButton("Decline", filled: false, action: onDecline)
                    actionButton("Confirm stay", filled: true, action: onConfirm)
                }
            }
            // Guest can cancel while it's still pending.
            else if stay.isPending && stay.isGuest {
                actionButton("Cancel request", filled: false, action: onCancel)
            }
            // Confirmed guest sees the reassurance about the cover policy.
            else if stay.status == "confirmed" {
                Label("Confirmed — your stay is covered by a Swapl policy.", systemImage: "checkmark.shield")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
        .opacity(isBusy ? 0.5 : 1)
        .allowsHitTesting(!isBusy)
    }

    private var statusBadge: some View {
        Text(statusLabel)
            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .bold))
            .foregroundStyle(statusColor)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(statusColor.opacity(0.14), in: Capsule())
    }

    private var statusLabel: String {
        switch stay.status {
        case "pending": return stay.isGuest ? "Awaiting host" : "Action needed"
        case "confirmed": return "Confirmed"
        case "declined": return "Declined"
        case "cancelled": return "Cancelled"
        case "completed": return "Completed"
        default: return stay.status.capitalized
        }
    }

    private var statusColor: Color {
        switch stay.status {
        case "confirmed", "completed": return SwaplSemanticLight.primary
        case "declined", "cancelled": return SwaplSemanticLight.destructive
        default: return AirbnbPalette.text
        }
    }

    private func actionButton(_ title: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(filled ? SwaplSemanticLight.primaryForeground : AirbnbPalette.text)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(filled ? SwaplSemanticLight.primary : SwaplSemanticLight.muted, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}
