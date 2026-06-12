import SwiftUI
import Observation
import SwaplDesignTokens

// "Get Inspired" (DOK-146): free-text wish + optional dates → the assistant
// composes a swap package from REAL, active, date-compatible listings.
// Confirming creates an actual proposal through the same code path as
// POST /api/proposals, then hands the proposal id back to the presenter
// (BrowseListView) which routes to the existing ProposalDetailView.
@MainActor
@Observable
final class InspireViewModel {
    var prompt = ""
    var useDates = false
    var dateFrom = Date()
    var dateTo = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    var isComposing = false
    var error: String?
    var package: InspirePackage?
    var isShowingPackage = false

    func compose() async {
        isComposing = true
        error = nil
        defer { isComposing = false }
        do {
            let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
            let pkg = try await AssistantRepository.shared.inspire(
                prompt: trimmed.isEmpty ? nil : trimmed,
                dateFrom: useDates ? SwaplDateText.apiString(from: dateFrom) : nil,
                dateTo: useDates ? SwaplDateText.apiString(from: dateTo) : nil
            )
            package = pkg
            isShowingPackage = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct InspireView: View {
    /// Called with the created proposal id on confirm, nil on dismiss/pass —
    /// the presenter closes the sheet and (when non-nil) opens the thread.
    let onFinished: (String?) -> Void

    @State private var vm = InspireViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    promptField
                    datesSection
                    if let error = vm.error {
                        Text(error)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                            .foregroundStyle(AirbnbPalette.destructive)
                    }
                    if vm.isComposing {
                        InspireLoadingView()
                            .frame(maxWidth: .infinity)
                            .padding(.top, 12)
                    } else {
                        PrimaryPill(title: "Dream up my swap", action: { Task { await vm.compose() } })
                    }
                }
                .padding(22)
            }
            .background(SwaplSemanticLight.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .tint(AirbnbPalette.text)
                }
            }
            .navigationDestination(isPresented: $vm.isShowingPackage) {
                if let pkg = vm.package {
                    PackageView(package: pkg, onFinished: onFinished)
                }
            }
        }
        .interactiveDismissDisabled(vm.isComposing)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                Text("Get Inspired")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
            }
            Text("Tell us the trip you're dreaming about — we'll compose a swap from real homes that match yours.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
    }

    private var promptField: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your wish")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            TextField(
                "Somewhere warm with great food, walkable, good for working remotely…",
                text: $vm.prompt,
                axis: .vertical
            )
            .font(.swaplBody(SwaplDesignSystem.FontSize.body))
            .lineLimit(3...6)
            .padding(14)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
        }
    }

    private var datesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $vm.useDates.animation(.snappy)) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("I have dates in mind")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text("Otherwise we'll use your home's availability.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            }
            .tint(SwaplSemanticLight.primary)

            if vm.useDates {
                VStack(spacing: 0) {
                    DatePicker("From", selection: $vm.dateFrom, in: Date()..., displayedComponents: .date)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .padding(.vertical, 6)
                    Divider()
                    DatePicker("To", selection: $vm.dateTo, in: vm.dateFrom..., displayedComponents: .date)
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
        }
    }
}

// Playful loading state — cycles through messages while the package composes.
struct InspireLoadingView: View {
    private static let messages = [
        "Dreaming up your swap…",
        "Matching homes to your vibe…",
        "Checking who's free when you are…",
        "Packing your virtual bags…"
    ]
    @State private var index = 0

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkles")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .symbolEffect(.pulse, options: .repeating)
            Text(Self.messages[index])
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .contentTransition(.opacity)
                .animation(.easeInOut, value: index)
        }
        .padding(.vertical, 20)
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2.2))
                index = (index + 1) % Self.messages.count
            }
        }
        .accessibilityLabel("Composing your swap package")
    }
}

// MARK: - Package

@MainActor
@Observable
final class PackageViewModel {
    let package: InspirePackage
    var selectedId: String
    var dateFrom: Date
    var dateTo: Date
    var message: String
    var isConfirming = false
    var isDismissing = false
    var error: String?

