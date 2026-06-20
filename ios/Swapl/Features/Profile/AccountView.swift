import SwiftUI
import CoreLocation
import MapKit
import PhotosUI
import UIKit
import ImageIO
import SwaplDesignTokens

struct AccountView: View {
    @Environment(AuthService.self) private var auth
    @State private var isConfirmingSignOut = false
    @State private var isCreatingListing = false
    @State private var myListings: [Listing] = []
    @State private var editingListing: Listing?
    // Real, data-driven profile stats (F19) — replaces the previously
    // hardcoded "2 Trips / 1 Home / 2026 / verified". nil until /api/me loads.
    @State private var me: MeResponse?

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                ScrollView {
                    SwaplPageTitle(String(localized: "Profile"))
                    VStack(alignment: .leading, spacing: 24) {
                        profileCard
                        quickCards
                        // Didit identity check — hides itself when the feature
                        // is off server-side or the user is already verified.
                        IdentityVerificationCard()
                        hostSection
                        keysCard
                        inviteCard
                        Color.clear.frame(height: 20)

                        // Airbnb-style settings jump list (DOK-147), mirroring
                        // the web /account sections.
                        // iOS Settings-style grouping: one row per section; tap
                        // opens a screen listing just that section's items.
                        VStack(spacing: 12) {
                            NavigationLink { PersonalInfoSectionView() } label: { portedMenuRow(String(localized: "General"), "gearshape") }
                                .buttonStyle(.plain)
                            NavigationLink { LoginSecuritySectionView() } label: { portedMenuRow(String(localized: "Login & security"), "lock.shield") }
                                .buttonStyle(.plain)
                            NavigationLink { PrivacySectionView() } label: { portedMenuRow(String(localized: "Privacy"), "hand.raised") }
                                .buttonStyle(.plain)
                            NavigationLink { NotificationSettingsView() } label: { portedMenuRow(String(localized: "Notifications"), "bell") }
                                .buttonStyle(.plain)
                            NavigationLink { GetHelpSectionView() } label: { portedMenuRow(String(localized: "Get help"), "questionmark.circle") }
                                .buttonStyle(.plain)
                            if auth.isAdmin {
                                NavigationLink { MetricsView() } label: { portedMenuRow(String(localized: "Admin"), "chart.bar") }
                                    .buttonStyle(.plain)
                            }
                        }

                        signOutRow
                        versionFooter
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 24)
                    .padding(.bottom, 148)
                }
                .background(SwaplSemanticLight.background)

