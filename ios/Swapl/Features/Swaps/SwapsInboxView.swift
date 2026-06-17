import SwiftUI
import Observation
import SwaplDesignTokens

@MainActor
@Observable
final class SwapsInboxViewModel {
    var inbox: InboxResponse?
    var error: String?
    var isLoading = false
    var hasLoaded = false
    var selectedFilter = "All"
    var searchText = ""
    // Default: most recent message first — the natural order for an inbox.
    // Toggleable to soonest check-in.
    var sortBy: SortOption = .recent

    enum SortOption: String, CaseIterable { case checkIn, recent }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            inbox = try await ProposalRepository.shared.inbox()
            hasLoaded = true
        } catch {
            self.error = error.localizedDescription
            hasLoaded = true
        }
    }

    var proposals: [ProposalSummary] {
        guard let inbox else { return [] }
        // Non-archived threads, partitioned by role (meSide). Hosting = I'm the
        // host (target); Traveling = I'm the guest (proposer). Archived is its
        // own tab. This is exact per-message, unlike the old bucket grouping.
        let live = inbox.buckets.waitingOnYou + inbox.buckets.sent + inbox.buckets.active
        var base: [ProposalSummary]
        switch selectedFilter {
        case "Hosting": base = live.filter { $0.meSide == "target" }
        case "Traveling": base = live.filter { $0.meSide == "proposer" }
        case "Archived": base = inbox.buckets.archived
        default: base = live
        }

        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !query.isEmpty {
            base = base.filter { proposal in
                [proposal.otherName ?? "", proposal.theirCity, proposal.theirNeighbourhood, proposal.myCity]
                    .contains { $0.localizedCaseInsensitiveContains(query) }
            }
        }

        switch sortBy {
        case .checkIn: return base.sorted { $0.dateFrom < $1.dateFrom }   // soonest first
        case .recent:  return base.sorted { $0.updatedAt > $1.updatedAt }
        }
    }

    // Transient error for a failed swipe action — shown as an alert, NOT the
    // full-screen `error` state (which would replace the whole inbox).
    var actionError: String?

    // Swipe-action mutations: accept/decline/archive/unarchive, then refresh.
    func perform(_ action: ProposalRepository.Action, on id: String) async {
        do {
            _ = try await ProposalRepository.shared.act(proposalId: id, action)
            await load()
        } catch {
            self.actionError = error.localizedDescription
        }
    }

    var isInboxEmpty: Bool {
        guard let inbox else { return true }
        return inbox.buckets.waitingOnYou.isEmpty &&
            inbox.buckets.sent.isEmpty &&
            inbox.buckets.active.isEmpty &&
            inbox.buckets.archived.isEmpty
    }
}

struct SwapsInboxView: View {
    @State private var vm = SwapsInboxViewModel()
    @State private var isSearching = false
    @State private var navPath = NavigationPath()
    @FocusState private var searchFieldFocused: Bool
    private let filters = ["All", "Hosting", "Traveling", "Archived"]

    // The filter keys above stay English (they drive bucket selection); only the
    // displayed chip label is localized.
    private func filterLabel(_ filter: String) -> String {
        switch filter {
        case "All": return String(localized: "All")
        case "Hosting": return String(localized: "Hosting")
        case "Traveling": return String(localized: "Traveling")
        case "Archived": return String(localized: "Archived")
        default: return filter
        }
    }

