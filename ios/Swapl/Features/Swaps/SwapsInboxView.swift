import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class SwapsInboxViewModel {
    var inbox: InboxResponse?
    var error: String?
    var isLoading = false
    var hasLoaded = false
    var selectedFilter = "All"

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
        switch selectedFilter {
        case "Hosting": return inbox.buckets.waitingOnYou
        case "Traveling": return inbox.buckets.sent + inbox.buckets.active
        case "Archived": return inbox.buckets.archived
        default:
            return inbox.buckets.waitingOnYou + inbox.buckets.sent + inbox.buckets.active + inbox.buckets.archived
        }
    }
}

struct SwapsInboxView: View {
    @State private var vm = SwapsInboxViewModel()
    private let filters = ["All", "Hosting", "Traveling", "Archived"]

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && !vm.hasLoaded {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel("Loading messages")
                } else if let error = vm.error {
                    ContentUnavailableView {
                        Label("Messages unavailable", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try Again") { Task { await vm.load() } }
                    }
                } else if vm.proposals.isEmpty {
                    ContentUnavailableView {
                        Label("No messages yet", systemImage: "message")
                    } description: {
                        Text("When you send or receive a proposal, it appears here.")
                    }
                } else {
                    messagesContent
                }
            }
            .background(Color(.systemBackground))
            .navigationDestination(for: String.self) { id in
                ProposalDetailView(proposalId: id)
            }
            .toolbar(.hidden, for: .navigationBar)
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
    }

    private var messagesContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack(alignment: .center) {
                    Text("Messages")
                        .font(.system(size: 40, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    Spacer()
                    CircleIcon(systemImage: "magnifyingglass")
                    CircleIcon(systemImage: "gearshape")
                }
                .padding(.horizontal, 22)
                .padding(.top, 30)

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

struct CircleIcon: View {
    let systemImage: String

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(AirbnbPalette.text)
            .frame(width: 56, height: 56)
            .background(AirbnbPalette.softBackground, in: Circle())
    }
}

struct MessageRow: View {
    let proposal: ProposalSummary

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ProposalAvatar(proposal: proposal)
                .frame(width: 72, height: 72)

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(proposal.otherName ?? proposal.theirCity)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    Spacer()
                    Text(shortDate(proposal.updatedAt))
                        .font(.system(size: 14))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }

                Text(statusLine)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(1)

                Text("\(SwaplDateText.range(from: proposal.dateFrom, to: proposal.dateTo)) · \(proposal.theirCity)")
                    .font(.system(size: 16))
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
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(cityColor(proposal.theirCity))
            Text(String(proposal.theirCity.prefix(1)))
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(.white)
            Circle()
                .fill(AirbnbPalette.accent)
                .frame(width: 28, height: 28)
                .overlay(
                    Text(String((proposal.otherName ?? proposal.myCity).prefix(1)))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                )
                .overlay(Circle().stroke(.white, lineWidth: 3))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
    }

    private func cityColor(_ city: String) -> Color {
        let colors: [Color] = [.teal, .indigo, .orange, .pink, .purple, .cyan]
        return colors[abs(city.hashValue) % colors.count]
    }
}

private extension InboxResponse {
    var isEmpty: Bool {
        buckets.waitingOnYou.isEmpty &&
        buckets.sent.isEmpty &&
        buckets.active.isEmpty &&
        buckets.archived.isEmpty
    }
}

@Observable
final class ProposalDetailViewModel {
    let proposalId: String
    var detail: ProposalDetail?
    var error: String?
    var isLoading = false

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
}

struct ProposalDetailView: View {
    @State private var vm: ProposalDetailViewModel

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
                ContentUnavailableView {
                    Label("Trip unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try Again") { Task { await vm.load() } }
                }
                .padding(.top, 80)
            } else if let detail = vm.detail {
                tripContent(detail)
            }
        }
        .background(Color(.systemBackground))
        .navigationTitle("Trip")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
    }

    private func tripContent(_ detail: ProposalDetail) -> some View {
        VStack(alignment: .leading, spacing: 26) {
            VStack(alignment: .leading, spacing: 14) {
                statusBadge(detail.proposal.status)
                Text("\(detail.targetListing.city) swap")
                    .font(.system(size: 38, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(2)
                Text(SwaplDateText.range(from: detail.proposal.dateFrom, to: detail.proposal.dateTo))
                    .font(.system(size: 18))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(.horizontal, 22)
            .padding(.top, 20)

            VStack(alignment: .leading, spacing: 18) {
                ListingPhotoView(listing: detail.targetListing, cornerRadius: 26)
                    .frame(height: 270)
                    .overlay(alignment: .topLeading) {
                        Text(detail.proposal.status.capitalized)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(AirbnbPalette.text)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(.white, in: Capsule())
                            .padding(18)
                    }

                VStack(alignment: .leading, spacing: 8) {
                    Text("\(detail.targetListing.propertyType.capitalized) in \(detail.targetListing.city)")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text("\(detail.targetListing.neighbourhood) · Hosted by \(detail.other.name ?? "your swap partner")")
                        .font(.system(size: 17))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                .padding(.horizontal, 4)

                Divider()

                HStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Your home")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                        Text("\(detail.proposerListing.neighbourhood), \(detail.proposerListing.city)")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                            .lineLimit(2)
                    }
                    Spacer()
                    ListingPhotoView(listing: detail.proposerListing, cornerRadius: 14)
                        .frame(width: 96, height: 76)
                }
            }
            .padding(16)
            .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
            .shadow(color: .black.opacity(0.06), radius: 18, x: 0, y: 10)
            .padding(.horizontal, 22)

            if let message = detail.proposal.message, !message.isEmpty {
                infoCard(title: detail.other.name.map { "Message from \($0)" } ?? "Message", body: message)
            }

            itineraryRows(detail)
        }
        .padding(.bottom, 34)
    }

    private func statusBadge(_ status: String) -> some View {
        Text(status.capitalized)
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(AirbnbPalette.text)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(AirbnbPalette.softBackground, in: Capsule())
    }

    private func infoCard(title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            Text(body)
                .font(.system(size: 16))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
        .padding(.horizontal, 22)
    }

    private func itineraryRows(_ detail: ProposalDetail) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Trip details")
                .font(.system(size: 24, weight: .bold))
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
                .background(AirbnbPalette.softBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(subtitle)
                    .font(.system(size: 16))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer()
        }
        .padding(18)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
        .padding(.horizontal, 22)
    }
}
