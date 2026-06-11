import SwiftUI
import Observation
import SwaplDesignTokens

// Founder-only dashboard (GET /api/admin/metrics). Reached from the Profile
// tab; the entry point is gated on role == "swapl_admin", and the server
// double-checks with a 403 for everyone else.

@MainActor
@Observable
final class MetricsViewModel {
    var metrics: AdminMetrics?
    var error: String?
    var isLoading = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            metrics = try await MetricsRepository.shared.fetch()
        } catch APIClient.APIError.status(403, _) {
            if metrics == nil { error = "This dashboard is for Swapl admins only." }
        } catch {
            // Keep showing stale numbers on a failed refresh.
            if metrics == nil { self.error = error.localizedDescription }
        }
    }
}

struct MetricsView: View {
    @State private var vm = MetricsViewModel()

    var body: some View {
        // ZStack so something always renders: with a bare `content`, the
        // initial not-yet-loading state produced an EmptyView and .task
        // never fired — the screen stayed blank forever.
        ZStack {
            SwaplSemanticLight.background.ignoresSafeArea()
            content
        }
        .navigationTitle("Metrics")
        .task { await vm.load() }
    }

    @ViewBuilder
    private var content: some View {
        if vm.metrics == nil && vm.error == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .frame(minHeight: 320)
                .accessibilityLabel("Loading metrics")
        } else if let error = vm.error {
            SwaplEmptyState(
                systemImage: "chart.bar.xaxis",
                title: "Metrics unavailable",
                description: error,
                actionTitle: "Try Again",
                action: { Task { await vm.load() } }
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let m = vm.metrics {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    nowSection(m.now)
                    usersSection(m.users)
                    listingsSection(m.listingsPerUser)
                    citiesSection(m.cities)
                    proposalsSection(m.engagement)
                    engagementSection(m.engagement)
                    generatedFooter(m.generatedAt)
                }
                .padding(.horizontal, 22)
                .padding(.top, 12)
                .padding(.bottom, 36)
            }
            .refreshable { await vm.load() }
        }
    }

    // MARK: - Now

    private func nowSection(_ now: AdminMetrics.Now) -> some View {
        section("Now") {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible())], spacing: 14) {
                BigStatCard(value: now.online, label: "Online now")
                BigStatCard(value: now.dau, label: "Today")
                BigStatCard(value: now.wau, label: "7 days")
                BigStatCard(value: now.mau, label: "30 days")
            }
        }
    }

    // MARK: - Users

    private func usersSection(_ users: AdminMetrics.Users) -> some View {
        section("Users") {
            SurfaceCard {
                VStack(spacing: 0) {
                    metricRow("Total", users.total)
                    rowDivider
                    metricRow("Email verified", users.emailVerified)
                    rowDivider
                    metricRow("With active listing", users.withActiveListing)
                    rowDivider
                    metricRow("New last 7 days", users.new7d)
                    rowDivider
                    metricRow("New last 30 days", users.new30d)
                }
            }
        }
    }

    // MARK: - Listings per user

    private func listingsSection(_ lpu: AdminMetrics.ListingsPerUser) -> some View {
        section("Listings per user") {
            VStack(spacing: 14) {
                SurfaceCard {
                    VStack(spacing: 0) {
                        metricRow("0 listings", lpu.distribution.zero)
                        rowDivider
                        metricRow("1 listing", lpu.distribution.one)
                        rowDivider
                        metricRow("2 listings", lpu.distribution.two)
                        rowDivider
                        metricRow("3+ listings", lpu.distribution.threePlus)
                        rowDivider
                        metricRow("Avg per host", text: String(format: "%.2f", lpu.avgPerUserWithListing))
                    }
                }

                if !lpu.topUsers.isEmpty {
                    SurfaceCard {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Top hosts")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                                .foregroundStyle(AirbnbPalette.text)
                                .padding(.bottom, 10)
                            ForEach(lpu.topUsers) { user in
                                HStack(alignment: .firstTextBaseline, spacing: 12) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(user.name ?? user.email)
                                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                            .foregroundStyle(AirbnbPalette.text)
                                            .lineLimit(1)
                                        if user.name != nil {
                                            Text(user.email)
                                                .font(.swaplMono(SwaplDesignSystem.FontSize.tiny))
                                                .foregroundStyle(SwaplSemanticLight.mutedForeground)
                                                .lineLimit(1)
                                        }
                                    }
                                    Spacer()
                                    Text("\(user.listings)")
                                        .font(.swaplDisplay(20, weight: .semibold))
                                        .foregroundStyle(AirbnbPalette.text)
                                }
                                .padding(.vertical, 8)
                                if user.id != lpu.topUsers.last?.id {
                                    rowDivider
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Cities

    private func citiesSection(_ cities: AdminMetrics.Cities) -> some View {
        section("Top cities") {
            SurfaceCard {
                VStack(spacing: 0) {
                    metricRow("Active listings", cities.totalActiveListings)
                    ForEach(Array(cities.top.enumerated()), id: \.offset) { _, city in
                        rowDivider
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(city.city)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                                .foregroundStyle(SwaplSemanticLight.mutedForeground)
                                .lineLimit(1)
                            Spacer()
                            Text(percentText(city.share))
                                .font(.swaplMono(SwaplDesignSystem.FontSize.tiny))
                                .foregroundStyle(SwaplSemanticLight.mutedForeground)
                            Text(city.listings.formatted())
                                .font(.swaplDisplay(20, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                        }
                        .padding(.vertical, 8)
                    }
                }
            }
        }
    }

    // MARK: - Proposals

    private func proposalsSection(_ e: AdminMetrics.Engagement) -> some View {
        section("Proposals") {
            SurfaceCard {
                VStack(spacing: 0) {
                    metricRow("Total", e.proposalsTotal)
                    rowDivider
                    metricRow("Accept rate", text: percentText(e.proposalAcceptRate))
                    ForEach(e.proposalsByStatus.sorted { $0.value > $1.value }, id: \.key) { status, count in
                        rowDivider
                        metricRow(status.replacingOccurrences(of: "_", with: " ").capitalized, count)
                    }
                }
            }
        }
    }

    // MARK: - Engagement

    private func engagementSection(_ e: AdminMetrics.Engagement) -> some View {
        section("Engagement") {
            SurfaceCard {
                VStack(spacing: 0) {
                    metricRow("Active agreements", e.agreementsActive)
                    rowDivider
                    metricRow("Completed agreements", e.agreementsCompleted)
                    rowDivider
                    metricRow("Messages total", e.messagesTotal)
                    rowDivider
                    metricRow("Messages last 7 days", e.messages7d)
                    rowDivider
                    metricRow("Favorites total", e.favoritesTotal)
                    rowDivider
                    metricRow("Favorites last 7 days", e.favorites7d)
                    rowDivider
                    metricRow("Saved searches", e.savedSearches)
                }
            }
        }
    }

    private func generatedFooter(_ generatedAt: String) -> some View {
        Text("Generated \(Self.parseISO(generatedAt).map { $0.formatted(date: .abbreviated, time: .shortened) } ?? generatedAt)")
            .font(.swaplMono(SwaplDesignSystem.FontSize.tiny))
            .foregroundStyle(SwaplSemanticLight.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .center)
    }

    // MARK: - Building blocks

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            content()
        }
    }

    private func metricRow(_ label: String, _ value: Int) -> some View {
        metricRow(label, text: value.formatted())
    }

    private func metricRow(_ label: String, text value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(SwaplSemanticLight.mutedForeground)
            Spacer()
            Text(value)
                .font(.swaplDisplay(20, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
        }
        .padding(.vertical, 8)
    }

    private var rowDivider: some View {
        Divider().overlay(AirbnbPalette.hairline)
    }

    private func percentText(_ share: Double) -> String {
        "\(Int((share * 100).rounded()))%"
    }

    // generatedAt is a full ISO timestamp; SwaplDateText.parse truncates to the
    // day, so parse here with and without fractional seconds.
    private static func parseISO(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

// One of the four hero numbers in the "Now" grid.
private struct BigStatCard: View {
    let value: Int
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(value.formatted())
                .font(.swaplDisplay(38, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }
}
