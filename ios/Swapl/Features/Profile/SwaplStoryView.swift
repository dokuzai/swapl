import SwiftUI
import Observation
import SwaplDesignTokens

// "Your Swapl story" (DOK-158). Reached from Account. A postcard timeline of
// every trip the member has taken and every guest they've welcomed — drawn in
// the same passport-stamp visual language as the public profile's "Where I've
// been" strip (DOK-147, see CityStamp) — topped with headline counts and a
// one-tap native share that carries the member's referral link (?ref=CODE) so
// the story itself feeds the viral loop.

@MainActor
@Observable
final class SwaplStoryViewModel {
    var story: SwaplStory?
    var error: String?
    var isLoading = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            story = try await StoryRepository.shared.myStory()
        } catch {
            if story == nil { self.error = error.localizedDescription }
        }
    }
}

struct SwaplStoryView: View {
    @State private var vm = SwaplStoryViewModel()

    // Universal-link domain for shareable referral links — same origin the
    // Invite & earn share sheet uses (app.swapl.fun). The server's referralUrl
    // can point at localhost in dev, so we rebuild from the code for a link that
    // always works off-device.
    private static let shareOrigin = "https://app.swapl.fun"

    var body: some View {
        ScrollView {
            if let story = vm.story {
                content(story)
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "book.closed",
                    title: "Story unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .padding(.top, 80)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 400)
                    .accessibilityLabel("Loading your story")
            }
        }
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        .navigationTitle("Your Swapl story")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .refreshable { await vm.load() }
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ story: SwaplStory) -> some View {
        if story.timeline.isEmpty {
            emptyStory(story)
        } else {
            VStack(alignment: .leading, spacing: 28) {
                countsStrip(story.counts)
                shareCard(story)
                timeline(story.timeline)
            }
            .padding(.horizontal, 22)
            .padding(.top, 18)
            .padding(.bottom, 40)
        }
    }

    // MARK: - Counts (B)

    private func countsStrip(_ counts: SwaplStory.Counts) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Your story so far")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
            HStack(spacing: 0) {
                countCell("\(counts.trips)", counts.trips == 1 ? "Trip" : "Trips")
                countDivider
                countCell("\(counts.hostings)", counts.hostings == 1 ? "Guest welcomed" : "Guests welcomed")
                countDivider
                countCell("\(counts.cities)", counts.cities == 1 ? "City" : "Cities")
                countDivider
                countCell("\(counts.countries)", counts.countries == 1 ? "Country" : "Countries")
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplColor.navyDark, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
    }

    private func countCell(_ value: String, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.swaplDisplay(34, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.8))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    private var countDivider: some View {
        Rectangle()
            .fill(SwaplSemanticLight.primaryForeground.opacity(0.2))
            .frame(width: 1, height: 44)
    }

    // MARK: - Share (C)