                Button {
                    isCreatingListing = true
                } label: {
                    Label(String(localized: "Switch to hosting"), systemImage: "arrow.up.arrow.down")
                        .font(.swaplBody(17, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .padding(.horizontal, 26)
                        .frame(height: 58)
                        .background(SwaplColor.navyDark, in: Capsule())
                        .shadow(color: .black.opacity(0.18), radius: 18, x: 0, y: 10)
                }
                .padding(.bottom, 18)

                // Real-time referrer toast (DOK-157): "NAME just verified — you
                // earned Keys!" while the account screen is open.
                ReferrerNotificationsToast()
            }
            .toolbar(.hidden, for: .navigationBar)
            // Tapping a past trip (from the Past trips card) opens its detail.
            .navigationDestination(for: String.self) { id in
                ProposalDetailView(proposalId: id)
            }
            .fullScreenCover(isPresented: $isCreatingListing, onDismiss: {
                Task { await loadMyListings() }
            }) {
                ListingCreationView()
            }
            .fullScreenCover(item: $editingListing) { listing in
                ListingCreationView(editing: listing) {
                    Task { await loadMyListings() }
                }
            }
            .task { await loadMyListings() }
            .task { await loadMe() }
            .confirmationDialog(String(localized: "Sign out of Swapl?"), isPresented: $isConfirmingSignOut, titleVisibility: .visible) {
                Button(String(localized: "Sign out"), role: .destructive) {
                    Task { await auth.signOut() }
                }
                Button(String(localized: "Cancel"), role: .cancel) {}
            }
        }
    }

    // Real version string from the bundle — "Version 1.0 (1)".
    private var versionFooter: some View {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return Text(String(localized: "Version \(version) (\(build))"))
            .font(.swaplMono(SwaplDesignSystem.FontSize.tiny))
            .foregroundStyle(AirbnbPalette.secondaryText)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 6)
    }

    private func portedMenuRow(_ title: String, _ icon: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 18, weight: .semibold))
            Text(title).font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(AirbnbPalette.secondaryText)
        }
        .foregroundStyle(AirbnbPalette.text)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    private var profileCard: some View {
        HStack(spacing: 22) {
            VStack(spacing: 12) {
                ZStack(alignment: .bottomTrailing) {
                    // Show the uploaded profile picture when set (DOK-216); reads
                    // auth.session so it updates the moment refreshSession() runs
                    // after an upload. Falls back to the initials monogram.
                    Group {
                        if let raw = auth.session?.avatar, let url = URL(string: raw) {
                            AsyncImage(url: url) { phase in
                                if case .success(let image) = phase {
                                    image.resizable().scaledToFill()
                                } else {
                                    initialsCircle
                                }
                            }
                        } else {
                            initialsCircle
                        }
                    }
                    .frame(width: 118, height: 118)
                    .clipShape(Circle())
                    // Verified badge is gated on real verification status
                    // (F19) — only an ID-verified member sees the shield.
                    if me?.user.verified == true {
                        Image(systemName: "checkmark.shield.fill")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.primaryForeground)
                            .frame(width: 44, height: 44)
                            .background(SwaplSemanticLight.primary, in: Circle())
                            .overlay(Circle().stroke(SwaplSemanticLight.card, lineWidth: 4))
                    }
                }
                Text(displayName)
                    .font(.swaplDisplay(30, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(1)
                Text(String(localized: "Swapl member"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .frame(maxWidth: .infinity)

            // Real stats from /api/me (F19). Until it loads we show em-dashes
            // rather than fabricated numbers.
            VStack(alignment: .leading, spacing: 14) {
                profileStat(activeSwapsValue, String(localized: "Swaps"))
                Divider()
                profileStat(homesValue, homesLabel)
                Divider()
                profileStat(memberSinceValue, String(localized: "Member since"))
            }
            .frame(width: 120, alignment: .leading)
        }
        .padding(24)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
        .shadow(color: .black.opacity(0.05), radius: 20, x: 0, y: 10)
    }

    private var quickCards: some View {
        HStack(spacing: 14) {
            NavigationLink { PastTripsLoaderView() } label: {
                ProfileFeatureCard(title: String(localized: "Past trips"), subtitle: String(localized: "Your completed swaps"), systemImage: "suitcase.rolling")
            }
            .buttonStyle(.plain)
            ProfileFeatureCard(title: String(localized: "Connections"), subtitle: String(localized: "Hosts you know"), systemImage: "person.2")
        }
    }

    // Host section: the empty-state CTA, or the list of the member's properties
    // (multi-listing) plus an "add another" row.
    @ViewBuilder
    private var hostSection: some View {
        if myListings.isEmpty {
            becomeHostCard
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text(myListings.count == 1 ? String(localized: "Your property") : String(localized: "Your properties"))
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                ForEach(myListings) { listing in
                    Button { editingListing = listing } label: { listingRow(listing) }
                        .buttonStyle(.plain)
                }
                Button { isCreatingListing = true } label: { addPropertyRow }
                    .buttonStyle(.plain)
            }
        }
    }

    private func listingRow(_ listing: Listing) -> some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .fill(SwaplSemanticLight.accent)
                Image(systemName: "house.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
            }
            .frame(width: 56, height: 56)

            VStack(alignment: .leading, spacing: 3) {
                Text(listing.title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(1)
                Text("\(listing.neighbourhood), \(listing.city)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "square.and.pencil")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
    }

    private var addPropertyRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
            Text(String(localized: "Add another property"))
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.accent.opacity(0.5), in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
    }

    private var becomeHostCard: some View {
        Button {
            isCreatingListing = true
        } label: {
            HStack(spacing: 18) {
                ZStack {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .fill(SwaplSemanticLight.accent)
                    Image(systemName: "house.and.flag")
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                }
                .frame(width: 86, height: 86)

                VStack(alignment: .leading, spacing: 6) {
                    Text(String(localized: "Become a host"))
                        .font(.swaplDisplay(23, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(String(localized: "Create your home listing and start proposing swaps."))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(18)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .buttonStyle(.plain)
    }

    // Entry to the Keys wallet (DOK-155) — "travel points", shown right after
    // the host card so it sits with the member's swap tools.
    private var keysCard: some View {
        NavigationLink {
            KeysWalletView()
        } label: {
            HStack(spacing: 18) {
                ZStack {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .fill(SwaplColor.navyDark)
                    Image(systemName: "key.horizontal.fill")
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                }
                .frame(width: 86, height: 86)

                VStack(alignment: .leading, spacing: 6) {
                    Text(String(localized: "Travel points"))
                        .font(.swaplDisplay(23, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(String(localized: "Your points balance, history, and gifting — stay somewhere without a simultaneous swap."))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(18)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .buttonStyle(.plain)
    }

    // Entry to Invite & earn (DOK-157) — the growth/referral dashboard, sitting
    // right under the wallet since both are part of the points economy. Hype copy:
    // bringing friends earns travel points and jumps the early-access line.
    private var inviteCard: some View {
        NavigationLink {
            InviteAndEarnView()
        } label: {
            HStack(spacing: 18) {
                ZStack {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .fill(SwaplSemanticLight.accent)
                    Image(systemName: "person.2.badge.gearshape.fill")
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                }
                .frame(width: 86, height: 86)

                VStack(alignment: .leading, spacing: 6) {
                    Text(String(localized: "Invite & earn"))
                        .font(.swaplDisplay(23, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(String(localized: "Bring friends, earn travel points, and jump the early-access line."))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(18)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .buttonStyle(.plain)
    }

    private var signOutRow: some View {
        Button {
            isConfirmingSignOut = true
        } label: {
            HStack(spacing: 18) {
                Image(systemName: "door.left.hand.open")
                    .font(.system(size: 24, weight: .regular))
                    .frame(width: 34)
                Text(String(localized: "Log out"))
                    .font(.swaplBody(18, weight: .semibold))
                Spacer()
            }
            .foregroundStyle(AirbnbPalette.text)
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
    }

    private func profileStat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.swaplDisplay(28, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
        }
    }

    // The user's own published listing, if any. The search response carries
    // viewerListingId (the session user's active listing); the detail endpoint
    // then provides the full model used to prefill the edit wizard.
    private func loadMyListings() async {
        guard auth.session != nil else { return }
        do {
            myListings = try await ListingRepository.shared.myListings()
        } catch {
            // Non-fatal: an empty list just shows the "Become a host" CTA.
        }
    }

    private func loadMe() async {
        guard auth.session != nil else { return }
        me = try? await ProfileRepository.shared.me()
    }

    // Real, data-driven profile stats (F19). "—" while loading.
    private var activeSwapsValue: String {
        me.map { String($0.counts.activeSwaps) } ?? "—"
    }

    private var homesValue: String {
        me.map { String($0.counts.listings) } ?? "—"
    }

    private var homesLabel: String {
        (me?.counts.listings == 1) ? String(localized: "Home") : String(localized: "Homes")
    }

    private var memberSinceValue: String {
        guard let createdAt = me?.user.createdAt,
              let date = SwaplDateText.parse(createdAt) ?? ISO8601DateFormatter().date(from: createdAt)
        else { return "—" }
        return String(Calendar.current.component(.year, from: date))
    }

    private var displayName: String {
        auth.session?.name ?? auth.session?.email.components(separatedBy: "@").first ?? String(localized: "Guest")
    }

    private var initials: String {
        String(displayName.prefix(1)).uppercased()
    }

    private var initialsCircle: some View {
        Circle()
            .fill(SwaplSemanticLight.primary)
            .overlay {
                Text(initials)
                    .font(.swaplDisplay(44, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
            }
    }
}

private struct ProfileFeatureCard: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 54, height: 54)
                .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            Spacer(minLength: 10)
            Text(title)
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
            Text(subtitle)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 170, alignment: .leading)
        .padding(18)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }
}

struct ListingCreationView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var locationService = ListingLocationService()
    @State private var step = 0
    @State private var draft = ListingCreationDraft()
    @State private var error: String?
    @State private var isPublishing = false
    @State private var createdListingId: String?
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var uploadingPhotos = false
    @State private var isGeneratingCopy = false

    // Publish acknowledgment (DOK-162). The host picks the hosting mode and must
    // tick a self-attestation before a NEW listing can publish; never shown when
    // editing (the ack is logged once at create time).
    @State private var ackMode: PublishAckMode = .entireHomeWhileAway
    @State private var ackAccepted = false

    // Edit mode: when set, the wizard is prefilled from the published listing
    // and submit issues PUT /api/listings/{id} instead of POST /api/listings.
    private let editingListingId: String?
    private let onSaved: (() -> Void)?

    private let steps = ["Photos", "Location", "Space", "Amenities", "Dates", "Review"]

    init(extractedInfo: ExtractedListingInfo? = nil) {
        editingListingId = nil
        onSaved = nil
        _draft = State(initialValue: ListingCreationDraft(extractedInfo: extractedInfo))
    }

    init(editing listing: Listing, onSaved: (() -> Void)? = nil) {
        editingListingId = listing.id
        self.onSaved = onSaved
        _draft = State(initialValue: ListingCreationDraft(listing: listing))
    }

    private var isEditing: Bool { editingListingId != nil }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                topBar
                progressHeader

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        currentStep
                        if let error {
                            Text(error)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                                .foregroundStyle(SwaplSemanticLight.destructive)
                                .padding(.top, 4)
                        }
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 24)
                    .padding(.bottom, 120)
                }
                .background(SwaplSemanticLight.background)
            }
            .safeAreaInset(edge: .bottom) {
                bottomBar
            }
            .alert(isEditing ? "Changes saved" : "Listing published", isPresented: createdBinding) {
                Button("Done") {
                    onSaved?()
                    dismiss()
                }
            } message: {
                Text(isEditing ? String(localized: "Your listing has been updated.") : String(localized: "Your home is now ready for swaps."))
            }
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: locationService.detectedAddress) { _, address in
                guard let address else { return }
                applyDetectedAddress(address)
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 44, height: 44)
                    .background(SwaplSemanticLight.card, in: Circle())
            }
            .accessibilityLabel("Close")
            Spacer()
            Text(isEditing ? String(localized: "Edit your home") : String(localized: "Create listing"))
                .font(.swaplBody(17, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()
            // Invisible counterweight keeps the title optically centered.
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(SwaplSemanticLight.background)
    }

    private var progressHeader: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Step \(step + 1) of \(steps.count)")
                .font(.swaplMono(SwaplDesignSystem.FontSize.tiny, weight: .medium))
                .foregroundStyle(SwaplSemanticLight.primary)
                .textCase(.uppercase)
            Text(steps[step])
                .font(.swaplDisplay(34, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            ProgressView(value: Double(step + 1), total: Double(steps.count))
                .tint(SwaplSemanticLight.primary)
        }
        .padding(.horizontal, 22)
        .padding(.bottom, 18)
        .background(SwaplSemanticLight.background)
    }

    @ViewBuilder
    private var currentStep: some View {
        switch step {
        case 0:
            photosStep
        case 1:
            locationStep
        case 2:
            spaceStep
        case 3:
            amenitiesStep
        case 4:
            datesStep
        default:
            reviewStep
        }
    }

    private var photosStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Start with the photos")
                .font(.swaplDisplay(26, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text("Add your home's photos first — we read the location from them where possible and draft the description for you. You confirm and tweak everything in the next steps.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            photosSection
        }
    }

    private var locationStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Start with where you are")
                .font(.swaplDisplay(26, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text("Most hosts create the listing while they are at home. Use location once to fill the address, city, neighbourhood, country and map pin.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

            LocationAutofillCard(
                status: locationService.statusText,
                isResolving: locationService.isResolving,
                action: { locationService.requestCurrentHomeLocation() }
            )

            AddressSearchField(text: $draft.address) { resolved in
                applyResolvedAddress(resolved)
            }
            // F23: Italian-market placeholder examples (was Istanbul / Cihangir
            // / Turkey). These are sample hints only, not stored values.
            ListingField(title: String(localized: "City"), text: $draft.city, placeholder: String(localized: "e.g. Roma"))
            ListingField(title: String(localized: "Neighbourhood"), text: $draft.neighbourhood, placeholder: String(localized: "e.g. Trastevere"))
            ListingField(title: String(localized: "Country"), text: $draft.country, placeholder: String(localized: "e.g. Italia"))
        }
    }

    private var spaceStep: some View {
        VStack(spacing: 14) {
            spaceTypeSelector
            ListingField(title: "Title", text: $draft.title, placeholder: "Sunny apartment near the water")
            ListingLongField(title: "Description", text: $draft.description, placeholder: "Describe the home, light, neighbourhood, and what makes the stay easy.")
            generateWithAIButton
            ListingPicker(title: "Property type", selection: $draft.propertyType, values: ["APARTMENT", "HOUSE", "ROOM", "STUDIO"])
            StepperCard(title: "Size", value: $draft.sizeSqm, range: 20...800, suffix: "sqm", step: 5)
            StepperCard(title: "Guests", value: $draft.sleeps, range: 1...20, suffix: "guests")
            StepperCard(title: "Bedrooms", value: $draft.bedrooms, range: 0...15, suffix: "bedrooms")
            StepperCard(title: "Bathrooms", value: $draft.bathrooms, range: 0...10, suffix: "bathrooms")
        }
    }

    // DOK-160: choose whole home vs single private room, and (for a room) how
    // many rooms are offered. Copy makes clear a room is worth fewer Keys.
    private var spaceTypeSelector: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 9) {
                Text("What are you offering?")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                Picker("What are you offering?", selection: $draft.spaceType) {
                    Text("Entire place").tag("entire_place")
                    Text("Private room").tag("private_room")
                }
                .pickerStyle(.segmented)
            }

            if draft.spaceType == "private_room" {
                StepperCard(title: String(localized: "Rooms offered"), value: $draft.roomsOffered, range: 1...15, suffix: String(localized: "rooms"))
                Text("A private room is worth fewer Keys per night than offering the whole home.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var amenitiesStep: some View {
        VStack(spacing: 14) {
            ToggleCard(title: "Elevator", systemImage: "arrow.up.arrow.down", isOn: $draft.hasElevator)
            ToggleCard(title: "Step-free access", systemImage: "figure.roll", isOn: $draft.stepFreeAccess)
            ToggleCard(title: "Pets allowed", systemImage: "pawprint", isOn: $draft.petsAllowed)
            ToggleCard(title: "Work setup", systemImage: "desktopcomputer", isOn: $draft.wfhSetup)
            ToggleCard(title: "Balcony", systemImage: "sun.max", isOn: $draft.balcony)
            ToggleCard(title: "Air conditioning", systemImage: "snowflake", isOn: $draft.ac)
            ToggleCard(title: "Washer", systemImage: "washer", isOn: $draft.washer)
            ToggleCard(title: "Dishwasher", systemImage: "dishwasher", isOn: $draft.dishwasher)
        }
    }

    private var datesStep: some View {
        VStack(spacing: 14) {
            DateCard(title: "Available from", date: $draft.availableFrom)
            DateCard(title: "Available to", date: $draft.availableTo)
            StepperCard(title: "Minimum stay", value: $draft.minStayDays, range: 1...180, suffix: "nights")
            StepperCard(title: "Maximum stay", value: $draft.maxStayDays, range: 1...365, suffix: "nights")
        }
    }

    private var photosSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Photos")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                if uploadingPhotos { ProgressView() }
            }
            PhotosPicker(selection: $photoItems, maxSelectionCount: 10, matching: .images) {
                HStack(spacing: 10) {
                    Image(systemName: "photo.on.rectangle.angled")
                    Text(draft.photos.isEmpty ? String(localized: "Add photos") : String(localized: "Add more photos"))
                }
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }
            }
            if !draft.photos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(draft.photos, id: \.self) { url in
                            AsyncImage(url: URL(string: url)) { img in
                                img.resizable().scaledToFill()
                            } placeholder: {
                                SwaplSemanticLight.muted
                            }
                            .frame(width: 84, height: 84)
                            .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.small, style: .continuous))
                            .overlay(alignment: .topTrailing) {
                                Button {
                                    draft.photos.removeAll { $0 == url }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 18, weight: .semibold))
                                        .symbolRenderingMode(.palette)
                                        .foregroundStyle(SwaplSemanticLight.primaryForeground, Color.black.opacity(0.55))
                                        .padding(4)
                                }
                                .accessibilityLabel("Remove photo")
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                Text("\(draft.photos.count) photo\(draft.photos.count == 1 ? "" : "s") uploaded")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
        .onChange(of: photoItems) { _, items in
            Task { await uploadPhotos(items) }
        }
    }

    // AI: draft a title + description from the photos (vision) and the facts
    // entered so far. Needs a location, so it's enabled once city is set.
    private var generateWithAIButton: some View {
        Button {
            Task { await generateListingCopy() }
        } label: {
            HStack(spacing: 8) {
                if isGeneratingCopy {
                    ProgressView().tint(SwaplSemanticLight.primary)
                } else {
                    Image(systemName: "sparkles")
                }
                Text(isGeneratingCopy
                     ? String(localized: "Writing from your photos…")
                     : String(localized: "Generate with AI"))
            }
            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
            .foregroundStyle(SwaplSemanticLight.primary)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(SwaplSemanticLight.accent.opacity(0.5), in: Capsule())
        }
        .disabled(isGeneratingCopy || draft.city.isEmpty || draft.neighbourhood.isEmpty)
    }

    private func generateListingCopy() async {
        isGeneratingCopy = true
        error = nil
        defer { isGeneratingCopy = false }
        do {
            let result = try await AIDraftRepository.shared.listingContent(
                AIDraftRepository.ListingContentRequest(
                    city: draft.city,
                    neighbourhood: draft.neighbourhood,
                    country: draft.country.isEmpty ? nil : draft.country,
                    propertyType: draft.propertyType,
                    sizeSqm: draft.sizeSqm,
                    sleeps: draft.sleeps,
                    bedrooms: draft.bedrooms,
                    bathrooms: draft.bathrooms,
                    floor: nil,
                    hasElevator: draft.hasElevator,
                    stepFreeAccess: draft.stepFreeAccess,
                    petsAllowed: draft.petsAllowed,
                    wfhSetup: draft.wfhSetup,
                    amenities: nil,
                    // Pass any text the host already wrote as guidance.
                    hostNotes: draft.description.isEmpty ? nil : draft.description,
                    photoUrls: draft.photos.isEmpty ? nil : draft.photos
                )
            )
            draft.title = result.title
            draft.description = result.description
        } catch {
            self.error = String(localized: "Couldn't generate the copy. Try again, or write it yourself.")
        }
    }

    private func uploadPhotos(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        uploadingPhotos = true
        error = nil
        defer { uploadingPhotos = false }
        var urls: [String] = []
        var firstOriginal: Data?
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            if firstOriginal == nil { firstOriginal = data }   // keep EXIF before downscale
            guard let jpeg = Self.downscaledJPEG(from: data) else { continue }
            do {
                let url = try await APIClient.shared.uploadListingPhoto(jpeg)
                urls.append(url)
            } catch {
                self.error = String(localized: "Couldn't upload a photo. Check your connection and try again.")
            }
        }
        if !urls.isEmpty {
            // Append so existing (already-published) photos survive an edit;
            // each thumbnail has its own remove button.
            draft.photos.append(contentsOf: urls.filter { !draft.photos.contains($0) })
        }
        photoItems = []

        // Pull the location from the photo's GPS EXIF, if present and the host
        // hasn't already entered a city — they confirm it on the Location step.
        if draft.city.isEmpty, let data = firstOriginal, let coord = Self.gpsCoordinate(from: data) {
            await prefillLocation(from: coord)
        }
    }

    // GPS coordinate from a photo's EXIF metadata (nil when the photo carries no
    // location — e.g. stripped on share or shot with location off).
    private static func gpsCoordinate(from data: Data) -> CLLocationCoordinate2D? {
        guard
            let src = CGImageSourceCreateWithData(data as CFData, nil),
            let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any],
            let gps = props[kCGImagePropertyGPSDictionary] as? [CFString: Any],
            let lat = gps[kCGImagePropertyGPSLatitude] as? Double,
            let lon = gps[kCGImagePropertyGPSLongitude] as? Double,
            let latRef = gps[kCGImagePropertyGPSLatitudeRef] as? String,
            let lonRef = gps[kCGImagePropertyGPSLongitudeRef] as? String
        else { return nil }
        return CLLocationCoordinate2D(
            latitude: latRef == "S" ? -lat : lat,
            longitude: lonRef == "W" ? -lon : lon
        )
    }

    // Reverse-geocode the EXIF coordinate and prefill the location fields. The
    // host confirms/edits on the Location step. CLGeocoder is the only API with
    // sub-locality (neighbourhood); deprecated on iOS 26 with no replacement.
    @available(iOS, deprecated: 26.0, message: "CLGeocoder is the only source of subLocality")
    private func prefillLocation(from coord: CLLocationCoordinate2D) async {
        let location = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
        guard let placemark = try? await CLGeocoder().reverseGeocodeLocation(location).first else { return }
        draft.lat = coord.latitude
        draft.lng = coord.longitude
        if draft.city.isEmpty, let city = placemark.locality { draft.city = city }
        if draft.neighbourhood.isEmpty, let hood = placemark.subLocality ?? placemark.locality {
            draft.neighbourhood = hood
        }
        if draft.country.isEmpty, let country = placemark.country { draft.country = country }
        if draft.address.isEmpty {
            let street = [placemark.thoroughfare, placemark.subThoroughfare].compactMap { $0 }.joined(separator: " ")
            if !street.isEmpty { draft.address = street }
        }
    }

    // Re-encode to a reasonably-sized JPEG so HEIC/large originals upload
    // reliably under the 8MB server cap.
    private static func downscaledJPEG(from data: Data, maxDimension: CGFloat = 1600, quality: CGFloat = 0.8) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxDimension ? maxDimension / longest : 1
        if scale >= 1 { return image.jpegData(compressionQuality: quality) }
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
        return resized.jpegData(compressionQuality: quality)
    }

    private var reviewStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text(draft.title.isEmpty ? String(localized: "Untitled home") : draft.title)
                    .font(.swaplDisplay(28, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(2)
                Text("\(draft.neighbourhood), \(draft.city), \(draft.country)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                Text("\(draft.sleeps) guests · \(draft.bedrooms) bedrooms · \(draft.bathrooms) baths")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }

            Text(isEditing
                ? "Saving updates your published listing right away — guests browsing Swapl will see the new details."
                : "Once published, your listing appears in Browse and can be used in swap proposals.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .padding(.horizontal, 4)

            if !isEditing {
                publishAcknowledgment
            }
        }
    }

    // DOK-162: hosting-mode picker + required self-attestation. The discrimine is
    // cession of enjoyment, not money — so the copy adapts to the chosen mode and
    // we never ask for proof of ownership here (that's the separate, optional
    // "Verify ownership" flow). Publish stays blocked until the box is ticked.
    private var publishAcknowledgment: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("How are you hosting?")
                .font(.swaplDisplay(20, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            VStack(spacing: 10) {
                ForEach(PublishAckMode.allCases, id: \.self) { mode in
                    Button {
                        if ackMode != mode { ackAccepted = false }
                        ackMode = mode
                    } label: {
                        HStack(alignment: .center, spacing: 12) {
                            Image(systemName: ackMode == mode ? "largecircle.fill.circle" : "circle")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundStyle(ackMode == mode ? SwaplSemanticLight.primary : AirbnbPalette.secondaryText)
                            Text(mode.pickerTitle)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                                .stroke(ackMode == mode ? SwaplSemanticLight.primary : AirbnbPalette.hairline, lineWidth: ackMode == mode ? 2 : 1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }

            Button {
                ackAccepted.toggle()
                error = nil
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: ackAccepted ? "checkmark.square.fill" : "square")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(ackAccepted ? SwaplSemanticLight.primary : AirbnbPalette.secondaryText)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ackMode.ackHeadline)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                            .foregroundStyle(AirbnbPalette.text)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(ackMode.ackFineprint)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AirbnbPalette.softBackground, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("I confirm I have the right to host")
            .accessibilityValue(ackAccepted ? "Checked" : "Not checked")
        }
    }

    private var bottomBar: some View {
        HStack(spacing: 12) {
            Button {
                error = nil
                step = max(0, step - 1)
            } label: {
                Text("Back")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(SwaplSemanticLight.card, in: Capsule())
            }
            .disabled(step == 0 || isPublishing)
            .opacity(step == 0 ? 0.45 : 1)

            Button {
                advance()
            } label: {
                HStack {
                    if isPublishing { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                    Text(step == steps.count - 1 ? (isEditing ? String(localized: "Save changes") : String(localized: "Publish")) : String(localized: "Continue"))
                }
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(SwaplSemanticLight.primary, in: Capsule())
            }
            .disabled(isPublishing)
        }
        .padding(.horizontal, 22)
        .padding(.top, 12)
        .padding(.bottom, 12)
        .background(.ultraThinMaterial)
    }

    private var createdBinding: Binding<Bool> {
        Binding(
            get: { createdListingId != nil },
            set: { if !$0 { createdListingId = nil } }
        )
    }

    private func advance() {
        error = validate()
        guard error == nil else { return }
        if step < steps.count - 1 {
            step += 1
        } else {
            Task { await publish() }
        }
    }

    private func validate() -> String? {
        switch step {
        case 0:
            if draft.city.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 { return String(localized: "Add a city.") }
            if draft.neighbourhood.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 { return String(localized: "Add a neighbourhood.") }
            if draft.country.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 { return String(localized: "Add a country.") }
        case 1:
            if draft.title.trimmingCharacters(in: .whitespacesAndNewlines).count < 4 { return String(localized: "Add a clearer title.") }
            if draft.description.trimmingCharacters(in: .whitespacesAndNewlines).count < 20 { return String(localized: "Write at least 20 characters about your home.") }
        case 3:
            if draft.availableTo <= draft.availableFrom { return String(localized: "End date must be after start date.") }
            if draft.maxStayDays < draft.minStayDays { return String(localized: "Maximum stay must be at least the minimum stay.") }
        case steps.count - 1:
            // Review step: the publish acknowledgment is mandatory on create.
            if !isEditing && !ackAccepted {
                return String(localized: "Please confirm you have the right to host before publishing.")
            }
        default:
            break
        }
        return nil
    }

    private func publish() async {
        isPublishing = true
        error = nil
        defer { isPublishing = false }
        do {
            let response: ListingCreateResponse
            if let editingListingId {
                response = try await ListingRepository.shared.update(id: editingListingId, draft.payload)
            } else {
                // Attach the publish acknowledgment only on create; the backend
                // requires ackAccepted + mode and rejects with 400 otherwise.
                var payload = draft.payload
                payload.ackAccepted = true
                payload.mode = ackMode.rawValue
                response = try await ListingRepository.shared.create(payload)
            }
            createdListingId = response.id
        } catch APIClient.APIError.status(400, let body) where (body ?? "").contains("PUBLISH_ACK") {
            self.error = String(localized: "Please confirm you have the right to host before publishing.")
        } catch APIClient.APIError.status(403, _) {
            self.error = isEditing
                ? "You can only edit your own listing."
                : "Verify your email before publishing — see the banner at the top of the app."
        } catch APIClient.APIError.status(404, _) where isEditing {
            self.error = String(localized: "This listing no longer exists.")
        } catch APIClient.APIError.status(402, _) {
            self.error = String(localized: "You've reached your plan's listing limit. Upgrade to publish more homes.")
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func applyDetectedAddress(_ address: DetectedHomeAddress) {
        if !address.city.isEmpty { draft.city = address.city }
        if !address.neighbourhood.isEmpty { draft.neighbourhood = address.neighbourhood }
        if !address.country.isEmpty { draft.country = address.country }
        if !address.address.isEmpty { draft.address = address.address }
        draft.lat = address.latitude
        draft.lng = address.longitude
    }

    // A place tapped in the address autocomplete fills the same fields as the
    // GPS path. Coordinates are stored exactly; the server fuzzes them for the
    // public map.
    private func applyResolvedAddress(_ resolved: ResolvedAddress) {
        if !resolved.address.isEmpty { draft.address = resolved.address }
        if !resolved.city.isEmpty { draft.city = resolved.city }
        if !resolved.neighbourhood.isEmpty { draft.neighbourhood = resolved.neighbourhood }
        if !resolved.country.isEmpty { draft.country = resolved.country }
        draft.lat = resolved.latitude
        draft.lng = resolved.longitude
    }
}

private struct ListingCreationDraft {
    // Location/title/description start empty so hosts enter their own home
    // (validation enforces it); only neutral numeric/amenity defaults remain.
    var city = ""
    var neighbourhood = ""
    var country = ""
    var address = ""
    var lat: Double?
    var lng: Double?
    var title = ""
    var description = ""
    var propertyType = "APARTMENT"
    // DOK-160: whole home vs single private room. Default whole place; when
    // "private_room" the host also picks how many rooms (1–15) they offer and
    // the nightly Keys are reduced server-side.
    var spaceType = "entire_place"
    var roomsOffered = 1
    var sizeSqm = 80
    var sleeps = 3
    var bedrooms = 2
    var bathrooms = 1
    var hasElevator = false
    var stepFreeAccess = false
    var petsAllowed = false
    var wfhSetup = true
    var balcony = true
    var ac = true
    var washer = true
    var dishwasher = true
    var availableFrom = Calendar.current.date(byAdding: .day, value: 60, to: Date()) ?? Date()
    var availableTo = Calendar.current.date(byAdding: .day, value: 90, to: Date()) ?? Date()
    var minStayDays = 7
    var maxStayDays = 30
    var photos: [String] = []

    // Fields the wizard has no UI for. They keep their create-flow defaults,
    // but in edit mode they carry the published listing's values so a save
    // doesn't silently wipe them.
    var floor: Int?
    var petTypes: [String] = []
    var wfhDesks = 0
    var hasParking = false
    var bikeIncluded = false
    var rooftop = false
    var garden = false
    var courtyard = false
    var piano = false
    var pool = false
    var dryer = false
    var gym = false
    var tags: [String] = []

    init() {}

    // Prefill from a published listing (edit mode).
    init(listing: Listing) {
        self.init()
        gym = listing.gym ?? false
        address = listing.address ?? ""
        city = listing.city
        neighbourhood = listing.neighbourhood
        country = listing.country
        lat = listing.lat
        lng = listing.lng
        title = listing.title
        description = listing.description
        propertyType = listing.propertyType
        spaceType = listing.spaceType ?? "entire_place"
        roomsOffered = listing.roomsOffered ?? 1
        sizeSqm = listing.sizeSqm
        sleeps = listing.sleeps
        bedrooms = listing.bedrooms
        bathrooms = listing.bathrooms
        floor = listing.floor
        hasElevator = listing.hasElevator
        stepFreeAccess = listing.stepFreeAccess
        petsAllowed = listing.petsAllowed
        petTypes = listing.petTypes.filter { ["dogs", "cats", "other"].contains($0) }
        wfhSetup = listing.wfhSetup
        wfhDesks = listing.wfhDesks
        hasParking = listing.hasParking
        bikeIncluded = listing.bikeIncluded
        rooftop = listing.rooftop
        balcony = listing.balcony
        garden = listing.garden
        courtyard = listing.courtyard
        piano = listing.piano
        pool = listing.pool
        ac = listing.ac
        washer = listing.washer
        dryer = listing.dryer
        dishwasher = listing.dishwasher
        if let from = SwaplDateText.parse(listing.availableFrom) { availableFrom = from }
        if let to = SwaplDateText.parse(listing.availableTo) { availableTo = to }
        minStayDays = listing.minStayDays
        maxStayDays = listing.maxStayDays
        photos = listing.photos
        tags = listing.tags
    }

    init(extractedInfo: ExtractedListingInfo?) {
        self.init()
        guard let extractedInfo else { return }
        if let title = extractedInfo.title, !title.isEmpty { self.title = title }
        if let description = extractedInfo.description, !description.isEmpty { self.description = description }
        if let city = extractedInfo.city, !city.isEmpty { self.city = city }
        if let neighbourhood = extractedInfo.neighbourhood, !neighbourhood.isEmpty { self.neighbourhood = neighbourhood }
        if let bedrooms = extractedInfo.bedrooms { self.bedrooms = bedrooms }
        if let bathrooms = extractedInfo.bathrooms { self.bathrooms = bathrooms }
        if let sleeps = extractedInfo.sleeps { self.sleeps = sleeps }
        if let startDate = extractedInfo.startDate { self.availableFrom = startDate }
        if let endDate = extractedInfo.endDate { self.availableTo = endDate }
        // Map the model's free-text type onto the picker's fixed buckets.
        if let pt = extractedInfo.propertyType?.lowercased(), !pt.isEmpty {
            if pt.contains("studio") { propertyType = "STUDIO" }
            else if pt.contains("house") || pt.contains("villa") || pt.contains("cottage") { propertyType = "HOUSE" }
            else if pt.contains("room") { propertyType = "ROOM" }
            else if pt.contains("apartment") || pt.contains("flat") || pt.contains("loft") || pt.contains("condo") { propertyType = "APARTMENT" }
        }
        if let amenities = extractedInfo.amenities {
            let normalized = Set(amenities.map { $0.lowercased() })
            func has(_ keys: String...) -> Bool { keys.contains { normalized.contains($0) } }
            balcony = has("balcony")
            ac = has("ac", "air conditioning", "aircon")
            washer = has("washer", "washing machine")
            dryer = has("dryer")
            dishwasher = has("dishwasher")
            wfhSetup = has("workspace", "desk", "wfh", "office")
            pool = has("pool", "swimming pool")
            rooftop = has("rooftop", "roof terrace")
            garden = has("garden")
            hasParking = has("parking", "garage")
            petsAllowed = has("pets", "pet friendly", "pet-friendly")
            gym = has("gym")
            piano = has("piano")
            bikeIncluded = has("bike", "bicycle")
        }
    }

    var payload: ListingCreateDraft {
        ListingCreateDraft(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            propertyType: propertyType,
            city: city.trimmingCharacters(in: .whitespacesAndNewlines),
            neighbourhood: neighbourhood.trimmingCharacters(in: .whitespacesAndNewlines),
            country: country.trimmingCharacters(in: .whitespacesAndNewlines),
            address: address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : address,
            lat: lat,
            lng: lng,
            sizeSqm: sizeSqm,
            sleeps: sleeps,
            bedrooms: bedrooms,
            bathrooms: bathrooms,
            floor: floor,
            hasElevator: hasElevator,
            stepFreeAccess: stepFreeAccess,
            petsAllowed: petsAllowed,
            petTypes: petsAllowed ? (petTypes.isEmpty ? ["dogs", "cats"] : petTypes) : [],
            wfhSetup: wfhSetup,
            wfhDesks: wfhSetup ? max(wfhDesks, 1) : 0,
            hasParking: hasParking,
            bikeIncluded: bikeIncluded,
            rooftop: rooftop,
            balcony: balcony,
            garden: garden,
            courtyard: courtyard,
            piano: piano,
            pool: pool,
            gym: gym,
            ac: ac,
            dishwasher: dishwasher,
            washer: washer,
            dryer: dryer,
            availableFrom: SwaplDateText.apiString(from: availableFrom),
            availableTo: SwaplDateText.apiString(from: availableTo),
            minStayDays: minStayDays,
            maxStayDays: maxStayDays,
            photos: photos,
            tags: tags,
            // Whole place always reports 1 room; a private room sends 1–15.
            spaceType: spaceType,
            roomsOffered: spaceType == "private_room" ? max(1, min(roomsOffered, 15)) : 1
        )
    }
}

private struct ListingField: View {
    let title: String
    @Binding var text: String
    let placeholder: String

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            TextField(placeholder, text: $text)
                .font(.swaplBody(17))
                .textInputAutocapitalization(.words)
                .padding(16)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }
        }
    }
}

private struct AddressSearchField: View {
    @Binding var text: String
    // Called when the host taps a suggestion: fills address/city/neighbourhood/
    // country/coords on the draft.
    var onSelect: (ResolvedAddress) -> Void

    @State private var search = LocationSearchService()
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Address")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                TextField("Search or enter your home address", text: $text)
                    .font(.swaplBody(17))
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .focused($focused)
                    .onChange(of: text) { _, newValue in
                        search.updateSearch(newValue)
                    }
                if search.isSearching {
                    ProgressView().scaleEffect(0.8)
                }
            }
            .padding(.horizontal, 18)
            .frame(height: 58)
            .background(SwaplSemanticLight.card, in: Capsule())
            .overlay {
                Capsule().stroke(AirbnbPalette.hairline)
            }

            if focused && !search.suggestions.isEmpty {
                suggestionsDropdown
            }

            Text("Only the approximate area is shown publicly.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
    }

    private var suggestionsDropdown: some View {
        VStack(spacing: 0) {
            ForEach(Array(search.suggestions.prefix(5).enumerated()), id: \.offset) { index, suggestion in
                Button {
                    Task {
                        if let resolved = await search.resolveAddress(suggestion) {
                            text = resolved.address
                            onSelect(resolved)
                        }
                        search.clearSearch()
                        focused = false
                    }
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "mappin.circle")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(suggestion.title)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                                .lineLimit(1)
                            if !suggestion.subtitle.isEmpty {
                                Text(suggestion.subtitle)
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                                    .foregroundStyle(AirbnbPalette.secondaryText)
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if index < min(search.suggestions.count, 5) - 1 {
                    Divider().overlay(AirbnbPalette.hairline).padding(.leading, 50)
                }
            }
        }
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
    }
}

private struct LocationAutofillCard: View {
    let status: String
    let isResolving: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(SwaplSemanticLight.accent)
                    if isResolving {
                        ProgressView()
                            .tint(SwaplSemanticLight.primary)
                    } else {
                        Image(systemName: "location.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                    }
                }
                .frame(width: 54, height: 54)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Use my current location")
                        .font(.swaplBody(17, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(status)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(18)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .buttonStyle(.plain)
        .disabled(isResolving)
    }
}

private struct DetectedHomeAddress: Equatable {
    let city: String
    let neighbourhood: String
    let country: String
    let address: String
    let latitude: Double
    let longitude: Double
}

@MainActor
private final class ListingLocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var isResolving = false
    @Published var statusText = String(localized: "Fill location automatically while you are at the home.")
    @Published var detectedAddress: DetectedHomeAddress?

    private let manager = CLLocationManager()
    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    // True only between the user tapping "use my current location" and the
    // permission prompt resolving. Gates the authorization-change callback so a
    // freshly-created manager (every time the edit screen appears) never
    // auto-locates and silently overwrites the address.
    private var awaitingAuthorizationToLocate = false

    func requestCurrentHomeLocation() {
        // Don't call CLLocationManager.locationServicesEnabled() here: it blocks
        // the main thread (UIKit unresponsiveness warning). Apple's guidance is
        // to gate on authorizationStatus and let the delegate report problems —
        // if Location Services are off system-wide, requestLocation() fails and
        // locationManager(_:didFailWithError:) shows the fallback message.
        switch manager.authorizationStatus {
        case .notDetermined:
            awaitingAuthorizationToLocate = true
            statusText = String(localized: "Allow location access to prefill your home details.")
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            locate()
        case .denied, .restricted:
            statusText = String(localized: "Location access is off for Swapl. Enter the address manually or enable it in Settings.")
        @unknown default:
            statusText = String(localized: "Enter the address manually.")
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            // Only react to the permission prompt the user themselves triggered.
            // Without this guard the callback fires on every screen appearance
            // and overwrites a manually-entered address.
            guard awaitingAuthorizationToLocate else { return }
            awaitingAuthorizationToLocate = false
            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                locate()
            case .denied, .restricted:
                statusText = String(localized: "Location access is off for Swapl. Enter the address manually or enable it in Settings.")
            default:
                break
            }
        }
    }

    private func locate() {
        isResolving = true
        statusText = String(localized: "Finding this home...")
        manager.requestLocation()
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            await resolve(location)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            isResolving = false
            statusText = String(localized: "Could not get your location. Enter the address manually.")
        }
    }

    private func resolve(_ location: CLLocation) async {
        if #available(iOS 26.0, *) {
            await resolveWithMapKit(location)
        } else {
            await resolveWithGeocoder(location)
        }
        isResolving = false
    }

    @available(iOS 26.0, *)
    private func resolveWithMapKit(_ location: CLLocation) async {
        do {
            guard let request = MKReverseGeocodingRequest(location: location) else {
                statusText = String(localized: "Location found, but address lookup failed. Enter the address manually.")
                return
            }
            let mapItem = try await request.mapItems.first
            let representations = mapItem?.addressRepresentations
            let city = representations?.cityName ?? mapItem?.name ?? ""
            let country = representations?.regionName ?? ""
            let address = [
                mapItem?.address?.shortAddress,
                representations?.fullAddress(includingRegion: true, singleLine: true)
            ]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .uniqued()
                .joined(separator: ", ")
            // MapKit gives no sub-locality — read the neighbourhood separately.
            let neighbourhood = await subLocality(for: location) ?? ""
            apply(city: city, neighbourhood: neighbourhood, country: country, address: address, location: location)
        } catch {
            statusText = String(localized: "Location found, but address lookup failed. Enter the address manually.")
        }
    }

    // Pre-iOS 26 fallback: CLGeocoder, same shape of result. Only reached on
    // iOS 17–25 (resolve() branches on #available); the deprecation annotation
    // matches CLGeocoder's own so the compiler doesn't warn about using it here.
    @available(iOS, introduced: 17.0, deprecated: 26.0, message: "Uses CLGeocoder; iOS 26+ takes the MapKit path")
    private func resolveWithGeocoder(_ location: CLLocation) async {
        do {
            let placemark = try await CLGeocoder().reverseGeocodeLocation(location).first
            let city = placemark?.locality ?? placemark?.name ?? ""
            let country = placemark?.country ?? ""
            let street = [placemark?.thoroughfare, placemark?.subThoroughfare]
                .compactMap { $0 }
                .joined(separator: " ")
            let address = [street, placemark?.postalCode ?? "", city]
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .uniqued()
                .joined(separator: ", ")
            apply(city: city, neighbourhood: placemark?.subLocality ?? "", country: country, address: address, location: location)
        } catch {
            statusText = String(localized: "Location found, but address lookup failed. Enter the address manually.")
        }
    }

    private func apply(city: String, neighbourhood: String, country: String, address: String, location: CLLocation) {
        // Prefer the real sub-locality (the Turkish "mahalle", a district name);
        // only fall back to guessing from the address string when it's missing.
        let hood = neighbourhood.isEmpty ? inferNeighbourhood(from: address, fallback: city) : neighbourhood
        detectedAddress = DetectedHomeAddress(
            city: city,
            neighbourhood: hood,
            country: country,
            address: address,
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude
        )
        statusText = city.isEmpty ? "Location found. Add the address details manually." : "Filled from your current location."
    }

    // MapKit's reverse geocoding (MKAddressRepresentations) returns city/region
    // but NOT the sub-locality / neighbourhood. CLGeocoder is the only API that
    // surfaces it, so we use it solely to read `subLocality`. It's deprecated on
    // iOS 26 with no replacement for this field — a deliberate, narrow use. The
    // annotation keeps the deprecated call from warning inside this helper.
    @available(iOS, deprecated: 26.0, message: "CLGeocoder is the only source of subLocality; MapKit has no equivalent")
    private func subLocality(for location: CLLocation) async -> String? {
        let placemark = try? await CLGeocoder().reverseGeocodeLocation(location).first
        return placemark?.subLocality
    }

    private func inferNeighbourhood(from address: String, fallback: String) -> String {
        let parts = address
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard parts.count > 1 else { return fallback }
        return parts.dropFirst().first ?? fallback
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

private struct ListingLongField: View {
    let title: String
    @Binding var text: String
    let placeholder: String

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            TextEditor(text: $text)
                .font(.swaplBody(17))
                .frame(minHeight: 132)
                .padding(12)
                .scrollContentBackground(.hidden)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(placeholder)
                            .font(.swaplBody(17))
                            .foregroundStyle(AirbnbPalette.secondaryText.opacity(0.75))
                            .padding(.horizontal, 18)
                            .padding(.vertical, 20)
                            .allowsHitTesting(false)
                    }
                }
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }
        }
    }
}

private struct ListingPicker: View {
    let title: String
    @Binding var selection: String
    let values: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
            Picker(title, selection: $selection) {
                ForEach(values, id: \.self) { value in
                    Text(value.capitalized).tag(value)
                }
            }
            .pickerStyle(.segmented)
        }
    }
}

private struct StepperCard: View {
    let title: String
    @Binding var value: Int
    let range: ClosedRange<Int>
    let suffix: String
    var step = 1

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                Text("\(value) \(suffix)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer()
            Stepper("", value: $value, in: range, step: step)
                .labelsHidden()
        }
        .padding(18)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }
}

private struct ToggleCard: View {
    let title: String
    let systemImage: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            Label(title, systemImage: systemImage)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
        }
        .tint(SwaplSemanticLight.primary)
        .padding(18)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }
}

