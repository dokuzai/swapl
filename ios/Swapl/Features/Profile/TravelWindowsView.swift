import SwiftUI
import Observation
import SwaplDesignTokens

// Travel windows editor (DOK-161). Add/remove date windows with optional
// destinations + notes, a live counter, and an upsell when the create POST
// returns 402 (the server's plan-cap copy is shown verbatim). Each window
// expands into its AI proposals — real homes free for the exact dates — each
// with a match badge and a tap-through to the listing (direct swap /
// Stay-with-Keys). Mirrors app/app/account/travel-windows/editor.tsx.
@MainActor
@Observable
final class TravelWindowsViewModel {
    var items: [TravelWindow] = []
    var error: String?
    var hasLoaded = false

    // Upsell copy from a 402 on create — surfaced verbatim (it carries the
    // member's current plan + cap), cleared on any successful create/delete.
    var upsell: String?

    var isCreating = false

    func load() async {
        defer { hasLoaded = true }
        do { items = try await TravelWindowRepository.shared.list() }
        catch { self.error = error.localizedDescription }
    }

    func create(dateFrom: Date, dateTo: Date, flexible: Bool, destinations: [String], notes: String) async -> Bool {
        isCreating = true
        error = nil
        defer { isCreating = false }
        do {
            let window = try await TravelWindowRepository.shared.create(
                dateFrom: SwaplDateText.apiString(from: dateFrom),
                dateTo: SwaplDateText.apiString(from: dateTo),
                flexible: flexible,
                destinations: destinations,
                notes: notes
            )
            items.append(window)
            items.sort { $0.dateFrom < $1.dateFrom }
            upsell = nil
            return true
        } catch APIClient.APIError.status(402, let body) {
            // The 402 body's `error` is the plan-cap upsell copy.
            upsell = APIClient.APIError.status(402, body).errorDescription
            return false
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func delete(_ window: TravelWindow) async {
        // Optimistic: drop locally, restore on failure.
        let snapshot = items
        items.removeAll { $0.id == window.id }
        upsell = nil
        do { try await TravelWindowRepository.shared.delete(id: window.id) }
        catch {
            items = snapshot
            self.error = error.localizedDescription
        }
    }
}

struct TravelWindowsView: View {
    @State private var vm = TravelWindowsViewModel()
    @State private var isAdding = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let upsell = vm.upsell {
                    UpsellCard(reason: upsell)
                }

                if let error = vm.error {
                    Text(error)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                        .foregroundStyle(AirbnbPalette.destructive)
                }

                if vm.items.isEmpty && vm.hasLoaded {
                    SwaplEmptyState(
                        systemImage: "calendar.badge.plus",
                        title: "No travel windows yet",
                        description: "Tell us when you'd like to travel — we'll bring you ready-made swaps for those dates."
                    )
                    .padding(.top, 8)
                } else {
                    ForEach(vm.items) { window in
                        TravelWindowCard(window: window, onRemove: { Task { await vm.delete(window) } })
                    }
                }
            }
            .padding(22)
        }
        .background(SwaplSemanticLight.background)
        .navigationTitle("Travel windows")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isAdding = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                }
                .accessibilityLabel("Add a travel window")
            }
        }
        .sheet(isPresented: $isAdding) {
            AddTravelWindowSheet(vm: vm)
        }
        .task { await vm.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "calendar.badge.clock")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                Text(vm.items.isEmpty ? "When do you want to go?" : "\(vm.items.count) saved")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
            }
            Text("Save the dates you're dreaming about. The assistant composes swaps from real homes that are free exactly then.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
    }
}

// MARK: - Upsell

private struct UpsellCard: View {
    let reason: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            KickerLabel(text: "Plus / Pro")
            Text("You've reached your plan's travel-window limit")
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text(reason)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AirbnbPalette.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }
}

// MARK: - Window card

private struct TravelWindowCard: View {
    let window: TravelWindow
    let onRemove: () -> Void