    init(package: InspirePackage) {
        self.package = package
        self.selectedId = package.destination.listingId
        self.dateFrom = SwaplDateText.parse(package.dates.from) ?? Date()
        self.dateTo = SwaplDateText.parse(package.dates.to) ?? Date()
        self.message = package.proposalMessage
    }

    var selected: InspireCandidate {
        package.allCandidates.first(where: { $0.listingId == selectedId }) ?? package.destination
    }

    /// Everything except the current hero — tapping a card swaps the hero
    /// using data the compose call already returned (no extra request).
    var alternatives: [InspireCandidate] {
        package.allCandidates.filter { $0.listingId != selectedId }
    }

    func confirm() async -> String? {
        isConfirming = true
        error = nil
        defer { isConfirming = false }
        do {
            let res = try await AssistantRepository.shared.confirm(
                packageId: package.packageId,
                listingId: selectedId,
                dateFrom: SwaplDateText.apiString(from: dateFrom),
                dateTo: SwaplDateText.apiString(from: dateTo),
                message: message.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            return res.proposalId
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func dismissPackage() async -> Bool {
        isDismissing = true
        error = nil
        defer { isDismissing = false }
        do {
            try await AssistantRepository.shared.dismiss(packageId: package.packageId)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}

struct PackageView: View {
    @State private var vm: PackageViewModel
    let onFinished: (String?) -> Void
    @State private var safariItem: SafariItem?

    init(package: InspirePackage, onFinished: @escaping (String?) -> Void) {
        _vm = State(initialValue: PackageViewModel(package: package))
        self.onFinished = onFinished
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                hero
                datesEditor
                messageEditor
                if !vm.alternatives.isEmpty {
                    alternativesSection
                }
                if !vm.package.experiences.isEmpty {
                    experiencesSection
                }
                if !vm.package.services.isEmpty {
                    servicesSection
                }
                if let error = vm.error {
                    Text(error)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                        .foregroundStyle(AirbnbPalette.destructive)
                        .padding(.horizontal, 22)
                }
                actions
            }
            .padding(.vertical, 18)
        }
        .background(SwaplSemanticLight.background)
        .navigationTitle("Your swap package")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $safariItem) { item in
            SafariView(url: item.url)
                .ignoresSafeArea()
        }
    }

    // MARK: hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            CandidatePhotoView(candidate: vm.selected, height: 240)
                .overlay(alignment: .topLeading) {
                    Text("\(vm.selected.matchScore)% match")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(.white, in: Capsule())
                        .padding(12)
                }
            VStack(alignment: .leading, spacing: 6) {
                Text(vm.selected.title)
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(locationText(vm.selected))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                if let why = vm.selected.why {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                            .padding(.top, 2)
                        Text(why)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                            .foregroundStyle(AirbnbPalette.text)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AirbnbPalette.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                    .padding(.top, 6)
                }
            }
        }
        .padding(.horizontal, 22)
        .animation(.snappy, value: vm.selectedId)
    }

    private func locationText(_ c: InspireCandidate) -> String {
        c.country.isEmpty ? c.city : "\(c.city), \(c.country)"
    }

    // MARK: dates & message

