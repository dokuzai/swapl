import SwiftUI
import Observation
import SwaplDesignTokens

// Services tab of Explore (DOK-145): the travel-services catalogue from
// GET /api/discover/services — configured affiliate partners (click-through
// via /api/affiliate/{partner} so the click is logged) plus concierge
// add-ons with their real DB prices. Nothing configured → clean empty state.
@MainActor
@Observable
final class ServicesViewModel {
    var items: [DiscoverService] = []
    var isLoading = false
    var error: String?
    var hasLoaded = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            items = try await DiscoverRepository.shared.services()
            hasLoaded = true
        } catch {
            self.error = error.localizedDescription
            hasLoaded = true
        }
    }
}

// Renders inside Explore's outer ScrollView — no nested scrolling here.
struct ServicesView: View {
    @State private var vm = ServicesViewModel()
    @State private var safariItem: SafariItem?

    var body: some View {
        Group {
            if vm.isLoading && !vm.hasLoaded {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 280)
                    .accessibilityLabel("Loading services")
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "wifi.exclamationmark",
                    title: "Services unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity, minHeight: 280)
            } else if vm.items.isEmpty {
                SwaplEmptyState(
                    systemImage: "bell",
                    title: "No services yet",
                    description: "Travel services and concierge extras will appear here soon."
                )
                .frame(maxWidth: .infinity, minHeight: 280)
            } else {
                LazyVStack(spacing: 14) {
                    ForEach(vm.items) { item in
                        ServiceCardView(item: item) {
                            guard let raw = item.url,
                                  let url = DiscoverRepository.resolveURL(raw) else { return }
                            safariItem = SafariItem(url: url)
                        }
                    }
                }
                .padding(.horizontal, 22)
            }
        }
        .task { await vm.load() }
        .sheet(item: $safariItem) { item in
            SafariView(url: item.url)
                .ignoresSafeArea()
        }
    }
}

struct ServiceCardView: View {
    let item: DiscoverService
    let action: () -> Void

    var body: some View {
        // Concierge add-ons have no click-through (their checkout lives in
        // the swap flow) — render them as plain cards, not buttons.
        if item.url != nil {
            Button(action: action) { card }
                .buttonStyle(.plain)
                .accessibilityLabel("\(item.name), book on \(item.name)")
        } else {
            card
        }
    }

    private var card: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: item.symbolName)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 52, height: 52)
                .background(AirbnbPalette.softBackground, in: Circle())

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text(item.name)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    if item.isConcierge {
                        Text("Concierge")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.tiny, weight: .bold))
                            .foregroundStyle(AirbnbPalette.text)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(SwaplSemanticLight.accent, in: Capsule())
                    }
                }
                Text(item.tagline)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let price = item.formattedPrice {
                    // Real catalogue price from the DB — concierge only.
                    Text(price)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.top, 2)
                } else if item.url != nil {
                    HStack(spacing: 5) {
                        Text("Book on \(item.name)")
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .padding(.top, 2)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
    }
}
