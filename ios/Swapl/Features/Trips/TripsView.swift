import SwiftUI
import Observation
import SwaplDesignTokens

// Trips tab (DOK-134): accepted swaps from the `active` bucket of
// GET /api/proposals, grouped into lifecycle sections derived from the
// proposal dates. Mirrors the Android TripsScreen; tapping a trip pushes the
// existing ProposalDetailView (the "Trip" screen with key codes & insurance).

@MainActor
@Observable
final class TripsViewModel {
    var trips: [ProposalSummary]?
    var error: String?
    var isLoading = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            trips = try await ProposalRepository.shared.inbox().buckets.active
        } catch {
            // Keep showing stale trips on a failed refresh, like Android does.
            if trips == nil { self.error = error.localizedDescription }
        }
    }
}

// Lifecycle phase derived from the proposal dates — ISO strings compare
// lexicographically, so prefix(10) against today's local date is enough.
enum TripPhase: String, CaseIterable {
    case active = "Active now"
    case upcoming = "Upcoming"
    case past = "Past"
}

extension ProposalSummary {
    func tripPhase(today: String = TripPhase.todayString()) -> TripPhase {
        if String(dateTo.prefix(10)) < today { return .past }
        if String(dateFrom.prefix(10)) > today { return .upcoming }
        return .active
    }
}

extension TripPhase {
    static func todayString(_ date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

struct TripsView: View {
    @State private var vm = TripsViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                SwaplPageTitle("Trips")
                content
            }
            .background(SwaplSemanticLight.background)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in
                ProposalDetailView(proposalId: id)
            }
            .task { await vm.load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading && vm.trips == nil && vm.error == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel("Loading trips")
        } else if let error = vm.error {
            SwaplEmptyState(
                systemImage: "wifi.exclamationmark",
                title: "Trips unavailable",
                description: error,
                actionTitle: "Try Again",
                action: { Task { await vm.load() } }
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let trips = vm.trips, trips.isEmpty {
            ScrollView {
                SwaplEmptyState(
                    systemImage: "suitcase.rolling",
                    title: "Trips",
                    description: "Accepted swaps will become trips."
                )
                .padding(.top, 120)
            }
            .refreshable { await vm.load() }
        } else if let trips = vm.trips {
            tripsList(trips)
        }
    }

    private func tripsList(_ trips: [ProposalSummary]) -> some View {
        let today = TripPhase.todayString()
        let sections: [(TripPhase, [ProposalSummary])] = [
            (.active, trips.filter { $0.tripPhase(today: today) == .active }
                .sorted { $0.dateTo < $1.dateTo }),
            (.upcoming, trips.filter { $0.tripPhase(today: today) == .upcoming }
                .sorted { $0.dateFrom < $1.dateFrom }),
            (.past, trips.filter { $0.tripPhase(today: today) == .past }
                .sorted { $0.dateTo > $1.dateTo })
        ].filter { !$0.1.isEmpty }

        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                ForEach(sections, id: \.0) { phase, list in
                    Text(phase.rawValue)
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.top, 14)

                    ForEach(list) { trip in
                        NavigationLink(value: trip.id) {
                            TripCard(trip: trip, phase: phase)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .refreshable { await vm.load() }
    }
}

// Every swap is reciprocal, so each trip carries both roles: you're the guest
// at their place and the host of yours for the same dates.
struct TripCard: View {
    let trip: ProposalSummary
    let phase: TripPhase

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ProposalAvatar(proposal: trip)
                .frame(width: 72, height: 72)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Trip to \(trip.theirCity)")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    Spacer()
                    Text(phase.rawValue)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(AirbnbPalette.softBackground, in: Capsule())
                }

                Text(SwaplDateText.range(from: trip.dateFrom, to: trip.dateTo)
                     + (trip.otherName.map { " · with \($0)" } ?? ""))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(1)

                Text("Guest in \(trip.theirNeighbourhood) · You host in \(trip.myCity)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(2)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
    }
}
