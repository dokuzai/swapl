import SwiftUI
import MapKit
import Observation
import AppIntents
import SwaplDesignTokens

@MainActor
@Observable
final class ListingDetailViewModel {
    let listingId: String
    var detail: ListingDetailResponse?
    var error: String?
    var isLoading = false

    init(listingId: String) { self.listingId = listingId }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            detail = try await ListingRepository.shared.detail(id: listingId)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ListingDetailView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var vm: ListingDetailViewModel
    @State private var isShowingProposalSheet = false
    @State private var isShowingKeysStaySheet = false
    @State private var isEditingListing = false
    @State private var isShowingCalendarEditor = false
    @State private var isShowingOwnerVerification = false
    @State private var isShowingValuationExplainer = false
    @State private var sentProposalId: String?
    @State private var requestedStayId: String?

    init(listingId: String) {
        _vm = State(initialValue: ListingDetailViewModel(listingId: listingId))
    }

    var body: some View {
        // ZStack so the hero photo (in the ScrollView) bleeds to the true top
        // edge while the controls float over it as a sibling layer. There is no
        // system navigation bar — a bar would reserve a content inset and push
        // the photo down, leaving the cream band we're getting rid of.
        ZStack(alignment: .top) {
            ScrollView {
                if let detail = vm.detail {
                    listingContent(detail)
                } else if let error = vm.error {
                    SwaplEmptyState(
                        systemImage: "exclamationmark.triangle",
                        title: String(localized: "Home unavailable"),
                        description: error,
                        actionTitle: String(localized: "Try Again"),
                        action: { Task { await vm.load() } }
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.top, 80)
                } else {
                    // Full-bleed placeholder so the push animation doesn't show a
                    // narrow strip of content over the system background.
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 400)
                        .accessibilityLabel("Loading home")
                }
            }
            .frame(maxWidth: .infinity)
            // Let the hero photo bleed all the way to the top edge, under the
            // status bar and the floating controls.
            .ignoresSafeArea(edges: .top)
            // Soft cream dissolve at the very top edge so the hero melts into the
            // background under the status bar / floating controls (same treatment
            // as the Explore map's top fade) — no hard photo edge, no header band.
            .overlay(alignment: .top) { heroTopFade }
            .background(SwaplSemanticLight.background.ignoresSafeArea())

            // Floating glass controls — back / city / share + heart — sit
            // directly on the fading photo. The ZStack respects the top safe
            // area, so they land just below the status bar.
            if let detail = vm.detail {
                floatingHeader(detail)
            }
        }
        // No system nav bar at all (its content inset is what pushed the photo
        // down). Swipe-to-go-back is preserved via the UINavigationController
        // gesture delegate restored in SwaplApp.
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .safeAreaInset(edge: .bottom) {
            if let detail = vm.detail {
                if isOwner(detail) {
                    ownerCTA(detail)
                } else {
                    proposalCTA(detail)
                }
            }
        }
        .fullScreenCover(isPresented: $isEditingListing) {
            if let listing = vm.detail?.listing {
                ListingCreationView(editing: listing) {
                    Task { await vm.load() }
                }
            }
        }
        .sheet(isPresented: $isShowingCalendarEditor, onDismiss: { Task { await vm.load() } }) {
            if let listing = vm.detail?.listing {
                ListingCalendarEditorView(listingId: listing.id, listingTitle: listing.title)
            }
        }
        .sheet(isPresented: $isShowingOwnerVerification, onDismiss: { Task { await vm.load() } }) {
            if let listing = vm.detail?.listing {
                OwnerVerificationSheet(listingId: listing.id)
            }
        }
        .sheet(isPresented: $isShowingValuationExplainer) {
            if let listing = vm.detail?.listing, let explanation = listing.valuationExplanation {
                NightlyKeysExplainerSheet(listing: listing, explanation: explanation)
            }
        }
        .sheet(isPresented: $isShowingProposalSheet) {
            if let detail = vm.detail, let viewerListingId = detail.viewerListingId {
                ProposalSheetView(detail: detail, proposerListingId: viewerListingId) { proposalId in
                    sentProposalId = proposalId
                    isShowingProposalSheet = false
                }
            }
        }
        .sheet(isPresented: $isShowingKeysStaySheet) {
            if let listing = vm.detail?.listing {
                StayWithKeysSheet(listing: listing) { stayId in
                    requestedStayId = stayId
                    isShowingKeysStaySheet = false
                }
            }
        }
        .alert("Proposal sent", isPresented: proposalSentBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("You can follow the conversation from Messages.")
        }
        .alert("Stay requested", isPresented: stayRequestedBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Your points are held until the host confirms. Track it under Trips.")
        }
        .task { await vm.load() }
        // Onscreen awareness: tell the system which home is on screen so Siri /
        // Apple Intelligence can resolve "open this home" against the entity.
        .userActivity(SwaplActivity.viewingListing, isActive: vm.detail != nil) { activity in
            SwaplActivity.annotate(
                activity,
                entity: EntityIdentifier(for: ListingEntity.self, identifier: vm.listingId),
                title: vm.detail?.listing.title
            )
        }
    }

    // Web origin for shareable listing links. Kept as a constant rather than
    // derived from the API base URL, which points at localhost in development;
    // app.swapl.fun is also the universal-link domain (see DeepLinkRouter).
    private static let shareOrigin = "https://app.swapl.fun"

    private func shareLink(_ detail: ListingDetailResponse) -> some View {
        let listing = detail.listing
        let url = URL(string: "\(Self.shareOrigin)/listings/\(listing.id)")!
        let summary = "\(listing.neighbourhood) · \(listing.city) on Swapl"
        // Text-only preview: the cover photo would need a fetch before the
        // share sheet opens, so we stay robust and skip it.
        return ShareLink(
            item: url,
            subject: Text(summary),
            message: Text(summary),
            preview: SharePreview(summary)
        ) {
            Image(systemName: "square.and.arrow.up")
                .font(.system(size: 18))
                .foregroundStyle(AirbnbPalette.text)
        }
        .accessibilityLabel("Share listing")
    }

    private var proposalSentBinding: Binding<Bool> {
        Binding(
            get: { sentProposalId != nil },
            set: { if !$0 { sentProposalId = nil } }
        )
    }

    private var stayRequestedBinding: Binding<Bool> {
        Binding(
            get: { requestedStayId != nil },
            set: { if !$0 { requestedStayId = nil } }
        )
    }

    // Cream gradient that fades the hero photo into the background at the top
    // edge, keeping the floating glass controls legible without an opaque band.
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

    // Floating header rendered over the hero photo (no system nav bar): back on
    // the left, city pill centered, share + favorite grouped on the right — all
    // Liquid Glass so they stay legible against the photo.
    private func floatingHeader(_ detail: ListingDetailResponse) -> some View {
        ZStack {
            Text(detail.listing.city)
                .font(.swaplBody(16, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
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

                HStack(spacing: 2) {
                    shareLink(detail)
                        .frame(width: 44, height: 44)
                    if !isOwner(detail) {
                        FavoriteHeartButton(
                            listingId: detail.listing.id,
                            size: 18,
                            unfilledColor: AirbnbPalette.text,
                            showsShadow: false
                        )
                        .frame(width: 44, height: 44)
                    }
                }
                .glassEffect(.regular, in: .capsule)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private func listingContent(_ detail: ListingDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 26) {
            // Color.clear defines the layout size (full width × 330) so the
            // scaledToFill photos — which report an oversized width — can never
            // widen the enclosing column and push content off-screen.
            Color.clear
                .frame(maxWidth: .infinity)
                // Taller than before: the hero now bleeds under the nav bar, so
                // the extra height keeps a generous photo visible below the
                // floating controls.
                .frame(height: 380)
                .overlay {
                    ListingPhotoGalleryView(listing: detail.listing)
                }
                .clipped()

            VStack(alignment: .leading, spacing: 12) {
                Text(detail.listing.title)
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(3)

                Text("\(detail.listing.neighbourhood), \(detail.listing.city), \(detail.listing.country)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.text)

                Text("\(detail.listing.sleeps) guests · \(detail.listing.bedrooms) bedrooms · \(detail.listing.bathrooms) baths")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.secondaryText)

                // DOK-160: clear private-room badge (with rooms when >1) so guests
                // immediately see this is a single room, not the whole home.
                if detail.listing.isPrivateRoom {
                    privateRoomBadge(detail.listing)
                }

                if let score = detail.matchScore {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                        Text("\(score)% match for your next swap")
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(AirbnbPalette.softBackground, in: Capsule())
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 22)

            Divider().padding(.horizontal, 22)

            hostSection(detail)
            descriptionSection(detail.listing.description)
            amenitySection(detail.listing)
            locationSection(detail.listing)
            if isOwner(detail) {
                nightlyKeysEntry(detail.listing)
                ownerVerificationEntry(detail)
            }
        }
        .padding(.bottom, 110)
    }

    // DOK-160: private-room badge shown to everyone near the specs. Surfaces the
    // rooms offered when more than one, and notes the reduced nightly Keys (the
    // server already discounts the value for a single room).
    private func privateRoomBadge(_ listing: Listing) -> some View {
        let rooms = listing.roomsOffered ?? 1
        return HStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "bed.double")
                    .font(.system(size: 13, weight: .semibold))
                Text(rooms > 1
                    ? String(localized: "Private room · \(rooms) rooms")
                    : String(localized: "Private room"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
            }
            .foregroundStyle(SwaplSemanticLight.primary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(SwaplSemanticLight.accent, in: Capsule())

            if let nightly = listing.nightlyKeys {
                Text("\(nightly) points / night")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
        .padding(.top, 2)
    }

    // DOK-163: owner-only "How your nightly Keys are calculated" entry. Shows the
    // persisted nightly value right on the card and, on tap, opens the full
    // reassuring breakdown. Rendered only when the server returned a structured
    // explanation (owner-only field), so it never appears for guests.
    @ViewBuilder
    private func nightlyKeysEntry(_ listing: Listing) -> some View {
        if let explanation = listing.valuationExplanation {
            let nightly = explanation.nightlyKeys ?? listing.nightlyKeys ?? 0
            Button {
                isShowingValuationExplainer = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "key.horizontal.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                        .frame(width: 44, height: 44)
                        .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.small, style: .continuous))

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text("\(nightly) points / night")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                                .foregroundStyle(AirbnbPalette.text)
                            if listing.isPrivateRoom {
                                Text("Private room")
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.tiny, weight: .semibold))
                                    .foregroundStyle(SwaplSemanticLight.primary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(SwaplSemanticLight.accent, in: Capsule())
                            }
                        }
                        Text("How your nightly Keys are calculated")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                .padding(14)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 22)
        }
    }

    // DOK-162: optional owner-proof entry, owner-only. Clearly framed as a trust
    // boost, never a requirement — publishing is never gated on this.
    private func ownerVerificationEntry(_ detail: ListingDetailResponse) -> some View {
        Button {
            isShowingOwnerVerification = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: detail.listing.ownerVerified == true ? "seal.fill" : "seal")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)

                VStack(alignment: .leading, spacing: 2) {
                    Text(detail.listing.ownerVerified == true
                        ? String(localized: "You're a verified owner")
                        : String(localized: "Verified owner badge — optional"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    Text(detail.listing.ownerVerified == true
                        ? String(localized: "Your home carries the Verified owner badge.")
                        : String(localized: "A trust boost for guests. Never required to publish or swap."))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(14)
            .background(AirbnbPalette.softBackground, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 22)
    }

    private func hostSection(_ detail: ListingDetailResponse) -> some View {
        HStack(spacing: 16) {
            Circle()
                .fill(SwaplSemanticLight.primary)
                .frame(width: 58, height: 58)
                .overlay(
                    Text(String((detail.host.name ?? "H").prefix(1)))
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text("Hosted by \(detail.host.name ?? String(localized: "Anonymous"))")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(detail.host.verified ? String(localized: "Verified host") : String(localized: "Swapl host"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                // DOK-162: discreet trust badge once an admin approved owner proof.
                if detail.listing.ownerVerified == true {
                    VerifiedOwnerBadge()
                        .padding(.top, 2)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 22)
    }

    private func descriptionSection(_ description: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("About this home")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text(description)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                .foregroundStyle(AirbnbPalette.text)
                .lineSpacing(4)
        }
        .padding(.horizontal, 22)
    }

    private func amenitySection(_ listing: Listing) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("What this place offers")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 14) {
                ForEach(amenityChips(listing).prefix(10), id: \.self) { amenity in
                    HStack(spacing: 10) {
                        Image(systemName: amenityIcon(amenity))
                            .frame(width: 22)
                        Text(amenityLabel(amenity))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    }
                    .foregroundStyle(AirbnbPalette.text)
                }
            }
        }
        .padding(.horizontal, 22)
    }

    // Approximate-area map (DOK-182 privacy): the server fuzzes lat/lng to a
    // ~2km area for non-owners, so we render a soft circle, not a precise pin —
    // the guest sees the neighbourhood they're heading to without the exact door.
    @ViewBuilder
    private func locationSection(_ listing: Listing) -> some View {
        if let lat = listing.lat, let lng = listing.lng {
            let center = CLLocationCoordinate2D(latitude: lat, longitude: lng)
            VStack(alignment: .leading, spacing: 12) {
                Text("Where you'll be")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Map(initialPosition: .region(MKCoordinateRegion(
                    center: center, latitudinalMeters: 4500, longitudinalMeters: 4500
                )), interactionModes: []) {
                    MapCircle(center: center, radius: 1500)
                        .foregroundStyle(SwaplSemanticLight.primary.opacity(0.14))
                        .stroke(SwaplSemanticLight.primary.opacity(0.45), lineWidth: 1.5)
                }
                .mapStyle(.standard(pointsOfInterest: .excludingAll))
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
                .allowsHitTesting(false)
                HStack(spacing: 6) {
                    Image(systemName: "mappin.and.ellipse")
                    Text("\(listing.neighbourhood), \(listing.city) · approximate area")
                }
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(.horizontal, 22)
        }
    }

    private func isOwner(_ detail: ListingDetailResponse) -> Bool {
        guard let userId = auth.session?.id else { return false }
        return detail.listing.userId == userId
    }

    // Shown instead of the proposal bar when the viewer owns this listing.
    private func ownerCTA(_ detail: ListingDetailResponse) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text("This is your home")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text("Update details, photos and dates")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer()
            Button {
                isShowingCalendarEditor = true
            } label: {
                Label("Dates", systemImage: "calendar")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(SwaplSemanticLight.accent, in: Capsule())
            }
            .accessibilityLabel("Manage availability dates")
            Button {
                isEditingListing = true
            } label: {
                Label("Edit", systemImage: "square.and.pencil")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(SwaplSemanticLight.primary, in: Capsule())
            }
            .accessibilityLabel("Edit listing")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        // Floating Liquid Glass card, inset from the edges — not an edge-to-edge
        // band. Content scrolls underneath it.
        .glassEffect(.regular, in: .rect(cornerRadius: 28))
        .padding(.horizontal, 14)
        .padding(.bottom, 6)
    }

    // Two ways to book this home, side by side (DOK-155): the direct
    // simultaneous swap ("Propose"), and the one-directional Stay-with-Keys
    // ("Stay with points"). Keys mode sits ALONGSIDE swaps, never replacing it.
    private func proposalCTA(_ detail: ListingDetailResponse) -> some View {
        VStack(spacing: 10) {
            HStack {
                Text(SwaplDateText.range(from: detail.listing.availableFrom, to: detail.listing.availableTo))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                Text(detail.viewerListingId == nil ? String(localized: "Create a listing to swap") : String(localized: "Swap or stay with points"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }

            HStack(spacing: 12) {
                // Stay with points — needs no listing of your own, so it stays
                // enabled even when the viewer hasn't published a home.
                Button {
                    isShowingKeysStaySheet = true
                } label: {
                    Label("Stay with points", systemImage: "key.horizontal")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(SwaplSemanticLight.accent, in: Capsule())
                }
                .buttonStyle(.plain)

                // Propose a direct swap — requires the viewer's own listing.
                Button {
                    isShowingProposalSheet = true
                } label: {
                    Text("Propose")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(SwaplSemanticLight.primary, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(detail.viewerListingId == nil)
                .opacity(detail.viewerListingId == nil ? 0.45 : 1)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        // Floating Liquid Glass card, inset from the edges — not an edge-to-edge
        // band. Content scrolls underneath it.
        .glassEffect(.regular, in: .rect(cornerRadius: 28))
        .padding(.horizontal, 14)
        .padding(.bottom, 6)
    }

    private func amenityChips(_ l: Listing) -> [String] {
        var out: [String] = []
        if l.balcony { out.append("Balcony") }
        if l.rooftop { out.append("Rooftop") }
        if l.garden { out.append("Garden") }
        if l.courtyard { out.append("Courtyard") }
        if l.pool { out.append("Pool") }
        if l.piano { out.append("Piano") }
        if l.bikeIncluded { out.append("Bike included") }
        if l.hasParking { out.append("Parking") }
        if l.wfhSetup { out.append("Workspace") }
        if l.petsAllowed { out.append("Pet friendly") }
        if l.stepFreeAccess { out.append("Step-free") }
        if l.hasElevator { out.append("Elevator") }
        if l.ac { out.append("Air conditioning") }
        if l.dishwasher { out.append("Dishwasher") }
        if l.washer { out.append("Washer") }
        if l.dryer { out.append("Dryer") }
        return out
    }

    // The amenity strings double as icon-mapping keys (English); the displayed
    // label is localized here without disturbing that mapping.
    private func amenityLabel(_ amenity: String) -> String {
        switch amenity {
        case "Balcony": return String(localized: "Balcony")
        case "Rooftop": return String(localized: "Rooftop")
        case "Garden": return String(localized: "Garden")
        case "Courtyard": return String(localized: "Courtyard")
        case "Pool": return String(localized: "Pool")
        case "Piano": return String(localized: "Piano")
        case "Bike included": return String(localized: "Bike included")
        case "Parking": return String(localized: "Parking")
        case "Workspace": return String(localized: "Workspace")
        case "Pet friendly": return String(localized: "Pet friendly")
        case "Step-free": return String(localized: "Step-free")
        case "Elevator": return String(localized: "Elevator")
        case "Air conditioning": return String(localized: "Air conditioning")
        case "Dishwasher": return String(localized: "Dishwasher")
        case "Washer": return String(localized: "Washer")
        case "Dryer": return String(localized: "Dryer")
        default: return amenity
        }
    }

    private func amenityIcon(_ amenity: String) -> String {
        switch amenity {
        case "Balcony", "Rooftop", "Garden", "Courtyard": "leaf"
        case "Pool": "water.waves"
        case "Bike included": "bicycle"
        case "Parking": "parkingsign"
        case "Workspace": "desktopcomputer"
        case "Pet friendly": "pawprint"
        case "Step-free", "Elevator": "figure.roll"
        case "Air conditioning": "snowflake"
        case "Washer", "Dryer": "washer"
        default: "checkmark.circle"
        }
    }
}

struct ProposalSheetView: View {
    let detail: ListingDetailResponse
    let proposerListingId: String
    let onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthService.self) private var auth
    @State private var dateFrom: Date
    @State private var dateTo: Date
    @State private var message = ""
    @State private var error: String?
    @State private var isSubmitting = false

    // "Draft with AI" state.
    @State private var isDrafting = false
    @State private var draftCaption: String?   // "Drafted on-device" / "Drafted with AI"
    @State private var draftError: String?
    @State private var undoText: String?       // one-step undo of a replaced message

    init(detail: ListingDetailResponse, proposerListingId: String, onCreated: @escaping (String) -> Void) {
        self.detail = detail
        self.proposerListingId = proposerListingId
        self.onCreated = onCreated
        let defaults = Self.defaultDates(for: detail.listing)
        _dateFrom = State(initialValue: defaults.from)
        _dateTo = State(initialValue: defaults.to)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("From", selection: $dateFrom, displayedComponents: .date)
                    DatePicker("To", selection: $dateTo, displayedComponents: .date)
                } footer: {
                    Text("Choose dates that fit both homes' availability.")
                }

                Section("Message") {
                    TextEditor(text: $message)
                        .frame(minHeight: 120)

                    draftWithAIRow
                }

                if let error {
                    Section {
                        Text(error)
                            .foregroundStyle(SwaplSemanticLight.destructive)
                    }
                }
            }
            .navigationTitle("Propose a swap")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? String(localized: "Sending") : String(localized: "Send")) {
                        Task { await submit() }
                    }
                    .disabled(isSubmitting || dateTo <= dateFrom)
                }
            }
        }
    }

    // MARK: - Draft with AI

    private var draftWithAIRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Button {
                    Task { await draftWithAI() }
                } label: {
                    HStack(spacing: 8) {
                        if isDrafting {
                            ProgressView()
                                .controlSize(.small)
                                .tint(SwaplSemanticLight.primary)
                        } else {
                            Image(systemName: "sparkles")
                        }
                        Text(isDrafting ? String(localized: "Drafting…") : String(localized: "Draft with AI"))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    }
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .background(SwaplSemanticLight.accent, in: Capsule())
                }
                .buttonStyle(.borderless)
                .disabled(isDrafting)
                .accessibilityLabel(isDrafting ? "Drafting message with AI" : "Draft message with AI")

                if undoText != nil {
                    Button("Undo") {
                        if let previous = undoText {
                            message = previous
                            undoText = nil
                            draftCaption = nil
                        }
                    }
                    .buttonStyle(.borderless)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .frame(minHeight: 44)
                    .accessibilityLabel("Undo AI draft, restore your previous message")
                }
            }

            if let draftCaption {
                Text(draftCaption)
                    .font(.swaplMono(SwaplDesignSystem.FontSize.tiny))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            if let draftError {
                Text(draftError)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(SwaplSemanticLight.destructive)
            }
        }
        .padding(.vertical, 2)
    }

    private func draftWithAI() async {
        isDrafting = true
        draftError = nil
        defer { isDrafting = false }
        do {
            let draft = try await ProposalDraftEngine.draft(
                proposerListingId: proposerListingId,
                targetListing: detail.listing,
                viewerName: auth.session?.name,
                viewerUserId: auth.session?.id,
                dateFrom: SwaplDateText.apiString(from: dateFrom),
                dateTo: SwaplDateText.apiString(from: dateTo)
            )
            // Keep one-step undo when replacing text the user already typed.
            let existing = message.trimmingCharacters(in: .whitespacesAndNewlines)
            undoText = existing.isEmpty ? nil : message
            message = draft.message
            draftCaption = draft.onDevice ? String(localized: "Drafted on-device") : String(localized: "Drafted with AI")
        } catch APIClient.APIError.status(429, _) {
            draftError = String(localized: "Too many drafts — try again in a few minutes.")
        } catch {
            draftError = String(localized: "Couldn't draft a message right now. You can still write your own.")
        }
    }

    private func submit() async {
        guard dateTo > dateFrom else {
            error = String(localized: "End date must be after start.")
            return
        }
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }
        do {
            let draft = ProposalDraft(
                proposerListingId: proposerListingId,
                targetListingId: detail.listing.id,
                dateFrom: SwaplDateText.apiString(from: dateFrom),
                dateTo: SwaplDateText.apiString(from: dateTo),
                message: message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : message
            )
            let response = try await ProposalRepository.shared.create(draft)
            onCreated(response.id)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private static func defaultDates(for listing: Listing) -> (from: Date, to: Date) {
        let from = SwaplDateText.parse(listing.availableFrom) ?? Date()
        let to = SwaplDateText.parse(listing.availableTo) ?? Calendar.current.date(byAdding: .day, value: 7, to: from) ?? from
        return (from, max(to, from))
    }
}
