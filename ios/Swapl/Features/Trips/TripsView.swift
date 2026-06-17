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

    // Filter by swap status group + order. "Active" = confirmed swaps,
    // "Potential" = pending/countered, "Cancelled" = declined/withdrawn.
    enum StatusFilter: String, CaseIterable { case all, active, potential, cancelled }
    enum SortOption: String, CaseIterable { case soonest, latest }
    enum GroupOption: String, CaseIterable { case city, country }
    var statusFilter: StatusFilter = .all
    var sortBy: SortOption = .soonest
    var groupBy: GroupOption = .city

    private func isCancelled(_ p: ProposalSummary) -> Bool {
        p.status == "DECLINED" || p.status == "WITHDRAWN"
    }

    func matchesFilter(_ p: ProposalSummary) -> Bool {
        switch statusFilter {
        // Default hides cancelled trips — they're a dead end. Pick "Cancelled"
        // to see them.
        case .all: return !isCancelled(p)
        case .active: return p.status == "ACCEPTED"
        case .potential: return p.status == "PENDING" || p.status == "COUNTERED"
        case .cancelled: return isCancelled(p)
        }
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            // All swaps, not just confirmed, so the status dot is meaningful:
            // confirmed (green), pending (orange), cancelled (red).
            let b = try await ProposalRepository.shared.inbox().buckets
            trips = b.active + b.waitingOnYou + b.sent + b.archived
        } catch {
            // Keep showing stale trips on a failed refresh, like Android does.
            if trips == nil { self.error = error.localizedDescription }
        }
    }
}

// Status dot colour + label for a swap: confirmed / pending / cancelled.
extension ProposalSummary {
    var statusColor: Color {
        switch status {
        case "ACCEPTED": return .green
        case "DECLINED", "WITHDRAWN": return .red
        default: return .orange   // PENDING, COUNTERED
        }
    }

    var statusLabel: String {
        switch status {
        case "ACCEPTED": return String(localized: "Confirmed")
        case "DECLINED", "WITHDRAWN": return String(localized: "Cancelled")
        default: return String(localized: "Pending")
        }
    }

