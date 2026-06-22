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
    // Whose side am I looking at? Traveling = I'm the guest (I initiated a swap,
    // or I'm staying with points); Hosting = I'm the host (I received it). Same
    // convention as the swaps inbox.
    enum Perspective: String, CaseIterable { case traveling, hosting }
    var statusFilter: StatusFilter = .all
    var sortBy: SortOption = .soonest
    var groupBy: GroupOption = .city
    var perspective: Perspective = .traveling

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

// A trip's travel method — the attribute that tells the SINGLE Trips list how
// this stay is paid for. ("mixed" = an exchange topped up with points; reserved
// until that feature lands, so it never appears yet.)
enum TripMethod {
    case exchange, points, couch, mixed
    var label: String {
        switch self {
        case .exchange: return String(localized: "Exchange")
        case .points: return String(localized: "Stay with points")
        case .couch: return String(localized: "Free couch")
        case .mixed: return String(localized: "Mixed")
        }
    }
}

// One unified trip, regardless of which backend it comes from — a swap proposal
// or a Stay-with-points. The list treats them as one kind of thing ("a trip with
// a method") instead of two separate sections/systems.
enum TripItem: Identifiable {
    case swap(ProposalSummary)
    case stay(KeysStay)

    var id: String {
        switch self {
        case .swap(let p): return "swap-\(p.id)"
        case .stay(let s): return "stay-\(s.id)"
        }
    }
    var method: TripMethod {
        switch self {
        case .swap: return .exchange
        case .stay(let s): return s.isCouchsurf ? .couch : .points
        }
    }
    var dateFrom: String { switch self { case .swap(let p): return p.dateFrom; case .stay(let s): return s.dateFrom } }
    var dateTo: String { switch self { case .swap(let p): return p.dateTo; case .stay(let s): return s.dateTo } }
    var city: String { switch self { case .swap(let p): return p.theirCity; case .stay(let s): return s.listing.city } }
    var country: String? { switch self { case .swap(let p): return p.theirCountry; case .stay: return nil } }

    func phase(today: String) -> TripPhase {
        if String(dateTo.prefix(10)) < today { return .past }
        if String(dateFrom.prefix(10)) > today { return .upcoming }
        return .active
    }

    // True when I'm the guest/traveler: the swap initiator (proposer), or the
    // one staying with points. False = I'm the host receiving them.
    var isTraveling: Bool {
        switch self {
        case .swap(let p): return p.meSide == "proposer"
        case .stay(let s): return s.isGuest
        }
    }

    var isCancelled: Bool {
        switch self {
        case .swap(let p): return p.status == "DECLINED" || p.status == "WITHDRAWN"
        case .stay(let s): return s.status == "declined" || s.status == "cancelled"
        }
    }

    func matchesFilter(_ f: TripsViewModel.StatusFilter) -> Bool {
        switch f {
        case .all: return !isCancelled
        case .active:
            switch self {
            case .swap(let p): return p.status == "ACCEPTED"
            case .stay(let s): return s.status == "confirmed" || s.status == "completed"
            }
        case .potential:
            switch self {
            case .swap(let p): return p.status == "PENDING" || p.status == "COUNTERED"
            case .stay(let s): return s.status == "pending"
            }
        case .cancelled: return isCancelled
        }
    }
}

