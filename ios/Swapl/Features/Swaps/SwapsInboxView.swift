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
                .frame(width: 44, height: 44)
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
                .frame(width: 44, height: 44)
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
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .frame(width: 44, height: 44)
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
    @Environment(\.dismiss) private var dismiss
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
        // ZStack so the hero photo bleeds to the true top edge while the header
        // floats over it — no system nav bar (its content inset is what left a
        // cream band above the photo).
        ZStack(alignment: .top) {
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
            // Let the hero photo bleed all the way to the top edge, under the
            // status bar and the floating header.
            .ignoresSafeArea(edges: .top)
            // Soft cream dissolve at the top edge so the hero melts into the
            // background under the status bar / floating header.
            .overlay(alignment: .top) { heroTopFade }
            .background(SwaplSemanticLight.background.ignoresSafeArea())

            if let detail = vm.detail {
                tripFloatingHeader(detail)
            }
        }
        // No system nav bar (its inset is what pushed the photo down). Swipe-back
        // is preserved via the gesture delegate restored in SwaplApp.
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
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
                Text(String(localized: "Confirming the swap for \(SwaplDateText.range(from: detail.proposal.dateFrom, to: detail.proposal.dateTo)) issues the swap insurance policy for both homes and creates a binding agreement. Your saved contact details will be shared with \(detail.other.name ?? String(localized: "your swap partner"))."))
            } else {
                Text(String(localized: "Accepting issues the swap insurance policy for both homes, creates a binding agreement, and shares your saved contact details with your swap partner."))
            }
        }
    }

    // Cream gradient that fades the hero into the background at the top edge,
    // keeping the floating title pill + avatar legible without a header band.
    private var heroTopFade: some View {
        LinearGradient(
            colors: [SwaplSemanticLight.background, SwaplSemanticLight.background.opacity(0)],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: 140)
        .frame(maxWidth: .infinity, alignment: .top)
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }

    // Floating header over the hero photo (no system nav bar): back on the left,
    // city + dates pill centered (with the status dot that fades in on scroll),
    // counterparty avatar on the right — all Liquid Glass.
    private func tripFloatingHeader(_ detail: ProposalDetail) -> some View {
        ZStack {
            VStack(spacing: 1) {
                HStack(spacing: 6) {
                    Text(detail.tripListing.city)
                        .font(.swaplBody(16, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
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
            .padding(.vertical, 8)
            .glassEffect(.regular, in: .capsule)

            HStack(spacing: 0) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .frame(width: 44, height: 44)
                        .glassEffect(.regular.interactive(), in: .circle)
                }
                .accessibilityLabel("Back")

                Spacer(minLength: 0)

                NavigationLink {
                    PublicProfileView(userId: detail.other.id)
                } label: {
                    CounterpartyAvatar(name: detail.other.name, avatarUrl: detail.other.avatar, size: 44)
                }
                .accessibilityLabel(Text("View \(detail.other.name ?? String(localized: "host"))'s profile"))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private func isPrincipal(_ detail: ProposalDetail) -> Bool {
        detail.proposal.meSide == "proposer" || detail.proposal.meSide == "target"
    }

    // Whether the viewer is the proposer of a still-open proposal — the case
    // where the Message pill sits inline beside "Withdraw proposal".
    private func proposerCanWithdraw(_ detail: ProposalDetail) -> Bool {
        let status = detail.proposal.status
        return (status == "PENDING" || status == "COUNTERED") && detail.proposal.meSide == "proposer"
    }

    // Compact "Message {name}" pill — used full-width on its own row, or half
    // width beside the withdraw action. Matches the GhostPill capsule height so
    // the two read as a single row.
    private func messagePill(_ detail: ProposalDetail) -> some View {
        NavigationLink {
            SwapChatView(
                proposalId: vm.proposalId,
                otherName: detail.other.name,
                isPrincipal: isPrincipal(detail)
            )
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 15, weight: .semibold))
                Text(String(localized: "Message \(detail.other.name ?? String(localized: "your swap partner"))"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(SwaplSemanticLight.primary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(SwaplSemanticLight.accent, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("Message \(detail.other.name ?? String(localized: "your swap partner"))"))
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

            contactSection(detail)

            reviewSection(detail)

            // Standalone "Message" row for every state EXCEPT the proposer's
            // open proposal — there it moves inline beside "Withdraw proposal"
            // (see actionSection).
            if !proposerCanWithdraw(detail) {
                NavigationLink {
                    SwapChatView(
                        proposalId: vm.proposalId,
                        otherName: detail.other.name,
                        isPrincipal: isPrincipal(detail)
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
            }

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

    // Off-platform contact channels (DOK-204). Shown once the swap is accepted
    // (server only sends `contactChannels` then). Before that, a teaser nudges
    // acceptance when the other party has channels set.
    @ViewBuilder
    private func contactSection(_ detail: ProposalDetail) -> some View {
        if let channels = detail.other.contactChannels, !channels.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(detail.other.name.map { String(localized: "Contact \($0)") } ?? String(localized: "Contact details"))
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                ForEach(channels.present, id: \.kind) { item in
                    contactRow(kind: item.kind, value: item.value)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(22)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
            .padding(.horizontal, 22)
        } else if detail.other.hasContactChannels == true {
            HStack(spacing: 12) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                Text(String(localized: "Contact details unlock once you both accept the swap."))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
            .padding(.horizontal, 22)
        }
    }

    @ViewBuilder
    private func contactRow(kind: ContactChannelKind, value: String) -> some View {
        if let url = kind.url(for: value) {
            Link(destination: url) { contactRowLabel(kind: kind, value: value, linkable: true) }
                .buttonStyle(.plain)
                .contentShape(Rectangle())
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(kind.label): \(value)")
                .accessibilityAddTraits(.isLink)
        } else {
            contactRowLabel(kind: kind, value: value, linkable: false)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(kind.label): \(value)")
        }
    }

    @ViewBuilder
    private func contactRowLabel(kind: ContactChannelKind, value: String, linkable: Bool) -> some View {
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
                    // Message the other host sits inline beside Withdraw so the
                    // friendly action is right next to the destructive one.
                    HStack(spacing: 12) {
                        messagePill(detail)
                        Button {
                            isConfirmingWithdraw = true
                        } label: {
                            Text(String(localized: "Withdraw proposal"))
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .medium))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .overlay(Capsule().stroke(AirbnbPalette.text.opacity(0.18)))
                        .foregroundStyle(AirbnbPalette.text)
                    }
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