    var body: some View {
        NavigationStack(path: $navPath) {
            Group {
                if vm.isLoading && !vm.hasLoaded {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel("Loading messages")
                } else if let error = vm.error {
                    SwaplEmptyState(
                        systemImage: "wifi.exclamationmark",
                        title: String(localized: "Messages unavailable"),
                        description: error,
                        actionTitle: String(localized: "Try Again"),
                        action: { Task { await vm.load() } }
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.isInboxEmpty {
                    SwaplEmptyState(
                        systemImage: "message",
                        title: String(localized: "No messages yet"),
                        description: String(localized: "When you send or receive a proposal, it appears here.")
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    messagesContent
                }
            }
            .background(SwaplSemanticLight.background)
            // Tapping a conversation opens the chat (with the trip pinned on top);
            // the pinned header pushes the full Trip screen via the String route.
            .navigationDestination(for: ProposalSummary.self) { summary in
                SwapChatView(
                    proposalId: summary.id,
                    otherName: summary.otherName,
                    isPrincipal: true,
                    tripSummary: summary
                )
            }
            .navigationDestination(for: String.self) { id in
                ProposalDetailView(proposalId: id)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .task { await vm.load() }
            .refreshable { await vm.load() }
            .alert(
                String(localized: "Couldn't complete that"),
                isPresented: Binding(get: { vm.actionError != nil }, set: { if !$0 { vm.actionError = nil } })
            ) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(vm.actionError ?? "")
            }
        }
    }

    // A List (not LazyVStack) so each conversation row supports native
    // `.swipeActions`. The header/search/filter live in a non-selectable first
    // section so they scroll with the list and keep the existing look.
    private var messagesContent: some View {
        List {
            Section {
                messagesHeader
                if isSearching { searchField }
            }
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 4, trailing: 0))
            .listRowBackground(Color.clear)

            if vm.proposals.isEmpty {
                SwaplEmptyState(
                    systemImage: "magnifyingglass",
                    title: String(localized: "No matches"),
                    description: String(localized: "No conversations match your current search or filter.")
                )
                .padding(.top, 40)
                .frame(maxWidth: .infinity)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else {
                ForEach(vm.proposals) { proposal in
                    // Only the photo + name open the conversation (not the whole
                    // row) — the rest of the row stays inert.
                    MessageRow(proposal: proposal, onOpen: { navPath.append(proposal) })
                        // Concluded / cancelled / declined threads fade to grey.
                        .opacity(proposal.isInactive ? 0.5 : 1)
                        .grayscale(proposal.isInactive ? 0.85 : 0)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 11, leading: 22, bottom: 11, trailing: 22))
                        .listRowBackground(Color.clear)
                        // Leading (swipe →): Accept / Reject — an incoming proposal
                        // awaiting your reply. Not full-swipe (deliberate tap).
                        .swipeActions(edge: .leading, allowsFullSwipe: false) {
                            if proposal.canRespond {
                                Button { Task { await vm.perform(.accept, on: proposal.id) } } label: {
                                    Label(String(localized: "Accept"), systemImage: "checkmark")
                                }
                                .tint(.green)
                                Button(role: .destructive) { Task { await vm.perform(.decline, on: proposal.id) } } label: {
                                    Label(String(localized: "Reject"), systemImage: "xmark")
                                }
                            }
                        }
                        // Trailing (swipe ←): Reply + Cancel (withdraw your own
                        // pending proposal, otherwise archive the thread).
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            replySwipeButton(proposal)
                            annullaSwipeButton(proposal)
                        }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 0)
    }

    // Archive / Unarchive swipe button (none for terminal threads already in
    // Archived). Shared by both swipe edges so a swipe either way archives.
    @ViewBuilder
    private func archiveSwipeButton(_ proposal: ProposalSummary) -> some View {
        if proposal.isArchivedByMe {
            Button { Task { await vm.perform(.unarchive, on: proposal.id) } } label: {
                Label(String(localized: "Unarchive"), systemImage: "tray.and.arrow.up")
            }
            .tint(.blue)
        } else if !proposal.isTerminal {
            Button { Task { await vm.perform(.archive, on: proposal.id) } } label: {
                Label(String(localized: "Archive"), systemImage: "archivebox")
            }
            .tint(.gray)
        }
    }


    private func replySwipeButton(_ proposal: ProposalSummary) -> some View {
        Button { navPath.append(proposal) } label: {
            Label(String(localized: "Reply"), systemImage: "arrowshape.turn.up.left")
        }
        .tint(SwaplSemanticLight.primary)
    }

    // "Cancel" the thread: withdraw your own still-pending proposal, otherwise
    // archive/unarchive it (you can't withdraw the other party's proposal).
    @ViewBuilder
    private func annullaSwipeButton(_ proposal: ProposalSummary) -> some View {
        let canWithdraw = proposal.meSide == "proposer"
            && (proposal.status == "PENDING" || proposal.status == "COUNTERED")
        if canWithdraw {
            Button(role: .destructive) { Task { await vm.perform(.withdraw, on: proposal.id) } } label: {
                Label(String(localized: "Cancel"), systemImage: "xmark.circle")
            }
        } else {
            archiveSwipeButton(proposal)
        }
    }

    private var filterMenu: some View {
        Menu {
            Picker(String(localized: "Show"), selection: Bindable(vm).selectedFilter) {
                ForEach(filters, id: \.self) { f in
                    Text(filterLabel(f)).tag(f)
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 48, height: 48)
                .glassEffect(.regular.interactive(), in: .circle)
                .overlay(alignment: .topTrailing) {
                    if vm.selectedFilter != "All" {
                        Circle().fill(SwaplSemanticLight.primary).frame(width: 9, height: 9)
                    }
                }
        }
        .accessibilityLabel("Filter messages")
    }

    private var sortMenu: some View {
        Menu {
            Picker(String(localized: "Sort by"), selection: Bindable(vm).sortBy) {
                Text(String(localized: "Last message")).tag(SwapsInboxViewModel.SortOption.recent)
                Text(String(localized: "Check-in date")).tag(SwapsInboxViewModel.SortOption.checkIn)
            }
        } label: {
            Image(systemName: "arrow.up.arrow.down")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 48, height: 48)
                .glassEffect(.regular.interactive(), in: .circle)
        }
        .accessibilityLabel("Sort messages")
    }

    private var searchField: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
            TextField(String(localized: "Search by host or city"), text: Bindable(vm).searchText)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                .foregroundStyle(AirbnbPalette.text)
                .focused($searchFieldFocused)
                .submitLabel(.search)
            if !vm.searchText.isEmpty {
                Button {
                    vm.searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 18)
        .frame(height: 52)
        .background(SwaplSemanticLight.card, in: Capsule())
        .overlay(Capsule().stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    private var messagesHeader: some View {
        SwaplPageTitle(String(localized: "Messages")) {
            HStack(spacing: 8) {
                filterMenu
                sortMenu
                Button {
                    withAnimation(.snappy) {
                        isSearching.toggle()
                        if isSearching {
                            searchFieldFocused = true
                        } else {
                            vm.searchText = ""
                        }
                    }
                } label: {
                    Image(systemName: isSearching ? "xmark" : "magnifyingglass")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .frame(width: 48, height: 48)
                        .glassEffect(.regular.interactive(), in: .circle)
                }
                .accessibilityLabel(isSearching ? "Close search" : "Search messages")
            }
        }
    }
}

struct MessageRow: View {
    let proposal: ProposalSummary
    var onOpen: () -> Void = {}

    var body: some View {
        // The whole row opens the conversation. Wrapping in a single Button (no
        // inner buttons) means the leading-edge photo no longer swallows the
        // left→right swipe gesture.
        Button(action: onOpen) {
            HStack(alignment: .top, spacing: 16) {
                ProposalCoverImage(proposal: proposal)
                    .frame(width: 72, height: 72)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .center, spacing: 8) {
                        Circle()
                            .fill(proposal.statusColor)
                            .frame(width: 9, height: 9)
                            .accessibilityLabel(proposal.statusLabel)
                        Text(proposal.otherName ?? proposal.theirCity)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                            .lineLimit(1)
                        Spacer()
                        Text(shortDate(proposal.updatedAt))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                    }

                    Text(statusLine)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)

                    Text("\(SwaplDateText.range(from: proposal.dateFrom, to: proposal.dateTo)) · \(proposal.theirCity)")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    private var statusLine: String {
        switch proposal.status {
        case "ACCEPTED": return String(localized: "Confirmed swap")
        case "COUNTERED": return String(localized: "Counter offer received")
        case "DECLINED": return String(localized: "Proposal declined")
        default: return proposal.meSide == "target" ? String(localized: "Waiting for your reply") : String(localized: "Proposal sent")
        }
    }

    private func shortDate(_ value: String) -> String {
        guard let date = SwaplDateText.parse(value) else { return String(value.prefix(10)) }
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("EEE")
        return formatter.string(from: date)
    }
}

// Cover photo of the other home when the API provides one, with the
// letter-tile ProposalAvatar as the fallback (no photo, bad URL, load error).
struct ProposalCoverImage: View {
    let proposal: ProposalSummary
    var size: CGFloat = 72

    var body: some View {
        Group {
            if let urlString = proposal.theirCoverPhotoUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFill()
                    } else {
                        ProposalAvatar(proposal: proposal)
                    }
                }
            } else {
                ProposalAvatar(proposal: proposal)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }
}

struct ProposalAvatar: View {
    let proposal: ProposalSummary

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .fill(cityColor(proposal.theirCity))
            Text(String(proposal.theirCity.prefix(1)))
                .font(.swaplDisplay(30, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
            Circle()
                .fill(SwaplSemanticLight.primary)
                .frame(width: 28, height: 28)
                .overlay(
                    Text(String((proposal.otherName ?? proposal.myCity).prefix(1)))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                )
                .overlay(Circle().stroke(.white, lineWidth: 3))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
    }

    private func cityColor(_ city: String) -> Color {
        let colors: [Color] = [
            SwaplColor.navy,
            SwaplColor.navy2,
            SwaplColor.navy3,
            SwaplColor.pink,
            SwaplColor.navyDark
        ]
        return colors[abs(city.hashValue) % colors.count]
    }
}

// Round profile photo for the trip header — the counterparty's avatar with an
// initials fallback (no photo / bad URL / load error).
struct CounterpartyAvatar: View {
    let name: String?
    let avatarUrl: String?
    var size: CGFloat = 32

    var body: some View {
        Group {
            if let urlString = avatarUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initials
                    }
                }
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(AirbnbPalette.hairline, lineWidth: 0.5))
    }

    private var initials: some View {
        ZStack {
            Circle().fill(SwaplSemanticLight.primary)
            Text(String((name ?? "·").prefix(1)).uppercased())
                .font(.swaplBody(size * 0.42, weight: .bold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
        }
    }
}

@MainActor
@Observable
final class ProposalDetailViewModel {
    let proposalId: String
    var detail: ProposalDetail?
    var error: String?
    var isLoading = false
    var isActing = false
    var actionError: String?

    // counter-offer draft
    var counterFrom = Date()
    var counterTo = Date()
    var counterMessage = ""

    init(proposalId: String) {
        self.proposalId = proposalId
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            detail = try await ProposalRepository.shared.detail(id: proposalId)
        } catch {
            self.error = error.localizedDescription
        }
    }

    // F11: seed the counter pickers from the proposal's existing dates (the
    // counter dates when a counter already stands, else the original dates),
    // so the host shifts from the current proposal instead of re-entering from
    // today.
    func seedCounterDates(from detail: ProposalDetail) {
        let from = detail.proposal.counterDateFrom ?? detail.proposal.dateFrom
        let to = detail.proposal.counterDateTo ?? detail.proposal.dateTo
        if let parsed = SwaplDateText.parse(from) { counterFrom = parsed }
        if let parsed = SwaplDateText.parse(to) { counterTo = parsed }
    }

    func act(_ action: ProposalRepository.Action) async {
        isActing = true
        actionError = nil
        defer { isActing = false }
        do {
            _ = try await ProposalRepository.shared.act(proposalId: proposalId, action)
            await load()
        } catch {
            actionError = error.localizedDescription
        }
    }
}

struct ProposalDetailView: View {
    @State private var vm: ProposalDetailViewModel
    @State private var showCounter = false
    @State private var showReview = false
    // Contextual app-feedback (DOK-190): set to the agreementId after a review
    // is submitted to present the rate-app sheet with surface "post-review".
    @State private var feedbackAfterReview: AppFeedbackContext?
    @State private var isConfirmingDecline = false
    @State private var isConfirmingWithdraw = false
    @State private var isConfirmingAccept = false
    // The status dot next to the city name fades in progressively as the photo's
    // status badge scrolls away (0 = hidden, 1 = fully shown). Its slot is always
    // reserved so the title pill never resizes.
    @State private var statusDotOpacity: Double = 0

    init(proposalId: String) {
        _vm = State(initialValue: ProposalDetailViewModel(proposalId: proposalId))
    }

    var body: some View {
        ScrollView {
            if vm.isLoading && vm.detail == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 400)
                    .accessibilityLabel("Loading trip")
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "exclamationmark.triangle",
                    title: String(localized: "Trip unavailable"),
                    description: error,
                    actionTitle: String(localized: "Try Again"),
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity)
                .padding(.top, 80)
            } else if let detail = vm.detail {
                tripContent(detail)
            }
        }
        .frame(maxWidth: .infinity)
        // Reveal the title-pill status dot only after the photo badge (~top of
        // the hero) has scrolled under the header.
        .onScrollGeometryChange(for: CGFloat.self) { geo in
            geo.contentOffset.y + geo.contentInsets.top
        } action: { _, y in
            // Fade the dot in across the last stretch of the hero photo, so it's
            // fully shown by the time the photo's status badge is gone.
            let start: CGFloat = 170, end: CGFloat = 250
            statusDotOpacity = Double(min(max((y - start) / (end - start), 0), 1))
        }
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        // No solid header bar anywhere — the nav bar is transparent and the
        // title sits in its own Liquid Glass pill (Telegram-style): destination
        // city + date range, counterparty photo on the right (→ their profile).
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            if let detail = vm.detail {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        HStack(spacing: 6) {
                            Text(detail.tripListing.city)
                                .font(.swaplBody(16, weight: .bold))
                                .foregroundStyle(AirbnbPalette.text)
                                .lineLimit(1)
                            // Status dot beside the city name — slot always
                            // reserved (opacity-only), so the pill never resizes.
                            Circle()
                                .fill(statusColor(detail.proposal.status))
                                .frame(width: 7, height: 7)
                                .opacity(statusDotOpacity)
                                .accessibilityHidden(true)
                        }
                        Text(SwaplDateText.range(from: detail.proposal.dateFrom, to: detail.proposal.dateTo))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .glassEffect(.regular, in: .capsule)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        PublicProfileView(userId: detail.other.id)
                    } label: {
                        CounterpartyAvatar(name: detail.other.name, avatarUrl: detail.other.avatar, size: 32)
                    }
                    .accessibilityLabel(Text("View \(detail.other.name ?? String(localized: "host"))'s profile"))
                }
            }
        }
        .task { await vm.load() }
        .sheet(isPresented: $showCounter) { counterSheet }
        .sheet(isPresented: $showReview) {
            if let detail = vm.detail, let agreement = detail.agreement {
                LeaveReviewSheet(
                    agreementId: agreement.id,
                    otherName: detail.other.name,
                    onSubmitted: {
                        Task { await vm.load() }
                        // DOK-190 post-review trigger: right after the traveller
                        // submits their review, prompt for app feedback once per
                        // agreement (guarded so it never re-nags).
                        if !AppFeedbackPrompt.hasSeen(surface: "post-review", contextKey: agreement.id) {
                            feedbackAfterReview = AppFeedbackContext(agreementId: agreement.id)
                        }
                    }
                )
            }
        }
        // One prompt at a time: the post-review sheet replaces the (now
        // dismissed) review sheet rather than stacking on top of it.
        .sheet(item: $feedbackAfterReview) { ctx in
            RateAppSheet(surface: "post-review", contextKey: ctx.agreementId)
        }
        .confirmationDialog("Decline this proposal?", isPresented: $isConfirmingDecline, titleVisibility: .visible) {
            Button(String(localized: "Decline"), role: .destructive) { Task { await vm.act(.decline) } }
            Button(String(localized: "Cancel"), role: .cancel) {}
        } message: {
            Text(String(localized: "The other host will be notified. This can't be undone."))
        }
        .confirmationDialog("Withdraw this proposal?", isPresented: $isConfirmingWithdraw, titleVisibility: .visible) {
            Button(String(localized: "Withdraw"), role: .destructive) { Task { await vm.act(.withdraw) } }
            Button(String(localized: "Cancel"), role: .cancel) {}
        } message: {
            Text(String(localized: "This removes your proposal. You can always send a new one."))
        }
        // F10: accept is the highest-commitment action — gate it behind an
        // explicit confirm that states a swap insurance policy is issued.
        .confirmationDialog(String(localized: "Accept this swap?"), isPresented: $isConfirmingAccept, titleVisibility: .visible) {
            Button(String(localized: "Accept & confirm swap")) { Task { await vm.act(.accept) } }
            Button(String(localized: "Cancel"), role: .cancel) {}
        } message: {
            if let detail = vm.detail {
                Text(String(localized: "Confirming the swap for \(SwaplDateText.range(from: detail.proposal.dateFrom, to: detail.proposal.dateTo)) issues the swap insurance policy for both homes. This creates a binding agreement."))
            } else {
                Text(String(localized: "Accepting issues the swap insurance policy for both homes and creates a binding agreement."))
            }
        }
    }

    private func tripContent(_ detail: ProposalDetail) -> some View {
        let tripListing = detail.tripListing
        let homeListing = detail.homeListing

        return VStack(alignment: .leading, spacing: 26) {
            // Full-bleed hero — the first scroll item, so it sits under the
            // floating glass header (no cream strip / "nav bar" behind it).
            // Tapping opens the full listing (swipeable gallery + lightbox).
            NavigationLink {
                ListingDetailView(listingId: tripListing.id)
            } label: {
                Color.clear
                    .frame(maxWidth: .infinity)
                    .frame(height: 300)
                    .overlay {
                        ListingPhotoView(listing: tripListing, cornerRadius: 0)
                    }
                    .clipped()
                    // Status badge at the BOTTOM of the photo, clear of the
                    // floating header; once it scrolls away the title-pill dot
                    // fades in.
                    .overlay(alignment: .bottomLeading) {
                        statusBadge(detail.proposal.status)
                            .padding(14)
                    }
                    .overlay(alignment: .bottomTrailing) {
                        HStack(spacing: 6) {
                            Text(String(localized: "View home & photos"))
                                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                            Image(systemName: "chevron.right")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(.white.opacity(0.92), in: Capsule())
                        .padding(14)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("View \(tripListing.city) home and all photos")

            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(String(localized: "\(tripListing.propertyType.capitalized) in \(tripListing.city)"))
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)
                    Text(String(localized: "\(tripListing.neighbourhood) · Hosted by \(detail.other.name ?? String(localized: "your swap partner"))"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)

                Divider()

                HStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(String(localized: "Your home"))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                        Text("\(homeListing.neighbourhood), \(homeListing.city)")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                            .lineLimit(2)
                    }
                    Spacer()
                    ListingPhotoView(listing: homeListing, cornerRadius: SwaplDesignSystem.CornerRadius.medium)
                        .frame(width: 96, height: 76)
                        .clipped()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
            .shadow(color: .black.opacity(0.06), radius: 18, x: 0, y: 10)
            .padding(.horizontal, 22)

            if let message = detail.proposal.message, !message.isEmpty {
                infoCard(title: detail.other.name.map { String(localized: "Message from \($0)") } ?? String(localized: "Message"), body: message)
            }

            // Once a swap is accepted there's an agreement — swap the static
            // itinerary for the full trip cockpit (phases, key codes, guide,
            // check-in/out). Reveal gating of the address/guide is server-side.
            if let agreement = detail.agreement {
                TripCockpitView(
                    agreementId: agreement.id,
                    otherName: detail.other.name,
                    otherListingId: tripListing.id,
                    myListingId: homeListing.id
                )
            } else {
                itineraryRows(detail)
            }

            reviewSection(detail)

            NavigationLink {
                SwapChatView(
                    proposalId: vm.proposalId,
                    otherName: detail.other.name,
                    isPrincipal: detail.proposal.meSide == "proposer" || detail.proposal.meSide == "target"
                )
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .font(.system(size: 16, weight: .semibold))
                    Text(String(localized: "Message \(detail.other.name ?? String(localized: "your swap partner"))"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .medium))
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                .foregroundStyle(AirbnbPalette.text)
                .padding(.vertical, 16)
                .padding(.horizontal, 18)
                .frame(maxWidth: .infinity)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                )
                .padding(.horizontal, 22)
            }
            .buttonStyle(.plain)

            actionSection(detail)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 34)
    }

    // After a COMPLETED swap, the server flags canReview until the caller has
    // left their (single) review — mirrors the web thread's LeaveReview card.
    @ViewBuilder
    private func reviewSection(_ detail: ProposalDetail) -> some View {
        if let agreement = detail.agreement,
           agreement.status == "COMPLETED",
           agreement.canReview == true {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(localized: "How was your swap?"))
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(String(localized: "Share how the stay with \(detail.other.name ?? String(localized: "your swap partner")) went — it helps the next guest."))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                PrimaryPill(title: String(localized: "Leave a review"), action: { showReview = true })
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(22)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
            .padding(.horizontal, 22)
        }
    }

    // Mirrors the web proposal thread: the recipient of a PENDING/COUNTERED
    // proposal can accept, decline, or counter; the sender can withdraw.
    @ViewBuilder
    private func actionSection(_ detail: ProposalDetail) -> some View {
        let status = detail.proposal.status
        let isTarget = detail.proposal.meSide == "target"
        let isProposer = detail.proposal.meSide == "proposer"
        let canRespond = status == "PENDING" || status == "COUNTERED"

        if canRespond && (isTarget || isProposer) {
            VStack(spacing: 12) {
                if let actionError = vm.actionError {
                    Text(actionError)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.destructive)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if canRespond && isTarget {
                    PrimaryPill(title: String(localized: "Accept swap"), action: { isConfirmingAccept = true }, isLoading: vm.isActing)
                    GhostPill(title: String(localized: "Counter offer"), action: {
                        vm.seedCounterDates(from: detail)
                        showCounter = true
                    })
                    GhostPill(title: String(localized: "Decline"), action: { isConfirmingDecline = true })
                }
                if canRespond && isProposer {
                    GhostPill(title: String(localized: "Withdraw proposal"), action: { isConfirmingWithdraw = true })
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
        }
    }

    private var counterSheet: some View {
        NavigationStack {
            Form {
                Section(String(localized: "New dates")) {
                    DatePicker(String(localized: "From"), selection: $vm.counterFrom, displayedComponents: .date)
                    DatePicker(String(localized: "To"), selection: $vm.counterTo, displayedComponents: .date)
                }
                Section(String(localized: "Note (optional)")) {
                    TextField(String(localized: "e.g. would these dates work?"), text: $vm.counterMessage, axis: .vertical)
                }
            }
            .navigationTitle(String(localized: "Counter offer"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { showCounter = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Send")) {
                        let from = SwaplDateText.apiString(from: vm.counterFrom)
                        let to = SwaplDateText.apiString(from: vm.counterTo)
                        let msg = vm.counterMessage.isEmpty ? nil : vm.counterMessage
                        showCounter = false
                        Task { await vm.act(.counter(dateFrom: from, dateTo: to, message: msg)) }
                    }
                    .disabled(vm.counterTo <= vm.counterFrom)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "ACCEPTED": return .green
        case "DECLINED", "WITHDRAWN": return .red
        default: return .orange
        }
    }

    private func statusBadge(_ status: String) -> some View {
        let color = statusColor(status)
        return HStack(spacing: 7) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(status.capitalized)
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(AirbnbPalette.softBackground, in: Capsule())
    }

    private func infoCard(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(2)
            Text(body)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
        .padding(.horizontal, 22)
    }

    private func itineraryRows(_ detail: ProposalDetail) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(String(localized: "Trip details"))
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .padding(.horizontal, 22)

            tripRow(icon: "door.left.hand.open", title: String(localized: "Check in"), subtitle: String(detail.proposal.dateFrom.prefix(10)))
            tripRow(icon: "door.left.hand.closed", title: String(localized: "Check out"), subtitle: String(detail.proposal.dateTo.prefix(10)))
        }
    }

    private func tripRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 26))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 74, height: 74)
                .background(AirbnbPalette.softBackground, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(18)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
        .padding(.horizontal, 22)
    }
}

private extension ProposalDetail {
    var tripListing: Listing {
        proposal.meSide == "target" ? proposerListing : targetListing
    }

    var homeListing: Listing {
        proposal.meSide == "target" ? targetListing : proposerListing
    }
}
