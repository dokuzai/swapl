import SwiftUI
import Observation
import SwaplDesignTokens

// "Your travel profile" (DOK-146): the AI-synthesised travel preferences,
// shown verbatim — privacy-first, built ONLY from in-app signals (interests,
// wishlist, saved searches, your own swap messages). The user can refresh it
// (rate-limited 5/h server-side) or delete it entirely at any time.
@MainActor
@Observable
final class TravelProfileViewModel {
    var profile: TravelProfile?
    var isLoading = false
    var isRefreshing = false
    var isDeleting = false
    var error: String?
    var hasLoaded = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            profile = try await AssistantRepository.shared.profile()
            hasLoaded = true
        } catch {
            self.error = error.localizedDescription
            hasLoaded = true
        }
    }

    func refresh() async {
        isRefreshing = true
        error = nil
        defer { isRefreshing = false }
        do {
            profile = try await AssistantRepository.shared.refreshProfile()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Returns true on success so the view can pop.
    func delete() async -> Bool {
        isDeleting = true
        error = nil
        defer { isDeleting = false }
        do {
            try await AssistantRepository.shared.deleteProfile()
            profile = nil
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}

struct TravelProfileView: View {
    @State private var vm = TravelProfileViewModel()
    @State private var isConfirmingDelete = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        // ZStack so something always renders: a bare conditional Group hits
        // EmptyView in the initial state and .task never fires (same blank-
        // screen bug MetricsView had — see commit 4fadaf9).
        ZStack {
            SwaplSemanticLight.background.ignoresSafeArea()
            if vm.profile == nil && vm.error == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Loading your travel profile")
            } else if let error = vm.error, vm.profile == nil {
                SwaplEmptyState(
                    systemImage: "wifi.exclamationmark",
                    title: "Profile unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let profile = vm.profile {
                content(profile)
            }
        }
        .navigationTitle("Your travel profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .confirmationDialog(
            "Delete your travel profile?",
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete profile", role: .destructive) {
                Task {
                    if await vm.delete() { dismiss() }
                }
            }
        } message: {
            Text("This erases the synthesised profile. It can be rebuilt from your in-app activity whenever you come back.")
        }
    }

    private func content(_ profile: TravelProfile) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                summaryCard(profile)
                if !profile.traits.themes.isEmpty {
                    traitSection("Themes", items: profile.traits.themes)
                }
                if !profile.traits.cities.isEmpty {
                    traitSection("Cities you gravitate to", items: profile.traits.cities)
                }
                if !profile.traits.constraints.isEmpty {
                    traitSection("Must-haves", items: profile.traits.constraints)
                }
                sourcesFootnote(profile)
                if let error = vm.error {
                    Text(error)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                        .foregroundStyle(AirbnbPalette.destructive)
                }
                actions
            }
            .padding(22)
        }
    }

    private func summaryCard(_ profile: TravelProfile) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                Text("How swapl sees your travels")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
            }
            Text(profile.summary)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                .foregroundStyle(AirbnbPalette.text)
            if let vibe = profile.traits.vibe, !vibe.isEmpty {
                Text("Vibe: \(vibe)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
    }

    private func traitSection(_ title: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            FlowChips(items: items)
        }
    }

    private func sourcesFootnote(_ profile: TravelProfile) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Built only from your in-app activity\(sourcesText(profile)).")
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                .foregroundStyle(AirbnbPalette.secondaryText)
            if let date = SwaplDateText.parseInstant(profile.updatedAt) {
                Text("Last updated \(date.formatted(date: .abbreviated, time: .omitted))")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
    }

    private func sourcesText(_ profile: TravelProfile) -> String {
        let names: [String: String] = [
            "interests": "interests",
            "favorites": "wishlist",
            "saved_searches": "saved searches",
            "swap_messages": "your messages"
        ]
        let used = profile.sourcesUsed.compactMap { names[$0] }
        return used.isEmpty ? "" : " — \(used.joined(separator: ", "))"
    }

    private var actions: some View {
        VStack(spacing: 12) {
            PrimaryPill(
                title: "Refresh from my activity",
                action: { Task { await vm.refresh() } },
                isLoading: vm.isRefreshing,
                isDisabled: vm.isDeleting
            )
            Button {
                isConfirmingDelete = true
            } label: {
                if vm.isDeleting {
                    ProgressView()
                } else {
                    Text("Delete this profile")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.destructive)
                }
            }
            .disabled(vm.isRefreshing || vm.isDeleting)
        }
        .padding(.top, 6)
    }
}

// Simple wrapping chip layout for trait lists.
private struct FlowChips: View {
    let items: [String]

    var body: some View {
        FlexibleChipLayout(spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(AirbnbPalette.softBackground, in: Capsule())
            }
        }
    }
}

// Minimal wrapping layout (iOS 16+ Layout protocol) so chips flow onto new
// lines instead of overflowing horizontally.
private struct FlexibleChipLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? x : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