private struct DateCard: View {
    let title: String
    @Binding var date: Date

    var body: some View {
        DatePicker(title, selection: $date, displayedComponents: .date)
            .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
            .tint(SwaplSemanticLight.primary)
            .padding(18)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
    }
}

// MARK: - Settings section sub-screens (iOS Settings-style navigation)

// Shared row + scaffold for the per-section settings screens. Each section row
// on the Account page pushes one of these, which lists just that section's items.
private struct AccountSettingsRow: View {
    let title: String
    let icon: String
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 18, weight: .semibold))
            Text(title).font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(AirbnbPalette.secondaryText)
        }
        .foregroundStyle(AirbnbPalette.text)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }
}

private struct AccountSectionScaffold<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                content()
            }
            .padding(.horizontal, 22)
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .swaplFloatingHeader(title)
    }
}

private struct PersonalInfoSectionView: View {
    @Environment(AuthService.self) private var auth
    var body: some View {
        AccountSectionScaffold(title: String(localized: "General")) {
            NavigationLink { LanguagePickerView() } label: { AccountSettingsRow(title: String(localized: "Language"), icon: "globe") }.buttonStyle(.plain)
            NavigationLink { PersonalInfoView() } label: { AccountSettingsRow(title: String(localized: "Personal information"), icon: "person.text.rectangle") }.buttonStyle(.plain)
            NavigationLink { InterestsEditorView() } label: { AccountSettingsRow(title: String(localized: "Interests"), icon: "heart.text.square") }.buttonStyle(.plain)
            NavigationLink { SavedSearchesView() } label: { AccountSettingsRow(title: String(localized: "Saved searches"), icon: "magnifyingglass") }.buttonStyle(.plain)
            NavigationLink { TravelWindowsView() } label: { AccountSettingsRow(title: String(localized: "Travel windows"), icon: "calendar.badge.clock") }.buttonStyle(.plain)
            NavigationLink { SwaplStoryView() } label: { AccountSettingsRow(title: String(localized: "Your Swapl story"), icon: "book.closed") }.buttonStyle(.plain)
            NavigationLink { SwapaliticsView() } label: { AccountSettingsRow(title: String(localized: "Swapalitics"), icon: "chart.bar.xaxis") }.buttonStyle(.plain)
            if let userId = auth.session?.id {
                NavigationLink { PublicProfileView(userId: userId) } label: { AccountSettingsRow(title: String(localized: "View public profile"), icon: "person") }.buttonStyle(.plain)
            }
        }
    }
}

