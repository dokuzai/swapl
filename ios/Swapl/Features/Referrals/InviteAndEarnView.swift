import SwiftUI
import Observation
import SwaplDesignTokens

// Invite & earn (DOK-157). Reached from Account. The member shares their code or
// link with one tap (native ShareLink), watches their tier progress and waitlist
// position climb, sees the anonymised leaderboard, and gets a "Invite someone to
// stay" CTA tied to their own home. Copy is "travel points", never money — the
// reward only lands when an invited friend verifies their identity.

@MainActor
@Observable
final class InviteAndEarnViewModel {
    var dashboard: ReferralDashboard?
    var error: String?
    var isLoading = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            dashboard = try await ReferralRepository.shared.dashboard()
        } catch {
            if dashboard == nil { self.error = error.localizedDescription }
        }
    }
}

struct InviteAndEarnView: View {
    @State private var vm = InviteAndEarnViewModel()
    @State private var isInvitingToStay = false

    // Web origin for shareable referral links — same universal-link domain the
    // listing share sheet uses (app.swapl.fun). The server returns shareUrl
    // pointing at localhost in dev, so we rebuild it from the code for a link
    // that always works off-device.
    private static let shareOrigin = "https://app.swapl.fun"

    var body: some View {
        ScrollView {
            if let dashboard = vm.dashboard {
                content(dashboard)
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "person.2.badge.gearshape",
                    title: "Invites unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .padding(.top, 80)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 400)
                    .accessibilityLabel("Loading your invites")
            }
        }
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        .navigationTitle("Invite & earn")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isInvitingToStay) {
            InviteToStaySheet()
        }
        .task { await vm.load() }
        .refreshable { await vm.load() }
    }

    private func shareURL(for dashboard: ReferralDashboard) -> URL {
        URL(string: "\(Self.shareOrigin)/?ref=\(dashboard.code)")
            ?? URL(string: dashboard.shareUrl)
            ?? URL(string: Self.shareOrigin)!
    }

    private func shareMessage(_ dashboard: ReferralDashboard) -> String {
        "Join me on Swapl — swap homes and travel on points, not cash. Use my link and we both score \(dashboard.rewardPerReferral) travel points when you verify."
    }

    private func content(_ dashboard: ReferralDashboard) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            heroCard(dashboard)
            shareCard(dashboard)
            inviteToStayButton
            tierCard(dashboard)
            if !dashboard.leaderboardTop.isEmpty {
                leaderboardCard(dashboard)
            }
            if !dashboard.joined.isEmpty {
                joinedCard(dashboard)
            }
            antiFarmNote
        }
        .padding(.horizontal, 22)
        .padding(.top, 18)
        .padding(.bottom, 40)
    }

    // MARK: Hero — points earned + waitlist position (the FOMO headline).

    private func heroCard(_ dashboard: ReferralDashboard) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                Text("Bring friends, climb the line")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
            }

            HStack(alignment: .top, spacing: 18) {
                heroStat("\(dashboard.keysEarned)", "points earned")
                Rectangle()
                    .fill(SwaplSemanticLight.primaryForeground.opacity(0.2))
                    .frame(width: 1, height: 52)
                heroStat("#\(dashboard.waitlistPosition)", "your spot in line")
            }

            Text("Every friend who joins and verifies earns you \(dashboard.rewardPerReferral) travel points — and bumps you up the early-access line. Points are never money.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplColor.navyDark, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
    }

    private func heroStat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.swaplDisplay(40, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Share — the code + one-tap native ShareLink.

    private func shareCard(_ dashboard: ReferralDashboard) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Your invite code")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            HStack(spacing: 12) {
                Text(dashboard.code)
                    .font(.swaplMono(24, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .kerning(2)
                Spacer()
                ShareLink(
                    item: shareURL(for: dashboard),
                    subject: Text("Join me on Swapl"),
                    message: Text(shareMessage(dashboard)),
                    preview: SharePreview("Join me on Swapl")
                ) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .padding(.horizontal, 18)
                        .frame(height: 44)
                        .background(SwaplSemanticLight.primary, in: Capsule())
                }
                .accessibilityLabel("Share your invite link")
            }
            .padding(18)
            .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))

            Text("One tap to send it anywhere — Messages, WhatsApp, email. Your friend taps the link, joins, and once they verify you both get points.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Invite someone to stay — the headline CTA tied to the host's home.

    private var inviteToStayButton: some View {
        Button {
            isInvitingToStay = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "house.and.flag.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .frame(width: 48, height: 48)
                    .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Invite someone to stay")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text("Send a personal invite tied to your home")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(16)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: Tier progress — current badge + a progress bar to the next tier.

    private func tierCard(_ dashboard: ReferralDashboard) -> some View {
        let progress = dashboard.tierProgress
        return VStack(alignment: .leading, spacing: 14) {
            Text("Your tier")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            HStack(spacing: 12) {
                Image(systemName: "rosette")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .frame(width: 48, height: 48)
                    .background(SwaplSemanticLight.accent, in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(progress.current?.label ?? "Not started")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(progress.current?.perk ?? "Invite your first friend to unlock perks.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }

            if let next = progress.next {
                let done = max(0, next.threshold - next.remaining)
                VStack(alignment: .leading, spacing: 8) {
                    ProgressView(value: Double(done), total: Double(max(next.threshold, 1)))
                        .tint(SwaplSemanticLight.primary)
                    Text(next.remaining == 1
                        ? "1 more verified friend to reach \(next.label)."
                        : "\(next.remaining) more verified friends to reach \(next.label).")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                }
            } else {
                Text("Top tier reached — you're a Swapl founder. ")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }

    // MARK: Leaderboard — anonymised top referrers, the caller flagged.

    private func leaderboardCard(_ dashboard: ReferralDashboard) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Leaderboard")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            VStack(spacing: 0) {
                ForEach(Array(dashboard.leaderboardTop.enumerated()), id: \.element.id) { index, entry in
                    leaderboardRow(entry)
                    if index < dashboard.leaderboardTop.count - 1 {
                        Divider().padding(.leading, 18)
                    }
                }
            }
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
    }

    private func leaderboardRow(_ entry: ReferralDashboard.LeaderboardEntry) -> some View {
        HStack(spacing: 14) {
            Text("\(entry.rank)")
                .font(.swaplMono(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(entry.rank <= 3 ? SwaplSemanticLight.primary : AirbnbPalette.secondaryText)
                .frame(width: 28, alignment: .leading)
            Text(entry.displayName)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: entry.isYou ? .bold : .semibold))
                .foregroundStyle(AirbnbPalette.text)
            if entry.isYou {
                Text("YOU")
                    .font(.swaplMono(SwaplDesignSystem.FontSize.tiny, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(SwaplSemanticLight.accent, in: Capsule())
            }
            Spacer()
            Text("\(entry.qualified)")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
        }
        .padding(18)
    }

    // MARK: Who's joined — invitees with their verification status.

    private func joinedCard(_ dashboard: ReferralDashboard) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your invites (\(dashboard.invitesSent))")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            VStack(spacing: 0) {
                ForEach(Array(dashboard.joined.enumerated()), id: \.element.id) { index, join in
                    joinedRow(join)
                    if index < dashboard.joined.count - 1 {
                        Divider().padding(.leading, 18)
                    }
                }
            }
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
    }

    private func joinedRow(_ join: ReferralDashboard.JoinedReferral) -> some View {
        HStack(spacing: 12) {
            Image(systemName: join.isQualified ? "checkmark.seal.fill" : "hourglass")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(join.isQualified ? SwaplSemanticLight.primary : AirbnbPalette.secondaryText)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(join.displayName)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(join.statusLabel)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer()
            Text(join.sourceLabel)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
        .padding(18)
    }

    private var antiFarmNote: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
            Text("Points land only once a friend verifies their identity — that keeps the line fair for everyone. Points are travel credit, never cash.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 4)
    }
}

// MARK: - Invite to stay sheet

// Issues an invitation tied to one of the member's own listings (DOK-157). We
// resolve the caller's active listing first; the resulting share link carries an
// opaque token that auto-links the invitee on signup (source=invite_to_stay).
struct InviteToStaySheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var listing: Listing?
    @State private var invite: InviteToStayResponse?
    @State private var error: String?
    @State private var isLoadingListing = true
    @State private var isSending = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoadingListing {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if listing == nil {
                    SwaplEmptyState(
                        systemImage: "house",
                        title: "List your home first",
                        description: "Invite-to-stay links are tied to your own listing. Create a home in Account, then invite a friend to come stay.",
                        actionTitle: nil,
                        action: nil
                    )
                    .padding(.top, 40)
                } else {
                    form
                }
            }
            .background(SwaplSemanticLight.background.ignoresSafeArea())
            .navigationTitle("Invite to stay")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .task { await loadListing() }
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let listing {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Inviting a guest to")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                        Text(listing.title)
                            .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                    }
                }

                VStack(alignment: .leading, spacing: 9) {
                    Text("Friend's email (optional)")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    TextField("friend@email.com", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .padding(16)
                        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                                .stroke(AirbnbPalette.hairline)
                        }
                    Text("Add an email to auto-match the invite when they sign up, or leave it blank for an open link anyone can use.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }

                if let invite {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Invite ready", systemImage: "checkmark.circle.fill")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                        ShareLink(
                            item: URL(string: invite.shareUrl) ?? URL(string: "https://app.swapl.fun")!,
                            subject: Text("Come stay at \(invite.listing.title)"),
                            message: Text("I'd love to host you on Swapl — swap homes and travel on points, not cash. Here's your invite to stay at \(invite.listing.title)."),
                            preview: SharePreview("Come stay on Swapl")
                        ) {
                            Label("Share invite link", systemImage: "square.and.arrow.up")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                                .frame(maxWidth: .infinity)
                                .frame(height: 54)
                                .background(SwaplSemanticLight.primary, in: Capsule())
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
                } else {
                    Button {
                        Task { await createInvite() }
                    } label: {
                        HStack {
                            if isSending { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                            Text(isSending ? "Creating" : "Create invite link")
                        }
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(SwaplSemanticLight.primary, in: Capsule())
                    }
                    .disabled(isSending)
                }

                if let error {
                    Text(error)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.destructive)
                }

                Text("When they join and verify, you both earn travel points. Points are never money.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(22)
        }
    }

    private func loadListing() async {
        isLoadingListing = true
        defer { isLoadingListing = false }
        do {
            let search = try await ListingRepository.shared.search(filters: SearchFilters())
            guard let id = search.viewerListingId else {
                listing = nil
                return
            }
            listing = try await ListingRepository.shared.detail(id: id).listing
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func createInvite() async {
        guard let listing else { return }
        isSending = true
        error = nil
        defer { isSending = false }
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            invite = try await ReferralRepository.shared.inviteToStay(
                listingId: listing.id,
                email: trimmed.isEmpty ? nil : trimmed
            )
        } catch APIClient.APIError.status(403, _) {
            error = "You can only invite guests to your own listing."
        } catch APIClient.APIError.status(429, _) {
            error = "You've sent a lot of invites recently — try again in a bit."
        } catch let caught {
            error = caught.localizedDescription
        }
    }
}