    @State private var showingProposals = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(window.rangeLabel)
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    HStack(spacing: 8) {
                        if window.flexible {
                            Text("Flexible")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.tiny, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.secondaryText)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(AirbnbPalette.softBackground, in: Capsule())
                        }
                        Text(window.destinations.isEmpty ? "Anywhere" : window.destinations.joined(separator: " · "))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .lineLimit(1)
                    }
                    if let notes = window.notes, !notes.isEmpty {
                        Text(notes)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                    }
                }
                Spacer(minLength: 12)
                Button(role: .destructive, action: onRemove) {
                    Image(systemName: "trash")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                .accessibilityLabel("Remove this travel window")
            }

            Divider().padding(.vertical, 14)

            Button {
                withAnimation(.snappy) { showingProposals.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 13, weight: .semibold))
                    Text(showingProposals ? "Hide swaps for these dates" : "Show swaps for these dates")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .bold))
                        .rotationEffect(.degrees(showingProposals ? 180 : 0))
                }
                .foregroundStyle(SwaplSemanticLight.primary)
            }
            .buttonStyle(.plain)

            if showingProposals {
                WindowProposalsSection(windowId: window.id)
                    .padding(.top, 14)
            }
        }
        .padding(16)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
    }
}

// MARK: - Proposals

@MainActor
@Observable
private final class WindowProposalsViewModel {
    enum State {
        case loading
        case noListing
        case error(String)
        case ready([WindowProposal])
    }

    var state: State = .loading

    func load(windowId: String) async {
        state = .loading
        do {
            let result = try await TravelWindowRepository.shared.proposals(windowId: windowId)
            state = .ready(result.proposals)
        } catch APIClient.APIError.status(409, let body) {
            if (body ?? "").contains("NO_ACTIVE_LISTING") {
                state = .noListing
            } else {
                state = .error(APIClient.APIError.status(409, body).errorDescription ?? "Couldn't load swaps.")
            }
        } catch {
            state = .error(error.localizedDescription)
        }
    }
}

private struct WindowProposalsSection: View {
    let windowId: String
    @State private var vm = WindowProposalsViewModel()