private struct LoginSecuritySectionView: View {
    @State private var isChangingPassword = false
    var body: some View {
        AccountSectionScaffold(title: String(localized: "Login & security")) {
            Button { isChangingPassword = true } label: { AccountSettingsRow(title: String(localized: "Change password"), icon: "lock.rotation") }.buttonStyle(.plain)
            NavigationLink { PasskeysView() } label: { AccountSettingsRow(title: String(localized: "Passkeys"), icon: "person.badge.key") }.buttonStyle(.plain)
        }
        .sheet(isPresented: $isChangingPassword) { ChangePasswordSheet() }
    }
}

private struct PrivacySectionView: View {
    var body: some View {
        AccountSectionScaffold(title: String(localized: "Privacy")) {
            NavigationLink { PrivacySettingsView() } label: { AccountSettingsRow(title: String(localized: "Privacy"), icon: "hand.raised") }.buttonStyle(.plain)
            NavigationLink { TravelProfileView() } label: { AccountSettingsRow(title: String(localized: "Your travel profile"), icon: "sparkles") }.buttonStyle(.plain)
        }
    }
}

private struct GetHelpSectionView: View {
    @State private var helpItem: SafariItem?
    @State private var isRatingApp = false
    var body: some View {
        AccountSectionScaffold(title: String(localized: "Get help")) {
            Button { helpItem = SafariItem(url: URL(string: "https://swapl.fun/contact")!) } label: { AccountSettingsRow(title: String(localized: "Contact Swapl support"), icon: "questionmark.circle") }.buttonStyle(.plain)
            Button { isRatingApp = true } label: { AccountSettingsRow(title: String(localized: "Rate the app"), icon: "star") }.buttonStyle(.plain)
        }
        .sheet(item: $helpItem) { item in
            SafariView(url: item.url).ignoresSafeArea()
        }
        .sheet(isPresented: $isRatingApp) { RateAppSheet() }
    }
}
