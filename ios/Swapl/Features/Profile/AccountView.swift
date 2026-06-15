import SwiftUI
import CoreLocation
import MapKit
import PhotosUI
import UIKit
import SwaplDesignTokens

struct AccountView: View {
    @Environment(AuthService.self) private var auth
    @State private var isConfirmingSignOut = false
    @State private var isCreatingListing = false
    @State private var myListing: Listing?
    @State private var editingListing: Listing?
    @State private var helpItem: SafariItem?
    @State private var isChangingPassword = false
    @State private var isRatingApp = false
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
                        becomeHostCard
                        keysCard
                        inviteCard
                        Color.clear.frame(height: 20)

                        // Airbnb-style settings jump list (DOK-147), mirroring
                        // the web /account sections.
                        sectionHeader(String(localized: "Personal information"))
                        NavigationLink { PersonalInfoView() } label: { portedMenuRow(String(localized: "Personal information"), "person.text.rectangle") }
                            .buttonStyle(.plain)
                        NavigationLink { InterestsEditorView() } label: { portedMenuRow(String(localized: "Interests"), "heart.text.square") }
                            .buttonStyle(.plain)
                        NavigationLink { SavedSearchesView() } label: { portedMenuRow(String(localized: "Saved searches"), "magnifyingglass") }
                            .buttonStyle(.plain)
                        NavigationLink { TravelWindowsView() } label: { portedMenuRow(String(localized: "Travel windows"), "calendar.badge.clock") }
                            .buttonStyle(.plain)
                        NavigationLink { SwaplStoryView() } label: { portedMenuRow(String(localized: "Your Swapl story"), "book.closed") }
                            .buttonStyle(.plain)
                        if let userId = auth.session?.id {
                            NavigationLink { PublicProfileView(userId: userId) } label: { portedMenuRow(String(localized: "View public profile"), "person") }
                                .buttonStyle(.plain)
                        }

                        sectionHeader(String(localized: "Login & security"))
                        Button {
                            isChangingPassword = true
                        } label: {
                            portedMenuRow(String(localized: "Change password"), "lock.rotation")
                        }
                        .buttonStyle(.plain)
                        NavigationLink { PasskeysView() } label: { portedMenuRow(String(localized: "Passkeys"), "person.badge.key") }
                            .buttonStyle(.plain)

                        sectionHeader(String(localized: "Privacy"))
                        NavigationLink { PrivacySettingsView() } label: { portedMenuRow(String(localized: "Privacy"), "hand.raised") }
                            .buttonStyle(.plain)
                        NavigationLink { TravelProfileView() } label: { portedMenuRow(String(localized: "Your travel profile"), "sparkles") }
                            .buttonStyle(.plain)

                        sectionHeader(String(localized: "Notifications"))
                        NavigationLink { NotificationSettingsView() } label: { portedMenuRow(String(localized: "Notifications"), "bell") }
                            .buttonStyle(.plain)

                        sectionHeader(String(localized: "Get help"))
                        Button {
                            helpItem = SafariItem(url: URL(string: "https://swapl.fun/contact")!)
                        } label: {
                            portedMenuRow(String(localized: "Contact Swapl support"), "questionmark.circle")
                        }
                        .buttonStyle(.plain)
                        Button {
                            isRatingApp = true
                        } label: {
                            portedMenuRow(String(localized: "Rate the app"), "star")
                        }
                        .buttonStyle(.plain)

                        if auth.isAdmin {
                            sectionHeader(String(localized: "Admin"))
                            NavigationLink { MetricsView() } label: { portedMenuRow(String(localized: "Metrics"), "chart.bar") }
                                .buttonStyle(.plain)
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
            .fullScreenCover(isPresented: $isCreatingListing, onDismiss: {
                Task { await loadMyListing() }
            }) {
                ListingCreationView()
            }
            .fullScreenCover(item: $editingListing) { listing in
                ListingCreationView(editing: listing) {
                    Task { await loadMyListing() }
                }
            }
            .task { await loadMyListing() }
            .task { await loadMe() }
            .sheet(isPresented: $isChangingPassword) {
                ChangePasswordSheet()
            }
            .sheet(isPresented: $isRatingApp) {
                RateAppSheet()
            }
            .sheet(item: $helpItem) { item in
                SafariView(url: item.url)
                    .ignoresSafeArea()
            }
            .confirmationDialog(String(localized: "Sign out of Swapl?"), isPresented: $isConfirmingSignOut, titleVisibility: .visible) {
                Button(String(localized: "Sign out"), role: .destructive) {
                    Task { await auth.signOut() }
                }
                Button(String(localized: "Cancel"), role: .cancel) {}
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
            .foregroundStyle(AirbnbPalette.text)
            .padding(.top, 10)
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
                    Circle()
                        .fill(SwaplSemanticLight.primary)
                        .frame(width: 118, height: 118)
                        .overlay {
                            Text(initials)
                                .font(.swaplDisplay(44, weight: .semibold))
                                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        }
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
            ProfileFeatureCard(title: String(localized: "Past trips"), subtitle: String(localized: "Your completed swaps"), systemImage: "suitcase.rolling")
            ProfileFeatureCard(title: String(localized: "Connections"), subtitle: String(localized: "Hosts you know"), systemImage: "person.2")
        }
    }