    var body: some View {
        Group {
            switch vm.state {
            case .loading:
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Finding homes free for your dates…")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            case .noListing:
                Text("Add an active listing first — a swap needs two homes.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            case .error(let message):
                Text(message)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                    .foregroundStyle(AirbnbPalette.destructive)
            case .ready(let proposals):
                if proposals.isEmpty {
                    Text("Nothing free for these exact dates yet — we'll keep watching and email you when a match appears.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                } else {
                    VStack(spacing: 12) {
                        ForEach(proposals) { proposal in
                            WindowProposalCard(proposal: proposal)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task { await vm.load(windowId: windowId) }
    }
}

private struct WindowProposalCard: View {
    let proposal: WindowProposal

    var body: some View {
        NavigationLink {
            ListingDetailView(listingId: proposal.listingId)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                photo
                VStack(alignment: .leading, spacing: 8) {
                    Text(proposal.locationText)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    if proposal.matchesDestination {
                        Label("On your wishlist destinations", systemImage: "star.fill")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.tiny, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                    }
                    Text(proposal.why)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .multilineTextAlignment(.leading)
                    modeChips
                }
                .padding(14)
            }
            .background(SwaplSemanticLight.background, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(proposal.title) in \(proposal.locationText), \(proposal.matchScore) percent match")
    }

    private var photo: some View {
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: SwaplDesignSystem.CornerRadius.medium,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: SwaplDesignSystem.CornerRadius.medium,
            style: .continuous
        )
        return Color.clear
            .frame(height: 150)
            .frame(maxWidth: .infinity)
            .overlay {
                if let raw = proposal.photo, let url = URL(string: raw) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image): image.resizable().scaledToFill()
                        case .failure: fallback
                        case .empty: ZStack { AirbnbPalette.softBackground; ProgressView() }
                        @unknown default: AirbnbPalette.softBackground
                        }
                    }
                } else {
                    fallback
                }
            }
            .overlay(alignment: .topLeading) {
                Text("\(proposal.matchScore)% match")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(.white, in: Capsule())
                    .padding(10)
            }
            .clipShape(shape)
    }

    private var fallback: some View {
        ZStack {
            let palette = SwaplCityPalettes.forName("warm")
            palette.sky
            CityIllust(palette: palette)
        }
    }

    private var modeChips: some View {
        HStack(spacing: 8) {
            if proposal.modes.directSwap {
                chip("Direct swap", system: "arrow.left.arrow.right", filled: true)
            }
            if proposal.modes.keysStay {
                let keys = (proposal.nightlyKeys ?? 0) > 0 ? " · \(proposal.nightlyKeys!) Keys/night" : ""
                chip("Stay with Keys\(keys)", system: "key.fill", filled: false)
            }
        }
    }

    private func chip(_ text: String, system: String, filled: Bool) -> some View {
        Label(text, systemImage: system)
            .font(.swaplBody(SwaplDesignSystem.FontSize.tiny, weight: .semibold))
            .foregroundStyle(filled ? Color.white : SwaplSemanticLight.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                filled ? AnyShapeStyle(SwaplSemanticLight.primary) : AnyShapeStyle(AirbnbPalette.accent),
                in: Capsule()
            )
    }
}

// MARK: - Add sheet

private struct AddTravelWindowSheet: View {
    @Bindable var vm: TravelWindowsViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var dateFrom = Date()
    @State private var dateTo = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    @State private var flexible = false
    @State private var destinations = ""
    @State private var notes = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    datesCard
                    Toggle(isOn: $flexible.animation(.snappy)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("My dates are flexible")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                            Text("We'll widen the search around these days.")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                                .foregroundStyle(AirbnbPalette.secondaryText)
                        }
                    }
                    .tint(SwaplSemanticLight.primary)

                    field(
                        title: "Where to? (optional)",
                        hint: "Comma-separated cities or countries — leave empty for anywhere.",
                        text: $destinations,
                        placeholder: "Lisbon, Portugal, Barcelona"
                    )
                    field(
                        title: "Notes (optional)",
                        hint: nil,
                        text: $notes,
                        placeholder: "Anniversary trip, want somewhere walkable…"
                    )

                    PrimaryPill(
                        title: "Save travel window",
                        action: { Task { await save() } },
                        isLoading: vm.isCreating,
                        isDisabled: dateTo <= dateFrom
                    )
                    if dateTo <= dateFrom {
                        Text("Your end date must be after the start date.")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                            .foregroundStyle(AirbnbPalette.destructive)
                    }
                }
                .padding(22)
            }
            .background(SwaplSemanticLight.background)
            .navigationTitle("Add a travel window")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .tint(AirbnbPalette.text)
                }
            }
        }
    }

    private func save() async {
        let dests = destinations
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let ok = await vm.create(
            dateFrom: dateFrom,
            dateTo: dateTo,
            flexible: flexible,
            destinations: dests,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        if ok { dismiss() }
        // On a 402, the sheet stays open and the upsell shows on the list
        // behind it; close so the member sees it.
        else if vm.upsell != nil { dismiss() }
    }

    private var datesCard: some View {
        VStack(spacing: 0) {
            DatePicker("From", selection: $dateFrom, in: Date()..., displayedComponents: .date)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .padding(.vertical, 6)
            Divider()
            DatePicker("To", selection: $dateTo, in: dateFrom..., displayedComponents: .date)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .padding(.vertical, 6)
        }
        .padding(.horizontal, 14)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
    }

    private func field(title: String, hint: String?, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            TextField(placeholder, text: text, axis: .vertical)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                .lineLimit(1...3)
                .padding(14)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                )
            if let hint {
                Text(hint)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
    }
}
