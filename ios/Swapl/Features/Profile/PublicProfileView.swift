import SwiftUI
import Observation
import SwaplDesignTokens

@MainActor
@Observable
final class PublicProfileViewModel {
    let userId: String
    var profile: PublicProfile?
    var error: String?
    init(userId: String) { self.userId = userId }
    func load() async {
        error = nil
        do { profile = try await ProfileRepository.shared.publicProfile(id: userId) }
        catch { self.error = error.localizedDescription }
    }
}

// Rich public profile (DOK-147), mirroring /profile/{id} on the web:
// identity card with real stats, icon info rows, "Where I've been" postcard
// stamps from COMPLETED swaps, reviews, interests, and the host's listings.
struct PublicProfileView: View {
    @State private var vm: PublicProfileViewModel
    @State private var showReport = false

    init(userId: String) { _vm = State(initialValue: PublicProfileViewModel(userId: userId)) }

    var body: some View {
        ScrollView {
            if let p = vm.profile {
                VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                    identityCard(p)
                    infoRows(p.user)
                    bioBlock(p.user)
                    visitedBlock(p.visited ?? [])
                    reviewsBlock(p)
                    interestsBlock(p.user.interests)
                    listingsBlock(p.listings)
                    reportLink
                }
                .padding(SwaplSpacing.s4)
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "person.crop.circle.badge.exclamationmark",
                    title: "Profile unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity)
                .padding(.top, 80)
            } else {
                // Fill the full width/height immediately so the view isn't a
                // narrow strip on a white background during the push animation.
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 400)
                    .accessibilityLabel("Loading profile")
            }
        }
        .frame(maxWidth: .infinity)
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .task { await vm.load() }
        .sheet(isPresented: $showReport) {
            if let p = vm.profile {
                ReportSheet(targetUserId: p.user.id, listingId: nil)
            }
        }
    }

    // MARK: - Identity card

    private func identityCard(_ p: PublicProfile) -> some View {
        SurfaceCard {
            HStack(alignment: .center, spacing: SwaplSpacing.s5) {
                VStack(spacing: SwaplSpacing.s2) {
                    avatar(p.user)
                    Text(p.user.name ?? String(localized: "Anonymous host"))
                        .font(.swaplDisplay(24, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.foreground)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                    if p.user.verified {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.system(size: 12, weight: .semibold))
                            Text("ID verified")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                        }
                        .foregroundStyle(SwaplColor.pink)
                    }
                }
                .frame(maxWidth: .infinity)

                VStack(alignment: .leading, spacing: SwaplSpacing.s3) {
                    statRow(value: "\(stats(p).swapsCompleted)", label: stats(p).swapsCompleted == 1 ? "Swap" : "Swaps")
                    Divider()
                    statRow(value: reviewsValue(p), label: stats(p).reviewsCount == 1 ? "Review" : "Reviews")
                    Divider()
                    statRow(value: tenureValue(p), label: tenureLabel(p))
                }
                .frame(width: 124, alignment: .leading)
            }
        }
    }

    private func avatar(_ u: PublicProfile.User) -> some View {
        ZStack {
            Circle().fill(SwaplSemanticLight.primary)
            if let avatar = u.avatar, let url = URL(string: avatar) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initialsView(u)
                    }
                }
            } else {
                initialsView(u)
            }
        }
        .frame(width: 96, height: 96)
        .clipShape(Circle())
    }

    private func initialsView(_ u: PublicProfile.User) -> some View {
        Text(String((u.name ?? "?").prefix(1)).uppercased())
            .font(.swaplDisplay(40, weight: .semibold))
            .foregroundStyle(SwaplSemanticLight.primaryForeground)
    }

    private func statRow(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.swaplDisplay(22, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.foreground)
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.mutedForeground)
        }
    }

    // Stats always render: a missing block (older API) degrades to zeros and
    // the member-since year from the user payload — never fake numbers.
    private func stats(_ p: PublicProfile) -> PublicProfile.Stats {
        p.stats ?? .init(swapsCompleted: 0, reviewsCount: 0, avgRating: nil, memberSince: p.user.memberSince)
    }

    private func reviewsValue(_ p: PublicProfile) -> String {
        let s = stats(p)
        if let avg = s.avgRating, s.reviewsCount > 0 {
            return "\(s.reviewsCount) · \(avg.formatted(.number.precision(.fractionLength(0...1))))★"
        }
        return "\(s.reviewsCount)"
    }

    // Tenure: "N" + "Years on Swapl" once a full year has passed; the join
    // year ("Since 2026") until then.
    private func joinYear(_ p: PublicProfile) -> Int {
        Int(stats(p).memberSince.prefix(4)) ?? Calendar.current.component(.year, from: Date())
    }

    private func tenureYears(_ p: PublicProfile) -> Int {
        max(0, Calendar.current.component(.year, from: Date()) - joinYear(p))
    }

    private func tenureValue(_ p: PublicProfile) -> String {
        let years = tenureYears(p)
        return years >= 1 ? "\(years)" : "\(joinYear(p))"
    }

    private func tenureLabel(_ p: PublicProfile) -> String {
        let years = tenureYears(p)
        if years >= 1 { return years == 1 ? "Year on Swapl" : "Years on Swapl" }
        return String(localized: "Joined Swapl")
    }

    // MARK: - Info rows (work / languages / home city)

    @ViewBuilder
    private func infoRows(_ u: PublicProfile.User) -> some View {
        let languages = (u.languages ?? []).filter { !$0.isEmpty }
        let home = [u.homeCity, u.homeCountry].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        if u.work != nil || !languages.isEmpty || !home.isEmpty {
            VStack(alignment: .leading, spacing: SwaplSpacing.s3) {
                if let work = u.work, !work.isEmpty {
                    infoRow(icon: "briefcase", text: "My work: \(work)")
                }
                if !languages.isEmpty {
                    infoRow(icon: "globe", text: "Speaks \(languages.joined(separator: ", "))")
                }
                if !home.isEmpty {
                    infoRow(icon: "mappin.and.ellipse", text: "Lives in \(home)")
                }
            }
        }
    }

    private func infoRow(icon: String, text: String) -> some View {
        HStack(spacing: SwaplSpacing.s3) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(SwaplSemanticLight.mutedForeground)
                .frame(width: 26)
            Text(text)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(SwaplSemanticLight.foreground)
        }
    }

    // MARK: - Bio

    @ViewBuilder
    private func bioBlock(_ u: PublicProfile.User) -> some View {
        if let vibe = u.bioVibe, !vibe.isEmpty {
            Text("\u{201C}\(vibe)\u{201D}")
                .font(.swaplDisplay(18))
                .italic()
                .foregroundStyle(SwaplColor.pink)
        }
        if let bio = u.bio, !bio.isEmpty {
            Text(bio).font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
        }
    }

    // MARK: - Where I've been

    @ViewBuilder
    private func visitedBlock(_ visited: [PublicProfile.VisitedCity]) -> some View {
        VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
            KickerLabel(text: "Where I've been")
            if visited.isEmpty {
                Text("No completed swaps yet — passport stamps appear here after each stay.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
            } else {
                CityStampStrip(visited: visited)
            }
        }
    }

    // MARK: - Reviews

    @ViewBuilder
    private func reviewsBlock(_ p: PublicProfile) -> some View {
        let reviews = p.reviews ?? []
        VStack(alignment: .leading, spacing: SwaplSpacing.s3) {
            KickerLabel(text: reviews.isEmpty ? "Reviews" : "Reviews (\(stats(p).reviewsCount))")
            if reviews.isEmpty {
                Text("No reviews yet — hosts review each other after a completed swap.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
            } else {
                ForEach(reviews) { review in
                    reviewCard(review)
                }
            }
        }
    }

    private func reviewCard(_ review: PublicProfile.Review) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                StarsRow(rating: review.rating)
                Text(review.text)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(SwaplSemanticLight.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(review.author.name ?? String(localized: "A Swapl member")) · \(reviewDate(review.createdAt))")
                    .font(.swaplMono(SwaplDesignSystem.FontSize.tiny))
                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func reviewDate(_ value: String) -> String {
        guard let date = SwaplDateText.parse(value) else { return String(value.prefix(10)) }
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("MMM yyyy")
        return formatter.string(from: date)
    }

    // MARK: - Interests / listings / report

    @ViewBuilder
    private func interestsBlock(_ slugs: [String]) -> some View {
        if !slugs.isEmpty {
            VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                KickerLabel(text: "Interests")
                let columns = [GridItem(.adaptive(minimum: 90), spacing: SwaplSpacing.s2)]
                LazyVGrid(columns: columns, alignment: .leading, spacing: SwaplSpacing.s2) {
                    ForEach(slugs, id: \.self) { TagChip(label: $0) }
                }
            }
        }
    }

    @ViewBuilder
    private func listingsBlock(_ ls: [Listing]) -> some View {
        if !ls.isEmpty {
            VStack(alignment: .leading, spacing: SwaplSpacing.s3) {
                KickerLabel(text: "Their homes")
                ForEach(ls) { l in
                    NavigationLink {
                        ListingDetailView(listingId: l.id)
                    } label: {
                        SurfaceCard {
                            VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                                // Photo-first cover: the listing's own photos win;
                                // the city illustration is only the no-photo fallback
                                // inside ListingPhotoView (same priority as web).
                                ListingPhotoView(listing: l, cornerRadius: SwaplDesignSystem.CornerRadius.medium)
                                    .aspectRatio(200.0 / 140.0, contentMode: .fit)
                                Text("\(l.neighbourhood) · \(l.city)")
                                    .font(.swaplDisplay(18))
                                Text("\(l.sizeSqm) m² · sleeps \(l.sleeps)")
                                    .font(.swaplMono(SwaplDesignSystem.FontSize.tiny))
                                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var reportLink: some View {
        Button(action: { showReport = true }) {
            Text("Report this user")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(SwaplSemanticLight.destructive)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// Five-star row used by the profile reviews and the leave-review sheet.
struct StarsRow: View {
    let rating: Int
    var size: CGFloat = 14

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { n in
                Image(systemName: n <= rating ? "star.fill" : "star")
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(n <= rating ? SwaplColor.pink : SwaplColor.cream2)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(rating) out of 5 stars")
    }
}