    private var becomeHostCard: some View {
        Button {
            if let myListing {
                editingListing = myListing
            } else {
                isCreatingListing = true
            }
        } label: {
            HStack(spacing: 18) {
                ZStack {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .fill(SwaplSemanticLight.accent)
                    Image(systemName: myListing == nil ? "house.and.flag" : "square.and.pencil")
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                }
                .frame(width: 86, height: 86)

                VStack(alignment: .leading, spacing: 6) {
                    Text(myListing == nil ? String(localized: "Become a host") : String(localized: "Edit your home"))
                        .font(.swaplDisplay(23, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(myListing.map { String(localized: "Update \"\($0.title)\" — photos, dates, amenities.") }
                        ?? String(localized: "Create your home listing and start proposing swaps."))
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
    private func loadMyListing() async {
        guard auth.session != nil else { return }
        do {
            let search = try await ListingRepository.shared.search(filters: SearchFilters())
            guard let id = search.viewerListingId else {
                myListing = nil
                return
            }
            myListing = try await ListingRepository.shared.detail(id: id).listing
        } catch {
            // Non-fatal: the card simply stays in "Become a host" mode.
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

    // Publish acknowledgment (DOK-162). The host picks the hosting mode and must
    // tick a self-attestation before a NEW listing can publish; never shown when
    // editing (the ack is logged once at create time).
    @State private var ackMode: PublishAckMode = .entireHomeWhileAway
    @State private var ackAccepted = false

    // Edit mode: when set, the wizard is prefilled from the published listing
    // and submit issues PUT /api/listings/{id} instead of POST /api/listings.
    private let editingListingId: String?
    private let onSaved: (() -> Void)?

    private let steps = ["Location", "Space", "Amenities", "Dates", "Review"]

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
            locationStep
        case 1:
            spaceStep
        case 2:
            amenitiesStep
        case 3:
            datesStep
        default:
            reviewStep
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

            AddressSearchField(text: $draft.address)
            // F23: Italian-market placeholder examples (was Istanbul / Cihangir
            // / Turkey). These are sample hints only, not stored values.
            ListingField(title: String(localized: "City"), text: $draft.city, placeholder: String(localized: "e.g. Roma"))
            ListingField(title: String(localized: "Neighbourhood"), text: $draft.neighbourhood, placeholder: String(localized: "e.g. Trastevere"))
            ListingField(title: String(localized: "Country"), text: $draft.country, placeholder: String(localized: "e.g. Italia"))
        }
    }

    private var spaceStep: some View {
        VStack(spacing: 14) {
            ListingField(title: "Title", text: $draft.title, placeholder: "Sunny apartment near the water")
            ListingLongField(title: "Description", text: $draft.description, placeholder: "Describe the home, light, neighbourhood, and what makes the stay easy.")
            ListingPicker(title: "Property type", selection: $draft.propertyType, values: ["APARTMENT", "HOUSE", "ROOM", "STUDIO"])
            StepperCard(title: "Size", value: $draft.sizeSqm, range: 20...800, suffix: "sqm", step: 5)
            StepperCard(title: "Guests", value: $draft.sleeps, range: 1...20, suffix: "guests")
            StepperCard(title: "Bedrooms", value: $draft.bedrooms, range: 0...15, suffix: "bedrooms")
            StepperCard(title: "Bathrooms", value: $draft.bathrooms, range: 0...10, suffix: "bathrooms")
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
            photosSection
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

    private func uploadPhotos(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        uploadingPhotos = true
        error = nil
        defer { uploadingPhotos = false }
        var urls: [String] = []
        for item in items {
            guard
                let data = try? await item.loadTransferable(type: Data.self),
                let jpeg = Self.downscaledJPEG(from: data)
            else { continue }
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
        if let amenities = extractedInfo.amenities {
            let normalized = Set(amenities.map { $0.lowercased() })
            balcony = normalized.contains("balcony")
            ac = normalized.contains("ac") || normalized.contains("air conditioning")
            washer = normalized.contains("washer")
            dishwasher = normalized.contains("dishwasher")
            wfhSetup = normalized.contains("workspace") || normalized.contains("desk")
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
            tags: tags
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
            }
            .padding(.horizontal, 18)
            .frame(height: 58)
            .background(SwaplSemanticLight.card, in: Capsule())
            .overlay {
                Capsule().stroke(AirbnbPalette.hairline)
            }
            Text("Only the approximate area is shown publicly.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
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

    func requestCurrentHomeLocation() {
        guard CLLocationManager.locationServicesEnabled() else {
            statusText = String(localized: "Location services are off. Enter the address manually.")
            return
        }

        switch manager.authorizationStatus {
        case .notDetermined:
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
            apply(city: city, country: country, address: address, location: location)
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
            apply(city: city, country: country, address: address, location: location)
        } catch {
            statusText = String(localized: "Location found, but address lookup failed. Enter the address manually.")
        }
    }

    private func apply(city: String, country: String, address: String, location: CLLocation) {
        detectedAddress = DetectedHomeAddress(
            city: city,
            neighbourhood: inferNeighbourhood(from: address, fallback: city),
            country: country,
            address: address,
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude
        )
        statusText = city.isEmpty ? "Location found. Add the address details manually." : "Filled from your current location."
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
