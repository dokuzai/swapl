import SwiftUI
import Observation
import SwaplDesignTokens

@MainActor
@Observable
final class SwapaliticsViewModel {
    var stats: Swapalitics?
    var error: String?
    var isLoading = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            stats = try await SwapaliticsRepository.shared.load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// Swapalitics — playful travel + impact dashboard: nights abroad, leaderboard
// position, engagement and collectable badges.
struct SwapaliticsView: View {
    @State private var vm = SwapaliticsViewModel()

    private let statColumns = [
        GridItem(.flexible(), spacing: 14),
        GridItem(.flexible(), spacing: 14)
    ]
    private let badgeColumns = [
        GridItem(.flexible(), spacing: 14),
        GridItem(.flexible(), spacing: 14)
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {

                if vm.isLoading && vm.stats == nil {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 80)
                } else if let error = vm.error {
                    SwaplEmptyState(
                        systemImage: "chart.bar",
                        title: String(localized: "Stats unavailable"),
                        description: error,
                        actionTitle: String(localized: "Try Again"),
                        action: { Task { await vm.load() } }
                    )
                    .padding(.top, 60)
                } else if let s = vm.stats {
                    hero(s)
                    statsGrid(s)
                    if !s.topCountries.isEmpty { whereYouveBeen(s) }
                    leaderboard(s)
                    impact(s)
                    badges(s)
                }
            }
            .padding(.bottom, 36)
        }
        .swaplFloatingHeader(String(localized: "Swapalitics"))
        .task { await vm.load() }
    }

    // Headline: nights abroad + share via Swapl.
    private func hero(_ s: Swapalitics) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(String(localized: "Nights abroad"))
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(s.nightsAbroad)")
                    .font(.swaplDisplay(56, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(String(localized: "\(s.pctViaSwapl)% via Swapl"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
            }
            if s.daysTracked > 0 {
                Text(String(localized: "\(s.nightsAbroad) of your \(s.daysAbroad) days abroad were swaps"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            } else if s.nightsUpcoming > 0 {
                Text(String(localized: "+\(s.nightsUpcoming) nights booked ahead"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous).stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    private func statsGrid(_ s: Swapalitics) -> some View {
        LazyVGrid(columns: statColumns, spacing: 14) {
            statTile(String(localized: "Swaps done"), "\(s.swapsCompleted)", "arrow.triangle.2.circlepath")
            statTile(String(localized: "Countries"), "\(s.countriesVisited)", "globe")
            statTile(String(localized: "Cities"), "\(s.citiesVisited)", "building.2")
            statTile(String(localized: "Nights hosted"), "\(s.nightsHosted)", "key")
        }
        .padding(.horizontal, 22)
    }

    private func statTile(_ title: String, _ value: String, _ icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
            Text(value)
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
    }

    // Days per country from daily location tracking.
    private func whereYouveBeen(_ s: Swapalitics) -> some View {
        let maxDays = max(1, s.topCountries.map(\.days).max() ?? 1)
        return VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Where you've been"))
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            ForEach(s.topCountries) { c in
                HStack(spacing: 12) {
                    Text(c.country)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .frame(width: 42, alignment: .leading)
                    GeometryReader { geo in
                        Capsule()
                            .fill(c.country == s.homeCountry ? AirbnbPalette.secondaryText.opacity(0.35) : SwaplSemanticLight.primary)
                            .frame(width: max(8, geo.size.width * CGFloat(c.days) / CGFloat(maxDays)))
                    }
                    .frame(height: 12)
                    Text(String(localized: "\(c.days)d"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .frame(width: 36, alignment: .trailing)
                }
            }
            if let home = s.homeCountry {
                Text(String(localized: "\(home) is your home base"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous).stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    // Leaderboard position vs the rest of the community.
    private func leaderboard(_ s: Swapalitics) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(String(localized: "Leaderboard"))
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                Text(String(localized: "Top \(s.percentile)%"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(SwaplSemanticLight.primary, in: Capsule())
            }
            Text(String(localized: "Ranked #\(s.rank) of \(s.totalTravellers) travellers"))
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text(String(localized: "Community average: \(s.avgNightsAllUsers) nights"))
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous).stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    // Engagement / impact on the platform.
    private func impact(_ s: Swapalitics) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(String(localized: "Your impact"))
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            impactRow("person.2.fill", String(localized: "People connected"), "\(s.peopleConnected)")
            impactRow("paperplane.fill", String(localized: "Friends brought in"), "\(s.referralsJoined)")
            impactRow("text.bubble.fill", String(localized: "Reviews written"), "\(s.reviewsWritten)")
            impactRow("number", String(localized: "You're swapler"), "#\(s.joinRank)")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous).stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    private func impactRow(_ icon: String, _ label: String, _ value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 26)
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()
            Text(value)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
        }
    }

    private func badges(_ s: Swapalitics) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(String(localized: "Badges"))
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                Text(String(localized: "\(s.badges.filter(\.earned).count)/\(s.badges.count)"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(.horizontal, 22)

            LazyVGrid(columns: badgeColumns, spacing: 14) {
                ForEach(s.badges) { badge in
                    badgeTile(badge)
                }
            }
            .padding(.horizontal, 22)
        }
    }

    private func badgeTile(_ badge: Swapalitics.Badge) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: badge.icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(badge.earned ? SwaplSemanticLight.primary : AirbnbPalette.secondaryText)
            Text(badge.label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
            Text(badge.description)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading)
        .padding(16)
        .background(
            (badge.earned ? SwaplSemanticLight.accent : SwaplSemanticLight.card),
            in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
        .opacity(badge.earned ? 1 : 0.55)
        .overlay(alignment: .topTrailing) {
            if !badge.earned {
                Image(systemName: "lock.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .padding(12)
            }
        }
    }
}