    private var datesEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Dates")
            VStack(spacing: 0) {
                DatePicker("From", selection: $vm.dateFrom, displayedComponents: .date)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .padding(.vertical, 6)
                Divider()
                DatePicker("To", selection: $vm.dateTo, in: vm.dateFrom..., displayedComponents: .date)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .padding(.vertical, 6)
            }
            .padding(.horizontal, 14)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
            if vm.package.dates.source == "availability" {
                Text("Suggested from your home's availability — adjust freely.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
        .padding(.horizontal, 22)
    }

    private var messageEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Your message")
            TextEditor(text: $vm.message)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                .scrollContentBackground(.hidden)
                .padding(10)
                .frame(minHeight: 140)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                )
            if vm.package.proposalMessageSource == "ai" {
                Text("Drafted by AI from your listing and theirs — make it yours.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
        .padding(.horizontal, 22)
    }

    // MARK: alternatives

    private var alternativesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Or swap the pick")
                .padding(.horizontal, 22)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(vm.alternatives) { candidate in
                        Button {
                            withAnimation(.snappy) { vm.selectedId = candidate.listingId }
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                CandidatePhotoView(candidate: candidate, height: 110, width: 160)
                                Text(candidate.city)
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                                    .foregroundStyle(AirbnbPalette.text)
                                    .lineLimit(1)
                                Text("\(candidate.matchScore)% match")
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                                    .foregroundStyle(AirbnbPalette.secondaryText)
                            }
                            .frame(width: 160, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Switch to \(candidate.title) in \(candidate.city), \(candidate.matchScore) percent match")
                    }
                }
                .padding(.horizontal, 22)
            }
        }
    }

    // MARK: affiliate enrichment

    private var experiencesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("While you're there")
                .padding(.horizontal, 22)
            VStack(spacing: 10) {
                ForEach(vm.package.experiences) { item in
                    Button {
                        if let url = DiscoverRepository.resolveURL(item.url) {
                            safariItem = SafariItem(url: url)
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "balloon")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(SwaplSemanticLight.primary)
                                .frame(width: 38, height: 38)
                                .background(AirbnbPalette.accent, in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                    .foregroundStyle(AirbnbPalette.text)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                Text("Book on \(item.partnerDisplayName)")
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                                    .foregroundStyle(AirbnbPalette.secondaryText)
                            }
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(AirbnbPalette.secondaryText)
                        }
                        .padding(14)
                        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                                .stroke(AirbnbPalette.hairline)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 22)
        }
    }

    private var servicesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Travel essentials")
                .padding(.horizontal, 22)
            VStack(spacing: 10) {
                ForEach(vm.package.services) { service in
                    Button {
                        if let url = DiscoverRepository.resolveURL(service.url) {
                            safariItem = SafariItem(url: url)
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: service.symbolName)
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(SwaplSemanticLight.primary)
                                .frame(width: 38, height: 38)
                                .background(AirbnbPalette.accent, in: Circle())
                            Text(service.name)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(AirbnbPalette.secondaryText)
                        }
                        .padding(14)
                        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                                .stroke(AirbnbPalette.hairline)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 22)
        }
    }

    // MARK: actions

    private var actions: some View {
        VStack(spacing: 12) {
            PrimaryPill(
                title: "Confirm & send proposal",
                action: {
                    Task {
                        if let proposalId = await vm.confirm() {
                            onFinished(proposalId)
                        }
                    }
                },
                isLoading: vm.isConfirming,
                isDisabled: vm.isDismissing
            )
            Button {
                Task {
                    if await vm.dismissPackage() {
                        onFinished(nil)
                    }
                }
            } label: {
                if vm.isDismissing {
                    ProgressView()
                } else {
                    Text("Not feeling it")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            }
            .disabled(vm.isConfirming || vm.isDismissing)
        }
        .padding(.horizontal, 22)
        .padding(.top, 6)
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
            .foregroundStyle(AirbnbPalette.text)
    }
}

// Candidate photo with the same fallback chain as the Discover cards: the
// listing's own photo when present, the brand city illustration otherwise.
struct CandidatePhotoView: View {
    let candidate: InspireCandidate
    var height: CGFloat
    var width: CGFloat? = nil

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
        Color.clear
            .frame(maxWidth: width == nil ? .infinity : nil)
            .frame(width: width, height: height)
            .overlay {
                if let raw = candidate.photo, let url = URL(string: raw) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        case .failure:
                            fallbackIllust
                        case .empty:
                            ZStack {
                                AirbnbPalette.softBackground
                                ProgressView()
                            }
                        @unknown default:
                            AirbnbPalette.softBackground
                        }
                    }
                } else {
                    fallbackIllust
                }
            }
            .clipShape(shape)
            .contentShape(shape)
    }

    private var fallbackIllust: some View {
        let palette = Self.palette(for: candidate.city)
        return ZStack {
            palette.sky
            CityIllust(palette: palette)
        }
    }

    // Stable per-city palette pick (FNV-1a) — same approach as ExperiencesView.
    private static func palette(for city: String) -> SwaplCityPalette {
        let names = ["warm", "cool", "rose", "sage", "dusk", "sand", "mono"]
        var hash: UInt64 = 1469598103934665603
        for byte in city.lowercased().utf8 { hash = (hash ^ UInt64(byte)) &* 1099511628211 }
        return SwaplCityPalettes.forName(names[Int(hash % UInt64(names.count))])
    }
}
