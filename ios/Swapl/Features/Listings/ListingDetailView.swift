import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class ListingDetailViewModel {
    let listingId: String
    var detail: ListingDetailResponse?
    var error: String?

    init(listingId: String) { self.listingId = listingId }

    func load() async {
        do {
            detail = try await ListingRepository.shared.detail(id: listingId)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ListingDetailView: View {
    @Environment(AuthService.self) private var auth
    @State private var vm: ListingDetailViewModel
    @State private var showPropose = false
    @State private var showReport = false

    init(listingId: String) {
        _vm = State(initialValue: ListingDetailViewModel(listingId: listingId))
    }

    var body: some View {
        ScrollView {
            if let d = vm.detail {
                VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                    CityIllust(palette: SwaplCityPalettes.forName(d.listing.palette))
                        .frame(height: 200)
                        .padding(.horizontal, SwaplSpacing.s4)

                    VStack(alignment: .leading, spacing: SwaplSpacing.s3) {
                        if let score = d.matchScore { MatchBadge(percent: score) }
                        Text(d.listing.title)
                            .font(.swaplDisplay(28))
                            .foregroundStyle(SwaplSemanticLight.foreground)
                        Text("\(d.listing.neighbourhood) · \(d.listing.city), \(d.listing.country)")
                            .font(.swaplBody(15))
                            .foregroundStyle(SwaplSemanticLight.mutedForeground)
                        Text(d.listing.description)
                            .font(.swaplBody(15))
                            .foregroundStyle(SwaplSemanticLight.foreground)

                        FlowLayout(items: amenityChips(d.listing))

                        NavigationLink(value: ListingDetailRoute.host(d.host.id)) {
                            SurfaceCard {
                                VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                                    KickerLabel(text: "Hosted by")
                                    Text(d.host.name ?? "Anonymous")
                                        .font(.swaplDisplay(20))
                                        .foregroundStyle(SwaplSemanticLight.foreground)
                                    if let bio = d.host.bio {
                                        Text(bio)
                                            .font(.swaplBody(14))
                                            .foregroundStyle(SwaplSemanticLight.mutedForeground)
                                    }
                                    if d.host.verified {
                                        TagChip(label: "ID verified")
                                    }
                                }
                            }
                        }
                        .buttonStyle(.plain)

                        proposeCTA(d)

                        Button("Report this listing") { showReport = true }
                            .font(.swaplBody(13))
                            .foregroundStyle(SwaplSemanticLight.destructive)
                            .padding(.top, SwaplSpacing.s2)
                    }
                    .padding(.horizontal, SwaplSpacing.s4)
                }
                .padding(.vertical, SwaplSpacing.s4)
            } else if let err = vm.error {
                Text(err).foregroundStyle(SwaplSemanticLight.destructive)
            } else {
                ProgressView().padding(40)
            }
        }
        .background(SwaplSemanticLight.background)
        .task { await vm.load() }
        .navigationDestination(for: ListingDetailRoute.self) { route in
            switch route {
            case .host(let id): PublicProfileView(userId: id)
            }
        }
        .sheet(isPresented: $showPropose) {
            if let viewerListingId = vm.detail?.viewerListingId, let targetId = vm.detail?.listing.id {
                ProposeSwapSheet(vm: ProposeSwapViewModel(
                    proposerListingId: viewerListingId,
                    targetListingId: targetId
                ))
            }
        }
        .sheet(isPresented: $showReport) {
            if let d = vm.detail {
                ReportSheet(targetUserId: d.host.id, listingId: d.listing.id)
            }
        }
    }

    enum ListingDetailRoute: Hashable {
        case host(String)
    }

    @ViewBuilder
    private func proposeCTA(_ d: ListingDetailResponse) -> some View {
        if auth.session == nil {
            PrimaryPill(title: "Sign in to propose", action: {}, isDisabled: true)
        } else if d.viewerListingId == nil {
            VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                PrimaryPill(title: "List your home first", action: {}, isDisabled: true)
                Text("Add your own listing before you can propose swaps.")
                    .font(.swaplBody(13))
                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
            }
        } else {
            PrimaryPill(title: "Propose a swap", action: { showPropose = true })
        }
    }

    private func amenityChips(_ l: Listing) -> [String] {
        var out: [String] = []
        if l.balcony { out.append("Balcony") }
        if l.rooftop { out.append("Rooftop") }
        if l.garden { out.append("Garden") }
        if l.courtyard { out.append("Courtyard") }
        if l.pool { out.append("Pool") }
        if l.piano { out.append("Piano") }
        if l.bikeIncluded { out.append("Bike incl.") }
        if l.hasParking { out.append("Parking") }
        if l.wfhSetup { out.append("WFH") }
        if l.petsAllowed { out.append("Pet-friendly") }
        if l.stepFreeAccess { out.append("Step-free") }
        if l.hasElevator { out.append("Elevator") }
        if l.ac { out.append("AC") }
        if l.dishwasher { out.append("Dishwasher") }
        if l.washer { out.append("Washer") }
        if l.dryer { out.append("Dryer") }
        return out
    }
}

struct FlowLayout: View {
    let items: [String]
    var body: some View {
        HStack(spacing: SwaplSpacing.s2) {
            ForEach(items.prefix(8), id: \.self) { TagChip(label: $0) }
            if items.count > 8 { TagChip(label: "+\(items.count - 8)") }
        }
    }
}