// Small capsule that tags a trip card with its travel method.
func tripMethodBadge(_ method: TripMethod) -> some View {
    Text(method.label)
        .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .bold))
        .foregroundStyle(AirbnbPalette.secondaryText)
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(AirbnbPalette.softBackground, in: Capsule())
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
    // Owned here (not inside KeysStaysSection) so keys stays reload on every tab
    // visit + pull-to-refresh with the same auth timing as the swaps fetch.
    @State private var keysVM = KeysStaysViewModel()

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
            .task { await reload() }
        }
    }

    // Load swaps + keys stays together so neither hides behind the other.
    private func reload() async {
        async let swaps: Void = vm.load()
        async let keys: Void = keysVM.load()
        _ = await (swaps, keys)
    }

    private var titleBar: some View { SwaplPageTitle("Trips") }

    // Swaps + stays merged into one list — a trip's travel method is just an
    // attribute on it, not a reason for a separate section.
    private var allTripItems: [TripItem] {
        let swaps = (vm.trips ?? []).map { TripItem.swap($0) }
        let stays = (keysVM.stays ?? []).map { TripItem.stay($0) }
        return swaps + stays
    }

    @ViewBuilder
    private var content: some View {
        let items = allTripItems
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Filter/sort controls + the Traveling/Hosting split only matter
                // once there are trips; otherwise just the plain title.
                if !items.isEmpty {
                    SwaplPageTitle("Trips") { tripsControls }
                } else {
                    titleBar
                }
                tripsBody(items)
            }
        }
        .refreshable { await reload() }
    }

    // Traveling (I'm the guest) vs Hosting (I'm the host) — a glass pill sitting
    // inline with the filter/group/sort controls; switches which side of the
    // stay the list shows.
    private var perspectivePill: some View {
        Menu {
            Picker(String(localized: "View"), selection: Bindable(vm).perspective) {
                Label("Traveling", systemImage: "suitcase").tag(TripsViewModel.Perspective.traveling)
                Label("Hosting", systemImage: "house").tag(TripsViewModel.Perspective.hosting)
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: vm.perspective == .traveling ? "suitcase" : "house")
                    .font(.system(size: 14, weight: .semibold))
                Text(vm.perspective == .traveling ? "Traveling" : "Hosting")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .fixedSize()
            }
            .foregroundStyle(AirbnbPalette.text)
            .padding(.horizontal, 13)
            .frame(height: 40)
            .glassEffect(.regular.interactive(), in: .capsule)
        }
        .fixedSize()
        .accessibilityLabel("Traveling or hosting")
    }

    @ViewBuilder
    private func tripsBody(_ allItems: [TripItem]) -> some View {
        // Still loading both sources, nothing to show yet.
        if vm.trips == nil && keysVM.stays == nil && vm.error == nil {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: 240)
                .accessibilityLabel("Loading trips")
        } else if allItems.isEmpty, let error = vm.error, vm.trips == nil {
            SwaplEmptyState(
                systemImage: "wifi.exclamationmark",
                title: "Trips unavailable",
                description: error,
                actionTitle: "Try Again",
                action: { Task { await reload() } }
            )
            .padding(.top, 40)
        } else {
            let items = allItems.filter { vm.perspective == .traveling ? $0.isTraveling : !$0.isTraveling }
            if items.isEmpty {
                SwaplEmptyState(
                    systemImage: vm.perspective == .traveling ? "suitcase.rolling" : "house",
                    title: vm.perspective == .traveling ? "No trips yet" : "No guests yet",
                    description: vm.perspective == .traveling
                        ? "Stays and exchanges you book show up here."
                        : "Stays and exchanges at your home show up here."
                )
                .padding(.top, 60)
            } else {
                tripsList(items)
            }
        }
    }

    // The Traveling/Hosting pill + a single options menu (filter, group, sort)
    // inline with the title. Filter/group/sort are folded into one glass button
    // so the labeled pill fits next to the title in every language.
    private var tripsControls: some View {
        HStack(spacing: 8) {
            perspectivePill
            tripsOptionsMenu
        }
    }

    private var tripsOptionsMenu: some View {
        Menu {
            Picker(String(localized: "Show"), selection: Bindable(vm).statusFilter) {
                ForEach(TripsViewModel.StatusFilter.allCases, id: \.self) { f in
                    Text(filterLabel(f)).tag(f)
                }
            }
            Picker(String(localized: "Group by"), selection: Bindable(vm).groupBy) {
                Text(String(localized: "City")).tag(TripsViewModel.GroupOption.city)
                Text(String(localized: "Country")).tag(TripsViewModel.GroupOption.country)
            }
            Picker(String(localized: "Order by"), selection: Bindable(vm).sortBy) {
                Text(String(localized: "Soonest")).tag(TripsViewModel.SortOption.soonest)
                Text(String(localized: "Latest")).tag(TripsViewModel.SortOption.latest)
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 40, height: 40)
                .glassEffect(.regular.interactive(), in: .circle)
                .overlay(alignment: .topTrailing) {
                    if vm.statusFilter != .all || vm.groupBy != .city || vm.sortBy != .soonest {
                        Circle().fill(SwaplSemanticLight.primary).frame(width: 9, height: 9)
                    }
                }
        }
        .accessibilityLabel("Filter and sort trips")
    }

    private func filterLabel(_ f: TripsViewModel.StatusFilter) -> String {
        switch f {
        case .all: return String(localized: "All")
        case .active: return String(localized: "Active")
        case .potential: return String(localized: "Potential")
        case .cancelled: return String(localized: "Cancelled")
        }
    }

    // One unified list: upcoming swaps + all stays grouped by destination, each
    // tagged with its travel method. Past SWAPS keep their dedicated timeline
    // card (PastTripsView is swap-only); stays stay inline regardless of phase
    // (matching how the old "Stays with points" section always showed them).
    private func tripsList(_ allItems: [TripItem]) -> some View {
        let today = TripPhase.todayString()
        let filtered = allItems.filter { $0.matchesFilter(vm.statusFilter) }
        let pastSwaps: [ProposalSummary] = filtered
            .compactMap { item in
                if case let .swap(p) = item, item.phase(today: today) == .past { return p }
                return nil
            }
            .sorted { $0.dateTo > $1.dateTo }
        let inline = filtered
            .filter { item in
                if case .swap = item { return item.phase(today: today) != .past }
                return true
            }
            .sorted { vm.sortBy == .soonest ? $0.dateFrom < $1.dateFrom : $0.dateFrom > $1.dateFrom }
        let grouped = groupTrips(inline)

        return LazyVStack(alignment: .leading, spacing: 24) {
            if inline.isEmpty && pastSwaps.isEmpty {
                Text("No upcoming trips")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .padding(.top, 8)
            }

            ForEach(grouped, id: \.0) { city, list in
                VStack(alignment: .leading, spacing: 12) {
                    Text(city)
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    ForEach(list) { item in
                        tripRow(item, today: today)
                    }
                }
            }

            if !pastSwaps.isEmpty {
                NavigationLink {
                    PastTripsView(trips: pastSwaps)
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

    // One row per trip, routed to the right detail by method. The method badge
    // lives on the card so the single list reads clearly.
    @ViewBuilder
    private func tripRow(_ item: TripItem, today: String) -> some View {
        switch item {
        case .swap(let p):
            NavigationLink(value: p.id) {
                TripCard(trip: p, isActive: p.tripPhase(today: today) == .active, method: item.method)
            }
            .buttonStyle(.plain)
        case .stay(let s):
            NavigationLink {
                KeysStayDetailView(stay: s, vm: keysVM)
            } label: {
                KeysStaySummaryCard(stay: s, method: item.method)
            }
            .buttonStyle(.plain)
            .opacity(keysVM.busyStayId == s.id ? 0.5 : 1)
        }
    }

    // Preserve first-seen order (already sorted), one bucket per city or country.
    private func groupTrips(_ items: [TripItem]) -> [(String, [TripItem])] {
        var order: [String] = []
        var map: [String: [TripItem]] = [:]
        for t in items {
            let key = vm.groupBy == .country ? (t.country ?? t.city) : t.city
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
    var method: TripMethod = .exchange

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ProposalCoverImage(proposal: trip, size: 84)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                tripMethodBadge(method)
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