    // Faded in lists: cancelled/declined, or a confirmed swap already in the past
    // (concluded). Drives the greyed-out style on rows/cards.
    var isInactive: Bool {
        if status == "DECLINED" || status == "WITHDRAWN" { return true }
        if status == "ACCEPTED", String(dateTo.prefix(10)) < TripPhase.todayString() { return true }
        return false
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
            // No fixed header bar: the title (and filter bar) scroll with the
            // content and fade away, like Explore.
            content
            .background(SwaplSemanticLight.background)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in
                ProposalDetailView(proposalId: id)
            }
            .task { await vm.load() }
        }
    }

    private var titleBar: some View { SwaplPageTitle("Trips") }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading && vm.trips == nil && vm.error == nil {
            VStack(spacing: 0) {
                titleBar
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Loading trips")
            }
        } else if let error = vm.error {
            VStack(spacing: 0) {
                titleBar
                SwaplEmptyState(
                    systemImage: "wifi.exclamationmark",
                    title: "Trips unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else if let trips = vm.trips, trips.isEmpty {
            ScrollView {
                titleBar
                // Keys stays show even with no reciprocal swaps yet.
                KeysStaysSection()
                    .padding(.horizontal, 22)
                SwaplEmptyState(
                    systemImage: "suitcase.rolling",
                    title: "Trips",
                    description: "Accepted swaps and stays with points show up here."
                )
                .padding(.top, 80)
            }
            .refreshable { await vm.load() }
        } else if let trips = vm.trips {
            tripsList(trips)
        }
    }

    // Filter + sort as glass icon buttons that sit inline with the title (no
    // chip bar). Filter = a menu of All / Active / Potential / Cancelled.
    private var tripsControls: some View {
        HStack(spacing: 8) {
            tripsFilterMenu
            tripsGroupMenu
            tripsSortMenu
        }
    }

    private var tripsGroupMenu: some View {
        Menu {
            Picker(String(localized: "Group by"), selection: Bindable(vm).groupBy) {
                Text(String(localized: "City")).tag(TripsViewModel.GroupOption.city)
                Text(String(localized: "Country")).tag(TripsViewModel.GroupOption.country)
            }
        } label: {
            Image(systemName: "square.stack.3d.up")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 44, height: 44)
                .glassEffect(.regular.interactive(), in: .circle)
                .overlay(alignment: .topTrailing) {
                    if vm.groupBy != .city {
                        Circle().fill(SwaplSemanticLight.primary).frame(width: 9, height: 9)
                    }
                }
        }
        .accessibilityLabel("Group trips")
    }

    private var tripsFilterMenu: some View {
        Menu {
            Picker(String(localized: "Show"), selection: Bindable(vm).statusFilter) {
                ForEach(TripsViewModel.StatusFilter.allCases, id: \.self) { f in
                    Text(filterLabel(f)).tag(f)
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 44, height: 44)
                .glassEffect(.regular.interactive(), in: .circle)
                .overlay(alignment: .topTrailing) {
                    if vm.statusFilter != .all {
                        Circle().fill(SwaplSemanticLight.primary).frame(width: 9, height: 9)
                    }
                }
        }
        .accessibilityLabel("Filter trips")
    }

    private var tripsSortMenu: some View {
        Menu {
            Picker(String(localized: "Order by"), selection: Bindable(vm).sortBy) {
                Text(String(localized: "Soonest")).tag(TripsViewModel.SortOption.soonest)
                Text(String(localized: "Latest")).tag(TripsViewModel.SortOption.latest)
            }
        } label: {
            Image(systemName: "arrow.up.arrow.down")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 44, height: 44)
                .glassEffect(.regular.interactive(), in: .circle)
        }
        .accessibilityLabel("Order trips")
    }

    private func filterLabel(_ f: TripsViewModel.StatusFilter) -> String {
        switch f {
        case .all: return String(localized: "All")
        case .active: return String(localized: "Active")
        case .potential: return String(localized: "Potential")
        case .cancelled: return String(localized: "Cancelled")
        }
    }

    private func tripsList(_ allTrips: [ProposalSummary]) -> some View {
        let today = TripPhase.todayString()
        let trips = allTrips.filter { vm.matchesFilter($0) }
        // Upcoming + active, grouped by destination city (Airbnb-style). Order
        // by the chosen sort (soonest/latest check-in). Past → own timeline.
        let upcoming = trips.filter { $0.tripPhase(today: today) != .past }
            .sorted { vm.sortBy == .soonest ? $0.dateFrom < $1.dateFrom : $0.dateFrom > $1.dateFrom }
        let past = trips.filter { $0.tripPhase(today: today) == .past }
            .sorted { $0.dateTo > $1.dateTo }
        let grouped = groupTrips(upcoming)

        return ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            SwaplPageTitle("Trips") { tripsControls }
            LazyVStack(alignment: .leading, spacing: 24) {
                KeysStaysSection()

                if upcoming.isEmpty {
                    Text("No upcoming swaps")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .padding(.top, 8)
                }

                ForEach(grouped, id: \.0) { city, list in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(city)
                            .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                        ForEach(list) { trip in
                            NavigationLink(value: trip.id) {
                                TripCard(trip: trip, isActive: trip.tripPhase(today: today) == .active)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if !past.isEmpty {
                    NavigationLink {
                        PastTripsView(trips: past)
                    } label: {
                        findPastTripsCard
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
            .padding(.bottom, 28)
          }
        }
        .refreshable { await vm.load() }
    }

    // Preserve first-seen order (already sorted by soonest date), one bucket per
    // city or country depending on the chosen grouping.
    private func groupTrips(_ trips: [ProposalSummary]) -> [(String, [ProposalSummary])] {
        var order: [String] = []
        var map: [String: [ProposalSummary]] = [:]
        for t in trips {
            let key = vm.groupBy == .country ? (t.theirCountry ?? t.theirCity) : t.theirCity
            if map[key] == nil { order.append(key) }
            map[key, default: []].append(t)
        }
        return order.map { ($0, map[$0]!) }
    }

    private var findPastTripsCard: some View {
        HStack(spacing: 14) {
            Text("Find your past trips")
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()
            Image(systemName: "suitcase.rolling")
                .font(.system(size: 22))
                .foregroundStyle(AirbnbPalette.secondaryText)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .background(AirbnbPalette.softBackground, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
    }
}

// Every swap is reciprocal: you're the guest at their place and host of yours
// for the same dates. Trip-forward card framed around the destination.
struct TripCard: View {
    let trip: ProposalSummary
    var isActive: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ProposalCoverImage(proposal: trip, size: 84)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .center, spacing: 8) {
                    Circle()
                        .fill(trip.statusColor)
                        .frame(width: 9, height: 9)
                        .accessibilityLabel(trip.statusLabel)
                    Text("Home in \(trip.theirCity)")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    if isActive {
                        Text("Now")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .bold))
                            .foregroundStyle(AirbnbPalette.text)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(AirbnbPalette.softBackground, in: Capsule())
                    }
                }
                Text(SwaplDateText.range(from: trip.dateFrom, to: trip.dateTo)
                     + (trip.otherName.map { " · Hosted by \($0)" } ?? ""))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(2)
                Text("You host \(trip.myCity)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
        // Cancelled/declined upcoming swaps fade to grey.
        .opacity(trip.isInactive ? 0.5 : 1)
        .grayscale(trip.isInactive ? 0.85 : 0)
    }
}

// Self-loading entry for the Profile "Past trips" card (the Trips tab passes
// its already-loaded data straight to PastTripsView instead).
struct PastTripsLoaderView: View {
    @State private var vm = TripsViewModel()

    var body: some View {
        Group {
            if let trips = vm.trips {
                let past = trips.filter { $0.tripPhase() == .past }.sorted { $0.dateTo > $1.dateTo }
                if past.isEmpty {
                    SwaplEmptyState(
                        systemImage: "suitcase.rolling",
                        title: String(localized: "No past trips yet"),
                        description: String(localized: "Your completed swaps will appear here.")
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    PastTripsView(trips: past)
                }
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "wifi.exclamationmark",
                    title: String(localized: "Trips unavailable"),
                    description: error,
                    actionTitle: String(localized: "Try Again"),
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(SwaplSemanticLight.background)
        .task { await vm.load() }
    }
}

// Past trips as a year-grouped vertical timeline (DOK-134, Airbnb-inspired).
// Pushed inside a NavigationStack that registers
// `.navigationDestination(for: String.self)` → ProposalDetailView.
struct PastTripsView: View {
    let trips: [ProposalSummary]

    private func year(_ iso: String) -> String { String(iso.prefix(4)) }

    // Ordered newest-first, one group per year.
    private var groups: [(String, [ProposalSummary])] {
        var order: [String] = []
        var map: [String: [ProposalSummary]] = [:]
        for t in trips {
            let y = year(t.dateFrom)
            if map[y] == nil { order.append(y) }
            map[y, default: []].append(t)
        }
        return order.map { ($0, map[$0]!) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SwaplPageTitle("Past trips")

                ForEach(Array(groups.enumerated()), id: \.offset) { index, group in
                    if index > 0 {
                        // Year divider between groups, like the reference timeline.
                        HStack {
                            Spacer()
                            Text(group.0)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.secondaryText)
                            Spacer()
                        }
                        .padding(.vertical, 6)
                    }
                    ForEach(group.1) { trip in
                        NavigationLink(value: trip.id) {
                            PastTripCard(trip: trip)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 22)
            .padding(.bottom, 28)
        }
        .background(SwaplSemanticLight.background)
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct PastTripCard: View {
    let trip: ProposalSummary

    var body: some View {
        HStack(spacing: 16) {
            ProposalCoverImage(proposal: trip)
                .frame(width: 72, height: 72)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(trip.statusColor)
                        .frame(width: 9, height: 9)
                        .accessibilityLabel(trip.statusLabel)
                    Text(trip.theirCity)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                }
                Text(SwaplDateText.range(from: trip.dateFrom, to: trip.dateTo))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
        // Past trips are concluded — render them muted.
        .opacity(0.6)
        .grayscale(0.7)
    }
}