    private func shareCard(_ story: SwaplStory) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Share your story")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            HStack(spacing: 12) {
                // Show the readable link (no scheme) — the ShareLink itself sends
                // the full URL carrying ?ref=CODE so every share recruits.
                Text(shareURL(for: story).absoluteString.replacingOccurrences(of: "https://", with: ""))
                    .font(.swaplMono(15, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer()
                ShareLink(
                    item: shareURL(for: story),
                    subject: Text("My Swapl story"),
                    message: Text(shareMessage(story)),
                    preview: SharePreview("My Swapl story")
                ) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .padding(.horizontal, 18)
                        .frame(height: 44)
                        .background(SwaplSemanticLight.primary, in: Capsule())
                }
                .accessibilityLabel("Share your Swapl story")
            }
            .padding(18)
            .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))

            Text("Send your story anywhere — Messages, WhatsApp, email. It carries your invite link, so when a friend taps it and joins, you both earn travel points.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func shareURL(for story: SwaplStory) -> URL {
        URL(string: "\(Self.shareOrigin)/?ref=\(story.share.referralCode)")
            ?? URL(string: story.share.referralUrl)
            ?? URL(string: Self.shareOrigin)!
    }

    private func shareMessage(_ story: SwaplStory) -> String {
        let c = story.counts
        let places = c.cities == 1 ? "1 city" : "\(c.cities) cities"
        return "I've swapped homes across \(places) on Swapl — travel on points, not cash. Join me with my link and we both score travel points when you verify."
    }

    // MARK: - Timeline (A)

    private func timeline(_ events: [SwaplStory.Event]) -> some View {
        // Preserve the server's dateTo-desc order; group consecutively by year
        // so the most recent year leads. (Events already arrive sorted.)
        let groups = groupedByYear(events)
        return VStack(alignment: .leading, spacing: 22) {
            KickerLabel(text: "Your passport")
            ForEach(groups, id: \.year) { group in
                VStack(alignment: .leading, spacing: 14) {
                    Text(String(group.year))
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    ForEach(Array(group.events.enumerated()), id: \.element.id) { index, event in
                        StoryStampRow(event: event, tilt: index.isMultiple(of: 2) ? -1.5 : 1.5)
                    }
                }
            }
        }
    }

    private func groupedByYear(_ events: [SwaplStory.Event]) -> [(year: Int, events: [SwaplStory.Event])] {
        var order: [Int] = []
        var buckets: [Int: [SwaplStory.Event]] = [:]
        for event in events {
            if buckets[event.year] == nil { order.append(event.year) }
            buckets[event.year, default: []].append(event)
        }
        return order.map { (year: $0, events: buckets[$0] ?? []) }
    }

    // MARK: - Empty state (D)

    private func emptyStory(_ story: SwaplStory) -> some View {
        VStack(spacing: 22) {
            SwaplEmptyState(
                systemImage: "airplane.departure",
                title: "Your story starts here",
                description: "Once you complete your first swap or Keys stay, your trips and the guests you welcome appear here as passport stamps — a postcard of everywhere Swapl takes you.",
                actionTitle: nil,
                action: nil
            )
            .padding(.top, 60)

            // Even with no story yet, the member can recruit — sharing the link
            // is how the journey begins.
            ShareLink(
                item: shareURL(for: story),
                subject: Text("Join me on Swapl"),
                message: Text("Join me on Swapl — swap homes and travel on points, not cash. Use my link and we both score travel points when you verify."),
                preview: SharePreview("Join me on Swapl")
            ) {
                Label("Invite a friend to swap", systemImage: "square.and.arrow.up")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(SwaplSemanticLight.primary, in: Capsule())
            }
            .padding(.horizontal, 22)
        }
        .padding(.bottom, 40)
    }
}

// MARK: - Stamp row

// One timeline entry rendered as a postcard: a kind badge (trip / hosting), the
// stamped city, and the dates + counterpart. The CityStamp reuses the exact
// passport-stamp styling from the public profile (DOK-147).
private struct StoryStampRow: View {
    let event: SwaplStory.Event
    var tilt: Double = 0

    private var isTrip: Bool { event.kind == .trip }

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            CityStamp(city: event.city, country: event.country, year: event.year, tilt: tilt)

            VStack(alignment: .leading, spacing: 6) {
                kindBadge
                Text(SwaplDateText.range(from: event.dateFrom, to: event.dateTo))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                if let detail = detailLine {
                    Text(detail)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }

    private var kindBadge: some View {
        HStack(spacing: 5) {
            Image(systemName: isTrip ? "airplane" : "house.fill")
                .font(.system(size: 11, weight: .bold))
            Text(isTrip ? String(localized: "TRIP") : String(localized: "HOSTED"))
                .font(.swaplMono(SwaplDesignSystem.FontSize.tiny, weight: .bold))
                .tracking(0.08 * 11)
        }
        .foregroundStyle(isTrip ? SwaplSemanticLight.primaryForeground : SwaplColor.navy)
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(
            (isTrip ? SwaplSemanticLight.primary : SwaplColor.cream2),
            in: Capsule()
        )
    }

    // Trip → who hosted you; hosting → who you welcomed. Falls back to the
    // listing title, then a neutral line, so a missing counterpart never blanks.
    private var detailLine: String? {
        if let name = event.counterpartName, !name.isEmpty {
            return isTrip ? "Hosted by \(name)" : "Welcomed \(name)"
        }
        if let title = event.listingTitle, !title.isEmpty {
            return title
        }
        return isTrip ? "A stay on Swapl" : "A guest in your home"
    }
}
