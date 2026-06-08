import SwiftUI
import Observation
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
    @State private var vm: ListingDetailViewModel
    @State private var isShowingProposalSheet = false
    @State private var sentProposalId: String?

    init(listingId: String) {
        _vm = State(initialValue: ListingDetailViewModel(listingId: listingId))
    }

    var body: some View {
        ScrollView {
            if let detail = vm.detail {
                listingContent(detail)
            } else if let error = vm.error {
                ContentUnavailableView {
                    Label("Home unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try Again") { Task { await vm.load() } }
                }
                .padding(.top, 80)
            } else {
                ProgressView()
                    .padding(40)
                    .accessibilityLabel("Loading home")
            }
        }
        .background(AirbnbPalette.background)
        .navigationTitle(vm.detail?.listing.city ?? "Home")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if let detail = vm.detail {
                proposalCTA(detail)
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
        .alert("Proposal sent", isPresented: proposalSentBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("You can follow the conversation from Messages.")
        }
        .task { await vm.load() }
    }

    private var proposalSentBinding: Binding<Bool> {
        Binding(
            get: { sentProposalId != nil },
            set: { if !$0 { sentProposalId = nil } }
        )
    }

    private func listingContent(_ detail: ListingDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 26) {
            // Color.clear defines the layout size (full width × 330) so the
            // scaledToFill photo — which reports an oversized width — can never
            // widen the enclosing column and push content off-screen.
            Color.clear
                .frame(maxWidth: .infinity)
                .frame(height: 330)
                .overlay {
                    ListingPhotoView(listing: detail.listing, cornerRadius: 0)
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
        }
        .padding(.bottom, 110)
    }

    private func hostSection(_ detail: ListingDetailResponse) -> some View {
        HStack(spacing: 16) {
            Circle()
                .fill(AirbnbPalette.primary)
                .frame(width: 58, height: 58)
                .overlay(
                    Text(String((detail.host.name ?? "H").prefix(1)))
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text("Hosted by \(detail.host.name ?? "Anonymous")")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(detail.host.verified ? "Verified host" : "Swapl host")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
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
                        Text(amenity)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    }
                    .foregroundStyle(AirbnbPalette.text)
                }
            }
        }
        .padding(.horizontal, 22)
    }

    private func proposalCTA(_ detail: ListingDetailResponse) -> some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(SwaplDateText.range(from: detail.listing.availableFrom, to: detail.listing.availableTo))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(detail.viewerListingId == nil ? "Create a listing first" : "Send a swap proposal")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer()
            Button {
                isShowingProposalSheet = true
            } label: {
                Text("Propose")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(AirbnbPalette.primaryForeground)
                    .padding(.horizontal, 26)
                    .padding(.vertical, 15)
                    .background(AirbnbPalette.primary, in: Capsule())
            }
            .disabled(detail.viewerListingId == nil)
            .opacity(detail.viewerListingId == nil ? 0.45 : 1)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 14)
        .background(AirbnbPalette.card)
        .overlay(alignment: .top) {
            AirbnbPalette.hairline.frame(height: 1)
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
    @State private var dateFrom: Date
    @State private var dateTo: Date
    @State private var message = ""
    @State private var error: String?
    @State private var isSubmitting = false

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
                }

                if let error {
                    Section {
                        Text(error)
                            .foregroundStyle(AirbnbPalette.destructive)
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
                    Button(isSubmitting ? "Sending" : "Send") {
                        Task { await submit() }
                    }
                    .disabled(isSubmitting || dateTo <= dateFrom)
                }
            }
        }
    }

    private func submit() async {
        guard dateTo > dateFrom else {
            error = "End date must be after start."
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
