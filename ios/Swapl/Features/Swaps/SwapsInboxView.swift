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
        let base: [ProposalSummary]
        guard let inbox else { return [] }
        switch selectedFilter {
        case "Hosting": base = inbox.buckets.waitingOnYou
        case "Traveling": base = inbox.buckets.sent + inbox.buckets.active
        case "Archived": base = inbox.buckets.archived
        default:
            base = inbox.buckets.waitingOnYou + inbox.buckets.sent + inbox.buckets.active + inbox.buckets.archived
        }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return base }
        return base.filter { proposal in
            [proposal.otherName ?? "", proposal.theirCity, proposal.theirNeighbourhood, proposal.myCity]
                .contains { $0.localizedCaseInsensitiveContains(query) }
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
    @FocusState private var searchFieldFocused: Bool
    private let filters = ["All", "Hosting", "Traveling", "Archived"]

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && !vm.hasLoaded {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel("Loading messages")
                } else if let error = vm.error {
                    SwaplEmptyState(
                        systemImage: "wifi.exclamationmark",
                        title: "Messages unavailable",
                        description: error,
                        actionTitle: "Try Again",
                        action: { Task { await vm.load() } }
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.isInboxEmpty {
                    SwaplEmptyState(
                        systemImage: "message",
                        title: "No messages yet",
                        description: "When you send or receive a proposal, it appears here."
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    messagesContent
                }
            }
            .background(SwaplSemanticLight.background)
            .navigationDestination(for: String.self) { id in
                ProposalDetailView(proposalId: id)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
    }

    private var messagesContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                messagesHeader

                if isSearching {
                    searchField
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(filters, id: \.self) { filter in
                            Button {
                                vm.selectedFilter = filter
                            } label: {
                                AirbnbChip(title: filter, selected: vm.selectedFilter == filter)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 22)
                }
                .padding(.top, 8)

                if vm.proposals.isEmpty {
                    SwaplEmptyState(
                        systemImage: "magnifyingglass",
                        title: "No matches",
                        description: "No conversations match your current search or filter."
                    )
                    .padding(.top, 48)
                } else {
                    LazyVStack(spacing: 22) {
                        ForEach(vm.proposals) { proposal in
                            NavigationLink(value: proposal.id) {
                                MessageRow(proposal: proposal)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 22)
                    .padding(.bottom, 28)
                }
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
            TextField("Search by host or city", text: Bindable(vm).searchText)
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
        HStack(alignment: .center) {
            Text("Messages")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.display, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()
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
                    .background(SwaplSemanticLight.card, in: Circle())
            }
            .accessibilityLabel(isSearching ? "Close search" : "Search messages")
        }
        .padding(.horizontal, 22)
        .padding(.top, 22)
    }
}

struct MessageRow: View {
    let proposal: ProposalSummary

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ProposalAvatar(proposal: proposal)
                .frame(width: 72, height: 72)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
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
    }

    private var statusLine: String {
        switch proposal.status {
        case "ACCEPTED": return "Confirmed swap"
        case "COUNTERED": return "Counter offer received"
        case "DECLINED": return "Proposal declined"
        default: return proposal.meSide == "target" ? "Waiting for your reply" : "Proposal sent"
        }
    }

    private func shortDate(_ value: String) -> String {
        guard let date = SwaplDateText.parse(value) else { return String(value.prefix(10)) }
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("EEE")
        return formatter.string(from: date)
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
    @State private var isConfirmingDecline = false
    @State private var isConfirmingWithdraw = false

    init(proposalId: String) {
        _vm = State(initialValue: ProposalDetailViewModel(proposalId: proposalId))
    }

    var body: some View {
        ScrollView {
            if vm.isLoading && vm.detail == nil {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(40)
                    .accessibilityLabel("Loading trip")
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "exclamationmark.triangle",
                    title: "Trip unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .padding(.top, 80)
            } else if let detail = vm.detail {
                tripContent(detail)
            }
        }
        .frame(maxWidth: .infinity)
        .background(SwaplSemanticLight.background)
        .navigationTitle("Trip")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .sheet(isPresented: $showCounter) { counterSheet }
        .confirmationDialog("Decline this proposal?", isPresented: $isConfirmingDecline, titleVisibility: .visible) {
            Button("Decline", role: .destructive) { Task { await vm.act(.decline) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The other host will be notified. This can't be undone.")
        }
        .confirmationDialog("Withdraw this proposal?", isPresented: $isConfirmingWithdraw, titleVisibility: .visible) {
            Button("Withdraw", role: .destructive) { Task { await vm.act(.withdraw) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes your proposal. You can always send a new one.")
        }
    }

    private func tripContent(_ detail: ProposalDetail) -> some View {
        let tripListing = detail.tripListing
        let homeListing = detail.homeListing

        return VStack(alignment: .leading, spacing: 26) {
            VStack(alignment: .leading, spacing: 14) {
                statusBadge(detail.proposal.status)
                Text("\(tripListing.city) swap")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(2)
                    .minimumScaleFactor(0.86)
                Text(SwaplDateText.range(from: detail.proposal.dateFrom, to: detail.proposal.dateTo))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.h3))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 22)
            .padding(.top, 20)

            VStack(alignment: .leading, spacing: 18) {
                // Tapping the trip photo opens the full listing — that's where
                // the swipeable photo gallery and lightbox live.
                NavigationLink {
                    ListingDetailView(listingId: tripListing.id)
                } label: {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: 270)
                        .overlay {
                            ListingPhotoView(listing: tripListing, cornerRadius: SwaplDesignSystem.CornerRadius.large)
                        }
                        .clipped()
                        .overlay(alignment: .topLeading) {
                            Text(detail.proposal.status.capitalized)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                                .foregroundStyle(AirbnbPalette.text)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(.white, in: Capsule())
                                .padding(18)
                        }
                        .overlay(alignment: .bottomTrailing) {
                            HStack(spacing: 6) {
                                Text("View home & photos")
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

                VStack(alignment: .leading, spacing: 8) {
                    Text("\(tripListing.propertyType.capitalized) in \(tripListing.city)")
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)
                    Text("\(tripListing.neighbourhood) · Hosted by \(detail.other.name ?? "your swap partner")")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)

                Divider()

                HStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Your home")
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
                infoCard(title: detail.other.name.map { "Message from \($0)" } ?? "Message", body: message)
            }

            itineraryRows(detail)

            NavigationLink { PublicProfileView(userId: detail.other.id) } label: {
                Text("View \(detail.other.name ?? "host")'s profile")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 22)
            }
            .buttonStyle(.plain)

            actionSection(detail)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 34)
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
                    PrimaryPill(title: "Accept swap", action: { Task { await vm.act(.accept) } }, isLoading: vm.isActing)
                    GhostPill(title: "Counter offer", action: { showCounter = true })
                    GhostPill(title: "Decline", action: { isConfirmingDecline = true })
                }
                if canRespond && isProposer {
                    GhostPill(title: "Withdraw proposal", action: { isConfirmingWithdraw = true })
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 8)
        }
    }

    private var counterSheet: some View {
        NavigationStack {
            Form {
                Section("New dates") {
                    DatePicker("From", selection: $vm.counterFrom, displayedComponents: .date)
                    DatePicker("To", selection: $vm.counterTo, displayedComponents: .date)
                }
                Section("Note (optional)") {
                    TextField("e.g. would these dates work?", text: $vm.counterMessage, axis: .vertical)
                }
            }
            .navigationTitle("Counter offer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showCounter = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
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

    private func statusBadge(_ status: String) -> some View {
        Text(status.capitalized)
            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .bold))
            .foregroundStyle(AirbnbPalette.text)
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
            Text("Trip details")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .padding(.horizontal, 22)

            tripRow(icon: "door.left.hand.open", title: "Check in", subtitle: String(detail.proposal.dateFrom.prefix(10)))
            tripRow(icon: "door.left.hand.closed", title: "Check out", subtitle: String(detail.proposal.dateTo.prefix(10)))
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
